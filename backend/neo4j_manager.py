"""
neo4j_manager.py — Capa de persistencia en Neo4j para el Analizador de Patrones de Llamadas.

Arquitectura dual:
  - NetworkX (graph_manager.py): grafo en memoria, consultas analíticas rápidas.
  - Neo4j (este módulo): almacenamiento persistente, consultas Cypher avanzadas.

Nodos: Cliente, Agente, Deuda, Interaccion, Pago, PromesaPago, Contacto
Relaciones: TIENE_DEUDA, TUVO_INTERACCION, REALIZA, ATENDIDA_POR,
            GENERA, PROMETE, TUVO_CONTACTO, SE_CUMPLE_CON
"""

import os
from typing import Dict, List, Any, Optional

try:
    from neo4j import AsyncGraphDatabase, AsyncDriver
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False


class Neo4jManager:
    def __init__(self):
        self.driver: Optional[Any] = None
        self.connected = False

    async def connect(self) -> None:
        if not NEO4J_AVAILABLE:
            print("[Neo4j] Driver no instalado — ejecuta: pip install neo4j")
            return

        uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
        user = os.environ.get("NEO4J_USER", "neo4j")
        password = os.environ.get("NEO4J_PASSWORD", "")

        if not password:
            print("[Neo4j] NEO4J_PASSWORD no configurada — modo solo-NetworkX")
            return

        try:
            import asyncio
            self.driver = AsyncGraphDatabase.driver(
                uri,
                auth=(user, password),
                connection_timeout=5,       # segundos para establecer conexión TCP
                max_connection_lifetime=300,
            )
            # Timeout de 6s para no bloquear el startup si Neo4j no está corriendo
            await asyncio.wait_for(self.driver.verify_connectivity(), timeout=6.0)
            self.connected = True
            print(f"[Neo4j] Conectado a {uri}")
            await self._create_constraints()
        except Exception as e:
            self.connected = False
            if self.driver:
                await self.driver.close()
                self.driver = None
            print(f"[Neo4j] No disponible ({type(e).__name__}: {e}) — el sistema continúa con NetworkX")

    async def close(self) -> None:
        if self.driver:
            await self.driver.close()

    async def _create_constraints(self) -> None:
        """Crea índices y constraints para optimizar consultas."""
        constraints = [
            "CREATE CONSTRAINT cliente_id IF NOT EXISTS FOR (c:Cliente) REQUIRE c.id IS UNIQUE",
            "CREATE CONSTRAINT agente_id IF NOT EXISTS FOR (a:Agente) REQUIRE a.id IS UNIQUE",
            "CREATE CONSTRAINT interaccion_id IF NOT EXISTS FOR (i:Interaccion) REQUIRE i.id IS UNIQUE",
            "CREATE CONSTRAINT pago_id IF NOT EXISTS FOR (p:Pago) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT promesa_id IF NOT EXISTS FOR (pr:PromesaPago) REQUIRE pr.id IS UNIQUE",
        ]
        async with self.driver.session() as session:
            for cypher in constraints:
                try:
                    await session.run(cypher)
                except Exception:
                    pass  # constraint ya existe

    # ------------------------------------------------------------------ #
    #  Ingesta                                                             #
    # ------------------------------------------------------------------ #

    async def ingest(self, data: Dict) -> None:
        """Carga todos los datos JSON en Neo4j, reemplazando los existentes."""
        if not self.connected:
            return

        async with self.driver.session() as session:
            # Limpiar grafo anterior
            await session.run("MATCH (n) DETACH DELETE n")

            # Clientes y Deudas
            for client in data.get("clientes", []):
                await session.run(
                    """
                    MERGE (c:Cliente {id: $id})
                    SET c.nombre = $nombre,
                        c.telefono = $telefono,
                        c.monto_deuda_inicial = $monto_deuda_inicial,
                        c.fecha_prestamo = $fecha_prestamo,
                        c.tipo_deuda = $tipo_deuda

                    MERGE (d:Deuda {id: $deuda_id})
                    SET d.monto_inicial = $monto_deuda_inicial,
                        d.tipo = $tipo_deuda,
                        d.fecha_prestamo = $fecha_prestamo

                    MERGE (c)-[:TIENE_DEUDA]->(d)
                    """,
                    id=client["id"],
                    nombre=client.get("nombre", ""),
                    telefono=client.get("telefono", ""),
                    monto_deuda_inicial=client.get("monto_deuda_inicial", 0),
                    fecha_prestamo=client.get("fecha_prestamo", ""),
                    tipo_deuda=client.get("tipo_deuda", ""),
                    deuda_id=f"deuda_{client['id']}",
                )

            # Interacciones
            for interaction in data.get("interacciones", []):
                tipo = interaction.get("tipo", "")

                if tipo == "pago_recibido":
                    await session.run(
                        """
                        MATCH (c:Cliente {id: $cliente_id})
                        MERGE (p:Pago {id: $id})
                        SET p.timestamp = $timestamp,
                            p.monto = $monto,
                            p.metodo_pago = $metodo_pago,
                            p.pago_completo = $pago_completo,
                            p.cliente_id = $cliente_id
                        MERGE (c)-[:REALIZA]->(p)
                        """,
                        id=interaction["id"],
                        cliente_id=interaction["cliente_id"],
                        timestamp=interaction.get("timestamp", ""),
                        monto=interaction.get("monto", 0),
                        metodo_pago=interaction.get("metodo_pago", ""),
                        pago_completo=interaction.get("pago_completo", False),
                    )

                elif tipo in ("llamada_saliente", "llamada_entrante"):
                    agent_id = interaction.get("agente_id")
                    resultado = interaction.get("resultado", "")

                    await session.run(
                        """
                        MATCH (c:Cliente {id: $cliente_id})
                        MERGE (i:Interaccion {id: $id})
                        SET i.timestamp = $timestamp,
                            i.tipo = $tipo,
                            i.duracion_segundos = $duracion_segundos,
                            i.agente_id = $agente_id,
                            i.resultado = $resultado,
                            i.sentimiento = $sentimiento,
                            i.cliente_id = $cliente_id
                        MERGE (c)-[:TUVO_INTERACCION]->(i)
                        """,
                        id=interaction["id"],
                        cliente_id=interaction["cliente_id"],
                        timestamp=interaction.get("timestamp", ""),
                        tipo=tipo,
                        duracion_segundos=interaction.get("duracion_segundos", 0),
                        agente_id=agent_id or "",
                        resultado=resultado,
                        sentimiento=interaction.get("sentimiento", ""),
                    )

                    if agent_id:
                        await session.run(
                            """
                            MERGE (a:Agente {id: $agente_id})
                            WITH a
                            MATCH (i:Interaccion {id: $iid})
                            MERGE (i)-[:ATENDIDA_POR]->(a)
                            """,
                            agente_id=agent_id,
                            iid=interaction["id"],
                        )

                    if resultado == "promesa_pago" and "monto_prometido" in interaction:
                        promise_id = f"promesa_{interaction['id']}"
                        await session.run(
                            """
                            MATCH (c:Cliente {id: $cliente_id})
                            MATCH (i:Interaccion {id: $iid})
                            MERGE (pr:PromesaPago {id: $promise_id})
                            SET pr.monto_prometido = $monto_prometido,
                                pr.fecha_promesa = $fecha_promesa,
                                pr.agente_id = $agente_id,
                                pr.cliente_id = $cliente_id,
                                pr.interaction_timestamp = $interaction_timestamp
                            MERGE (i)-[:GENERA]->(pr)
                            MERGE (c)-[:PROMETE]->(pr)
                            """,
                            promise_id=promise_id,
                            cliente_id=interaction["cliente_id"],
                            iid=interaction["id"],
                            monto_prometido=interaction["monto_prometido"],
                            fecha_promesa=interaction.get("fecha_promesa", ""),
                            agente_id=agent_id or "",
                            interaction_timestamp=interaction.get("timestamp", ""),
                        )

                elif tipo in ("email", "sms"):
                    await session.run(
                        """
                        MATCH (c:Cliente {id: $cliente_id})
                        MERGE (ct:Contacto {id: $id})
                        SET ct.timestamp = $timestamp,
                            ct.tipo = $tipo,
                            ct.cliente_id = $cliente_id
                        MERGE (c)-[:TUVO_CONTACTO]->(ct)
                        """,
                        id=interaction["id"],
                        cliente_id=interaction["cliente_id"],
                        timestamp=interaction.get("timestamp", ""),
                        tipo=tipo,
                    )

        print(f"[Neo4j] Ingesta completada: {len(data.get('clientes', []))} clientes, "
              f"{len(data.get('interacciones', []))} interacciones")

    # ------------------------------------------------------------------ #
    #  Consultas analíticas (Cypher)                                      #
    # ------------------------------------------------------------------ #

    async def get_dashboard_data(self) -> Optional[Dict]:
        """Métricas generales del grafo desde Neo4j."""
        if not self.connected:
            return None
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH (c:Cliente)
                OPTIONAL MATCH (c)-[:REALIZA]->(p:Pago)
                WITH c,
                     coalesce(sum(p.monto), 0) AS total_pagado_cliente
                RETURN
                    count(c) AS total_clientes,
                    sum(c.monto_deuda_inicial) AS total_deuda,
                    sum(total_pagado_cliente) AS total_recuperado
                """
            )
            row = await result.single()
            if not row:
                return None

            total_deuda = row["total_deuda"] or 0
            total_recuperado = row["total_recuperado"] or 0

            agentes = await session.run("MATCH (a:Agente) RETURN count(a) AS total")
            agentes_row = await agentes.single()

            interactions = await session.run(
                "MATCH (i:Interaccion) RETURN count(i) AS total"
            )
            interactions_row = await interactions.single()

            promesas = await session.run(
                """
                MATCH (pr:PromesaPago)
                RETURN count(pr) AS total,
                       sum(CASE WHEN pr.cumplida THEN 1 ELSE 0 END) AS cumplidas
                """
            )
            promesas_row = await promesas.single()

            return {
                "tasa_recuperacion": round(total_recuperado / total_deuda * 100 if total_deuda else 0, 1),
                "total_deuda": round(total_deuda, 2),
                "total_recuperado": round(total_recuperado, 2),
                "total_clientes": row["total_clientes"],
                "total_agentes": agentes_row["total"] if agentes_row else 0,
                "total_interacciones": interactions_row["total"] if interactions_row else 0,
                "total_promesas": promesas_row["total"] if promesas_row else 0,
                "promesas_cumplidas": promesas_row["cumplidas"] if promesas_row else 0,
                "source": "neo4j",
            }

    async def get_client_timeline(self, cliente_id: str) -> Optional[Dict]:
        """Timeline completo de un cliente consultando Neo4j."""
        if not self.connected:
            return None
        async with self.driver.session() as session:
            # Datos del cliente
            client_result = await session.run(
                "MATCH (c:Cliente {id: $id}) RETURN c", id=cliente_id
            )
            client_row = await client_result.single()
            if not client_row:
                return None

            # Interacciones
            ints_result = await session.run(
                """
                MATCH (c:Cliente {id: $id})-[:TUVO_INTERACCION]->(i:Interaccion)
                RETURN i ORDER BY i.timestamp
                """,
                id=cliente_id,
            )
            events = [dict(record["i"]) for record in await ints_result.data()]

            # Pagos
            pagos_result = await session.run(
                """
                MATCH (c:Cliente {id: $id})-[:REALIZA]->(p:Pago)
                RETURN p ORDER BY p.timestamp
                """,
                id=cliente_id,
            )
            pagos = [dict(record["p"]) for record in await pagos_result.data()]

            # Promesas
            promesas_result = await session.run(
                """
                MATCH (c:Cliente {id: $id})-[:PROMETE]->(pr:PromesaPago)
                RETURN pr ORDER BY pr.fecha_promesa
                """,
                id=cliente_id,
            )
            promesas = [dict(record["pr"]) for record in await promesas_result.data()]

            return {
                "cliente": dict(client_row["c"]),
                "interacciones": events,
                "pagos": pagos,
                "promesas": promesas,
                "source": "neo4j",
            }

    async def get_agent_effectiveness(self, agente_id: str) -> Optional[Dict]:
        """Métricas de un agente desde Neo4j."""
        if not self.connected:
            return None
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH (a:Agente {id: $id})
                OPTIONAL MATCH (i:Interaccion)-[:ATENDIDA_POR]->(a)
                RETURN a,
                       count(i) AS total_contactos,
                       collect(i.resultado) AS resultados,
                       collect(i.timestamp) AS timestamps
                """,
                id=agente_id,
            )
            row = await result.single()
            if not row or not row["a"]:
                return None

            resultados = row["resultados"] or []
            from collections import Counter
            result_counts = dict(Counter(r for r in resultados if r))
            exitosos = sum(result_counts.get(k, 0) for k in ("pago_inmediato", "promesa_pago", "renegociacion"))
            total = row["total_contactos"] or 0

            return {
                "id": agente_id,
                "total_contactos": total,
                "resultados": result_counts,
                "tasa_exito": round(exitosos / total * 100 if total else 0, 1),
                "source": "neo4j",
            }

    async def get_unfulfilled_promises(self) -> Optional[List[Dict]]:
        """Promesas vencidas sin cumplir desde Neo4j."""
        if not self.connected:
            return None
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH (c:Cliente)-[:PROMETE]->(pr:PromesaPago)
                WHERE pr.fecha_promesa < '2025-08-12'
                  AND (pr.cumplida IS NULL OR pr.cumplida = false)
                RETURN pr, c.nombre AS cliente_nombre, c.telefono AS telefono
                ORDER BY pr.fecha_promesa
                """
            )
            rows = await result.data()
            return [
                {
                    **dict(row["pr"]),
                    "cliente_nombre": row["cliente_nombre"],
                    "cliente_telefono": row["telefono"],
                }
                for row in rows
            ]

    async def get_graph_stats(self) -> Dict:
        """Estadísticas del grafo Neo4j para la API de status."""
        if not self.connected:
            return {"connected": False}
        async with self.driver.session() as session:
            result = await session.run(
                """
                MATCH (n) RETURN labels(n)[0] AS tipo, count(n) AS total
                """
            )
            rows = await result.data()
            counts = {row["tipo"]: row["total"] for row in rows}
            return {"connected": True, "node_counts": counts}
