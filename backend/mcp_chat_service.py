"""
mcp_chat_service.py — Chat con Gemini function calling sobre Neo4j.

En lugar de serializar todos los datos como texto, el LLM puede ejecutar
consultas Cypher de solo lectura sobre el grafo Neo4j directamente.

Guardrails:
- Solo MATCH/RETURN/WITH/WHERE/ORDER/LIMIT/SKIP/CALL (subquery lectura)
- No CREATE, MERGE, DELETE, SET, REMOVE, DROP
- Límite automático de 50 resultados si no hay LIMIT
- Timeout de 10s por query
"""

import os
import re
import asyncio
import json
from typing import List, Dict, Optional

from google import genai
from google.genai import types

try:
    from neo4j import AsyncGraphDatabase
    NEO4J_SDK = True
except ImportError:
    NEO4J_SDK = False


SYSTEM_PROMPT = """Eres un asistente analítico experto para un sistema de cobranzas llamado "Analizador de Patrones de Llamadas".

Tienes acceso a una base de datos Neo4j con el siguiente esquema:

NODOS:
- Cliente(id, nombre, telefono, monto_deuda_inicial, tipo_deuda, fecha_prestamo)
- Agente(id)
- Interaccion(id, tipo, timestamp, resultado, duracion_segundos, sentimiento, agente_id, cliente_id)
- Pago(id, monto, timestamp, metodo_pago, pago_completo, cliente_id)
- PromesaPago(id, monto_prometido, fecha_promesa, cumplida, agente_id, cliente_id)
- Deuda(id, monto_inicial, tipo, fecha_prestamo)

RELACIONES:
- (Cliente)-[:TIENE_DEUDA]->(Deuda)
- (Cliente)-[:TUVO_INTERACCION]->(Interaccion)
- (Cliente)-[:REALIZA]->(Pago)
- (Interaccion)-[:ATENDIDA_POR]->(Agente)
- (Interaccion)-[:GENERA]->(PromesaPago)
- (Cliente)-[:PROMETE]->(PromesaPago)

Reglas:
- Responde siempre en español
- Sé conciso pero informativo
- Usa las herramientas disponibles para obtener datos reales del grafo
- Si no encuentras datos suficientes, dilo claramente
- No inventes datos que no estén en la base de datos
- Formatea números grandes con separadores (ej: $1,500)
"""

# Palabras prohibidas en queries Cypher (escritura)
_WRITE_KEYWORDS = re.compile(
    r'\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|CALL\s+\{.*WRITE|LOAD\s+CSV)\b',
    re.IGNORECASE,
)


def _is_safe_cypher(query: str) -> bool:
    """Retorna True si la query es de solo lectura."""
    return not bool(_WRITE_KEYWORDS.search(query))


def _add_limit(query: str) -> str:
    """Agrega LIMIT 50 si la query no tiene LIMIT."""
    if re.search(r'\bLIMIT\b', query, re.IGNORECASE):
        return query
    return query.rstrip().rstrip(';') + '\nLIMIT 50'


class MCPChatService:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key) if api_key else None
        self.model  = "gemini-2.5-flash"
        self.driver = None
        self.neo4j_available = False

    async def connect_neo4j(self) -> None:
        """Establece conexión con Neo4j. Llama en el startup."""
        if not NEO4J_SDK:
            print("[MCP] neo4j SDK no instalado")
            return

        uri      = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
        user     = os.environ.get("NEO4J_USER") or os.environ.get("NEO4J_USERNAME", "neo4j")
        password = os.environ.get("NEO4J_PASSWORD", "")
        self.database = os.environ.get("NEO4J_DATABASE", None)

        if not password:
            return

        try:
            self.driver = AsyncGraphDatabase.driver(
                uri, auth=(user, password), connection_timeout=15,
            )
            await asyncio.wait_for(self.driver.verify_connectivity(), timeout=20.0)
            self.neo4j_available = True
            print(f"[MCP] Conectado a Neo4j en {uri}")
        except Exception as e:
            self.neo4j_available = False
            if self.driver:
                await self.driver.close()
                self.driver = None
            print(f"[MCP] Neo4j no disponible: {e}")

    async def close(self) -> None:
        if self.driver:
            await self.driver.close()

    async def _run_cypher(self, query: str) -> List[Dict]:
        """Ejecuta Cypher de solo lectura y retorna lista de dicts."""
        if not self.neo4j_available or not self.driver:
            return [{"error": "Neo4j no disponible"}]

        if not _is_safe_cypher(query):
            return [{"error": "Query rechazada: contiene operaciones de escritura"}]

        safe_query = _add_limit(query)

        try:
            async with self.driver.session(database=self.database) as session:
                result = await asyncio.wait_for(
                    session.run(safe_query),
                    timeout=10.0,
                )
                rows = await result.data()
                # Serializar a tipos JSON simples
                clean = []
                for row in rows:
                    clean_row = {}
                    for k, v in row.items():
                        if hasattr(v, '_properties'):   # nodo Neo4j
                            clean_row[k] = dict(v)
                        elif isinstance(v, (int, float, str, bool, type(None))):
                            clean_row[k] = v
                        else:
                            clean_row[k] = str(v)
                    clean.append(clean_row)
                return clean
        except asyncio.TimeoutError:
            return [{"error": "Timeout: la consulta tardó más de 10 segundos"}]
        except Exception as e:
            return [{"error": f"Error en query: {e}"}]

    async def _run_metricas(self) -> Dict:
        """Retorna métricas generales del grafo."""
        if not self.neo4j_available:
            return {"error": "Neo4j no disponible"}
        try:
            async with self.driver.session(database=self.database) as session:
                r = await session.run(
                    """
                    MATCH (c:Cliente)
                    OPTIONAL MATCH (c)-[:REALIZA]->(p:Pago)
                    WITH c, coalesce(sum(p.monto), 0) AS pagado
                    WITH count(c) AS total_clientes,
                         sum(c.monto_deuda_inicial) AS total_deuda,
                         sum(pagado) AS total_recuperado
                    RETURN total_clientes, total_deuda, total_recuperado,
                           round(total_recuperado * 100.0 / nullif(total_deuda,0), 1) AS tasa_recuperacion
                    """
                )
                row = await r.single()
                if row:
                    return dict(row)
                return {}
        except Exception as e:
            return {"error": str(e)}

    # ── Tool definitions para Gemini ──────────────────────────────────────

    def _get_tools(self):
        return [
            types.Tool(function_declarations=[
                types.FunctionDeclaration(
                    name="ejecutar_cypher",
                    description=(
                        "Ejecuta una consulta Cypher de solo lectura (MATCH/RETURN) "
                        "sobre la base de datos Neo4j del sistema de cobranzas. "
                        "Úsala para responder preguntas específicas sobre clientes, "
                        "agentes, deudas, pagos y promesas."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "query": types.Schema(
                                type=types.Type.STRING,
                                description="Consulta Cypher de solo lectura. Solo MATCH/RETURN/WITH/WHERE/ORDER BY/LIMIT.",
                            ),
                        },
                        required=["query"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="obtener_metricas_generales",
                    description=(
                        "Obtiene las métricas generales del sistema: total de clientes, "
                        "deuda total, total recuperado y tasa de recuperación."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={},
                    ),
                ),
            ])
        ]

    # ── build_context ─────────────────────────────────────────────────────

    def build_context(self, dashboard, agents, clients, promises=None) -> str:
        """Contexto mínimo — el LLM tiene acceso directo a Neo4j via tools."""
        return (
            f"Resumen del sistema: {dashboard.get('total_clientes',0)} clientes, "
            f"{dashboard.get('total_agentes',0)} agentes, "
            f"deuda total ${dashboard.get('total_deuda',0):,.0f}, "
            f"recuperado ${dashboard.get('total_recuperado',0):,.0f} "
            f"({dashboard.get('tasa_recuperacion',0)}%). "
            "Usa las herramientas disponibles para responder con datos precisos."
        )

    # ── chat ──────────────────────────────────────────────────────────────

    async def chat(self, message: str, context: str, history: List[Dict] = None) -> str:
        if not self.client:
            return "Error: GEMINI_API_KEY no configurada."

        try:
            contents: List[types.Content] = []

            # Contexto inicial
            contents.append(types.Content(
                role="user",
                parts=[types.Part(text=f"Contexto actual:\n{context}")],
            ))
            contents.append(types.Content(
                role="model",
                parts=[types.Part(text="Entendido. Tengo acceso a Neo4j para consultas en tiempo real. ¿En qué puedo ayudarte?")],
            ))

            # Historial
            if history:
                for msg in history[-8:]:
                    role = "user" if msg.get("role") == "user" else "model"
                    contents.append(types.Content(
                        role=role,
                        parts=[types.Part(text=msg.get("content", ""))],
                    ))

            # Mensaje actual
            contents.append(types.Content(
                role="user",
                parts=[types.Part(text=message)],
            ))

            # Agentic loop: máximo 4 rondas de tool calls
            for _ in range(4):
                response = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        temperature=0.2,
                        tools=self._get_tools() if self.neo4j_available else None,
                    ),
                )

                candidate = response.candidates[0] if response.candidates else None
                if not candidate:
                    break

                # Si hay function calls, ejecutarlas
                tool_calls = [
                    p for p in candidate.content.parts
                    if hasattr(p, 'function_call') and p.function_call
                ]

                if not tool_calls:
                    # Respuesta de texto final
                    return response.text or "No se pudo generar una respuesta."

                # Agregar respuesta del modelo al historial
                contents.append(candidate.content)

                # Ejecutar cada tool call y agregar resultados
                tool_results = []
                for part in tool_calls:
                    fc   = part.function_call
                    name = fc.name
                    args = dict(fc.args) if fc.args else {}

                    if name == "ejecutar_cypher":
                        result = await self._run_cypher(args.get("query", ""))
                    elif name == "obtener_metricas_generales":
                        result = await self._run_metricas()
                    else:
                        result = {"error": f"Herramienta desconocida: {name}"}

                    tool_results.append(
                        types.Part(function_response=types.FunctionResponse(
                            name=name,
                            response={"result": json.dumps(result, ensure_ascii=False, default=str)},
                        ))
                    )

                contents.append(types.Content(role="tool", parts=tool_results))

            # Si salimos del loop sin respuesta de texto
            return "No pude completar la consulta. Por favor intenta reformulando tu pregunta."

        except Exception as e:
            import traceback, sys
            print(f"[MCP CHAT ERROR] {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            err_str = str(e)
            if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
                return "La API de Gemini ha alcanzado su límite. Espera unos minutos e intenta de nuevo."
            if "UNAVAILABLE" in err_str or "503" in err_str:
                return "Los servidores de Gemini están con alta demanda. Intenta de nuevo en unos segundos."
            return "Ocurrió un error al procesar tu consulta. Por favor intenta de nuevo."
