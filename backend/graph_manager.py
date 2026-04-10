"""
graph_manager.py — NetworkX-based knowledge graph for call interaction analysis.
Nodes: Cliente, Agente, Interaccion, Pago, PromesaPago, Deuda
Edges: TIENE_DEUDA, TUVO_INTERACCION, REALIZA, ATENDIDA_POR, GENERA, PROMETE
"""

import networkx as nx
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from collections import defaultdict

# Reference date = data generation date
REFERENCE_DATE = datetime(2025, 8, 12, tzinfo=timezone.utc)

RESULTADO_EXITOSO = {"pago_inmediato", "promesa_pago", "renegociacion"}


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


class GraphManager:
    def __init__(self):
        self.reset()

    def reset(self):
        """Clear all data and reinitialize the graph."""
        self.G = nx.DiGraph()
        self.metadata: Dict = {}

        self.clients: Dict[str, Dict] = {}
        self.agents: Dict[str, Dict] = {}
        self.interactions: List[Dict] = []
        self.contacts: List[Dict] = []

        self.payments_by_client: Dict[str, List[Dict]] = defaultdict(list)
        self.promises_by_client: Dict[str, List[Dict]] = defaultdict(list)
        self.interactions_by_client: Dict[str, List[Dict]] = defaultdict(list)

    # ------------------------------------------------------------------ #
    #  Ingestion                                                           #
    # ------------------------------------------------------------------ #

    def ingest(self, data: Dict) -> None:
        self.metadata = data.get("metadata", {})

        for client in data.get("clientes", []):
            self._add_client(client)

        # Sort by timestamp so we process chronologically
        raw_ints = sorted(
            data.get("interacciones", []),
            key=lambda x: x.get("timestamp", ""),
        )
        for interaction in raw_ints:
            self._add_interaction(interaction)

        # Post-processing
        self._compute_promise_fulfillment()
        self._compute_client_metrics()
        self._compute_agent_metrics()

    # ------------------------------------------------------------------ #
    #  Node builders                                                       #
    # ------------------------------------------------------------------ #

    def _add_client(self, client: Dict) -> None:
        cid = client["id"]
        props = {
            "id": cid,
            "nombre": client.get("nombre", ""),
            "telefono": client.get("telefono", ""),
            "monto_deuda_inicial": client.get("monto_deuda_inicial", 0),
            "fecha_prestamo": client.get("fecha_prestamo", ""),
            "tipo_deuda": client.get("tipo_deuda", ""),
            # computed later
            "total_pagado": 0,
            "monto_pendiente": client.get("monto_deuda_inicial", 0),
            "tasa_recuperacion": 0.0,
            "risk_score": 50,
            "estado": "sin_contacto",
            "promesas_hechas": 0,
            "promesas_cumplidas": 0,
            "total_interacciones": 0,
            "total_llamadas": 0,
            "total_pagos": 0,
        }
        self.G.add_node(cid, node_type="cliente", **props)
        self.clients[cid] = props

        # Debt node
        debt_id = f"deuda_{cid}"
        self.G.add_node(
            debt_id,
            node_type="deuda",
            monto_inicial=client.get("monto_deuda_inicial", 0),
            tipo=client.get("tipo_deuda", ""),
            fecha_prestamo=client.get("fecha_prestamo", ""),
        )
        self.G.add_edge(cid, debt_id, edge_type="TIENE_DEUDA")

    def _ensure_agent(self, agent_id: str) -> None:
        if agent_id not in self.G:
            self.G.add_node(
                agent_id,
                node_type="agente",
                id=agent_id,
                total_contactos=0,
                promesas_generadas=0,
                pagos_inmediatos=0,
                renegociaciones=0,
                se_niega=0,
                disputas=0,
                sin_respuesta=0,
            )
            self.agents[agent_id] = {"id": agent_id}

    def _add_interaction(self, interaction: Dict) -> None:
        iid = interaction["id"]
        cid = interaction["cliente_id"]
        tipo = interaction.get("tipo", "")
        ts = interaction.get("timestamp", "")

        if tipo == "pago_recibido":
            payment = {
                "id": iid,
                "cliente_id": cid,
                "timestamp": ts,
                "tipo": tipo,
                "monto": interaction.get("monto", 0),
                "metodo_pago": interaction.get("metodo_pago", ""),
                "pago_completo": interaction.get("pago_completo", False),
            }
            self.G.add_node(iid, node_type="pago", **payment)
            if cid in self.G:
                self.G.add_edge(cid, iid, edge_type="REALIZA")
            self.payments_by_client[cid].append(payment)

            # Running total on client node
            if cid in self.clients:
                self.clients[cid]["total_pagado"] += payment["monto"]
                self.G.nodes[cid]["total_pagado"] = self.clients[cid]["total_pagado"]

        elif tipo in ("llamada_saliente", "llamada_entrante"):
            agent_id = interaction.get("agente_id")
            resultado = interaction.get("resultado", "")
            sentimiento = interaction.get("sentimiento", "")

            int_node = {
                "id": iid,
                "cliente_id": cid,
                "timestamp": ts,
                "tipo": tipo,
                "duracion_segundos": interaction.get("duracion_segundos", 0),
                "agente_id": agent_id,
                "resultado": resultado,
                "sentimiento": sentimiento,
            }

            if resultado == "renegociacion" and "nuevo_plan_pago" in interaction:
                plan = interaction["nuevo_plan_pago"]
                int_node["cuotas"] = plan.get("cuotas")
                int_node["monto_mensual"] = plan.get("monto_mensual")

            self.G.add_node(iid, node_type="interaccion", **int_node)
            if cid in self.G:
                self.G.add_edge(cid, iid, edge_type="TUVO_INTERACCION")

            if agent_id:
                self._ensure_agent(agent_id)
                self.G.add_edge(iid, agent_id, edge_type="ATENDIDA_POR")

            self.interactions_by_client[cid].append(int_node)
            self.interactions.append(int_node)

            # Promises
            if resultado == "promesa_pago" and "monto_prometido" in interaction:
                promise_id = f"promesa_{iid}"
                promise = {
                    "id": promise_id,
                    "interaction_id": iid,
                    "cliente_id": cid,
                    "agente_id": agent_id,
                    "monto_prometido": interaction["monto_prometido"],
                    "fecha_promesa": interaction.get("fecha_promesa", ""),
                    "interaction_timestamp": ts,
                    "cumplida": False,
                    "vencida": False,
                }
                self.G.add_node(promise_id, node_type="promesa", **promise)
                self.G.add_edge(iid, promise_id, edge_type="GENERA")
                if cid in self.G:
                    self.G.add_edge(cid, promise_id, edge_type="PROMETE")
                self.promises_by_client[cid].append(promise)

        elif tipo in ("email", "sms"):
            contact = {
                "id": iid,
                "cliente_id": cid,
                "timestamp": ts,
                "tipo": tipo,
            }
            self.G.add_node(iid, node_type="contacto", **contact)
            if cid in self.G:
                self.G.add_edge(cid, iid, edge_type="TUVO_CONTACTO")
            self.interactions_by_client[cid].append(contact)
            self.contacts.append(contact)

    # ------------------------------------------------------------------ #
    #  Post-processing                                                     #
    # ------------------------------------------------------------------ #

    def _compute_promise_fulfillment(self) -> None:
        for cid, promises in self.promises_by_client.items():
            payments = sorted(
                self.payments_by_client.get(cid, []),
                key=lambda x: x["timestamp"],
            )
            for promise in promises:
                promise_ts = promise["interaction_timestamp"]
                fecha_str = promise.get("fecha_promesa", "")
                monto_prometido = promise["monto_prometido"]

                # Is the due date past?
                fp_dt = _parse_ts(fecha_str + "T00:00:00Z") if fecha_str else None
                promise["vencida"] = bool(fp_dt and fp_dt < REFERENCE_DATE)

                # Payments AFTER the interaction that created the promise
                payments_after = [p for p in payments if p["timestamp"] > promise_ts]
                cumulative = sum(p["monto"] for p in payments_after)
                any_complete = any(p["pago_completo"] for p in payments_after)

                promise["cumplida"] = any_complete or (cumulative >= monto_prometido * 0.5)

                pid = promise["id"]
                if pid in self.G:
                    self.G.nodes[pid]["cumplida"] = promise["cumplida"]
                    self.G.nodes[pid]["vencida"] = promise["vencida"]
                    if promise["cumplida"]:
                        # Link fulfilling payments to promise node
                        for p in payments_after[:1]:
                            if p["id"] in self.G:
                                self.G.add_edge(
                                    promise["id"], p["id"], edge_type="SE_CUMPLE_CON"
                                )

    def _compute_client_metrics(self) -> None:
        for cid, client in self.clients.items():
            interactions = self.interactions_by_client.get(cid, [])
            payments = self.payments_by_client.get(cid, [])
            promises = self.promises_by_client.get(cid, [])

            outcomes = [i.get("resultado", "") for i in interactions if "resultado" in i]
            sentimientos = [
                i.get("sentimiento", "") for i in interactions if "sentimiento" in i
            ]

            se_niega = outcomes.count("se_niega_pagar")
            disputas = outcomes.count("disputa")
            pagos_inmediatos = outcomes.count("pago_inmediato")
            promesas_hechas = len(promises)
            promesas_cumplidas = sum(1 for p in promises if p.get("cumplida"))
            total_pagado = client["total_pagado"]
            monto_deuda = client["monto_deuda_inicial"] or 1

            # Risk score 0-100 (higher = lower risk / more likely to pay)
            risk = 50.0
            risk += pagos_inmediatos * 5
            risk -= se_niega * 8
            risk -= disputas * 5
            if promesas_hechas:
                fulfillment_rate = promesas_cumplidas / promesas_hechas
                risk += fulfillment_rate * 20 - 10
            if total_pagado:
                recovery = min(total_pagado / monto_deuda, 1.0)
                risk += recovery * 15
            if sentimientos.count("hostil") > 2:
                risk -= 10
            risk = max(0, min(100, round(risk, 1)))

            # Current state
            calls = sorted(
                [i for i in interactions if "resultado" in i],
                key=lambda x: x.get("timestamp", ""),
            )
            if payments:
                last_p = sorted(payments, key=lambda x: x["timestamp"])[-1]
                estado = "pago_completo" if last_p.get("pago_completo") else "pago_parcial"
            elif calls:
                estado_map = {
                    "pago_inmediato": "pago_completo",
                    "promesa_pago": "promesa_activa",
                    "renegociacion": "en_renegociacion",
                    "se_niega_pagar": "rehusa_pagar",
                    "disputa": "en_disputa",
                    "sin_respuesta": "sin_respuesta",
                }
                estado = estado_map.get(calls[-1].get("resultado", ""), "contactado")
            else:
                estado = "sin_contacto"

            updates = {
                "total_pagado": round(total_pagado, 2),
                "monto_pendiente": round(max(0, monto_deuda - total_pagado), 2),
                "tasa_recuperacion": round(
                    min(total_pagado / monto_deuda, 1.0) * 100, 1
                ),
                "risk_score": risk,
                "estado": estado,
                "promesas_hechas": promesas_hechas,
                "promesas_cumplidas": promesas_cumplidas,
                "total_interacciones": len(interactions),
                "total_llamadas": sum(
                    1
                    for i in interactions
                    if i.get("tipo") in ("llamada_saliente", "llamada_entrante")
                ),
                "total_pagos": len(payments),
            }
            self.clients[cid].update(updates)
            for k, v in updates.items():
                self.G.nodes[cid][k] = v

    def _compute_agent_metrics(self) -> None:
        for interaction in self.interactions:
            aid = interaction.get("agente_id")
            if not aid or aid not in self.G:
                continue
            node = self.G.nodes[aid]
            resultado = interaction.get("resultado", "")

            node["total_contactos"] = node.get("total_contactos", 0) + 1
            if resultado == "promesa_pago":
                node["promesas_generadas"] = node.get("promesas_generadas", 0) + 1
            elif resultado == "pago_inmediato":
                node["pagos_inmediatos"] = node.get("pagos_inmediatos", 0) + 1
            elif resultado == "renegociacion":
                node["renegociaciones"] = node.get("renegociaciones", 0) + 1
            elif resultado == "se_niega_pagar":
                node["se_niega"] = node.get("se_niega", 0) + 1
            elif resultado == "disputa":
                node["disputas"] = node.get("disputas", 0) + 1
            elif resultado == "sin_respuesta":
                node["sin_respuesta"] = node.get("sin_respuesta", 0) + 1

            self.agents[aid] = {k: v for k, v in node.items()}

    # ------------------------------------------------------------------ #
    #  API helpers                                                         #
    # ------------------------------------------------------------------ #

    def get_all_clients(self) -> List[Dict]:
        return list(self.clients.values())

    def get_client_by_id(self, cid: str) -> Optional[Dict]:
        return self.clients.get(cid)

    def get_client_timeline(self, cid: str) -> Optional[Dict]:
        if cid not in self.clients:
            return None
        client = self.clients[cid]
        interactions = sorted(
            self.interactions_by_client.get(cid, []),
            key=lambda x: x.get("timestamp", ""),
        )
        payments = sorted(
            self.payments_by_client.get(cid, []),
            key=lambda x: x.get("timestamp", ""),
        )
        promises = self.promises_by_client.get(cid, [])

        events = []
        for i in interactions:
            events.append({**i, "category": "interaccion"})
        for p in payments:
            events.append({**p, "category": "pago"})
        events.sort(key=lambda x: x.get("timestamp", ""))

        # Debt evolution
        running = 0.0
        debt_evolution = []
        for e in events:
            if e.get("category") == "pago":
                running += e.get("monto", 0)
            debt_evolution.append(
                {
                    "timestamp": e["timestamp"],
                    "monto_pagado": round(running, 2),
                    "monto_pendiente": round(
                        max(0, client["monto_deuda_inicial"] - running), 2
                    ),
                }
            )

        return {
            "cliente": client,
            "eventos": events,
            "promesas": promises,
            "evolucion_deuda": debt_evolution,
        }

    def get_all_agents(self) -> List[Dict]:
        result = []
        for aid in self.agents:
            if aid not in self.G:
                continue
            nd = dict(self.G.nodes[aid])
            total = nd.get("total_contactos", 0)
            exitosos = (
                nd.get("pagos_inmediatos", 0)
                + nd.get("promesas_generadas", 0)
                + nd.get("renegociaciones", 0)
            )
            result.append(
                {
                    **nd,
                    "tasa_exito": round(exitosos / total * 100 if total else 0, 1),
                }
            )
        return sorted(result, key=lambda x: x.get("total_contactos", 0), reverse=True)

    def get_agent_effectiveness(self, aid: str) -> Optional[Dict]:
        if aid not in self.agents:
            return None
        nd = dict(self.G.nodes[aid])
        total = nd.get("total_contactos", 0)
        exitosos = (
            nd.get("pagos_inmediatos", 0)
            + nd.get("promesas_generadas", 0)
            + nd.get("renegociaciones", 0)
        )
        agent_ints = [i for i in self.interactions if i.get("agente_id") == aid]

        by_day: Dict[str, int] = defaultdict(int)
        by_result: Dict[str, int] = defaultdict(int)
        for i in agent_ints:
            by_day[i["timestamp"][:10]] += 1
            by_result[i.get("resultado", "n/a")] += 1

        return {
            **nd,
            "tasa_exito": round(exitosos / total * 100 if total else 0, 1),
            "actividad_por_dia": dict(by_day),
            "resultados": dict(by_result),
        }

    def get_unfulfilled_promises(self) -> List[Dict]:
        result = []
        for cid, promises in self.promises_by_client.items():
            client = self.clients.get(cid, {})
            for p in promises:
                if p.get("vencida") and not p.get("cumplida"):
                    result.append(
                        {
                            **p,
                            "cliente_nombre": client.get("nombre", ""),
                            "cliente_telefono": client.get("telefono", ""),
                        }
                    )
        return sorted(result, key=lambda x: x.get("fecha_promesa", ""))

    def get_best_hours(self) -> Dict:
        hour_stats: Dict[int, Dict] = defaultdict(
            lambda: {"total": 0, "exitosos": 0, "resultados": defaultdict(int)}
        )
        for interaction in self.interactions:
            ts = interaction.get("timestamp", "")
            if not ts:
                continue
            try:
                hour = int(ts[11:13])
            except (ValueError, IndexError):
                continue
            resultado = interaction.get("resultado", "")
            hour_stats[hour]["total"] += 1
            hour_stats[hour]["resultados"][resultado] += 1
            if resultado in RESULTADO_EXITOSO:
                hour_stats[hour]["exitosos"] += 1

        hours_data = []
        for hour in sorted(hour_stats):
            st = hour_stats[hour]
            total = st["total"]
            exitosos = st["exitosos"]
            hours_data.append(
                {
                    "hora": hour,
                    "total_llamadas": total,
                    "exitosas": exitosos,
                    "tasa_exito": round(exitosos / total * 100 if total else 0, 1),
                    "resultados": dict(st["resultados"]),
                }
            )

        mejor = (
            max(hours_data, key=lambda x: x["tasa_exito"])["hora"]
            if hours_data
            else None
        )
        return {"por_hora": hours_data, "mejor_hora": mejor}

    def get_dashboard_data(self) -> Dict:
        total_deuda = sum(c.get("monto_deuda_inicial", 0) for c in self.clients.values())
        total_recuperado = sum(c.get("total_pagado", 0) for c in self.clients.values())

        all_promises = [p for ps in self.promises_by_client.values() for p in ps]
        total_promesas = len(all_promises)
        promesas_cumplidas = sum(1 for p in all_promises if p.get("cumplida"))
        promesas_vencidas = sum(
            1 for p in all_promises if p.get("vencida") and not p.get("cumplida")
        )

        deuda_por_tipo: Dict[str, float] = defaultdict(float)
        for c in self.clients.values():
            deuda_por_tipo[c.get("tipo_deuda", "otro")] += c.get(
                "monto_deuda_inicial", 0
            )

        estados: Dict[str, int] = defaultdict(int)
        for c in self.clients.values():
            estados[c.get("estado", "sin_contacto")] += 1

        actividad: Dict[str, int] = defaultdict(int)
        for i in self.interactions + self.contacts:
            day = i.get("timestamp", "")[:10]
            if day:
                actividad[day] += 1
        for p_list in self.payments_by_client.values():
            for p in p_list:
                day = p.get("timestamp", "")[:10]
                if day:
                    actividad[day] += 1

        risk_dist = {"alto": 0, "medio": 0, "bajo": 0}
        for c in self.clients.values():
            r = c.get("risk_score", 50)
            if r < 35:
                risk_dist["alto"] += 1
            elif r < 65:
                risk_dist["medio"] += 1
            else:
                risk_dist["bajo"] += 1

        resultado_dist: Dict[str, int] = defaultdict(int)
        for i in self.interactions:
            resultado_dist[i.get("resultado", "n/a")] += 1

        return {
            "tasa_recuperacion": round(
                total_recuperado / total_deuda * 100 if total_deuda else 0, 1
            ),
            "total_deuda": round(total_deuda, 2),
            "total_recuperado": round(total_recuperado, 2),
            "total_clientes": len(self.clients),
            "total_agentes": len(self.agents),
            "total_interacciones": len(self.interactions) + len(self.contacts),
            "total_promesas": total_promesas,
            "promesas_cumplidas": promesas_cumplidas,
            "promesas_vencidas": promesas_vencidas,
            "tasa_promesas": round(
                promesas_cumplidas / total_promesas * 100 if total_promesas else 0, 1
            ),
            "deuda_por_tipo": dict(deuda_por_tipo),
            "clientes_por_estado": dict(estados),
            "actividad_por_dia": dict(sorted(actividad.items())),
            "distribucion_riesgo": risk_dist,
            "resultados_interacciones": dict(resultado_dist),
        }

    def get_graph_data(
        self,
        cliente_id: Optional[str] = None,
        agente_id: Optional[str] = None,
        tipo: Optional[str] = None,
    ) -> Dict:
        COLORS = {
            "cliente": "#3B82F6",
            "agente": "#10B981",
            "deuda": "#EF4444",
            "interaccion": "#F59E0B",
            "pago": "#8B5CF6",
            "promesa": "#F97316",
            "contacto": "#6B7280",
        }

        nodes = []
        edges = []
        included: set = set()

        def add_node(nid: str):
            if nid in included or nid not in self.G:
                return
            nd = dict(self.G.nodes[nid])
            nt = nd.get("node_type", "unknown")
            label = nd.get("nombre", nd.get("id", nid))
            nodes.append(
                {
                    "data": {
                        "id": nid,
                        "label": label,
                        "type": nt,
                        "color": COLORS.get(nt, "#999"),
                        **{
                            k: v
                            for k, v in nd.items()
                            if isinstance(v, (str, int, float, bool))
                            and k not in ("node_type",)
                        },
                    }
                }
            )
            included.add(nid)

        if cliente_id:
            # Ego-graph radius 2 around the client
            sub_nodes = nx.ego_graph(self.G, cliente_id, radius=2).nodes()
            for nid in sub_nodes:
                add_node(nid)
        else:
            # Overview: clients + agents only
            for cid in self.clients:
                add_node(cid)
            for aid in self.agents:
                add_node(aid)

            if agente_id:
                # Also pull interactions for that agent
                for i in self.interactions:
                    if i.get("agente_id") == agente_id:
                        add_node(i["id"])

        # Edges among included nodes
        edge_counts: Dict[tuple, int] = defaultdict(int)
        for u, v, data in self.G.edges(data=True):
            if u in included and v in included:
                et = data.get("edge_type", "")
                # Aggregate client->agent edges
                un = self.G.nodes.get(u, {}).get("node_type", "")
                vn = self.G.nodes.get(v, {}).get("node_type", "")
                if un == "cliente" and vn == "agente":
                    edge_counts[(u, v)] += 1
                elif un == "interaccion" and vn == "agente":
                    edge_counts[(u, v)] += 1
                else:
                    edges.append(
                        {
                            "data": {
                                "id": f"{u}__{v}",
                                "source": u,
                                "target": v,
                                "label": et,
                            }
                        }
                    )

        # Build aggregated client-agent edges from interaction graph
        if not cliente_id:
            ca_counts: Dict[tuple, int] = defaultdict(int)
            for i in self.interactions:
                cid = i.get("cliente_id")
                aid = i.get("agente_id")
                if cid in included and aid in included:
                    ca_counts[(cid, aid)] += 1
            for (cid, aid), cnt in ca_counts.items():
                edges.append(
                    {
                        "data": {
                            "id": f"{cid}__{aid}",
                            "source": cid,
                            "target": aid,
                            "label": f"{cnt}",
                            "weight": cnt,
                        }
                    }
                )

        return {"nodes": nodes, "edges": edges}
