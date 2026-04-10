"""
chat_service.py — Gemini-powered chat assistant for call pattern analysis.
Uses the google-genai SDK (v1.x), replacing the deprecated google-generativeai.
"""

from google import genai
from google.genai import types
from typing import Dict, List, Optional


SYSTEM_PROMPT = """Eres un asistente analítico experto para un sistema de cobranzas llamado "Analizador de Patrones de Llamadas".

Tu rol es responder preguntas sobre los datos de cobro: clientes, agentes, interacciones, pagos, promesas y métricas de rendimiento.

Reglas:
- Responde siempre en español
- Sé conciso pero informativo — respuestas cortas y directas
- Usa los datos proporcionados en el contexto para responder con precisión
- Si te preguntan recomendaciones, basa las sugerencias en los datos reales
- Formatea números grandes con separadores (ej: $1,500)
- Si no tienes suficiente información para responder, dilo claramente
- No inventes datos que no estén en el contexto
"""


class ChatService:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key) if api_key else None
        self.model = "gemini-2.5-flash"

    def build_context(
        self,
        dashboard: Dict,
        agents: List[Dict],
        clients: List[Dict],
        promises: Optional[List[Dict]] = None,
    ) -> str:
        ctx = f"""DATOS ACTUALES DEL SISTEMA:

Métricas generales:
- Tasa de recuperación: {dashboard.get('tasa_recuperacion', 0)}%
- Total deuda: ${dashboard.get('total_deuda', 0):,.2f}
- Total recuperado: ${dashboard.get('total_recuperado', 0):,.2f}
- Clientes: {dashboard.get('total_clientes', 0)}
- Agentes: {dashboard.get('total_agentes', 0)}
- Interacciones totales: {dashboard.get('total_interacciones', 0)}
- Promesas totales: {dashboard.get('total_promesas', 0)}
- Promesas cumplidas: {dashboard.get('promesas_cumplidas', 0)}
- Promesas vencidas: {dashboard.get('promesas_vencidas', 0)}
- Tasa de cumplimiento: {dashboard.get('tasa_promesas', 0)}%

Distribución de riesgo:
- Alto riesgo: {dashboard.get('distribucion_riesgo', {}).get('alto', 0)} clientes
- Medio riesgo: {dashboard.get('distribucion_riesgo', {}).get('medio', 0)} clientes
- Bajo riesgo: {dashboard.get('distribucion_riesgo', {}).get('bajo', 0)} clientes

Deuda por tipo:
"""
        for tipo, monto in dashboard.get("deuda_por_tipo", {}).items():
            ctx += f"- {tipo.replace('_', ' ')}: ${monto:,.2f}\n"

        ctx += "\nResultados de interacciones:\n"
        for res, cnt in dashboard.get("resultados_interacciones", {}).items():
            ctx += f"- {res.replace('_', ' ')}: {cnt}\n"

        ctx += "\nAgentes (todos):\n"
        for a in agents:
            ctx += (
                f"- {a['id']}: {a.get('total_contactos', 0)} contactos, "
                f"tasa éxito {a.get('tasa_exito', 0)}%, "
                f"pagos inmediatos: {a.get('pagos_inmediatos', 0)}, "
                f"promesas generadas: {a.get('promesas_generadas', 0)}, "
                f"renegociaciones: {a.get('renegociaciones', 0)}, "
                f"se niega: {a.get('se_niega', 0)}, "
                f"disputas: {a.get('disputas', 0)}\n"
            )

        ctx += f"\nClientes ({len(clients)} total):\n"
        for c in clients:
            ctx += (
                f"- {c['nombre']} ({c['id']}): "
                f"deuda inicial ${c.get('monto_deuda_inicial', 0):,.0f}, "
                f"pagado ${c.get('total_pagado', 0):,.0f}, "
                f"pendiente ${c.get('monto_pendiente', 0):,.0f}, "
                f"estado: {c.get('estado', '?')}, "
                f"risk score: {c.get('risk_score', 0)}, "
                f"promesas: {c.get('promesas_cumplidas', 0)}/{c.get('promesas_hechas', 0)}\n"
            )

        if promises:
            ctx += f"\nPromesas vencidas sin cumplir ({len(promises)}):\n"
            for p in promises[:20]:
                ctx += (
                    f"- {p.get('cliente_nombre', '?')}: "
                    f"${p.get('monto_prometido', 0):,.0f} "
                    f"para {p.get('fecha_promesa', '?')} "
                    f"(agente: {p.get('agente_id', '?')})\n"
                )

        return ctx

    async def chat(
        self, message: str, context: str, history: List[Dict] = None
    ) -> str:
        if not self.client:
            return "Error: GEMINI_API_KEY no configurada."
        try:
            # Construir historial de conversación
            contents: List[types.Content] = []

            # Contexto de datos como primer turno
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part(text=f"Contexto de datos actualizado:\n\n{context}")],
                )
            )
            contents.append(
                types.Content(
                    role="model",
                    parts=[types.Part(text="Datos cargados. ¿En qué puedo ayudarte?")],
                )
            )

            # Historial previo (últimos 10 turnos)
            if history:
                for msg in history[-10:]:
                    role = "user" if msg.get("role") == "user" else "model"
                    contents.append(
                        types.Content(
                            role=role,
                            parts=[types.Part(text=msg.get("content", ""))],
                        )
                    )

            # Mensaje actual
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part(text=message)],
                )
            )

            response = await self.client.aio.models.generate_content(
                model=self.model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.3,
                ),
            )
            return response.text
        except Exception as e:
            import traceback, sys
            print(f"[CHAT ERROR] {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            err_str = str(e)
            if "RESOURCE_EXHAUSTED" in err_str or "429" in err_str:
                return (
                    "La API de Gemini ha alcanzado su límite de solicitudes. "
                    "Por favor espera unos minutos e intenta de nuevo."
                )
            if "UNAVAILABLE" in err_str or "503" in err_str:
                return (
                    "Los servidores de Gemini están con alta demanda en este momento. "
                    "Esto es temporal — intenta de nuevo en unos segundos."
                )
            return "Ocurrió un error al procesar tu consulta. Por favor intenta de nuevo."
