"""
main.py — FastAPI app for the Call Pattern Analyzer.
"""

import json
import os
from pathlib import Path
from typing import Optional, List, Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from graph_manager import GraphManager
from chat_service import ChatService
from mcp_chat_service import MCPChatService
from neo4j_manager import Neo4jManager
from prediction_service import PaymentPredictor
from anomaly_detector import AnomalyDetector

# Carga variables de entorno desde backend/.env
load_dotenv(Path(__file__).parent / ".env")

# ------------------------------------------------------------------ #
#  App setup                                                           #
# ------------------------------------------------------------------ #

app = FastAPI(
    title="Analizador de Patrones de Llamadas",
    description="API para análisis de interacciones de cobro mediante grafo de conocimiento",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

gm = GraphManager()
neo4j_gm = Neo4jManager()
predictor = PaymentPredictor()
anomaly_det = AnomalyDetector()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not GEMINI_API_KEY:
    print("[WARN] GEMINI_API_KEY no configurada — el chat no funcionará")
chat_service = ChatService(GEMINI_API_KEY)
mcp_chat: Optional[MCPChatService] = None  # se inicializa en startup si Neo4j disponible

DATA_PATH = Path(__file__).parent.parent / "data" / "interacciones_clientes.json"


@app.on_event("startup")
async def startup_event():
    global mcp_chat
    # Conectar a Neo4j (opcional — el sistema funciona sin él)
    await neo4j_gm.connect()

    # Inicializar MCPChatService si Neo4j está disponible
    try:
        _mcp = MCPChatService(api_key=GEMINI_API_KEY)
        await _mcp.connect_neo4j()
        if _mcp.neo4j_available:
            mcp_chat = _mcp
            print("[MCP] MCPChatService activo — consultas Cypher dinámicas habilitadas")
        else:
            print("[MCP] Neo4j no disponible — usando ChatService estándar")
    except Exception as e:
        print(f"[MCP] Fallback a ChatService estándar: {e}")

    if not DATA_PATH.exists():
        print(f"[WARN] Data file not found at {DATA_PATH}")
        return
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if data.get("clientes") and data.get("interacciones"):
        gm.ingest(data)
        predictor.train(gm)
        print(
            f"[OK] NetworkX graph loaded: {len(gm.clients)} clients, "
            f"{len(gm.agents)} agents, {len(gm.interactions)} call interactions"
        )
        if neo4j_gm.connected:
            await neo4j_gm.ingest(data)
            print("[OK] Neo4j graph populated")
    else:
        print("[INFO] Data file exists but is empty — waiting for upload")


@app.on_event("shutdown")
async def shutdown_event():
    await neo4j_gm.close()
    if mcp_chat:
        await mcp_chat.close()


# ------------------------------------------------------------------ #
#  Health / Status                                                     #
# ------------------------------------------------------------------ #


@app.get("/", tags=["Health"])
async def root():
    neo4j_stats = await neo4j_gm.get_graph_stats()
    return {
        "status": "ok",
        "data_loaded": len(gm.clients) > 0,
        "clientes": len(gm.clients),
        "agentes": len(gm.agents),
        "interacciones": len(gm.interactions),
        "neo4j": neo4j_stats,
    }


# ------------------------------------------------------------------ #
#  Data Upload                                                         #
# ------------------------------------------------------------------ #


@app.post("/ingest", tags=["Data"])
async def ingest_data(request: Request):
    """Accept parsed JSON data from the frontend and re-ingest."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    if "clientes" not in body or "interacciones" not in body:
        raise HTTPException(
            400, "JSON must contain 'clientes' and 'interacciones' arrays"
        )

    # Save to disk for persistence
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=2)

    # Re-ingest NetworkX (in-memory, fast analytics)
    gm.reset()
    gm.ingest(body)
    predictor.train(gm)

    # Re-ingest Neo4j (persistent graph store)
    neo4j_status = "not_connected"
    if neo4j_gm.connected:
        await neo4j_gm.ingest(body)
        neo4j_status = "ok"

    return {
        "status": "ok",
        "clientes": len(gm.clients),
        "agentes": len(gm.agents),
        "interacciones": len(gm.interactions),
        "neo4j": neo4j_status,
    }


# ------------------------------------------------------------------ #
#  Chat (Gemini)                                                       #
# ------------------------------------------------------------------ #


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


@app.post("/chat", tags=["Chat"])
async def chat_endpoint(req: ChatRequest):
    """Send a natural language query to the Gemini-powered assistant."""
    if not gm.clients:
        raise HTTPException(400, "No data loaded. Please upload data first.")

    dashboard = gm.get_dashboard_data()
    agents    = gm.get_all_agents()
    clients   = gm.get_all_clients()
    promises  = gm.get_unfulfilled_promises()
    history   = [{"role": m.role, "content": m.content} for m in req.history]

    # Usar MCP si disponible, fallback a ChatService estándar
    active_service = mcp_chat if mcp_chat else chat_service
    context = active_service.build_context(dashboard, agents, clients, promises)
    response = await active_service.chat(req.message, context, history)

    source = "mcp_cypher" if (mcp_chat and active_service is mcp_chat) else "context_serialized"
    return {"response": response, "source": source}


# ------------------------------------------------------------------ #
#  Clientes                                                            #
# ------------------------------------------------------------------ #


@app.get("/clientes", tags=["Clientes"])
def list_clients():
    return gm.get_all_clients()


@app.get("/clientes/{cliente_id}", tags=["Clientes"])
def get_client(cliente_id: str):
    client = gm.get_client_by_id(cliente_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client


@app.get("/clientes/{cliente_id}/timeline", tags=["Clientes"])
def client_timeline(cliente_id: str):
    result = gm.get_client_timeline(cliente_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return result


@app.get("/clientes/{cliente_id}/prediccion", tags=["Clientes"])
def get_prediccion(cliente_id: str):
    """Retorna la predicción de probabilidad de pago en los próximos 7 días para un cliente."""
    if cliente_id not in gm.clients:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return predictor.predict(cliente_id)


# ------------------------------------------------------------------ #
#  Agentes                                                             #
# ------------------------------------------------------------------ #


@app.get("/agentes", tags=["Agentes"])
def list_agents():
    return gm.get_all_agents()


@app.get("/agentes/{agente_id}/efectividad", tags=["Agentes"])
def agent_effectiveness(agente_id: str):
    result = gm.get_agent_effectiveness(agente_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    return result


# ------------------------------------------------------------------ #
#  Analytics                                                           #
# ------------------------------------------------------------------ #


@app.get("/analytics/dashboard", tags=["Analytics"])
def dashboard():
    return gm.get_dashboard_data()


@app.get("/analytics/promesas-incumplidas", tags=["Analytics"])
def unfulfilled_promises():
    return gm.get_unfulfilled_promises()


@app.get("/analytics/mejores-horarios", tags=["Analytics"])
def best_hours():
    return gm.get_best_hours()


@app.get("/analytics/anomalias", tags=["Analytics"])
def get_anomalias(
    tipo: Optional[str] = None,
    umbral_promesas_rotas: int = 3,
    dias_inactividad: int = 7,
    umbral_disputas_factor: float = 3.0,
):
    """
    Detecta anomalías en el grafo: agentes con disputas altas, clientes con
    promesas rotas, agentes inactivos y clientes con pagos decrecientes.
    """
    anomalias = anomaly_det.detect(
        gm,
        factor=umbral_disputas_factor,
        threshold=umbral_promesas_rotas,
        days=dias_inactividad,
    )
    if tipo:
        anomalias = [a for a in anomalias if a["tipo"] == tipo]
    return {
        "total_anomalias": len(anomalias),
        "anomalias": anomalias,
        "configuracion": {
            "umbral_promesas_rotas": umbral_promesas_rotas,
            "dias_inactividad": dias_inactividad,
            "umbral_disputas_factor": umbral_disputas_factor,
        },
    }


# ------------------------------------------------------------------ #
#  Graph                                                               #
# ------------------------------------------------------------------ #


@app.get("/graph/data", tags=["Graph"])
def graph_data(
    cliente_id: Optional[str] = None,
    agente_id: Optional[str] = None,
    tipo: Optional[str] = None,
):
    return gm.get_graph_data(cliente_id=cliente_id, agente_id=agente_id, tipo=tipo)
