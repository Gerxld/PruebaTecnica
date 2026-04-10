# PRD v2.0 — Analizador de Patrones de Llamadas

| Campo             | Valor                                                    |
| ----------------- | -------------------------------------------------------- |
| **Proyecto**      | Analizador de Patrones de Llamadas                       |
| **Version PRD**   | 2.0.0                                                    |
| **Fecha**         | 2026-04-09                                               |
| **Autor**         | BrainPRD (agente orquestador)                            |
| **Estado**        | Aprobado para desarrollo — extension de funcionalidades  |
| **PRD anterior**  | PRD v1.0.0 (2026-04-09) — remediacion y migracion       |

---

## 1. Meta & Vision

### 1.1 Resumen ejecutivo

Este PRD documenta la segunda fase de desarrollo del **Analizador de Patrones de Llamadas**, una plataforma de analitica de cobranzas que ingesta datos JSON, construye un grafo de conocimiento con NetworkX (in-memory) y Neo4j (persistencia), y sirve un dashboard React interactivo con chat asistido por Gemini.

La primera fase (PRD v1.0) estabilizo la plataforma: migracion a Neo4j, correccion del bug de upload, documentacion base. Esta segunda fase agrega **cuatro bloques funcionales nuevos** que transforman el sistema de una herramienta de visualizacion pasiva a una plataforma de inteligencia predictiva y consultiva:

1. **Integracion MCP + LLM sobre Neo4j** — Consultas Cypher dinamicas generadas por el LLM en respuesta a preguntas en lenguaje natural, reemplazando el contexto serializado como texto plano.
2. **Analisis Predictivo de Pago** — Modelo ML que predice probabilidad de pago por cliente en los proximos 7 dias.
3. **Deteccion de Anomalias** — Identificacion automatica de patrones inusuales en agentes y clientes.
4. **Rediseno Frontend** — Transicion de tema brutalist a una UI minimalista data-driven con soporte de modo nocturno/diurno.

### 1.2 Estado actual del sistema (baseline para esta fase)

| Componente                        | Estado                                                               | Archivos clave                                |
| --------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Backend FastAPI                   | Funcional, v2.0.0, 12 endpoints REST                                | `backend/main.py`                             |
| Grafo in-memory (NetworkX)        | Completo: 7 tipos de nodos, 8 tipos de relaciones                   | `backend/graph_manager.py`                    |
| Grafo persistente (Neo4j)         | Funcional con fallback, constraints + indices, ingesta dual          | `backend/neo4j_manager.py`                    |
| Chat (Gemini 2.5 Flash)           | Funcional, contexto serializado como texto plano en cada turno       | `backend/chat_service.py`                     |
| Frontend React                    | 6 componentes, tema brutalist light, framer-motion para transiciones | `frontend/src/components/*.jsx`               |
| Dashboard                         | 8 KPIs, 6 charts (Chart.js), tabla de promesas vencidas             | `frontend/src/components/Dashboard.jsx`       |
| Timeline de clientes              | Lista con busqueda, timeline visual, evolucion de deuda              | `frontend/src/components/ClientTimeline.jsx`  |
| Grafo visual                      | Cytoscape.js + fcose, ego-graph por cliente, detalles de nodo        | `frontend/src/components/GraphView.jsx`       |
| Vista de agentes                  | Tabla comparativa, charts radar/bar/line, detalle individual         | `frontend/src/components/AgentView.jsx`       |
| Chat widget                       | Panel flotante con historial, parseo basico de Markdown              | `frontend/src/components/ChatWidget.jsx`      |

### 1.3 Endpoints actuales

| Metodo | Ruta                               | Tag        | Descripcion                                  |
| ------ | ---------------------------------- | ---------- | -------------------------------------------- |
| GET    | `/`                                | Health     | Status del sistema + stats Neo4j             |
| POST   | `/ingest`                          | Data       | Carga/recarga JSON de datos                  |
| POST   | `/chat`                            | Chat       | Pregunta al asistente Gemini                 |
| GET    | `/clientes`                        | Clientes   | Lista todos los clientes con metricas        |
| GET    | `/clientes/{id}`                   | Clientes   | Detalle de un cliente                        |
| GET    | `/clientes/{id}/timeline`          | Clientes   | Timeline de interacciones y pagos            |
| GET    | `/agentes`                         | Agentes    | Lista todos los agentes con metricas         |
| GET    | `/agentes/{id}/efectividad`        | Agentes    | Efectividad detallada de un agente           |
| GET    | `/analytics/dashboard`             | Analytics  | KPIs y agregaciones generales                |
| GET    | `/analytics/promesas-incumplidas`  | Analytics  | Promesas vencidas sin cumplir                |
| GET    | `/analytics/mejores-horarios`      | Analytics  | Analisis de efectividad por hora             |
| GET    | `/graph/data`                      | Graph      | Nodos y aristas para Cytoscape.js            |

---

## 2. Scope

### 2.1 In-Scope

- Integrar el servidor MCP de Graphiti para que el LLM (Gemini) genere y ejecute consultas Cypher sobre Neo4j directamente desde el chat
- Reemplazar el metodo `build_context()` de texto serializado por un flujo MCP donde el LLM invoca herramientas de consulta al grafo
- Implementar modelo predictivo de probabilidad de pago (scikit-learn o logica estadistica) con endpoint `GET /clientes/{id}/prediccion`
- Implementar deteccion de anomalias con endpoint `GET /analytics/anomalias` y 4 tipos de anomalias configurables
- Redisenar completamente el frontend de tema brutalist a estilo minimalista data-driven
- Agregar switch de modo nocturno/diurno en la LandingPage, persistido en localStorage
- Mejorar las animaciones con framer-motion (transiciones de tab, entrada de cards, hover states)
- Reemplazar el sistema CSS actual (custom properties brutalist en `index.css`) por un nuevo sistema de variables dual (light/dark)

### 2.2 Out-of-Scope

- Cambiar React 18 por otro framework frontend (React se mantiene)
- Cambiar FastAPI por otro framework backend (FastAPI se mantiene)
- Agregar autenticacion, autorizacion o gestion de usuarios
- Despliegue a produccion (cloud, containers, CI/CD pipelines)
- Cambiar Chart.js por otra libreria de graficos
- Cambiar Cytoscape.js por otra libreria de visualizacion de grafos
- Internacionalizacion (i18n) — el sistema permanece en espanol
- Tests unitarios o de integracion (salvo los necesarios para validar el modelo ML)
- Cambiar de Gemini a otro proveedor de LLM
- Migrar de CSS plano a CSS Modules, Tailwind u otro framework CSS
- Agregar dependencias frontend pesadas (Redux, React Query, etc.)
- Streaming de respuestas del chat (SSE/WebSocket)
- Notificaciones push o sistema de alertas en tiempo real

---

## 3. Requisitos Funcionales (User Stories)

---

### Feature 1: Integracion MCP + LLM sobre Neo4j

---

#### US-101: Configurar servidor MCP de Graphiti para exponer herramientas de consulta al grafo

**`[AGENT: mcp-nlq-integrator]`**

> Como desarrollador del sistema, quiero configurar el servidor MCP de Graphiti conectado a la instancia de Neo4j existente, para que el LLM pueda invocar herramientas de busqueda y consulta Cypher sobre el grafo de conocimiento.

**Contexto tecnico**:
- Neo4j ya esta configurado en `neo4j_manager.py` con conexion via `AsyncGraphDatabase.driver` (URI: `bolt://localhost:7687`, credenciales en variables de entorno `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`).
- El esquema Neo4j tiene constraints de unicidad en: `Cliente.id`, `Agente.id`, `Interaccion.id`, `Pago.id`, `PromesaPago.id`.
- Labels Neo4j: `Cliente`, `Agente`, `Deuda`, `Interaccion`, `Pago`, `PromesaPago`, `Contacto`.
- Relaciones Neo4j: `TIENE_DEUDA`, `TUVO_INTERACCION`, `REALIZA`, `ATENDIDA_POR`, `GENERA`, `PROMETE`, `TUVO_CONTACTO`, `SE_CUMPLE_CON`.

**Criterios de aceptacion**:

```gherkin
Given que Neo4j esta corriendo con datos ingestados
And el servidor MCP de Graphiti esta configurado apuntando a la misma instancia Neo4j
When el servidor MCP se inicia
Then expone herramientas de busqueda y consulta sobre el grafo
And puede responder a invocaciones de herramientas via protocolo MCP

Given que el servidor MCP esta corriendo
When un cliente MCP invoca una herramienta de busqueda con el parametro "clientes con riesgo alto"
Then el servidor ejecuta la consulta Cypher correspondiente contra Neo4j
And retorna los resultados estructurados al cliente MCP

Given que Neo4j no esta disponible
When el servidor MCP intenta ejecutar una consulta
Then retorna un error descriptivo sin crashear el proceso
```

---

#### US-102: Modificar ChatService para usar MCP como proveedor de datos en lugar de contexto serializado

**`[AGENT: mcp-nlq-integrator]`**

> Como usuario del chat, quiero hacer preguntas en lenguaje natural y que el sistema genere consultas Cypher dinamicas sobre Neo4j para obtener respuestas precisas, en lugar de depender de un dump completo de datos serializado como texto.

**Contexto tecnico**:
- Actualmente `chat_service.py` usa `build_context()` (lineas 31-100) que serializa **todos** los datos del dashboard, agentes, clientes y promesas como texto plano. Este contexto se inyecta en cada turno como primer mensaje del historial.
- El modelo actual es `gemini-2.5-flash` configurado con `temperature=0.3`.
- El `SYSTEM_PROMPT` (lineas 11-22) define el rol y reglas del asistente.
- El endpoint `POST /chat` en `main.py` (lineas 154-169) obtiene dashboard, agents, clients, promises de `GraphManager` y los pasa a `build_context()`.

**Criterios de aceptacion**:

```gherkin
Given que el usuario envia la pregunta "Cual es el cliente con mas deuda pendiente?"
When el sistema procesa la pregunta via MCP
Then Gemini genera una consulta Cypher como:
  MATCH (c:Cliente)-[:TIENE_DEUDA]->(d:Deuda)
  RETURN c.nombre, d.monto_inicial ORDER BY d.monto_inicial DESC LIMIT 1
And la consulta se ejecuta sobre Neo4j via el servidor MCP
And la respuesta incluye el nombre del cliente y el monto exacto de su deuda

Given que el usuario envia la pregunta "Que agente tiene mejor tasa de exito?"
When el sistema procesa la pregunta via MCP
Then Gemini genera la consulta Cypher apropiada para calcular tasa de exito por agente
And la respuesta incluye el ID del agente y su tasa numerica exacta
And los datos provienen directamente de Neo4j, no de texto serializado

Given que el usuario envia una pregunta ambigua como "como va todo?"
When el sistema procesa la pregunta
Then el LLM puede combinar multiples invocaciones de herramientas MCP
And formula una respuesta resumen con datos reales del grafo

Given que MCP no esta disponible (Neo4j caido, servidor MCP no iniciado)
When el usuario envia una pregunta en el chat
Then el sistema hace fallback al metodo actual de build_context() con datos de NetworkX
And la respuesta se genera normalmente sin que el usuario note degradacion
And se loguea un warning en el backend: "[MCP] Fallback a contexto serializado"
```

---

#### US-103: Mantener compatibilidad del endpoint POST /chat con el frontend existente

**`[AGENT: mcp-nlq-integrator]`**

> Como desarrollador del frontend, quiero que el contrato del endpoint POST /chat no cambie, para no tener que modificar el ChatWidget.

**Contexto tecnico**:
- El frontend `ChatWidget.jsx` envia `POST /chat` con body `{ message: string, history: [{role, content}] }` y espera respuesta `{ response: string }`.
- El manejo de historial se limita a los ultimos 10 mensajes (`history.slice(-10)` en linea 45 de ChatWidget.jsx).

**Criterios de aceptacion**:

```gherkin
Given que el endpoint POST /chat usa internamente MCP
When el frontend envia { message: "...", history: [...] }
Then la respuesta sigue siendo { response: "..." }
And no se requiere ningun cambio en ChatWidget.jsx ni en api.js

Given que el chat tiene historial de conversacion
When el usuario hace una pregunta de seguimiento ("y el segundo?")
Then el LLM usa el historial previo para contextualizar la consulta Cypher
And la respuesta es coherente con la conversacion anterior
```

---

### Feature 2: Analisis Predictivo de Pago

---

#### US-201: Calcular probabilidad de pago por cliente en los proximos 7 dias

**`[AGENT: graphiti-rest-api-builder]`**

> Como analista de cobranzas, quiero ver la probabilidad de que un cliente realice un pago en los proximos 7 dias, para priorizar mis esfuerzos de seguimiento en los clientes con mayor probabilidad de respuesta positiva.

**Contexto tecnico**:
- Los features disponibles para cada cliente en el grafo (extraibles de `graph_manager.py` lineas 255-330) son:
  - `risk_score` (0-100, calculado por la formula en lineas 274-287)
  - `promesas_hechas` y `promesas_cumplidas` (tasa de cumplimiento de promesas)
  - `total_interacciones`, `total_llamadas`, `total_pagos`
  - `total_pagado`, `monto_pendiente`, `tasa_recuperacion`
  - `estado` (pago_completo, pago_parcial, promesa_activa, en_renegociacion, rehusa_pagar, en_disputa, sin_respuesta, sin_contacto)
- La data de pagos por cliente esta en `payments_by_client` con timestamps, montos y metodo.
- La data de interacciones por cliente esta en `interactions_by_client` con timestamps, resultados y sentimientos.
- La data de promesas por cliente esta en `promises_by_client` con montos, fechas y estado de cumplimiento.
- `REFERENCE_DATE` es `2025-08-12` — fecha de referencia para calculos temporales.
- **Restriccion**: Sin dependencias externas pesadas. Usar `scikit-learn` (RandomForest, LogisticRegression o similar) o logica estadistica pura sobre los datos existentes.

**Criterios de aceptacion**:

```gherkin
Given que existen datos cargados para el cliente "cliente_001"
And el cliente tiene historial de interacciones, pagos y promesas
When llamo a GET /clientes/cliente_001/prediccion
Then recibo un JSON con la estructura:
  {
    "cliente_id": "cliente_001",
    "probabilidad_pago_7d": 0.73,
    "confianza": "alta",
    "factores_positivos": ["risk_score alto (72)", "2 promesas cumplidas de 3"],
    "factores_negativos": ["ultima interaccion hace 5 dias"],
    "modelo": "logistic_regression_v1",
    "fecha_prediccion": "2025-08-12"
  }
And el campo "probabilidad_pago_7d" esta entre 0.0 y 1.0
And el campo "confianza" es uno de: "alta" (>0.7 o <0.3), "media" (0.3-0.7), "baja" (datos insuficientes)

Given que el cliente no tiene historial (0 interacciones, 0 pagos)
When llamo a GET /clientes/{id}/prediccion
Then recibo probabilidad basada solo en el risk_score inicial (50)
And el campo "confianza" es "baja"
And "factores_negativos" incluye "datos insuficientes para prediccion precisa"

Given que el cliente_id no existe
When llamo a GET /clientes/{id}/prediccion
Then recibo HTTP 404 con detalle "Cliente no encontrado"
```

---

#### US-202: Definir features y entrenar el modelo predictivo

**`[AGENT: graphiti-rest-api-builder]`**

> Como desarrollador, quiero un modulo de prediccion que use features derivados del grafo existente para entrenar un modelo de clasificacion, de forma que la prediccion sea reproducible y explicable.

**Contexto tecnico**:
- El modelo debe entrenarse con los datos existentes del grafo al momento de la ingesta (post-procesamiento).
- Features sugeridos (extraibles directamente de las estructuras en `graph_manager.py`):
  1. `risk_score` — score 0-100 del cliente
  2. `tasa_cumplimiento_promesas` — promesas_cumplidas / promesas_hechas (0 si no hay promesas)
  3. `frecuencia_contacto` — total_interacciones / dias_desde_primer_contacto
  4. `ratio_pagos_interacciones` — total_pagos / total_interacciones (0 si no hay interacciones)
  5. `dias_desde_ultimo_pago` — (REFERENCE_DATE - timestamp del ultimo pago).days (999 si nunca pago)
  6. `dias_desde_ultima_interaccion` — (REFERENCE_DATE - timestamp de ultima interaccion).days
  7. `sentimiento_predominante` — encoded: positivo=1, neutro=0, hostil=-1 (promedio)
  8. `resultado_ultima_llamada` — encoded: pago_inmediato=1, promesa_pago=0.7, renegociacion=0.5, se_niega_pagar=-0.5, disputa=-0.8, sin_respuesta=-0.3
  9. `monto_pendiente_ratio` — monto_pendiente / monto_deuda_inicial
  10. `tendencia_pagos` — pendiente de regresion lineal sobre montos de pagos en el tiempo (positiva = pagos crecientes)
- **Label (variable objetivo)**: si el cliente realizo al menos un pago en los 7 dias previos a REFERENCE_DATE (binario: 1 = pago, 0 = no pago).
- Si el dataset es muy pequeno (50 clientes), usar cross-validation con leave-one-out o fallback a logica heuristica ponderada.

**Criterios de aceptacion**:

```gherkin
Given que se ingestan datos con POST /ingest
When el post-procesamiento del grafo finaliza
Then el modelo predictivo se entrena automaticamente con los datos disponibles
And se almacena en memoria para consultas posteriores

Given que el dataset tiene menos de 20 muestras con label positivo
When el modelo intenta entrenarse
Then hace fallback a logica heuristica ponderada (weighted scoring)
And el campo "modelo" en la respuesta de prediccion indica "heuristic_weighted_v1"
And se loguea: "[PREDICTION] Dataset insuficiente para ML, usando heuristica"

Given que el modelo esta entrenado
When se consulta la prediccion de cualquier cliente
Then los "factores_positivos" y "factores_negativos" se derivan de los feature importances
And cada factor incluye el valor numerico concreto del feature para ese cliente
```

---

### Feature 3: Deteccion de Anomalias

---

#### US-301: Detectar agente con tasa de disputas anomalamente alta

**`[AGENT: graphiti-rest-api-builder]`**

> Como supervisor de cobranzas, quiero identificar automaticamente a los agentes cuya tasa de disputas es significativamente superior al promedio del equipo, para intervenir con capacitacion o reasignacion.

**Contexto tecnico**:
- Las metricas de agentes se calculan en `_compute_agent_metrics()` (lineas 332-354 de `graph_manager.py`): `total_contactos`, `promesas_generadas`, `pagos_inmediatos`, `renegociaciones`, `se_niega`, `disputas`, `sin_respuesta`.
- La tasa de disputas de un agente es: `disputas / total_contactos`.
- El umbral de anomalia es: tasa de disputas del agente >= 3x la tasa promedio del equipo.
- Si un agente tiene menos de 5 contactos, no se evalua para esta anomalia (muestra insuficiente).

**Criterios de aceptacion**:

```gherkin
Given que existen 5 agentes con los siguientes datos:
  | Agente     | Contactos | Disputas | Tasa  |
  | agente_001 | 30        | 2        | 6.7%  |
  | agente_002 | 25        | 1        | 4.0%  |
  | agente_003 | 28        | 8        | 28.6% |
  | agente_004 | 22        | 1        | 4.5%  |
  | agente_005 | 20        | 0        | 0.0%  |
And el promedio de tasa de disputas del equipo es 8.76%
And el umbral es 3x el promedio = 26.28%
When llamo a GET /analytics/anomalias
Then la respuesta incluye una anomalia de tipo "agente_disputas_alta" para agente_003
And la anomalia incluye: agente_id, tasa_disputas (28.6%), promedio_equipo (8.76%), factor (3.26x)

Given que ningun agente supera 3x el promedio de disputas
When llamo a GET /analytics/anomalias
Then no se incluyen anomalias de tipo "agente_disputas_alta"
```

---

#### US-302: Detectar cliente con N promesas rotas consecutivas

**`[AGENT: graphiti-rest-api-builder]`**

> Como analista de cobranzas, quiero identificar automaticamente a los clientes que han roto N promesas de pago consecutivas, para escalar el caso o cambiar de estrategia de cobro.

**Contexto tecnico**:
- Las promesas por cliente estan en `promises_by_client` (diccionario de listas).
- Cada promesa tiene: `cumplida` (bool), `vencida` (bool), `fecha_promesa`, `monto_prometido`.
- Una promesa "rota" es: `vencida=True AND cumplida=False`.
- Las promesas deben evaluarse en orden cronologico (por `interaction_timestamp`).
- N es configurable, con default 3. Se pasa como query parameter: `GET /analytics/anomalias?umbral_promesas_rotas=3`.

**Criterios de aceptacion**:

```gherkin
Given que el cliente "cliente_015" tiene 4 promesas ordenadas cronologicamente:
  | Promesa | Vencida | Cumplida | Consecutivas rotas |
  | P1      | true    | true     | 0                  |
  | P2      | true    | false    | 1                  |
  | P3      | true    | false    | 2                  |
  | P4      | true    | false    | 3                  |
And el umbral de promesas rotas consecutivas es 3 (default)
When llamo a GET /analytics/anomalias
Then la respuesta incluye una anomalia de tipo "promesas_rotas_consecutivas" para cliente_015
And la anomalia incluye: cliente_id, nombre, promesas_rotas_consecutivas (3), ultima_promesa_fecha

Given que llamo a GET /analytics/anomalias?umbral_promesas_rotas=5
And ningun cliente tiene 5 promesas rotas consecutivas
Then no se incluyen anomalias de tipo "promesas_rotas_consecutivas"
```

---

#### US-303: Detectar agente sin actividad en X dias

**`[AGENT: graphiti-rest-api-builder]`**

> Como supervisor, quiero identificar agentes que no han registrado actividad en un periodo configurable, para verificar si estan activos o si necesitan reasignacion de cartera.

**Contexto tecnico**:
- Las interacciones por agente se pueden derivar del campo `agente_id` en cada interaccion de `self.interactions`.
- El timestamp de la ultima interaccion de cada agente se obtiene ordenando sus interacciones por timestamp.
- X es configurable con default 7 dias. Se pasa como query parameter: `GET /analytics/anomalias?dias_inactividad=7`.
- La fecha de referencia para el calculo es `REFERENCE_DATE` (2025-08-12).

**Criterios de aceptacion**:

```gherkin
Given que el agente "agente_004" tiene su ultima interaccion el 2025-08-01
And REFERENCE_DATE es 2025-08-12
And el umbral de inactividad es 7 dias (default)
When llamo a GET /analytics/anomalias
Then la respuesta incluye una anomalia de tipo "agente_inactivo" para agente_004
And la anomalia incluye: agente_id, ultima_actividad ("2025-08-01"), dias_sin_actividad (11)

Given que todos los agentes tienen actividad dentro de los ultimos 7 dias
When llamo a GET /analytics/anomalias
Then no se incluyen anomalias de tipo "agente_inactivo"
```

---

#### US-304: Detectar clientes con deuda en escalada (pagos decrecientes)

**`[AGENT: graphiti-rest-api-builder]`**

> Como analista de riesgo, quiero identificar clientes cuyos pagos muestran una tendencia decreciente sostenida, indicando que la situacion de cobranza se esta deteriorando.

**Contexto tecnico**:
- Los pagos por cliente estan en `payments_by_client` con `timestamp` y `monto`.
- "Pagos decrecientes" se define como: el cliente tiene al menos 3 pagos, y los montos de los ultimos 3 pagos ordenados cronologicamente forman una secuencia estrictamente decreciente (P3 > P2 > P1 donde P1 es el mas reciente).
- Adicionalmente, si el ultimo pago es menor al 50% del primer pago historico, se agrega un factor de severidad "alta".

**Criterios de aceptacion**:

```gherkin
Given que el cliente "cliente_022" tiene pagos ordenados cronologicamente:
  | Pago | Timestamp  | Monto |
  | P1   | 2025-07-01 | 500   |
  | P2   | 2025-07-15 | 350   |
  | P3   | 2025-08-01 | 150   |
And los ultimos 3 pagos forman secuencia decreciente: 500 > 350 > 150
And el ultimo pago (150) es menor al 50% del primer pago (500)
When llamo a GET /analytics/anomalias
Then la respuesta incluye una anomalia de tipo "pagos_decrecientes" para cliente_022
And la anomalia incluye: cliente_id, nombre, pagos_recientes ([500, 350, 150]), tendencia ("decreciente"), severidad ("alta")

Given que el cliente tiene menos de 3 pagos
When se evaluan anomalias de pagos decrecientes
Then el cliente no se evalua para esta anomalia
```

---

#### US-305: Endpoint unificado de anomalias con filtros

**`[AGENT: graphiti-rest-api-builder]`**

> Como consumidor de la API, quiero un unico endpoint que retorne todas las anomalias detectadas con la posibilidad de filtrar por tipo, para integrar los resultados en el dashboard.

**Criterios de aceptacion**:

```gherkin
Given que existen anomalias de diferentes tipos detectadas en los datos
When llamo a GET /analytics/anomalias
Then recibo un JSON con la estructura:
  {
    "total_anomalias": 7,
    "anomalias": [
      {
        "id": "ANO-001",
        "tipo": "agente_disputas_alta",
        "severidad": "alta",
        "entidad_tipo": "agente",
        "entidad_id": "agente_003",
        "descripcion": "Tasa de disputas 3.26x superior al promedio del equipo",
        "datos": { "tasa_disputas": 28.6, "promedio_equipo": 8.76, "factor": 3.26 },
        "recomendacion": "Revisar casos de disputa del agente y evaluar necesidad de capacitacion"
      },
      ...
    ],
    "configuracion": {
      "umbral_disputas_factor": 3,
      "umbral_promesas_rotas": 3,
      "dias_inactividad": 7
    }
  }

Given que quiero filtrar anomalias por tipo
When llamo a GET /analytics/anomalias?tipo=agente_disputas_alta
Then recibo solo las anomalias de tipo "agente_disputas_alta"

Given que quiero cambiar los umbrales de deteccion
When llamo a GET /analytics/anomalias?umbral_promesas_rotas=5&dias_inactividad=14
Then la deteccion usa los umbrales personalizados en lugar de los defaults
And el campo "configuracion" en la respuesta refleja los umbrales usados
```

---

### Feature 4: Rediseno Frontend — Minimalista / Data-Driven UI

---

#### US-401: Definir sistema de variables CSS dual (modo claro / modo oscuro)

**`[AGENT: frontend-dataviz-specialist]`**

> Como usuario, quiero poder alternar entre modo claro y modo oscuro, para usar la plataforma comodamente en cualquier condicion de iluminacion.

**Contexto tecnico**:
- El archivo `frontend/src/index.css` actualmente define un tema light con variables CSS en `:root` (lineas 7-28): `--bg: #F0EBE3`, `--surface: #FFFFFF`, `--border: #0A0A0A`, etc.
- Las fuentes actuales son `Archivo Black` (display) y `Space Mono` (monospace).
- El rediseno debe reemplazar estas fuentes y colores por un sistema minimalista data-driven.
- La preferencia de tema debe persistirse en `localStorage` con key `theme` y valores `light` o `dark`.
- Al cargar la pagina, se lee `localStorage.getItem('theme')`. Si no existe, se usa `prefers-color-scheme` del sistema operativo como default.
- El cambio de tema se aplica toggling la clase `dark` en el elemento `<html>`.

**Criterios de aceptacion**:

```gherkin
Given que el usuario abre la aplicacion por primera vez
When el sistema operativo tiene modo oscuro activado
Then la aplicacion se renderiza en modo oscuro
And localStorage no contiene valor de "theme" aun

Given que el usuario hace clic en el switch de tema en la LandingPage
When el tema actual es "light"
Then la aplicacion transiciona a modo oscuro con una animacion suave (transicion CSS de 300ms)
And localStorage se actualiza con theme="dark"
And todas las variables CSS cambian al set de valores oscuros

Given que el usuario recarga la pagina
When localStorage tiene theme="dark"
Then la aplicacion se renderiza directamente en modo oscuro sin flash de tema incorrecto

Given que la aplicacion esta en modo oscuro
When el usuario navega de LandingPage al Dashboard
Then el modo oscuro persiste en todas las vistas
And todos los charts (Chart.js) usan colores del tema activo
And el grafo (Cytoscape.js) usa colores del tema activo
```

---

#### US-402: Redisenar la LandingPage con estilo minimalista

**`[AGENT: frontend-dataviz-specialist]`**

> Como usuario, quiero que la pagina de carga de datos tenga un diseno limpio y profesional, con tipografia clara y el switch de modo nocturno/diurno visible.

**Contexto tecnico**:
- La LandingPage actual (`frontend/src/components/LandingPage.jsx`, 175 lineas) tiene: titulo grande con efecto glitch, area de drag-and-drop, textarea para JSON, boton "ANALIZAR DATOS".
- El rediseno debe mantener toda la funcionalidad actual pero con estetica minimalista:
  - Eliminar efecto glitch, marquee y decoraciones pesadas
  - Tipografia limpia: una fuente sans-serif moderna (Inter, sistema, o similar) reemplazando Archivo Black
  - Fuente mono para datos y codigo (JetBrains Mono, Fira Code o similar) reemplazando Space Mono
  - Layout centrado con maximo 600px de ancho
  - Switch de tema en la esquina superior derecha
  - Micro-interacciones con framer-motion (no animaciones dramaticas)

**Criterios de aceptacion**:

```gherkin
Given que el usuario abre la LandingPage
When la pagina se renderiza
Then se muestra un switch de tema en la esquina superior derecha (icono sol/luna)
And el titulo es legible sin efectos de glitch
And el area de drop tiene bordes suaves, sin sombras brutalistas (sin box-shadow con offset)
And la transicion de entrada usa framer-motion con opacity y translateY suave (200-300ms)

Given que el usuario arrastra un archivo JSON sobre el area de drop
When el archivo entra al area
Then el area cambia de color sutilmente (border-color y background con opacidad)
And no hay efecto de "yellow background" ni de "solid border" agresivo como en el tema actual

Given que hay un error de validacion
When se muestra el mensaje de error
Then usa un color rojo suave con background semitransparente, sin borde grueso
```

---

#### US-403: Redisenar el Dashboard con estilo data-driven

**`[AGENT: frontend-dataviz-specialist]`**

> Como analista, quiero un dashboard donde los datos sean el foco visual, con KPIs claros, espaciado generoso y charts con paleta neutra, sin decoracion innecesaria.

**Contexto tecnico**:
- El Dashboard actual (`frontend/src/components/Dashboard.jsx`, 266 lineas) tiene: 8 KPIs en grid, 6 charts (Doughnut, Bar, Line), tabla de promesas.
- Los KPIs usan clases `.kpi-card` con sombras brutalistas (`box-shadow: 4px 4px 0`), bordes gruesos (`3px solid`) y fuente display pesada (`Archivo Black`).
- Los charts usan colores hardcodeados: `#0038FF`, `#00AA44`, `#E68A00`, etc.
- El rediseno debe:
  - Eliminar sombras con offset (usar `box-shadow` sutiles: `0 1px 3px rgba(0,0,0,0.08)`)
  - Bordes finos (1px) en colores neutros
  - KPIs con valor grande numerico en fuente sans-serif semibold, label en texto muted small-caps
  - Charts con paleta armonica que funcione en ambos modos (usar CSS custom properties para colores de charts)
  - Cards con animacion de entrada staggered via framer-motion (cada card aparece con 50ms de delay sobre la anterior)

**Criterios de aceptacion**:

```gherkin
Given que el usuario navega al tab Dashboard
When los KPIs se renderizan
Then cada KPI card tiene padding uniforme (1.25rem), borde de 1px, border-radius de 8px
And no tiene box-shadow con offset (no hay efecto brutalista)
And el valor KPI usa font-size >= 1.5rem, font-weight 600, color contextual (verde para positivo, rojo para riesgo)
And los KPIs aparecen con animacion staggered (motion.div con initial/animate, delay incremental de 50ms)

Given que el usuario cambia de tab y vuelve al Dashboard
When la animacion de entrada se ejecuta
Then la transicion es suave (opacity + translateY, duracion 200ms, ease-out)
And no hay efecto "glitch" en el titulo de la pagina

Given que la aplicacion esta en modo oscuro
When el Dashboard se renderiza
Then los charts usan colores de texto y grid adaptados al fondo oscuro
And las cards tienen fondo ligeramente mas claro que el background (uso de --surface)
And no hay elementos con fondos blancos puros (#FFFFFF) sobre fondo oscuro
```

---

#### US-404: Redisenar la sidebar de navegacion

**`[AGENT: frontend-dataviz-specialist]`**

> Como usuario, quiero una sidebar minimalista que ocupe menos espacio visual y se integre con el nuevo sistema de diseno.

**Contexto tecnico**:
- La sidebar actual (definida en CSS lineas 111-199 de `index.css` y en `App.jsx` lineas 62-98) tiene: logo con fuente display, 4 items de navegacion con iconos de texto (`[D]`, `[C]`, `[G]`, `[A]`), estado activo con background negro + texto blanco.
- El rediseno debe:
  - Reemplazar los iconos de texto por iconos SVG minimalistas inline (no se agrega dependencia de icon library)
  - Eliminar bordes gruesos y sombras
  - Active state: borde izquierdo de 2px en color primario, background con opacidad baja
  - Hover: background con opacidad muy baja, sin transicion de ancho de borde
  - Ancho reducido a 200px (de 240px actuales)

**Criterios de aceptacion**:

```gherkin
Given que la aplicacion esta en la vista principal (post-upload)
When la sidebar se renderiza
Then tiene ancho de 200px con bordes de 1px
And los items de navegacion usan iconos SVG inline (no texto como "[D]")
And el item activo tiene borde izquierdo de 2px en color primario y background semitransparente
And no tiene sombras con offset

Given que el usuario cambia de tab
When la animacion de transicion se ejecuta
Then el contenido principal transiciona con framer-motion (AnimatePresence mode="wait")
And la duracion de la transicion es 200ms con curva ease-out
And no hay desplazamiento horizontal (solo opacity + translateY)
```

---

#### US-405: Redisenar ClientTimeline, GraphView, AgentView y ChatWidget

**`[AGENT: frontend-dataviz-specialist]`**

> Como usuario, quiero que todas las vistas del sistema sigan el mismo lenguaje visual minimalista, con consistencia en bordes, sombras, tipografia y animaciones.

**Contexto tecnico**:
- **ClientTimeline.jsx** (327 lineas): lista de clientes a la izquierda (280px), panel de detalle a la derecha con KPIs, chart de evolucion de deuda, promesas, y timeline vertical.
  - Los colores de chart (`#94a3b8`, `#64748b`, `#1e293b`) ya son de estilo dark — deben usar CSS variables.
  - Los timeline dots usan `border: 2px solid var(--border)` — cambiar a circulos con 1px.
  - Los badges de estado usan la clase `.badge` con bordes gruesos — suavizar.
- **GraphView.jsx** (252 lineas): visualizacion Cytoscape.js con selector de cliente, leyenda, panel de detalles de nodo.
  - Colores de nodos hardcodeados en `COLORS` de `graph_manager.py` y en estilos Cytoscape — deben usar una paleta armonica.
  - Los estilos de Cytoscape (lineas 48-112) usan colores dark slate (`#e2e8f0`, `#0f172a`, `#334155`) directos — necesitan adaptarse al tema activo.
- **AgentView.jsx** (284 lineas): tabla comparativa, charts de barras/radar/linea, detalle individual.
  - Los mismos colores dark hardcodeados que ClientTimeline.
  - El radar chart usa colores de dark theme.
- **ChatWidget.jsx** (141 lineas): panel flotante con toggle button, mensajes, input.
  - El header usa `background: var(--border)` (negro) con `color: var(--surface)` (blanco) — en el nuevo diseno debe ser mas sutil.
  - El boton toggle es un cuadrado negro de 56px — redisenar como circulo o rectangulo redondeado.

**Criterios de aceptacion**:

```gherkin
Given que el usuario navega a la vista de Clientes
When la lista de clientes y el timeline se renderizan
Then los cards usan el mismo estilo que el Dashboard (1px border, border-radius 8px, sombra sutil)
And los timeline dots son circulos de 8px con borde de 1px
And los badges de estado usan border-radius de 4px, padding reducido, sin borde grueso
And los colores del chart de evolucion de deuda usan CSS variables del tema activo

Given que el usuario navega a la vista de Grafo
When Cytoscape.js renderiza el grafo
Then los colores de fondo, texto de nodos y lineas de aristas se adaptan al tema activo
And la leyenda usa el mismo estilo de badges que el resto de la aplicacion
And el panel de detalles de nodo tiene el estilo de card unificado

Given que el usuario navega a la vista de Agentes
When los charts se renderizan
Then los colores de ejes, grids y labels usan CSS variables del tema activo
And el radar chart se lee correctamente tanto en modo claro como oscuro

Given que el usuario abre el ChatWidget
When el panel de chat se despliega
Then la animacion de apertura usa framer-motion (scale + opacity, 200ms)
And el header del chat tiene fondo sutil (no negro completo)
And los mensajes del usuario y del AI tienen estilos diferenciados pero armoniosos
And el boton toggle es un circulo de 48px con borde-radius 50% y sombra sutil
```

---

#### US-406: Implementar animaciones de alta calidad con framer-motion

**`[AGENT: frontend-dataviz-specialist]`**

> Como usuario, quiero que las transiciones entre vistas, la entrada de elementos, y las interacciones de hover sean suaves y coherentes, sin sentirse lentas ni excesivas.

**Contexto tecnico**:
- framer-motion ya esta instalado (v12.38.0) y se usa para:
  - Transicion de tabs en App.jsx (AnimatePresence mode="wait", opacity + translateX)
  - Entrada de LandingPage (opacity + translateY)
  - ChatWidget (scale + opacity en toggle/panel)
- Las animaciones CSS actuales (`@keyframes brutalist-enter`, `glitch`, `marquee`, `spin-square`, `pulse-border`, `blink`) deben eliminarse o reemplazarse.
- Nuevas animaciones requeridas:
  - **Page enter**: cada card/seccion aparece con stagger (delay incremental 50ms), opacity 0->1, translateY 8->0
  - **Tab transition**: fade-out 150ms + fade-in 200ms con translateY sutil (no translateX)
  - **Card hover**: transform: translateY(-2px) + box-shadow increase, duracion 150ms
  - **KPI number**: counter animation (numero incrementa de 0 al valor, duracion 400ms) usando framer-motion `useMotionValue` + `useTransform`
  - **Chart appear**: opacity 0->1 con delay de 200ms despues de que el card aparece

**Criterios de aceptacion**:

```gherkin
Given que el usuario navega a un tab
When los cards de la vista se renderizan
Then cada card aparece con un delay staggered:
  - Card 1: delay 0ms, duracion 200ms
  - Card 2: delay 50ms, duracion 200ms
  - Card 3: delay 100ms, duracion 200ms
  - ...
And la animacion es opacity (0->1) + translateY (8px->0)

Given que el usuario pasa el mouse sobre un card
When el hover se activa
Then el card se desplaza 2px hacia arriba (translateY -2px)
And la sombra aumenta sutilmente
And la transicion dura 150ms con curva ease-out

Given que el usuario cambia de tab Dashboard a Clientes
When AnimatePresence ejecuta la transicion
Then el contenido actual desaparece con opacity 1->0 en 150ms
And el nuevo contenido aparece con opacity 0->1 + translateY 8px->0 en 200ms
And no hay desplazamiento horizontal (no translateX)

Given que un KPI numerico se renderiza
When la animacion de entrada del KPI card completa
Then el numero incrementa animado de 0 al valor final en 400ms
And el incremento usa curva easeOut para desacelerar al final
```

---

## 4. Requisitos No-Funcionales

| ID     | Categoria       | Requisito                                                                                           | Umbral medible                                                    |
| ------ | --------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| NFR-01 | Rendimiento     | El endpoint GET /clientes/{id}/prediccion debe responder rapidamente                                | < 200ms (p95)                                                     |
| NFR-02 | Rendimiento     | El endpoint GET /analytics/anomalias debe responder rapidamente                                     | < 500ms (p95) con dataset de 50 clientes / 502 interacciones     |
| NFR-03 | Rendimiento     | La consulta Cypher generada por MCP debe ejecutarse en tiempo razonable                             | < 2 segundos incluyendo generacion por LLM + ejecucion en Neo4j  |
| NFR-04 | Rendimiento     | El cambio de tema (light/dark) no debe causar reflow visible                                        | Transicion completada en < 300ms sin parpadeo                     |
| NFR-05 | Rendimiento     | Las animaciones framer-motion deben mantener 60fps                                                  | No hay frame drops perceptibles en transiciones de tab o stagger  |
| NFR-06 | Disponibilidad  | Si MCP/Neo4j no esta disponible, el chat debe funcionar con fallback                                | Respuesta via build_context() en < 5 segundos                     |
| NFR-07 | Disponibilidad  | Si el modelo ML no puede entrenarse, el endpoint de prediccion debe funcionar con heuristica        | Respuesta con confianza "baja" en < 100ms                         |
| NFR-08 | Compatibilidad  | El frontend rediseado debe funcionar en Chrome, Firefox y Edge modernos                             | Ultimas 2 versiones de cada navegador                             |
| NFR-09 | Accesibilidad   | El switch de tema debe ser operable con teclado                                                     | Focusable con Tab, togglable con Space/Enter                      |
| NFR-10 | Accesibilidad   | Los colores de ambos temas deben cumplir ratio de contraste WCAG AA para texto                      | Contraste >= 4.5:1 para texto normal, >= 3:1 para texto grande   |
| NFR-11 | Mantenibilidad  | Todas las consultas Cypher generadas por MCP deben loguearse en el backend                          | Log con nivel INFO: query, parametros, tiempo de ejecucion        |
| NFR-12 | Seguridad       | Las consultas Cypher generadas por el LLM deben ser de solo lectura                                 | No se permiten MERGE, CREATE, DELETE, SET en queries generadas    |
| NFR-13 | Datos           | El modelo predictivo debe recalcularse automaticamente al re-ingestar datos                         | POST /ingest exitoso -> modelo re-entrenado                       |
| NFR-14 | Mantenibilidad  | Los colores del frontend deben definirse exclusivamente en CSS custom properties, no hardcodeados    | 0 colores hex directos en archivos .jsx (excepto en configs de charts que lean variables CSS) |

---

## 5. Task Assignment Matrix

### Prioridad 1 — Feature 1: MCP + LLM sobre Neo4j

| Task ID | Agente responsable             | Descripcion tecnica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Dependencia | Definition of Done                                                                                                                                                     |
| ------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-101   | `[AGENT: mcp-nlq-integrator]`  | **Instalar y configurar graphiti-mcp-server.** (1) Instalar el paquete `graphiti-mcp-server` en el entorno del backend. (2) Configurar la conexion a la instancia Neo4j existente (mismas credenciales que `neo4j_manager.py`: URI=`bolt://localhost:7687`, usuario y password de variables de entorno). (3) Configurar las herramientas MCP que expone el servidor: busqueda de nodos, busqueda de relaciones, ejecucion de consultas Cypher de solo lectura. (4) Crear script de inicio `start_mcp.bat` / documentar comando de inicio. (5) Verificar que el servidor responde a invocaciones de herramientas con datos reales del grafo.                                                                                                                        | Neo4j corriendo con datos ingestados | El servidor MCP inicia sin errores, se conecta a Neo4j, y responde a invocaciones de herramientas con datos del grafo. Un test manual con un query de prueba retorna resultados correctos. |
| T-102   | `[AGENT: mcp-nlq-integrator]`  | **Crear MCPChatService como nuevo proveedor de chat.** (1) Crear archivo `backend/mcp_chat_service.py` que implemente la misma interfaz publica que `ChatService` (metodo `chat(message, context, history) -> str`). (2) Internamente, usar el SDK de Gemini con function calling / tool_use para invocar herramientas MCP. (3) Definir las herramientas disponibles para el LLM: `buscar_clientes(filtro)`, `buscar_agentes(filtro)`, `ejecutar_cypher(query)`, `obtener_metricas()`. (4) Implementar guardrails: las queries Cypher generadas solo pueden ser MATCH/RETURN, no MERGE/CREATE/DELETE/SET. (5) Si el LLM genera una query con operaciones de escritura, rechazarla con mensaje de error descriptivo. (6) Loguear cada query ejecutada con nivel INFO. | T-101       | El `MCPChatService` puede responder preguntas como "cliente con mas deuda" ejecutando Cypher real sobre Neo4j. Las queries de escritura se rechazan. Los logs muestran cada query ejecutada. |
| T-103   | `[AGENT: mcp-nlq-integrator]`  | **Integrar MCPChatService en main.py con fallback.** (1) En `main.py`, detectar si el servidor MCP esta disponible al startup. (2) Si MCP esta disponible, usar `MCPChatService` como proveedor de chat. (3) Si MCP no esta disponible, usar el `ChatService` actual como fallback. (4) El endpoint `POST /chat` no cambia su contrato: sigue recibiendo `{message, history}` y retornando `{response}`. (5) Agregar campo opcional `source` en la respuesta que indica si se uso "mcp" o "context_serialized". (6) Loguear `[MCP] Usando MCP para chat` o `[MCP] Fallback a contexto serializado` segun corresponda.                                                                                                                                          | T-102       | El endpoint POST /chat usa MCP cuando esta disponible y fallback cuando no. El contrato de la API no cambia. El frontend funciona sin modificaciones.                   |

### Prioridad 2 — Features 2 y 3: Prediccion + Anomalias

| Task ID | Agente responsable                    | Descripcion tecnica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Dependencia | Definition of Done                                                                                                                                                                                                   |
| ------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-201   | `[AGENT: graphiti-rest-api-builder]`  | **Crear modulo de prediccion de pago.** (1) Crear archivo `backend/prediction_service.py`. (2) Implementar clase `PaymentPredictor` con metodos: `train(graph_manager)` para entrenar con datos del grafo, `predict(cliente_id) -> dict` para predecir por cliente. (3) Feature engineering: extraer 10 features de cada cliente (ver listado en US-202). (4) Label: binario, 1 si el cliente realizo al menos un pago en los 7 dias previos a REFERENCE_DATE. (5) Si hay >= 20 samples con label positivo, usar `LogisticRegression` de scikit-learn con `class_weight='balanced'`. Si hay menos, usar heuristica ponderada basada en los features. (6) Guardar feature importances para explicabilidad. (7) El metodo `predict()` retorna: probabilidad, confianza, factores positivos, factores negativos. (8) Agregar `scikit-learn` a `requirements.txt`. | Ninguna     | El modulo `prediction_service.py` se entrena con los datos del grafo. `predict("cliente_001")` retorna un dict con probabilidad entre 0-1, confianza, y factores explicativos. Con dataset pequeno usa heuristica.    |
| T-202   | `[AGENT: graphiti-rest-api-builder]`  | **Crear endpoint GET /clientes/{id}/prediccion.** (1) En `main.py`, importar `PaymentPredictor` e instanciarlo. (2) Llamar a `predictor.train(gm)` despues de `gm.ingest(data)` en el startup y en el endpoint `POST /ingest`. (3) Crear endpoint `GET /clientes/{id}/prediccion` que llama a `predictor.predict(cliente_id)`. (4) Si el cliente no existe, retornar HTTP 404. (5) El response incluye: cliente_id, probabilidad_pago_7d, confianza, factores_positivos, factores_negativos, modelo, fecha_prediccion.                                                                                                                                                                                                                                                                                                            | T-201       | `curl http://localhost:8000/clientes/cliente_001/prediccion` retorna JSON con prediccion valida. El modelo se re-entrena automaticamente al re-ingestar datos.                                                        |
| T-301   | `[AGENT: graphiti-rest-api-builder]`  | **Crear modulo de deteccion de anomalias.** (1) Crear archivo `backend/anomaly_detector.py`. (2) Implementar clase `AnomalyDetector` con metodo `detect(graph_manager, config) -> list[dict]`. (3) Implementar 4 detectores internos: (a) `_detect_high_dispute_agents(factor=3)` — agentes con tasa de disputas >= factor * promedio, minimo 5 contactos para evaluar. (b) `_detect_broken_promises(threshold=3)` — clientes con N promesas rotas consecutivas (vencida=True, cumplida=False), evaluadas en orden cronologico por interaction_timestamp. (c) `_detect_inactive_agents(days=7)` — agentes cuya ultima interaccion es anterior a REFERENCE_DATE - days dias. (d) `_detect_decreasing_payments()` — clientes con >= 3 pagos donde los ultimos 3 son estrictamente decrecientes; severidad "alta" si el ultimo pago < 50% del primer pago. (4) Cada anomalia retorna: id (auto-generado ANO-XXX), tipo, severidad (alta/media/baja), entidad_tipo, entidad_id, descripcion, datos (dict con metricas especificas), recomendacion.                                                              | Ninguna     | El modulo `anomaly_detector.py` detecta las 4 categorias de anomalias. Con los datos de prueba (50 clientes, 5 agentes, 502 interacciones), identifica al menos 1 anomalia si existe en los datos.                   |
| T-302   | `[AGENT: graphiti-rest-api-builder]`  | **Crear endpoint GET /analytics/anomalias.** (1) En `main.py`, importar `AnomalyDetector` e instanciarlo. (2) Crear endpoint `GET /analytics/anomalias` con query params opcionales: `tipo` (filtro por tipo de anomalia), `umbral_promesas_rotas` (default 3), `dias_inactividad` (default 7), `umbral_disputas_factor` (default 3). (3) El response incluye: total_anomalias, anomalias (lista), configuracion (umbrales usados). (4) Agregar tag "Analytics" al endpoint.                                                                                                                                                                                                                                                                                                                                                    | T-301       | `curl http://localhost:8000/analytics/anomalias` retorna JSON con anomalias detectadas. Los filtros por tipo y umbrales personalizados funcionan. El campo configuracion refleja los umbrales usados.                  |

### Prioridad 3 — Feature 4: Rediseno Frontend

| Task ID | Agente responsable                       | Descripcion tecnica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Dependencia       | Definition of Done                                                                                                                                                                                                   |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-401   | `[AGENT: frontend-dataviz-specialist]`   | **Reescribir index.css con sistema de variables dual.** (1) Definir variables `:root` (light) y `.dark` (dark) con paleta minimalista. Light: `--bg: #FAFAFA`, `--surface: #FFFFFF`, `--surface2: #F5F5F5`, `--border: #E5E5E5`, `--border-strong: #D4D4D4`, `--text: #171717`, `--text-muted: #737373`, `--primary: #2563EB`, `--success: #16A34A`, `--warning: #D97706`, `--danger: #DC2626`, `--purple: #7C3AED`. Dark: `--bg: #0A0A0A`, `--surface: #171717`, `--surface2: #262626`, `--border: #2E2E2E`, `--border-strong: #404040`, `--text: #FAFAFA`, `--text-muted: #A3A3A3`, mismos colores semanticos con ajuste de luminosidad. (2) Reemplazar fuentes: display -> `Inter` (o `system-ui`), mono -> `JetBrains Mono` (o `ui-monospace`). (3) Eliminar todas las animaciones CSS brutalistas (`@keyframes glitch`, `marquee`, `spin-square`, `pulse-border`). (4) Redefinir clases: `.card` sin box-shadow con offset (usar `0 1px 3px rgba(0,0,0,0.08)`), `.kpi-card` sin bordes de 3px, `.badge` con border-radius 4px, `.nav-item` sin pseudo-elemento `::before` de ancho variable. (5) Agregar transicion global: `*, *::before, *::after { transition: background-color 0.3s, color 0.3s, border-color 0.3s; }` para cambio de tema suave. (6) Cards: `border: 1px solid var(--border)`, `border-radius: 8px`, `box-shadow: 0 1px 3px rgba(0,0,0,0.08)`. (7) Scrollbar: adaptar colores al tema. | Ninguna           | El archivo `index.css` tiene sistema dual light/dark. Al agregar clase `dark` al `<html>`, todos los colores cambian. No quedan estilos brutalistas (sin sombras con offset, bordes gruesos de 3px, efectos glitch). |
| T-402   | `[AGENT: frontend-dataviz-specialist]`   | **Implementar ThemeProvider y switch de tema.** (1) Crear `frontend/src/components/ThemeToggle.jsx` con un boton SVG sol/luna que alterna `document.documentElement.classList.toggle('dark')` y persiste en `localStorage.setItem('theme', value)`. (2) En `frontend/src/main.jsx`, agregar script inline pre-render que lee `localStorage.getItem('theme')` o `window.matchMedia('(prefers-color-scheme: dark)')` y aplica la clase `dark` antes del primer paint (evitar flash). (3) Renderizar `ThemeToggle` en LandingPage (esquina superior derecha con `position: fixed`) y en la sidebar (debajo del boton "Nuevos datos"). (4) El toggle debe ser accesible: `role="switch"`, `aria-label="Cambiar tema"`, focusable con Tab, togglable con Space/Enter.                                                                                                                                                                                                                                                                                       | T-401             | El switch cambia el tema instantaneamente. La preferencia persiste entre recargas. No hay flash de tema incorrecto al cargar. El switch es accesible con teclado.                                                     |
| T-403   | `[AGENT: frontend-dataviz-specialist]`   | **Redisenar LandingPage.jsx.** (1) Eliminar efecto glitch del titulo (quitar clase `landing-cursor`, quitar animacion `glitch`). (2) Titulo: tipografia Inter/system-ui, sin texto en mayusculas agresivo, tamano moderado (`clamp(1.5rem, 4vw, 2.5rem)`). (3) Subtitulo: color muted, sin text-transform uppercase. (4) Area de drop: border `1px dashed var(--border-strong)`, border-radius 12px, sin box-shadow. Hover: border solid, background `var(--primary)` con opacidad 0.04. (5) Textarea: border-radius 8px, 1px border. (6) Boton: border-radius 8px, sin box-shadow con offset, background `var(--primary)`, color blanco. (7) ThemeToggle en esquina superior derecha. (8) Animaciones framer-motion: entrada del contenedor con opacity+translateY (300ms, ease-out).                                                                                                                                                                                                                                                               | T-401, T-402      | La LandingPage se renderiza con estilo minimalista. No hay efecto glitch, sombras brutalistas ni bordes de 3px. El ThemeToggle esta visible y funcional.                                                              |
| T-404   | `[AGENT: frontend-dataviz-specialist]`   | **Redisenar Dashboard.jsx con KPI animation y stagger.** (1) Envolver cada KPI en `motion.div` con stagger: `initial={{ opacity: 0, y: 8 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ delay: index * 0.05, duration: 0.2 }}`. (2) Implementar counter animation para valores numericos de KPIs usando framer-motion `useMotionValue`, `useTransform`, y `animate()` — el numero incrementa de 0 al valor en 400ms con curva easeOut. (3) Cards de charts: misma animacion stagger. (4) Adaptar `chartDefaults` para usar CSS variables: leer `getComputedStyle(document.documentElement).getPropertyValue('--text')` para colores de ticks, labels y grid. (5) Paleta de charts: usar colores semanticos (`var(--success)`, `var(--danger)`, etc.) convertidos a valores hex en runtime. (6) Eliminar `animation: glitch` del titulo `.page-title`. (7) Eliminar clase `.page-header` con borde inferior grueso, reemplazar con padding-bottom y separacion tipografica.                                                                      | T-401             | Los KPIs aparecen con stagger animado. Los numeros incrementan visualmente. Los charts usan colores del tema activo. No hay elementos brutalistas.                                                                    |
| T-405   | `[AGENT: frontend-dataviz-specialist]`   | **Redisenar sidebar en App.jsx.** (1) Reducir ancho a 200px. (2) Reemplazar iconos de texto (`[D]`, `[C]`, `[G]`, `[A]`) por SVGs inline minimalistas: Dashboard=grid icon, Clientes=users icon, Grafo=network icon, Agentes=user icon. (3) Active state: `border-left: 2px solid var(--primary)`, `background: rgba(var(--primary-rgb), 0.06)`. (4) Hover: `background: var(--surface2)`. (5) Logo: fuente sans-serif, sin Archivo Black, tamano moderado. (6) Eliminar borde inferior grueso entre nav items (usar 1px o nada). (7) Transicion de tab: cambiar de `translateX` a `translateY` en AnimatePresence. (8) Agregar ThemeToggle en la parte inferior de la sidebar antes del boton "Nuevos datos".                                                                                                                                                                                                                                                                                                                                       | T-401, T-402      | La sidebar tiene 200px de ancho, iconos SVG, active state sutil. La transicion entre tabs usa translateY. El ThemeToggle esta en la sidebar.                                                                          |
| T-406   | `[AGENT: frontend-dataviz-specialist]`   | **Redisenar ClientTimeline.jsx.** (1) Adaptar colores de chart (`chartOpts`) para leer CSS variables del tema activo. (2) Timeline dots: 8px de diametro, border 1px, border-radius 50%. (3) Timeline content cards: 1px border, border-radius 6px, sombra sutil. (4) Badges: border-radius 4px, font-size 0.7rem, padding `0.15rem 0.4rem`. (5) Client list sidebar: items con hover sutil, selected state con `border-left: 2px solid var(--primary)`. (6) KPI mini-cards del header del cliente: border-radius 6px, sin bordes gruesos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | T-401             | La vista de Clientes usa el estilo unificado. Charts se adaptan al tema. Timeline visual es limpio y legible.                                                                                                         |
| T-407   | `[AGENT: frontend-dataviz-specialist]`   | **Redisenar GraphView.jsx.** (1) Adaptar estilos Cytoscape.js para el tema activo: leer CSS variables y pasarlas a la configuracion de estilos de Cytoscape en `loadGraph()`. En modo light: text-outline-color claro, background nodes/edges de colores armoniosos. En modo dark: mantener los colores actuales ajustados. (2) Panel de detalles de nodo: card unificado con border-radius 8px, tabla de propiedades con font-size reducido. (3) Selector de cliente: input con border-radius 6px, 1px border. (4) Leyenda: badges con estilo unificado. (5) Crear funcion `getCytoscapeTheme()` que retorna el objeto de estilos basado en el tema activo.                                                                                                                                                                                                                                                                                                                                                                                                | T-401             | El grafo se renderiza correctamente en ambos temas. Los colores de nodos, aristas y textos se adaptan al fondo.                                                                                                       |
| T-408   | `[AGENT: frontend-dataviz-specialist]`   | **Redisenar AgentView.jsx.** (1) Adaptar colores de charts (`chartBase`) para leer CSS variables. (2) Tabla de agentes: `border-collapse: collapse`, 1px borders, border-radius en contenedor, hover row sutil. (3) ScoreBar: border-radius en la barra, colores semanticos. (4) Radar chart: adaptar colores de escala radial y point labels al tema activo. (5) Detalle del agente: layout unificado con cards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | T-401             | La vista de Agentes usa el estilo unificado. Todos los charts se adaptan al tema. La tabla es legible en ambos modos.                                                                                                 |
| T-409   | `[AGENT: frontend-dataviz-specialist]`   | **Redisenar ChatWidget.jsx.** (1) Boton toggle: circulo de 48px, border-radius 50%, sombra sutil `0 2px 8px rgba(0,0,0,0.15)`, background `var(--primary)`, color blanco. (2) Panel de chat: border-radius 12px, sombra `0 4px 16px rgba(0,0,0,0.12)`. (3) Header: background `var(--surface2)` en lugar de negro solido, color `var(--text)`. (4) Mensajes del usuario: background `var(--primary)`, color blanco, border-radius `12px 12px 4px 12px`. (5) Mensajes del AI: background `var(--surface2)`, color `var(--text)`, border-radius `12px 12px 12px 4px`. (6) Input: sin borde grueso, placeholder color muted. (7) Animacion de aparicion de mensajes: framer-motion opacity+translateY con 150ms.                                                                                                                                                                                                                                                                                                                                              | T-401             | El ChatWidget tiene estilo minimalista. Los mensajes tienen border-radius diferenciado. El boton toggle es circular. Los colores se adaptan al tema.                                                                   |
| T-410   | `[AGENT: frontend-dataviz-specialist]`   | **Integrar nuevos endpoints en api.js y crear vistas de prediccion y anomalias.** (1) En `api.js`, agregar: `getPrediccion(id)` que llama a `GET /clientes/{id}/prediccion`, `getAnomalias(params)` que llama a `GET /analytics/anomalias`. (2) En `ClientTimeline.jsx`, agregar seccion de prediccion debajo del header del cliente: mostrar probabilidad como porcentaje con barra visual, confianza como badge, factores positivos/negativos como lista. (3) En `Dashboard.jsx`, agregar card de "Anomalias detectadas" al final: cantidad total, lista colapsable con las anomalias mas severas, cada una con badge de severidad, descripcion y recomendacion. (4) Ambas secciones nuevas usan el estilo unificado minimalista.                                                                                                                                                                                                                                                                                                                         | T-202, T-302, T-401 | La prediccion de pago se muestra en el detalle de cada cliente. Las anomalias se muestran en el Dashboard. Ambos usan el nuevo estilo visual.                                                                        |

---

## 6. Dependencies & Risks

### 6.1 Dependencias tecnicas

| ID   | Dependencia                                                    | Impacto                                                         | Mitigacion                                                                                                     |
| ---- | -------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D-01 | Neo4j corriendo con datos ingestados (prerequisito de Feature 1) | Sin Neo4j, MCP no tiene grafo que consultar                     | Feature 1 depende de la infraestructura establecida en PRD v1.0. Verificar antes de iniciar T-101.             |
| D-02 | graphiti-mcp-server compatible con la version de Neo4j          | Si hay incompatibilidad, el servidor MCP no arranca              | Verificar compatibilidad de versiones antes de iniciar. Alternativa: servidor MCP custom con driver neo4j.     |
| D-03 | Gemini API con soporte de function calling / tool_use           | Si Gemini 2.5 Flash no soporta function calling, MCP no funciona| Verificar en documentacion de google-genai SDK. Alternativa: usar tool_use via prompting estructurado.          |
| D-04 | scikit-learn instalable en el entorno Python del backend        | Sin scikit-learn, el modelo ML no se entrena                     | Agregar a `requirements.txt`. Si hay conflicto de dependencias, usar heuristica como unico metodo.             |
| D-05 | Fonts Inter y JetBrains Mono accesibles via Google Fonts o local | Sin las fuentes, el frontend usa fallback del sistema            | Usar `system-ui, -apple-system, sans-serif` como fallback. Las fuentes son cosmeticas, no funcionales.          |
| D-06 | Endpoints T-202 y T-302 disponibles antes de integrar en frontend | El frontend no puede mostrar prediccion/anomalias sin endpoints | T-410 depende de T-202 y T-302. El frontend debe manejar gracefully endpoints no disponibles (mostrar "No disponible"). |

### 6.2 Riesgos

| ID   | Riesgo                                                                              | Prob.  | Impacto | Mitigacion                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R-01 | El servidor MCP de Graphiti no es compatible con la estructura de datos actual       | Media  | Alto    | Plan B: crear un servidor MCP custom minimo que expose herramientas de consulta Cypher directas, sin depender del SDK de Graphiti.          |
| R-02 | Gemini 2.5 Flash genera queries Cypher sintacticamente incorrectas                  | Alta   | Medio   | Implementar validacion de sintaxis antes de ejecutar. Agregar exemplos de queries correctas en el system prompt. Retry con error message.   |
| R-03 | Gemini genera queries de escritura (MERGE, CREATE, DELETE) pese al guardrail        | Media  | Alto    | Validar cada query con regex antes de ejecutar. Usar usuario Neo4j de solo lectura como segunda capa de seguridad.                          |
| R-04 | El dataset de 50 clientes es insuficiente para entrenar un modelo ML significativo  | Alta   | Medio   | El diseno ya contempla fallback a heuristica ponderada. La heuristica es funcional y explicable.                                            |
| R-05 | Las animaciones framer-motion causan jank en dispositivos lentos                    | Baja   | Bajo    | Usar `will-change` en elementos animados. Reducir duracion en dispositivos con `prefers-reduced-motion`. Usar `layout` animations sparingly.|
| R-06 | El cambio de tema causa flash of unstyled content (FOUC)                            | Media  | Medio   | Script inline en `<head>` de `index.html` que aplica la clase `dark` antes del primer render, no en React.                                  |
| R-07 | Los colores de Cytoscape.js no se actualizan al cambiar tema sin recargar el grafo  | Alta   | Bajo    | Escuchar cambios de clase en `<html>` via MutationObserver y re-aplicar estilos de Cytoscape. O re-renderizar el grafo.                     |
| R-08 | Los colores de Chart.js hardcodeados no se actualizan al cambiar tema               | Alta   | Medio   | Crear helper `getChartColors()` que lee CSS variables. Destruir y recrear instancias de Chart al cambiar tema, o usar plugin de Chart.js.    |

---

## 7. Estrategia de Ejecucion

### 7.1 Orden de ejecucion por fases

```
FASE 1 — Backend: Prediccion + Anomalias (sin dependencias externas)
  T-201: Crear prediction_service.py                   [AGENT: graphiti-rest-api-builder]
  T-301: Crear anomaly_detector.py                     [AGENT: graphiti-rest-api-builder]
  T-202: Endpoint GET /clientes/{id}/prediccion        [AGENT: graphiti-rest-api-builder]
  T-302: Endpoint GET /analytics/anomalias             [AGENT: graphiti-rest-api-builder]

FASE 2 — Backend: MCP + LLM (requiere Neo4j)
  T-101: Configurar graphiti-mcp-server                [AGENT: mcp-nlq-integrator]
  T-102: Crear MCPChatService                          [AGENT: mcp-nlq-integrator]
  T-103: Integrar en main.py con fallback              [AGENT: mcp-nlq-integrator]

FASE 3 — Frontend: Sistema de diseno base (independiente de backend)
  T-401: Reescribir index.css con variables dual       [AGENT: frontend-dataviz-specialist]
  T-402: ThemeProvider y switch de tema                 [AGENT: frontend-dataviz-specialist]

FASE 4 — Frontend: Rediseno de componentes (depende de T-401)
  T-403: Redisenar LandingPage.jsx                     [AGENT: frontend-dataviz-specialist]
  T-404: Redisenar Dashboard.jsx                       [AGENT: frontend-dataviz-specialist]
  T-405: Redisenar sidebar en App.jsx                  [AGENT: frontend-dataviz-specialist]
  T-406: Redisenar ClientTimeline.jsx                  [AGENT: frontend-dataviz-specialist]
  T-407: Redisenar GraphView.jsx                       [AGENT: frontend-dataviz-specialist]
  T-408: Redisenar AgentView.jsx                       [AGENT: frontend-dataviz-specialist]
  T-409: Redisenar ChatWidget.jsx                      [AGENT: frontend-dataviz-specialist]

FASE 5 — Frontend: Integracion de nuevos endpoints (depende de FASE 1 + FASE 3)
  T-410: Integrar prediccion + anomalias en frontend   [AGENT: frontend-dataviz-specialist]
```

### 7.2 Paralelismo

Las fases 1, 2 y 3 pueden ejecutarse **en paralelo** porque:
- FASE 1 (graphiti-rest-api-builder) trabaja en archivos backend nuevos (`prediction_service.py`, `anomaly_detector.py`) sin tocar archivos existentes.
- FASE 2 (mcp-nlq-integrator) trabaja en `mcp_chat_service.py` y solo modifica `main.py` al final (T-103).
- FASE 3 (frontend-dataviz-specialist) trabaja exclusivamente en archivos frontend.

La FASE 4 depende solo de FASE 3 (index.css y ThemeToggle disponibles).
La FASE 5 depende de FASE 1 (endpoints disponibles) y FASE 3 (nuevo estilo disponible).

### 7.3 Camino critico

```
Camino critico mas largo:
  T-101 (MCP setup, 3h) --> T-102 (MCPChatService, 4h) --> T-103 (integracion, 2h)
  Total: ~9 horas

Camino critico frontend:
  T-401 (CSS, 4h) --> T-404 (Dashboard, 3h) --> T-410 (integracion, 3h)
  Total: ~10 horas

Camino critico backend analytics:
  T-201 (prediccion, 4h) + T-301 (anomalias, 3h) --> T-202 + T-302 (endpoints, 2h)
  Total: ~9 horas
```

**Estimacion total con paralelismo**: ~10-12 horas de trabajo neto (el frontend es el camino mas largo).

### 7.4 Criterio de entrega minima viable

En orden de prioridad:

1. **Prediccion + Anomalias** (T-201, T-202, T-301, T-302) — nuevos endpoints analiticos funcionando
2. **Rediseno CSS base** (T-401, T-402) — tema dual funcionando, switch de tema operativo
3. **Rediseno de componentes** (T-403 a T-409) — todas las vistas con nuevo estilo
4. **MCP + LLM** (T-101, T-102, T-103) — chat inteligente con Cypher dinamico
5. **Integracion frontend** (T-410) — prediccion y anomalias visibles en la UI

---

## 8. Resumen de asignaciones por agente

### `[AGENT: mcp-nlq-integrator]`
| Task   | Prioridad | Descripcion                                  |
| ------ | --------- | -------------------------------------------- |
| T-101  | P1        | Configurar graphiti-mcp-server               |
| T-102  | P1        | Crear MCPChatService                         |
| T-103  | P1        | Integrar en main.py con fallback             |

**Archivos a crear**: `backend/mcp_chat_service.py`, `start_mcp.bat`
**Archivos a modificar**: `backend/main.py` (endpoint /chat), `backend/requirements.txt`
**No modificar**: `backend/chat_service.py` (se mantiene como fallback), `frontend/*`

---

### `[AGENT: graphiti-rest-api-builder]`
| Task   | Prioridad | Descripcion                                  |
| ------ | --------- | -------------------------------------------- |
| T-201  | P2        | Crear prediction_service.py                  |
| T-202  | P2        | Endpoint GET /clientes/{id}/prediccion       |
| T-301  | P2        | Crear anomaly_detector.py                    |
| T-302  | P2        | Endpoint GET /analytics/anomalias            |

**Archivos a crear**: `backend/prediction_service.py`, `backend/anomaly_detector.py`
**Archivos a modificar**: `backend/main.py` (agregar 2 endpoints), `backend/requirements.txt` (agregar scikit-learn)
**No modificar**: `backend/graph_manager.py`, `backend/neo4j_manager.py`, `backend/chat_service.py`, `frontend/*`

---

### `[AGENT: frontend-dataviz-specialist]`
| Task   | Prioridad | Descripcion                                  |
| ------ | --------- | -------------------------------------------- |
| T-401  | P3        | Reescribir index.css con variables dual      |
| T-402  | P3        | ThemeProvider y switch de tema                |
| T-403  | P3        | Redisenar LandingPage.jsx                    |
| T-404  | P3        | Redisenar Dashboard.jsx con KPI animation    |
| T-405  | P3        | Redisenar sidebar en App.jsx                 |
| T-406  | P3        | Redisenar ClientTimeline.jsx                 |
| T-407  | P3        | Redisenar GraphView.jsx                      |
| T-408  | P3        | Redisenar AgentView.jsx                      |
| T-409  | P3        | Redisenar ChatWidget.jsx                     |
| T-410  | P3        | Integrar prediccion + anomalias en frontend  |

**Archivos a crear**: `frontend/src/components/ThemeToggle.jsx`
**Archivos a modificar**: `frontend/src/index.css` (reescritura completa), `frontend/src/main.jsx` (script de tema), `frontend/src/App.jsx` (sidebar + ThemeToggle), `frontend/src/components/LandingPage.jsx`, `frontend/src/components/Dashboard.jsx`, `frontend/src/components/ClientTimeline.jsx`, `frontend/src/components/GraphView.jsx`, `frontend/src/components/AgentView.jsx`, `frontend/src/components/ChatWidget.jsx`, `frontend/src/services/api.js` (2 funciones nuevas)
**No modificar**: `backend/*`

---

## 9. Apendice: Especificaciones tecnicas detalladas

### 9.1 Esquema de respuesta del endpoint de prediccion

```json
{
  "cliente_id": "string",
  "probabilidad_pago_7d": 0.0,
  "confianza": "alta | media | baja",
  "factores_positivos": ["string con valor numerico"],
  "factores_negativos": ["string con valor numerico"],
  "modelo": "logistic_regression_v1 | heuristic_weighted_v1",
  "fecha_prediccion": "YYYY-MM-DD"
}
```

### 9.2 Esquema de respuesta del endpoint de anomalias

```json
{
  "total_anomalias": 0,
  "anomalias": [
    {
      "id": "ANO-001",
      "tipo": "agente_disputas_alta | promesas_rotas_consecutivas | agente_inactivo | pagos_decrecientes",
      "severidad": "alta | media | baja",
      "entidad_tipo": "agente | cliente",
      "entidad_id": "string",
      "descripcion": "string descriptivo en espanol",
      "datos": {},
      "recomendacion": "string con accion sugerida en espanol"
    }
  ],
  "configuracion": {
    "umbral_disputas_factor": 3,
    "umbral_promesas_rotas": 3,
    "dias_inactividad": 7
  }
}
```

### 9.3 Paleta CSS propuesta

| Variable          | Light     | Dark      | Uso                                |
| ----------------- | --------- | --------- | ---------------------------------- |
| `--bg`            | `#FAFAFA` | `#0A0A0A` | Fondo principal                    |
| `--surface`       | `#FFFFFF` | `#171717` | Fondo de cards y panels            |
| `--surface2`      | `#F5F5F5` | `#262626` | Fondo de elementos secundarios     |
| `--border`        | `#E5E5E5` | `#2E2E2E` | Bordes por defecto                 |
| `--border-strong` | `#D4D4D4` | `#404040` | Bordes enfatizados                 |
| `--text`          | `#171717` | `#FAFAFA` | Texto principal                    |
| `--text-muted`    | `#737373` | `#A3A3A3` | Texto secundario                   |
| `--primary`       | `#2563EB` | `#3B82F6` | Acciones primarias, links activos  |
| `--success`       | `#16A34A` | `#22C55E` | Indicadores positivos, pagos       |
| `--warning`       | `#D97706` | `#F59E0B` | Indicadores de precaucion          |
| `--danger`        | `#DC2626` | `#EF4444` | Indicadores de riesgo, errores     |
| `--purple`        | `#7C3AED` | `#8B5CF6` | Elementos categoricos secundarios  |

### 9.4 Features del modelo predictivo

| # | Feature                        | Derivacion                                                              | Tipo   |
| - | ------------------------------ | ----------------------------------------------------------------------- | ------ |
| 1 | `risk_score`                   | Directo de `client["risk_score"]`                                       | Float  |
| 2 | `tasa_cumplimiento_promesas`   | `promesas_cumplidas / promesas_hechas` (0 si no hay promesas)           | Float  |
| 3 | `frecuencia_contacto`          | `total_interacciones / dias_desde_primer_contacto`                      | Float  |
| 4 | `ratio_pagos_interacciones`    | `total_pagos / total_interacciones` (0 si no hay interacciones)         | Float  |
| 5 | `dias_desde_ultimo_pago`       | `(REFERENCE_DATE - ultimo_pago.timestamp).days` (999 si nunca pago)     | Int    |
| 6 | `dias_desde_ultima_interaccion`| `(REFERENCE_DATE - ultima_interaccion.timestamp).days`                  | Int    |
| 7 | `sentimiento_predominante`     | Promedio encoded: positivo=1, neutro=0, hostil=-1                       | Float  |
| 8 | `resultado_ultima_llamada`     | Encoded: pago_inmediato=1, promesa=0.7, renego=0.5, niega=-0.5, disputa=-0.8, sin_resp=-0.3 | Float |
| 9 | `monto_pendiente_ratio`        | `monto_pendiente / monto_deuda_inicial`                                 | Float  |
| 10| `tendencia_pagos`              | Pendiente de regresion lineal sobre montos de pagos ordenados por fecha  | Float  |

### 9.5 Definiciones de severidad de anomalias

| Tipo de anomalia             | Severidad alta                                        | Severidad media                                | Severidad baja              |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------- | --------------------------- |
| `agente_disputas_alta`       | Factor >= 5x promedio                                 | Factor >= 3x y < 5x promedio                   | No aplica (umbral es 3x)   |
| `promesas_rotas_consecutivas`| >= 5 promesas rotas consecutivas                      | >= 3 y < 5 promesas rotas consecutivas          | No aplica (umbral es 3)    |
| `agente_inactivo`            | >= 14 dias sin actividad                              | >= 7 y < 14 dias sin actividad                  | No aplica (umbral es 7)    |
| `pagos_decrecientes`         | Ultimo pago < 50% del primer pago historico           | Secuencia decreciente pero > 50% del primero    | No aplica                  |
