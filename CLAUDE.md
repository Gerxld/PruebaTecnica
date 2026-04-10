# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Analizador de Patrones de Llamadas** — A debt collection analytics platform. It ingests JSON client/interaction data, builds an in-memory NetworkX knowledge graph, and serves a React dashboard with charts, client timelines, a Cytoscape.js graph view, and a Gemini-powered chat assistant.

## Running the Project

**Backend** (FastAPI, port 8000):
```bash
cd backend
uvicorn main:app --reload --port 8000
```

**Frontend** (Vite/React, port 5173):
```bash
cd frontend
npm run dev
```

Or use the provided `.bat` files: `start_backend.bat` / `start_frontend.bat`.

On first launch the backend auto-ingests `data/interacciones_clientes.json` if present. If not, the frontend's landing page (`LandingPage.jsx`) handles file upload via `POST /ingest`.

## Backend Architecture

- **`main.py`** — FastAPI app. Instantiates `GraphManager` and `ChatService` as module-level singletons. Exposes REST endpoints grouped by tag: Health, Data, Chat, Clientes, Agentes, Analytics, Graph.
- **`graph_manager.py`** — Core logic. Builds and queries a `networkx.DiGraph`. Node types: `cliente`, `agente`, `interaccion`, `pago`, `promesa_pago`, `deuda`, `contacto`. Edge types: `TIENE_DEUDA`, `TUVO_INTERACCION`, `REALIZA`, `ATENDIDA_POR`, `GENERA`, `PROMETE`, `TUVO_CONTACTO`, `SE_CUMPLE_CON`. After ingestion, runs three post-processing passes: promise fulfillment, client metrics (including risk score 0–100), and agent metrics.
- **`chat_service.py`** — Wraps `google.generativeai` (`gemini-2.0-flash`). The `build_context()` method serializes all graph data into a text prompt injected at conversation start. The Gemini API key is hardcoded in `main.py`.

### Key Backend Conventions
- `REFERENCE_DATE` in `graph_manager.py` is `2025-08-12` — used to determine whether payment promises are overdue.
- Promise fulfillment: a promise is `cumplida=True` if any subsequent payment is marked `pago_completo`, or cumulative payments after the promise timestamp cover ≥50% of `monto_prometido`.
- Risk score starts at 50, adjusted by: `+5` per immediate payment, `−8` per refusal, `−5` per dispute, `±10` based on promise fulfillment rate, `+15` scaled by total recovery, `−10` if >2 hostile interactions.
- `GraphManager.reset()` must be called before re-ingesting data.

## Frontend Architecture

- **`src/services/api.js`** — All axios calls. `BASE` is hardcoded to `http://localhost:8000`. Vite proxies `/api/*` → `http://localhost:8000` but the service file bypasses the proxy and hits the backend directly.
- **`src/App.jsx`** — Root component. Shows `LandingPage` until data is loaded, then switches to a sidebar layout with four tabs: Dashboard, Clientes, Grafo, Agentes. `ChatWidget` is always rendered over the main content.
- **Components**: `Dashboard.jsx` (Chart.js KPI cards + charts), `ClientTimeline.jsx` (client list + per-client timeline), `GraphView.jsx` (Cytoscape.js with `cytoscape-fcose` layout), `AgentView.jsx` (agent effectiveness tables/charts), `ChatWidget.jsx` (floating Gemini chat panel), `LandingPage.jsx` (file upload).

### Key Frontend Conventions
- Styling is entirely in `src/index.css` — CSS custom properties on `:root`, a dark "brutalist" theme. No CSS modules or Tailwind.
- Animations use `framer-motion` (`AnimatePresence` + `motion.div`) for tab transitions.
- Graph `GET /graph/data` accepts optional query params: `cliente_id` (ego-graph, radius 2), `agente_id` (filter interactions), `tipo` (unused server-side currently).

## Data Format

Input JSON must have two top-level arrays:
```json
{
  "clientes": [{ "id", "nombre", "telefono", "monto_deuda_inicial", "fecha_prestamo", "tipo_deuda" }],
  "interacciones": [{ "id", "cliente_id", "tipo", "timestamp", ... }]
}
```
Interaction `tipo` values: `llamada_saliente`, `llamada_entrante`, `pago_recibido`, `email`, `sms`.

## Dependencies

Backend: Python with `fastapi`, `uvicorn`, `networkx`, `pydantic`, `google-generativeai`. Install via:
```bash
pip install -r backend/requirements.txt
```

Frontend: React 18, Vite 5, Chart.js, Cytoscape.js + fcose, framer-motion, axios. Install via:
```bash
cd frontend && npm install
```
