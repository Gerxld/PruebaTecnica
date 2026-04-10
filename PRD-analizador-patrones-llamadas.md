# PRD — Analizador de Patrones de Llamadas

| Campo             | Valor                                          |
| ----------------- | ---------------------------------------------- |
| **Proyecto**      | Analizador de Patrones de Llamadas             |
| **Version PRD**   | 1.0.0                                          |
| **Fecha**         | 2026-04-09                                     |
| **Autor**         | BrainPRD (agente orquestador)                  |
| **Estado**        | En remediacion — proyecto existente con gaps    |

---

## 1. Meta & Vision

### 1.1 Resumen ejecutivo

El proyecto es una plataforma de analisis de patrones de cobro que ingesta datos JSON de interacciones cliente-agente, construye un grafo de conocimiento, expone una API REST y presenta un dashboard web interactivo. El sistema ya cuenta con una implementacion funcional parcial: backend FastAPI con grafo NetworkX in-memory, frontend React con Dashboard/Timeline/Grafo/Agentes/Chat. Sin embargo, existen gaps criticos que impiden cumplir los requisitos de evaluacion, siendo el principal la ausencia de Graphiti (Neo4j) como motor de grafo (40% de la nota).

### 1.2 Distribucion de evaluacion

| Componente                          | Peso  | Estado actual                       |
| ----------------------------------- | ----- | ----------------------------------- |
| Ingesta y modelado de grafo         | 40%   | Parcial — NetworkX, NO Graphiti     |
| API de consultas                    | 30%   | Completa funcionalmente             |
| Visualizacion web                   | 30%   | Completa, bug 404 en upload         |

---

## 2. Scope

### 2.1 In-Scope

- Migrar el grafo de NetworkX a Graphiti (Neo4j-backed) preservando toda la logica de negocio existente
- Corregir bug 404 en la funcionalidad de upload de JSON (LandingPage)
- Crear README.md con todas las secciones requeridas por el enunciado
- Crear .gitignore apropiado para el stack (Python + Node.js)
- Documentar el modelo de grafo (esquema de entidades y relaciones)
- Responder las 3 preguntas de reflexion tecnica
- Adaptar los endpoints REST para consultar Graphiti en lugar de NetworkX
- Integrar MCP + LLM sobre Graphiti (bonus)

### 2.2 Out-of-Scope

- Cambiar el framework frontend (React se mantiene)
- Cambiar el framework backend (FastAPI se mantiene)
- Agregar autenticacion o autorizacion
- Despliegue a produccion (cloud, Docker registry, CI/CD)
- Migrar a otra base de datos que no sea Neo4j/Graphiti
- Redisenar el tema visual del frontend
- Internacionalizacion (i18n)
- Tests de carga o performance benchmarking

---

## 3. Analisis del Estado Actual y Gaps

### 3.1 Bug 404 en LandingPage — Diagnostico detallado

**Sintoma**: Al subir un archivo JSON en LandingPage, el usuario recibe "Request Failed with status code 404".

**Archivos involucrados**:
- `frontend/src/services/api.js` (linea 3): `const BASE = 'http://localhost:8000'`
- `frontend/src/components/LandingPage.jsx` (linea 35): `await ingestData(data)`
- `backend/main.py` (linea 80): `@app.post("/ingest", tags=["Data"])`
- `frontend/vite.config.js` (lineas 8-14): proxy configurado para `/api/*`

**Analisis de causa raiz**:

1. El `api.js` define `BASE = 'http://localhost:8000'` como URL absoluta. Esto hace que axios envie las peticiones directamente al backend, **saltandose el proxy de Vite**.
2. El proxy de Vite esta configurado para reescribir `/api/*` quitando el prefijo `/api`, pero el servicio `api.js` nunca usa el prefijo `/api` — envia directamente a `http://localhost:8000/ingest`.
3. La ruta `POST /ingest` existe en el backend (linea 80 de `main.py`), por lo tanto:
   - Si el backend esta corriendo: la peticion deberia funcionar. El 404 indicaria que el backend NO esta corriendo cuando el usuario intenta subir.
   - Si el backend NO esta corriendo: axios recibe un error de red, pero el frontend lo reporta como 404.
4. **Hipotesis alternativa**: El Content-Type podria no ser `application/json`. La funcion `ingestData` pasa el objeto `data` (ya parseado) a `api.post('/ingest', data)`. Axios serializa automaticamente a JSON y establece `Content-Type: application/json`. Esto deberia funcionar correctamente.
5. **Hipotesis mas probable**: Si el frontend se sirve desde `http://localhost:5173` y el backend esta en `http://localhost:8000`, la peticion directa funciona solo si CORS esta habilitado. CORS esta habilitado (`allow_origins=["*"]`), pero el error 404 sugiere que la peticion llega al backend y no encuentra la ruta, o el backend no esta activo.

**Conclusion**: El bug necesita investigacion en runtime. El agente de frontend debe: (a) verificar que el backend esta activo, (b) inspeccionar la peticion en DevTools del navegador para confirmar URL, method, status y response body exactos, (c) probar la ruta con `curl -X POST http://localhost:8000/ingest -H "Content-Type: application/json" -d @data/interacciones_clientes.json`. Si la ruta funciona con curl pero no desde el frontend, el problema esta en la configuracion de axios o en la forma en que LandingPage invoca `ingestData`.

### 3.2 Graphiti no implementado — Analisis

**Estado actual**: `graph_manager.py` usa `networkx.DiGraph` con 7 tipos de nodos y 7 tipos de aristas. Todo el post-procesamiento (promise fulfillment, risk score, agent metrics) se ejecuta en memoria de Python.

**Requerimiento**: Usar Graphiti (capa de grafo temporal sobre Neo4j) para almacenar y consultar el grafo de conocimiento.

**Estrategia de migracion recomendada**: Crear una capa `graphiti_manager.py` que reemplace a `graph_manager.py` como proveedor de datos. Mantener `graph_manager.py` como fallback (modo sin Neo4j) para desarrollo local. La capa Graphiti debe:
- Conectarse a Neo4j (preferiblemente via Docker Compose)
- Cargar las mismas entidades como episodios/nodos en Graphiti
- Replicar las consultas Cypher equivalentes a los metodos actuales de `GraphManager`
- Mantener la misma interfaz publica que `GraphManager` para minimizar cambios en `main.py`

### 3.3 Entregables de documentacion ausentes

| Entregable                          | Estado    |
| ----------------------------------- | --------- |
| README.md                          | Ausente   |
| .gitignore                         | Ausente   |
| Esquema del modelo de grafo        | Ausente   |
| Preguntas de reflexion             | Ausente   |
| Instrucciones de instalacion       | Solo en CLAUDE.md (no visible al evaluador) |

---

## 4. Requisitos Funcionales (User Stories)

### US-001: Migrar grafo de NetworkX a Graphiti/Neo4j
**`[AGENT: graphiti-data-engineer]`**

> Como evaluador, quiero que el sistema use Graphiti (Neo4j-backed) como motor de grafo, para que el proyecto cumpla con el requisito del 40% de la evaluacion.

**Criterios de aceptacion**:

```gherkin
Given el archivo interacciones_clientes.json con 50 clientes y 502 interacciones
When el sistema ejecuta la ingesta a Graphiti
Then se crean nodos para cada entidad (cliente, agente, deuda, interaccion, pago, promesa, contacto)
And se crean relaciones tipadas (TIENE_DEUDA, TUVO_INTERACCION, REALIZA, ATENDIDA_POR, GENERA, PROMETE, SE_CUMPLE_CON, TUVO_CONTACTO)
And cada nodo y relacion conserva todas las propiedades definidas en graph_manager.py

Given datos cargados en Graphiti
When se consulta el timeline de un cliente
Then los resultados son identicos a los que retorna GraphManager.get_client_timeline()

Given datos cargados en Graphiti
When se re-ingestan datos (POST /ingest)
Then el grafo previo se limpia y se reconstruye con los nuevos datos
```

### US-002: Adaptar endpoints REST para consultar Graphiti
**`[AGENT: graphiti-rest-api-builder]`**

> Como evaluador, quiero que los endpoints de la API consulten el grafo en Graphiti, para verificar la integracion completa del pipeline ingesta-API.

**Criterios de aceptacion**:

```gherkin
Given datos cargados en Graphiti
When llamo a GET /clientes/{id}/timeline
Then recibo el timeline completo del cliente con eventos ordenados cronologicamente
And la estructura de respuesta es identica a la actual

Given datos cargados en Graphiti
When llamo a GET /agentes/{id}/efectividad
Then recibo las metricas del agente (tasa_exito, actividad_por_dia, resultados)

Given datos cargados en Graphiti
When llamo a GET /analytics/promesas-incumplidas
Then recibo todas las promesas vencidas (fecha_promesa < 2025-08-12) que no estan cumplidas

Given datos cargados en Graphiti
When llamo a GET /analytics/mejores-horarios
Then recibo el analisis por hora con total_llamadas, exitosas, tasa_exito y mejor_hora

Given datos cargados en Graphiti
When llamo a GET /graph/data con parametro cliente_id
Then recibo nodos y aristas del ego-graph de radio 2 en formato Cytoscape-compatible
```

### US-003: Corregir bug 404 en carga de JSON
**`[AGENT: frontend-dataviz-specialist]`**

> Como usuario, quiero subir un archivo JSON desde la landing page sin recibir error 404, para poder analizar mis datos de cobranza.

**Criterios de aceptacion**:

```gherkin
Given que el backend esta corriendo en localhost:8000
And estoy en la LandingPage del frontend
When arrastro un archivo JSON valido al area de drop
Then el archivo se envia al backend via POST /ingest
And recibo confirmacion con el conteo de clientes, agentes e interacciones
And la vista cambia al Dashboard

Given que el backend NO esta corriendo
When intento subir un archivo JSON
Then veo un mensaje de error claro: "No se puede conectar con el servidor"
And no veo "Request Failed with status code 404"

Given que subo un JSON invalido (sin campos clientes/interacciones)
When el backend responde con HTTP 400
Then veo el mensaje de error del backend en la UI
```

### US-004: Crear README.md completo
**`[AGENT: brain-prd]`**

> Como evaluador, quiero un README.md con toda la informacion requerida, para poder evaluar las decisiones tecnicas y reproducir el proyecto.

**Criterios de aceptacion**:

```gherkin
Given el archivo README.md en la raiz del proyecto
When lo abro
Then contiene las secciones: Descripcion, Requisitos previos, Instalacion y ejecucion, Arquitectura tecnica, Modelo de grafo (esquema), Decisiones tecnicas, Preguntas de reflexion, Mejoras futuras

Given la seccion "Preguntas de reflexion"
When la leo
Then contiene respuestas argumentadas para:
  1. Ventajas de usar un grafo vs modelo relacional para este caso
  2. Como escalar a 1 millon de clientes
  3. Que otras fuentes de datos serian utiles integrar

Given la seccion "Modelo de grafo"
When la leo
Then contiene un esquema (ASCII, Mermaid o tabla) que describe:
  - Los 7 tipos de nodos con sus propiedades
  - Los 8 tipos de relaciones con sus nodos origen/destino
```

### US-005: Crear .gitignore
**`[AGENT: brain-prd]`**

> Como desarrollador, quiero un .gitignore que excluya archivos innecesarios del repositorio.

**Criterios de aceptacion**:

```gherkin
Given el archivo .gitignore en la raiz del proyecto
When hago git status
Then no aparecen: node_modules/, __pycache__/, .env, dist/, *.pyc, .vite/
And el archivo interacciones_clientes.json SI esta incluido en el repo (es dato de prueba)
```

### US-006: Integrar MCP + LLM sobre Graphiti (BONUS)
**`[AGENT: mcp-nlq-integrator]`**

> Como usuario, quiero hacer preguntas en lenguaje natural sobre el grafo de conocimiento usando MCP, para obtener respuestas mas precisas basadas directamente en la estructura del grafo.

**Criterios de aceptacion**:

```gherkin
Given que el MCP server de Graphiti esta corriendo
When envio una pregunta como "Cual es el cliente con mas deuda pendiente?"
Then el sistema ejecuta una consulta Cypher o Graphiti search
And retorna una respuesta precisa con datos del grafo

Given que el chat funciona con MCP
When pregunto "Que agente tiene mejor tasa de exito?"
Then la respuesta incluye el ID del agente y su tasa numerica exacta
```

---

## 5. Requisitos No-Funcionales

| ID     | Categoria      | Requisito                                                                                                | Umbral                                  |
| ------ | -------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| NFR-01 | Rendimiento    | La ingesta de 50 clientes + 502 interacciones a Graphiti debe completarse en tiempo razonable            | < 30 segundos                           |
| NFR-02 | Rendimiento    | Los endpoints de consulta deben responder rapidamente                                                     | < 500ms (p95) para cualquier GET        |
| NFR-03 | Disponibilidad | El sistema debe funcionar con `docker compose up` o instrucciones claras de instalacion                   | Setup funcional en menos de 5 minutos   |
| NFR-04 | Compatibilidad | El frontend debe funcionar en Chrome, Firefox y Edge modernos                                             | Ultimas 2 versiones de cada navegador   |
| NFR-05 | Seguridad      | La API key de Gemini no debe estar hardcodeada en el codigo fuente                                        | Usar variable de entorno (.env)         |
| NFR-06 | Mantenibilidad | El codigo debe seguir las convenciones ya establecidas (Python PEP 8, JSX funcional con hooks)            | Sin errores de linting criticos         |
| NFR-07 | Datos          | El sistema debe validar la estructura del JSON antes de ingestar                                          | Rechazar JSON sin clientes/interacciones|

---

## 6. Task Assignment Matrix

### Prioridad 1 — CRITICO (Bloqueantes para evaluacion)

| Task ID | Agente responsable              | Descripcion tecnica                                                                                                                                                                                                                                                                                                                                                                                                                         | Dependencia             | Definition of Done                                                                                                                    |
| ------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| T-001   | `[AGENT: graphiti-data-engineer]` | **Disenar schema Graphiti y crear modulo de ingesta.** (1) Crear `docker-compose.yml` con Neo4j 5.x (puertos 7474/7687). (2) Crear `backend/graphiti_manager.py` que implemente la misma interfaz publica que `GraphManager` (metodos: `ingest`, `reset`, `get_all_clients`, `get_client_by_id`, `get_client_timeline`, `get_all_agents`, `get_agent_effectiveness`, `get_unfulfilled_promises`, `get_best_hours`, `get_dashboard_data`, `get_graph_data`). (3) Usar la API REST de Graphiti para crear episodios y entidades. (4) Los 7 tipos de nodos son: `cliente` (props: id, nombre, telefono, monto_deuda_inicial, fecha_prestamo, tipo_deuda), `agente` (props: id), `deuda` (props: monto_inicial, tipo, fecha_prestamo), `interaccion` (props: id, cliente_id, timestamp, tipo, duracion_segundos, agente_id, resultado, sentimiento), `pago` (props: id, cliente_id, timestamp, monto, metodo_pago, pago_completo), `promesa` (props: id, monto_prometido, fecha_promesa, cumplida, vencida), `contacto` (props: id, cliente_id, timestamp, tipo). (5) Los 8 tipos de relaciones son: TIENE_DEUDA (cliente->deuda), TUVO_INTERACCION (cliente->interaccion), REALIZA (cliente->pago), ATENDIDA_POR (interaccion->agente), GENERA (interaccion->promesa), PROMETE (cliente->promesa), SE_CUMPLE_CON (promesa->pago), TUVO_CONTACTO (cliente->contacto). (6) Replicar el post-procesamiento: promise fulfillment (>=50% del monto prometido o pago_completo posterior), risk score (formula en lineas 274-287 de graph_manager.py), metricas de agente. (7) Documentar decisiones de modelado en un archivo `GRAPH_MODEL.md`. | Ninguna                 | Neo4j arranca con `docker compose up`. Los 50 clientes y 502 interacciones se cargan. Todos los metodos retornan datos equivalentes a NetworkX. |
| T-002   | `[AGENT: graphiti-rest-api-builder]` | **Adaptar main.py para usar GraphitiManager.** (1) Importar `GraphitiManager` en lugar de (o ademas de) `GraphManager`. (2) Detectar si Neo4j esta disponible; si lo esta, usar `GraphitiManager`; si no, fallback a `GraphManager` (modo degradado). (3) Verificar que todos los 10 endpoints retornan la misma estructura de datos. (4) El endpoint `POST /ingest` debe llamar a `graphiti_manager.ingest(body)`. (5) Mover la API key de Gemini de hardcoded a variable de entorno `GEMINI_API_KEY`. (6) Actualizar `requirements.txt` con las dependencias de Graphiti/Neo4j. (7) Agregar manejo de errores para conexion perdida con Neo4j. | T-001                   | Todos los endpoints (`/clientes/{id}/timeline`, `/agentes/{id}/efectividad`, `/analytics/promesas-incumplidas`, `/analytics/mejores-horarios`, `/graph/data`) retornan datos correctos consultando Graphiti. `curl` contra cada endpoint retorna HTTP 200. |
| T-003   | `[AGENT: frontend-dataviz-specialist]` | **Corregir bug 404 en upload.** Pasos de investigacion: (1) Abrir DevTools > Network en el navegador con el frontend corriendo en `http://localhost:5173`. (2) Subir un JSON y observar la peticion HTTP. Verificar: URL exacta, method, status, response body. (3) Si la URL es `http://localhost:8000/ingest` y retorna 404, verificar que el backend esta corriendo (`curl http://localhost:8000/`). (4) Si el backend responde OK a GET `/` pero no a POST `/ingest`, verificar que no hay un typo en la ruta o un error de middleware. (5) **Fix mas probable**: Cambiar `api.js` linea 3 de `const BASE = 'http://localhost:8000'` a `const BASE = ''` y usar el proxy de Vite (`/api/*`). Esto requiere tambien cambiar todas las rutas en `api.js` para anteponer `/api` (ej: `api.get('/api/clientes')`). **Alternativa**: mantener la URL absoluta y solo verificar que el backend este corriendo, mejorando el manejo de errores en `LandingPage.jsx` linea 37 para distinguir entre error de red y error HTTP. (6) Agregar un bloque catch mas granular en `parseAndSubmit` que muestre "No se puede conectar con el servidor. Verifica que el backend este corriendo en localhost:8000." cuando `e.code === 'ERR_NETWORK'`. | Ninguna                 | Se puede subir `interacciones_clientes.json` desde la landing page sin error. Al subir un JSON valido, la vista transiciona al Dashboard con datos. Al intentar subir sin backend, el mensaje de error es descriptivo. |
| T-004   | `[AGENT: brain-prd]`           | **Crear .gitignore.** Contenido: `node_modules/`, `dist/`, `.vite/`, `__pycache__/`, `*.pyc`, `*.pyo`, `.env`, `.env.local`, `*.log`, `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/`, `*.swp`, `*.swo`. NO excluir `data/interacciones_clientes.json` (es dato de prueba necesario). | Ninguna                 | El archivo `.gitignore` existe en la raiz. `git status` no muestra archivos generados. |
| T-005   | `[AGENT: brain-prd]`           | **Crear README.md completo.** Secciones requeridas: (1) Titulo y descripcion breve. (2) Requisitos previos (Python 3.10+, Node.js 18+, Docker para Neo4j). (3) Instalacion y ejecucion paso a paso (backend, frontend, Neo4j). (4) Arquitectura tecnica (diagrama de componentes: frontend <-> FastAPI <-> Graphiti/Neo4j). (5) Modelo de grafo (esquema con los 7 nodos y 8 relaciones, incluir diagrama Mermaid). (6) Decisiones tecnicas (por que FastAPI, por que Graphiti, por que Chart.js + Cytoscape, por que Gemini). (7) Endpoints de la API (tabla con method, ruta, descripcion). (8) Preguntas de reflexion (ver T-006). (9) Mejoras futuras. (10) Estructura del proyecto (arbol de archivos). | T-001 (para Graphiti docs) | El README.md existe, contiene las 10 secciones, las instrucciones de instalacion funcionan end-to-end. |
| T-006   | `[AGENT: brain-prd]`           | **Redactar preguntas de reflexion** dentro del README.md: (1) **Grafo vs Relacional**: argumentar ventajas del grafo para modelar relaciones temporales multi-salto (cliente->interaccion->promesa->pago), descubrimiento de patrones de cobro, y flexibilidad de schema. (2) **Escalabilidad a 1M clientes**: discutir sharding de Neo4j, indices compuestos por cliente_id y timestamp, paginacion de consultas, caching de agregaciones en Redis, ingesta batch asincrona. (3) **Otras fuentes de datos**: sugerir historial crediticio (buro de credito), datos demograficos, redes sociales (para sentiment analysis), registros de pagos externos, datos de geolocalizacion para segmentacion regional. | Ninguna                 | Las 3 respuestas estan en el README.md, cada una con al menos 3-5 oraciones argumentadas. |

### Prioridad 2 — IMPORTANTE (Mejoran la nota pero no son bloqueantes)

| Task ID | Agente responsable              | Descripcion tecnica                                                                                                                                                                                                                                                                                                                      | Dependencia | Definition of Done                                                                                          |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| T-007   | `[AGENT: graphiti-data-engineer]` | **Crear documentacion del modelo de grafo.** Archivo `GRAPH_MODEL.md` con: (1) Diagrama Mermaid del schema completo (nodos como cajas, relaciones como flechas tipadas). (2) Tabla de nodos con tipo, propiedades, cardinalidad esperada. (3) Tabla de relaciones con nodo origen, nodo destino, tipo, propiedades de la arista. (4) Explicacion de las relaciones temporales (como el timestamp se usa para ordenar interacciones y determinar cumplimiento de promesas). (5) Justificacion de cada decision de modelado (por que promesa es un nodo separado y no una propiedad de interaccion, por que deuda es un nodo y no una propiedad de cliente, etc.). | T-001       | `GRAPH_MODEL.md` existe y es referenciado desde README.md. El diagrama Mermaid renderiza correctamente en GitHub. |
| T-008   | `[AGENT: frontend-dataviz-specialist]` | **Mejorar manejo de errores global en el frontend.** (1) En `api.js`, agregar un interceptor de axios que capture errores de red y los convierta en mensajes legibles. (2) En `App.jsx`, agregar un estado de error global que muestre un banner cuando el backend no responde. (3) En cada componente que llama a la API (Dashboard, ClientTimeline, GraphView, AgentView), asegurar que los bloques catch muestren errores en la UI en lugar de fallar silenciosamente. | T-003       | Al desconectar el backend, cada vista muestra un mensaje de error informativo en lugar de quedar en "Cargando..." indefinidamente. |
| T-009   | `[AGENT: graphiti-rest-api-builder]` | **Agregar documentacion OpenAPI enriquecida.** (1) Agregar `response_model` a cada endpoint con modelos Pydantic que describan la estructura de respuesta. (2) Agregar `description` y `summary` a cada endpoint. (3) Verificar que `http://localhost:8000/docs` renderiza correctamente la documentacion Swagger con ejemplos. | T-002       | La pagina `/docs` de FastAPI muestra todos los endpoints con descripciones, modelos de request/response, y codigos de error documentados. |

### Prioridad 3 — BONUS (Puntos extra)

| Task ID | Agente responsable              | Descripcion tecnica                                                                                                                                                                                                                                                                                                                                                   | Dependencia  | Definition of Done                                                                                              |
| ------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| T-010   | `[AGENT: mcp-nlq-integrator]`  | **Configurar MCP server para Graphiti.** (1) Instalar y configurar `graphiti-mcp-server` que expone herramientas de busqueda y consulta sobre el grafo en Graphiti. (2) Configurar un LLM (Gemini u otro) como cliente MCP que invoca las herramientas de Graphiti para responder preguntas. (3) Modificar `chat_service.py` para que el flujo de chat use MCP: el LLM recibe la pregunta del usuario, invoca herramientas de Graphiti via MCP, y formula la respuesta con los datos obtenidos. (4) Mantener fallback: si MCP no esta disponible, usar el metodo actual de `build_context()` con datos serializados. | T-001, T-002 | El chat puede responder preguntas ejecutando consultas reales al grafo via MCP. Las respuestas son mas precisas que las del metodo actual de contexto serializado. |
| T-011   | `[AGENT: graphiti-rest-api-builder]` | **Agregar tests de integracion.** (1) Crear `backend/tests/` con pytest. (2) Test de ingesta: cargar JSON, verificar que los nodos existen en Graphiti. (3) Test de cada endpoint: verificar estructura de respuesta y datos correctos. (4) Test de re-ingesta: cargar datos, re-cargar otros datos, verificar que los datos anteriores fueron reemplazados. | T-002        | `pytest` corre sin errores. Al menos 1 test por endpoint critico. Coverage > 60% del modulo graphiti_manager. |

---

## 7. Dependencias & Riesgos

### 7.1 Dependencias tecnicas

| ID   | Dependencia                                 | Impacto                                          | Mitigacion                                                                      |
| ---- | ------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| D-01 | Neo4j disponible como servicio Docker        | Sin Neo4j, Graphiti no funciona                   | Incluir `docker-compose.yml` con Neo4j 5.x. Documentar alternativa Neo4j Desktop |
| D-02 | Graphiti SDK/API compatible con Python 3.10+ | Posibles breaking changes en versiones recientes  | Fijar version en requirements.txt                                               |
| D-03 | API key de Gemini valida                     | Chat no funciona sin key                          | Mover a .env, documentar como obtener key en README                             |
| D-04 | npm y pip disponibles en el entorno          | No se puede instalar el proyecto                  | Documentar versiones minimas en README                                          |

### 7.2 Riesgos

| ID   | Riesgo                                                        | Probabilidad | Impacto | Mitigacion                                                                                                                 |
| ---- | ------------------------------------------------------------- | ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| R-01 | Graphiti API cambia su interfaz entre versiones                | Media        | Alto    | Fijar version exacta. Leer documentacion oficial antes de implementar.                                                     |
| R-02 | Performance de ingesta a Neo4j lenta para 502 interacciones   | Baja         | Medio   | Usar batch/bulk operations de Graphiti. Crear indices en Neo4j para id y timestamp.                                        |
| R-03 | El post-procesamiento (risk score, promise fulfillment) es dificil de replicar en Cypher | Media        | Alto    | Opcion A: replicar en Cypher. Opcion B: hacer post-procesamiento en Python y escribir resultados como propiedades en Neo4j. |
| R-04 | El bug 404 tiene una causa distinta a la hipotesis            | Media        | Bajo    | El agente de frontend debe probar en runtime, no solo analizar codigo estaticamente.                                       |
| R-05 | La API key de Gemini hardcodeada se filtra al hacer push      | Alta         | Alto    | Moverla a .env inmediatamente. Agregar .env a .gitignore. Revocar la key actual si ya fue pushed.                          |

---

## 8. Estrategia de Ejecucion

### 8.1 Orden de ejecucion por fases

```
FASE 0 (Inmediata, sin dependencias — ejecutar en paralelo)
  T-003: Corregir bug 404 en frontend         [AGENT: frontend-dataviz-specialist]
  T-004: Crear .gitignore                      [AGENT: brain-prd]
  T-006: Redactar preguntas de reflexion       [AGENT: brain-prd]

FASE 1 (Infraestructura Graphiti)
  T-001: Schema + ingesta a Graphiti           [AGENT: graphiti-data-engineer]

FASE 2 (Depende de FASE 1)
  T-002: Adaptar endpoints a Graphiti          [AGENT: graphiti-rest-api-builder]
  T-007: Documentar modelo de grafo            [AGENT: graphiti-data-engineer]

FASE 3 (Depende de FASE 2)
  T-005: Crear README.md completo              [AGENT: brain-prd]
  T-008: Mejorar manejo errores frontend       [AGENT: frontend-dataviz-specialist]
  T-009: Documentacion OpenAPI                 [AGENT: graphiti-rest-api-builder]

FASE 4 (Bonus — solo si hay tiempo)
  T-010: MCP + LLM sobre Graphiti              [AGENT: mcp-nlq-integrator]
  T-011: Tests de integracion                  [AGENT: graphiti-rest-api-builder]
```

### 8.2 Camino critico

```
T-001 (Graphiti ingesta) --> T-002 (API adaptar) --> T-005 (README) --> ENTREGA
```

Tiempo estimado del camino critico: T-001 (4-6h) + T-002 (3-4h) + T-005 (1-2h) = **8-12 horas de trabajo neto**.

Las tareas T-003, T-004, T-006 se ejecutan en paralelo con T-001 y no afectan el camino critico.

### 8.3 Criterio de entrega minima viable

Para una entrega que obtenga la maxima puntuacion posible, el orden de prioridad es:

1. **Graphiti funcional** (T-001 + T-002) — 40% de la nota
2. **API endpoints correctos** (T-002 verificado) — 30% de la nota  
3. **Frontend sin bugs + visualizaciones** (T-003) — 30% de la nota
4. **README + .gitignore + reflexion** (T-004 + T-005 + T-006) — requisito obligatorio
5. **Documentacion del modelo** (T-007) — requisito importante
6. **Bonus MCP** (T-010) — puntos extra

---

## 9. Hallazgos adicionales de la auditoria de codigo

### 9.1 API key expuesta (CRITICO de seguridad)

En `backend/main.py` linea 36:
```python
GEMINI_API_KEY = "AIzaSyD12jMkxPaBFbaKWP9_2RRzgE8UFcutFNQ"
```

Esta API key esta hardcodeada y sera expuesta al hacer push al repositorio. **Accion inmediata requerida**:
1. Mover a variable de entorno: `GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")`
2. Crear archivo `.env` con la key (no committear)
3. Si la key ya fue pushed, revocarla en Google Cloud Console

### 9.2 Proxy de Vite no utilizado

El `vite.config.js` configura un proxy `/api/*` que reescribe las rutas quitando el prefijo `/api`. Sin embargo, `api.js` usa una URL absoluta (`http://localhost:8000`), haciendo que el proxy sea inutil. Esto no es un bug funcional pero es un desperdicio de configuracion. La decision de si usar proxy o URL directa debe ser consistente.

### 9.3 Colores de charts inconsistentes entre dark/light

El CSS define un tema light (fondo `#F0EBE3`, texto `#0A0A0A`). Sin embargo, `AgentView.jsx` y `ClientTimeline.jsx` usan colores de texto de chart como `#94a3b8` y `#64748b` (grises claros de un tema dark), y colores de grid como `#1e293b` (oscuro). Esto funciona visualmente pero no es coherente con el sistema de variables CSS. El `Dashboard.jsx` usa los colores correctos del tema (`#0A0A0A`, `#555`, `#E8E2D9`).

### 9.4 Advertencia de deprecacion en FastAPI

`main.py` linea 42 usa `@app.on_event("startup")` que esta deprecado en versiones recientes de FastAPI. Se debe migrar a `lifespan` context manager. No es bloqueante pero genera warnings.

---

## 10. Resumen de asignaciones por agente

### `[AGENT: graphiti-data-engineer]`
- **T-001**: Crear docker-compose.yml + graphiti_manager.py (CRITICO)
- **T-007**: Documentar modelo de grafo en GRAPH_MODEL.md (IMPORTANTE)

### `[AGENT: graphiti-rest-api-builder]`
- **T-002**: Adaptar main.py para usar GraphitiManager (CRITICO)
- **T-009**: Documentacion OpenAPI enriquecida (IMPORTANTE)
- **T-011**: Tests de integracion con pytest (BONUS)

### `[AGENT: frontend-dataviz-specialist]`
- **T-003**: Corregir bug 404 en LandingPage (CRITICO)
- **T-008**: Mejorar manejo de errores global (IMPORTANTE)

### `[AGENT: mcp-nlq-integrator]`
- **T-010**: MCP server + LLM sobre Graphiti (BONUS)

### `[AGENT: brain-prd]`
- **T-004**: Crear .gitignore (CRITICO)
- **T-005**: Crear README.md completo (CRITICO)
- **T-006**: Redactar preguntas de reflexion (CRITICO)
