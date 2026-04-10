"""
anomaly_detector.py — Detección de anomalías en el grafo de interacciones.

Implementa 4 detectores:
  a) Agentes con tasa de disputas anormalmente alta
  b) Clientes con promesas consecutivas rotas
  c) Agentes inactivos
  d) Clientes con pagos estrictamente decrecientes
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from graph_manager import GraphManager

REFERENCE_DATE = datetime(2025, 8, 12, tzinfo=timezone.utc)


def _parse_ts(ts_str: str) -> Optional[datetime]:
    if not ts_str:
        return None
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class AnomalyDetector:
    """Detecta patrones anómalos en los datos del grafo de cobros."""

    def detect(
        self,
        gm: "GraphManager",
        factor: float = 3.0,
        threshold: int = 3,
        days: int = 7,
    ) -> List[Dict]:
        """
        Ejecuta los 4 detectores y retorna la lista combinada de anomalías.

        Args:
            gm: instancia de GraphManager con datos ya ingestados.
            factor: multiplicador sobre el promedio de disputas para detectar agentes.
            threshold: mínimo de promesas consecutivas rotas para alertar.
            days: días de inactividad antes de marcar a un agente.
        """
        anomalias: List[Dict] = []

        try:
            anomalias.extend(self._detect_high_dispute_agents(gm, factor=factor))
        except Exception as e:
            print(f"[WARN] _detect_high_dispute_agents falló: {e}")

        try:
            anomalias.extend(self._detect_broken_promises(gm, threshold=threshold))
        except Exception as e:
            print(f"[WARN] _detect_broken_promises falló: {e}")

        try:
            anomalias.extend(self._detect_inactive_agents(gm, days=days))
        except Exception as e:
            print(f"[WARN] _detect_inactive_agents falló: {e}")

        try:
            anomalias.extend(self._detect_decreasing_payments(gm))
        except Exception as e:
            print(f"[WARN] _detect_decreasing_payments falló: {e}")

        # Asignar IDs secuenciales
        for idx, anomalia in enumerate(anomalias, start=1):
            anomalia["id"] = f"ANO-{idx:03d}"

        return anomalias

    # ------------------------------------------------------------------ #
    #  Detector A: Agentes con alta tasa de disputas                       #
    # ------------------------------------------------------------------ #

    def _detect_high_dispute_agents(
        self, gm: "GraphManager", factor: float = 3.0
    ) -> List[Dict]:
        """
        Detecta agentes cuya tasa de disputas es >= factor * promedio del equipo
        y tienen al menos 5 contactos.
        """
        DISPUTA_RESULTADOS = {"disputa", "disputa_abierta"}

        # Calcular tasa de disputas por agente
        agent_stats: Dict[str, Dict[str, int]] = {}
        for interaction in gm.interactions:
            aid = interaction.get("agente_id")
            if not aid:
                continue
            if aid not in agent_stats:
                agent_stats[aid] = {"total": 0, "disputas": 0}
            agent_stats[aid]["total"] += 1
            if interaction.get("resultado") in DISPUTA_RESULTADOS:
                agent_stats[aid]["disputas"] += 1

        if not agent_stats:
            return []

        # Calcular promedio del equipo (solo agentes con >= 1 contacto)
        tasas = []
        for stats in agent_stats.values():
            total = stats["total"]
            if total > 0:
                tasas.append(stats["disputas"] / total)

        if not tasas:
            return []

        promedio = sum(tasas) / len(tasas)

        # Umbral mínimo para evitar falsos positivos con promedios bajísimos
        MIN_AVERAGE = 0.01

        anomalias: List[Dict] = []
        for aid, stats in agent_stats.items():
            total = stats["total"]
            if total < 5:
                continue

            tasa = stats["disputas"] / total
            umbral_efectivo = max(promedio, MIN_AVERAGE) * factor

            if tasa >= umbral_efectivo:
                ratio = round(tasa / max(promedio, MIN_AVERAGE), 1)

                if ratio >= 3.0:
                    severidad = "alta"
                else:
                    severidad = "media"

                anomalias.append(
                    {
                        "id": "",  # se asigna en detect()
                        "tipo": "agente_disputas_alto",
                        "severidad": severidad,
                        "entidad_tipo": "agente",
                        "entidad_id": aid,
                        "descripcion": (
                            f"El agente {aid} tiene una tasa de disputas "
                            f"{ratio}x el promedio del equipo "
                            f"({round(tasa * 100, 1)}% vs {round(promedio * 100, 1)}% promedio)"
                        ),
                        "datos": {
                            "total_contactos": total,
                            "total_disputas": stats["disputas"],
                            "tasa_disputas": round(tasa, 4),
                            "promedio_equipo": round(promedio, 4),
                            "ratio_vs_promedio": ratio,
                        },
                        "recomendacion": (
                            f"Revisar la técnica de cobro del agente {aid}. "
                            "Considerar capacitación en manejo de objeciones y "
                            "desescalada de conflictos."
                        ),
                    }
                )

        return anomalias

    # ------------------------------------------------------------------ #
    #  Detector B: Clientes con promesas consecutivas rotas                #
    # ------------------------------------------------------------------ #

    def _detect_broken_promises(
        self, gm: "GraphManager", threshold: int = 3
    ) -> List[Dict]:
        """
        Detecta clientes con >= threshold promesas consecutivas vencidas y no cumplidas.
        """
        anomalias: List[Dict] = []

        for cid, promises in gm.promises_by_client.items():
            if not promises:
                continue

            # Ordenar por timestamp de la interacción que generó la promesa
            sorted_promises = sorted(
                promises,
                key=lambda p: p.get("interaction_timestamp", ""),
            )

            # Contar rachas de promesas rotas consecutivas
            max_racha = 0
            racha_actual = 0
            for p in sorted_promises:
                vencida = p.get("vencida", False)
                cumplida = p.get("cumplida", False)
                if vencida and not cumplida:
                    racha_actual += 1
                    max_racha = max(max_racha, racha_actual)
                else:
                    racha_actual = 0  # se rompe la racha

            if max_racha >= threshold:
                severidad = "alta" if max_racha >= 5 else "media"
                client_info = gm.clients.get(cid, {})
                monto_total_prometido = sum(
                    p.get("monto_prometido", 0)
                    for p in sorted_promises
                    if p.get("vencida") and not p.get("cumplida")
                )

                anomalias.append(
                    {
                        "id": "",
                        "tipo": "cliente_promesas_rotas",
                        "severidad": severidad,
                        "entidad_tipo": "cliente",
                        "entidad_id": cid,
                        "descripcion": (
                            f"El cliente {client_info.get('nombre', cid)} tiene "
                            f"{max_racha} promesas de pago consecutivas incumplidas"
                        ),
                        "datos": {
                            "cliente_nombre": client_info.get("nombre", ""),
                            "total_promesas": len(sorted_promises),
                            "promesas_rotas_consecutivas": max_racha,
                            "monto_total_prometido_incumplido": round(
                                monto_total_prometido, 2
                            ),
                            "monto_pendiente": client_info.get("monto_pendiente", 0),
                        },
                        "recomendacion": (
                            "Escalar el caso a supervisor. Evaluar cambio de estrategia: "
                            "visita en persona, acuerdo de pago alternativo o proceso legal."
                        ),
                    }
                )

        return anomalias

    # ------------------------------------------------------------------ #
    #  Detector C: Agentes inactivos                                       #
    # ------------------------------------------------------------------ #

    def _detect_inactive_agents(
        self, gm: "GraphManager", days: int = 7
    ) -> List[Dict]:
        """
        Detecta agentes que no han tenido interacciones en los últimos `days` días
        contados desde REFERENCE_DATE.
        """
        cutoff = REFERENCE_DATE - timedelta(days=days)
        anomalias: List[Dict] = []

        # Último timestamp de interacción por agente
        ultimo_por_agente: Dict[str, Optional[datetime]] = {
            aid: None for aid in gm.agents
        }

        for interaction in gm.interactions:
            aid = interaction.get("agente_id")
            if not aid or aid not in ultimo_por_agente:
                continue
            ts = _parse_ts(interaction.get("timestamp", ""))
            if ts is None:
                continue
            if ultimo_por_agente[aid] is None or ts > ultimo_por_agente[aid]:
                ultimo_por_agente[aid] = ts

        for aid, ultimo_ts in ultimo_por_agente.items():
            if ultimo_ts is None or ultimo_ts < cutoff:
                if ultimo_ts is None:
                    dias_inactivo = None
                    ultima_fecha_str = "nunca"
                else:
                    dias_inactivo = (REFERENCE_DATE - ultimo_ts).days
                    ultima_fecha_str = ultimo_ts.strftime("%Y-%m-%d")

                agent_info = gm.agents.get(aid, {})
                total_contactos = agent_info.get("total_contactos", 0) or (
                    gm.G.nodes[aid].get("total_contactos", 0) if aid in gm.G else 0
                )

                anomalias.append(
                    {
                        "id": "",
                        "tipo": "agente_inactivo",
                        "severidad": "media",
                        "entidad_tipo": "agente",
                        "entidad_id": aid,
                        "descripcion": (
                            f"El agente {aid} no ha registrado interacciones "
                            f"en los últimos {dias_inactivo if dias_inactivo else '7+'} días "
                            f"(última actividad: {ultima_fecha_str})"
                        ),
                        "datos": {
                            "ultima_interaccion": ultima_fecha_str,
                            "dias_inactivo": dias_inactivo,
                            "umbral_dias": days,
                            "total_contactos_historicos": total_contactos,
                        },
                        "recomendacion": (
                            f"Verificar disponibilidad del agente {aid}. "
                            "Si está en ausencia, reasignar su cartera de clientes."
                        ),
                    }
                )

        return anomalias

    # ------------------------------------------------------------------ #
    #  Detector D: Clientes con pagos decrecientes                         #
    # ------------------------------------------------------------------ #

    def _detect_decreasing_payments(self, gm: "GraphManager") -> List[Dict]:
        """
        Detecta clientes cuyo monto de los últimos 3 pagos es estrictamente
        decreciente (señal de deterioro de capacidad de pago).
        """
        anomalias: List[Dict] = []

        for cid, payments in gm.payments_by_client.items():
            if len(payments) < 3:
                continue

            sorted_payments = sorted(payments, key=lambda p: p.get("timestamp", ""))
            montos = [p.get("monto", 0) for p in sorted_payments]

            # Verificar si los últimos 3 montos son estrictamente decrecientes
            ultimos_3 = montos[-3:]
            if not (ultimos_3[0] > ultimos_3[1] > ultimos_3[2]):
                continue

            # Calcular severidad
            primer_monto = montos[0] if montos[0] > 0 else 1
            ultimo_monto = montos[-1]
            ratio_caida = ultimo_monto / primer_monto

            if ratio_caida < 0.5:
                severidad = "alta"
            else:
                severidad = "media"

            client_info = gm.clients.get(cid, {})
            caida_porcentual = round((1 - ratio_caida) * 100, 1)

            anomalias.append(
                {
                    "id": "",
                    "tipo": "cliente_pagos_decrecientes",
                    "severidad": severidad,
                    "entidad_tipo": "cliente",
                    "entidad_id": cid,
                    "descripcion": (
                        f"El cliente {client_info.get('nombre', cid)} muestra una "
                        f"tendencia decreciente en sus pagos: los últimos 3 montos son "
                        f"{[round(m, 2) for m in ultimos_3]} "
                        f"(caída del {caida_porcentual}% respecto al primer pago)"
                    ),
                    "datos": {
                        "cliente_nombre": client_info.get("nombre", ""),
                        "total_pagos": len(payments),
                        "ultimos_3_montos": [round(m, 2) for m in ultimos_3],
                        "primer_pago_monto": round(montos[0], 2),
                        "ultimo_pago_monto": round(ultimo_monto, 2),
                        "caida_porcentual": caida_porcentual,
                        "monto_pendiente": client_info.get("monto_pendiente", 0),
                    },
                    "recomendacion": (
                        "Contactar al cliente para evaluar situación financiera. "
                        "Considerar renegociación del plan de pago o reducción temporal de cuotas."
                    ),
                }
            )

        return anomalias
