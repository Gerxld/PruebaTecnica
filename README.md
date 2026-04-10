# Analizador de Patrones de Llamadas

Sistema de inteligencia para empresas de gestión de cobros. Procesa interacciones históricas cliente-agente, las almacena en un grafo de conocimiento, y expone un dashboard web con análisis, timelines, visualización del grafo y un asistente IA conversacional.

---

## Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                 │
│  LandingPage → Dashboard → ClientTimeline → GraphView → Chat   │
└─────────────────────────────┬──────────────────────────────────┘
                              │ HTTP (Vite proxy → localhost:8000)
┌─────────────────────────────▼──────────────────────────────────┐
│                     BACKEND (FastAPI)                          │
│                                                                │
│  ┌──────────────────┐   ┌──────────────────┐                  │
│  │  GraphManager    │   │  Neo4jManager    │                  │
│  │  (NetworkX)      │   │  (neo4j driver)  │                  │
│  │  In-memory       │   │  Persistent      │                  │
│  │  Fast analytics  │   │  Graph DB        │                  │
│  └──────────────────┘   └────────┬─────────┘                  │
│                                  │ bolt://localhost:7687        │
│  ┌──────────────────┐   ┌────────▼─────────┐                  │
│  │  ChatService     │   │  Neo4j Desktop   │                  │
│  │  (Gemini 2.0)    │   │  (local DB)      │                  │
│  └──────────────────┘   └──────────────────┘                  │
└────────────────────────────────────────────────────────────────┘
```

**Capa dual de conocimiento:**
- **NetworkX** (in-memory): Para todas las consultas analíticas en tiempo real. Sub-milisegundo.
- **Neo4j** (persistente): Almacenamiento durable del grafo. Permite consultas Cypher y exploración visual desde Neo4j Browser.

---

## Requisitos

- Python 3.10+
- Node.js 18+
- Neo4j Desktop (opcional pero recomendado para persistencia)
- API Key de Google Gemini (para el chat)

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd PruebaTecnica
```

### 2. Configurar variables de entorno

```bash
cp .env.example backend/.env
# Edita backend/.env con tu API key de Gemini y contraseña de Neo4j
```

### 3. Instalar dependencias del backend

```bash
cd backend
pip install -r requirements.txt
```

### 4. Instalar dependencias del frontend

```bash
cd frontend
npm install
```

---

## Configurar Neo4j Desktop (recomendado)

1. Descarga e instala [Neo4j Desktop](https://neo4j.com/download/)
2. Abre Neo4j Desktop → **New Project** → **Add** → **Local DBMS**
3. Asigna un nombre y una contraseña (por defecto: `password`)
4. Haz clic en **Start** para iniciar la base de datos
5. Actualiza `NEO4J_PASSWORD` en `backend/.env` con la contraseña que elegiste

> Si no configuras Neo4j, el sistema funciona en modo solo-NetworkX (in-memory). Los datos se persisten en `data/interacciones_clientes.json`.

---

## Ejecutar el Proyecto

**Opción A — Scripts de inicio (Windows)**

```bash
# Terminal 1
start_backend.bat

# Terminal 2
start_frontend.bat
```

**Opción B — Manual**

```bash
# Terminal 1: Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Abre el navegador en **http://localhost:5173**

---

## Flujo de uso

1. Sube el archivo `data/interacciones_clientes.json` desde la pantalla de inicio
2. El sistema carga y analiza ~50 clientes y 500+ interacciones
3. Explora las 4 vistas: Dashboard, Clientes, Grafo, Agentes
4. Usa el chat (botón `>_`) para consultas en lenguaje natural

---

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Health check + estado de Neo4j |
| POST | `/ingest` | Carga datos JSON al sistema |
| POST | `/chat` | Consulta al asistente Gemini |
| GET | `/clientes` | Lista todos los clientes |
| GET | `/clientes/{id}` | Cliente por ID |
| GET | `/clientes/{id}/timeline` | Timeline completo del cliente |
| GET | `/agentes` | Lista todos los agentes |
| GET | `/agentes/{id}/efectividad` | Métricas de desempeño del agente |
| GET | `/analytics/dashboard` | KPIs generales del sistema |
| GET | `/analytics/promesas-incumplidas` | Promesas vencidas sin cumplir |
| GET | `/analytics/mejores-horarios` | Análisis de efectividad por hora |
| GET | `/graph/data` | Datos del grafo para Cytoscape.js |

Documentación interactiva: http://localhost:8000/docs

---

## Modelo del Grafo de Conocimiento

### Nodos

| Etiqueta | Propiedades clave |
|----------|-------------------|
| `Cliente` | id, nombre, telefono, monto_deuda_inicial, tipo_deuda, risk_score, estado |
| `Agente` | id, total_contactos, pagos_inmediatos, promesas_generadas, tasa_exito |
| `Deuda` | id, monto_inicial, tipo, fecha_prestamo |
| `Interaccion` | id, timestamp, tipo, resultado, sentimiento, duracion_segundos |
| `Pago` | id, timestamp, monto, metodo_pago, pago_completo |
| `PromesaPago` | id, monto_prometido, fecha_promesa, cumplida, vencida |
| `Contacto` | id, timestamp, tipo (email/sms) |

### Relaciones

```
(Cliente)-[:TIENE_DEUDA]→(Deuda)
(Cliente)-[:TUVO_INTERACCION]→(Interaccion)
(Cliente)-[:REALIZA]→(Pago)
(Cliente)-[:PROMETE]→(PromesaPago)
(Interaccion)-[:ATENDIDA_POR]→(Agente)
(Interaccion)-[:GENERA]→(PromesaPago)
(PromesaPago)-[:SE_CUMPLE_CON]→(Pago)
(Cliente)-[:TUVO_CONTACTO]→(Contacto)
```

### Diagrama simplificado

```
Cliente ──TIENE_DEUDA──► Deuda
   │
   ├──TUVO_INTERACCION──► Interaccion ──ATENDIDA_POR──► Agente
   │                           │
   │                           └──GENERA──► PromesaPago ──SE_CUMPLE_CON──► Pago
   │
   ├──REALIZA──► Pago
   ├──PROMETE──► PromesaPago
   └──TUVO_CONTACTO──► Contacto (email/sms)
```

### Métricas calculadas en tiempo de ingesta

**Risk Score (0–100):** Indicador de probabilidad de pago.
- Base: 50
- +5 por pago inmediato
- −8 por negativa a pagar
- −5 por disputa
- ±10 según tasa de cumplimiento de promesas
- +15 escalado por recuperación total
- −10 si >2 interacciones hostiles

**Estado del cliente:** `sin_contacto` → `contactado` → `promesa_activa` / `en_renegociacion` / `rehusa_pagar` / `en_disputa` / `pago_parcial` / `pago_completo`

---

## Tecnologías Utilizadas

| Capa | Tecnología |
|------|------------|
| Backend API | FastAPI + Uvicorn |
| Grafo en memoria | NetworkX DiGraph |
| Grafo persistente | Neo4j Desktop + neo4j Python driver |
| LLM / Chat | Google Gemini 2.0 Flash |
| Frontend | React 18 + Vite 5 |
| Visualización gráfica | Cytoscape.js + fcose layout |
| Gráficos | Chart.js + react-chartjs-2 |
| Animaciones | Framer Motion |

---

## Decisiones Técnicas Importantes

### 1. NetworkX + Neo4j en lugar de graphiti-core puro

Graphiti es un framework de knowledge graph diseñado para datos **no estructurados** (texto libre), que usa LLMs para extraer entidades y relaciones automáticamente. Para este proyecto, los datos ya vienen estructurados como JSON tipado.

Decisión: usar **NetworkX** para analytics en memoria (velocidad sub-ms) y el **driver oficial de Neo4j** para persistencia del grafo. Esto evita ~500 llamadas LLM durante la ingesta, reduce la latencia de startup de ~30 segundos a <1 segundo, y produce un grafo más preciso al tener control directo sobre el schema.

### 2. Arquitectura dual (in-memory + persistente)

El grafo NetworkX se reconstruye en RAM en cada startup desde el JSON. Neo4j sirve como store persistente y permite exploración visual desde Neo4j Browser (`http://localhost:7474`).

### 3. Vite proxy para comunicación frontend-backend

El frontend usa rutas relativas (`/api/*`) que el dev server de Vite proxea a `localhost:8000`. Esto evita problemas de CORS y simplifica el deployment.

### 4. Risk Score como propiedad derivada

El risk score se calcula en tiempo de ingesta (no en cada consulta) y se almacena como propiedad del nodo `Cliente`. Esto permite filtrarlo y ordenarlo en Cypher sin recalcular.

---

## Preguntas de Reflexión

### 1. ¿Qué ventajas ofrece un grafo de conocimiento vs. una base de datos relacional para este problema?

Un grafo captura las **relaciones como ciudadanos de primera clase**. En SQL, para encontrar "todos los clientes que hicieron una promesa, no la cumplieron, y luego recibieron otra llamada del mismo agente", necesitarías 4-5 JOINs con subconsultas correlacionadas. En Cypher: `MATCH (c)-[:PROMETE]->(pr {cumplida:false})<-[:GENERA]-(:Interaccion)-[:ATENDIDA_POR]->(a)<-[:ATENDIDA_POR]-(:Interaccion)-[:TUVO_INTERACCION]-(c)`.

Además, el grafo modela naturalmente la **evolución temporal** (cadenas de interacciones → promesas → pagos o incumplimientos), lo que es el corazón de este dominio.

### 2. ¿Cómo escalaría tu solución si tuviéramos 1 millón de clientes?

- **Neo4j cluster** (Causal Clustering) para lectura distribuida
- Eliminar el grafo NetworkX in-memory; migrar todas las consultas a Cypher optimizado con índices de propiedad (`id`, `timestamp`, `tipo_deuda`)
- **Procesamiento batch** de la ingesta usando la API de Neo4j Bulk Import (`neo4j-admin database import`)
- Cachear los KPIs del dashboard (Redis / TTL de 5 minutos), ya que no cambian en tiempo real
- Separar el servicio de chat (async workers) del API de consultas
- Calcular el risk score como job programado (Celery/APScheduler) en lugar de en cada ingesta

### 3. ¿Qué otras fuentes de datos serían útiles para mejorar el análisis?

- **Historial crediticio externo** (buros de crédito): enriquecería el risk score con datos previos al préstamo
- **Datos macroeconómicos** (tasa de desempleo, inflación por período): correla impagos con contexto económico
- **Gravaciones y transcripciones de llamadas** (Speech-to-Text): análisis de sentimiento más preciso que el campo `sentimiento` manual
- **Datos de WhatsApp/redes sociales**: muchos cobros se negocian por mensajería instantánea fuera del sistema
- **Calendario**: festivos, quincenas, fecha de cobro de nómina — impactan directamente la tasa de pago ese día

---

## Mejoras Futuras Identificadas

1. **Integración MCP + LLM sobre Neo4j**: Usar el servidor MCP de Graphiti para permitir consultas Cypher generadas por LLM desde el chat
2. **Análisis predictivo**: Modelo ML que prediga probabilidad de pago en los próximos 7 días basado en risk score + historial
3. **Detección de anomalías**: Identificar patrones inusuales (agente con tasa de disputas 3x el promedio, cliente con 10 promesas rotas consecutivas)
4. **Autenticación**: Roles por agente/supervisor con vistas filtradas
5. **Exportación**: Descarga de reportes en CSV/PDF desde el dashboard
6. **WebSockets**: Push en tiempo real cuando llegan nuevas interacciones
7. **Tests automatizados**: Pytest para los endpoints + Vitest para componentes React
