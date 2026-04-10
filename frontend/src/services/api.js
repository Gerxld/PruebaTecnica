import axios from 'axios'

// Rutas relativas — el proxy de Vite (vite.config.js) reenvía /api/* → localhost:8000
// En producción, el servidor web debe hacer el mismo proxy.
const api = axios.create({ baseURL: '/api' })

/* Data & Status */
export const getStatus     = ()           => api.get('/').then(r => r.data)
export const ingestData    = (data)       => api.post('/ingest', data).then(r => r.data)

/* Chat */
export const sendChat      = (message, history = []) =>
  api.post('/chat', { message, history }).then(r => r.data)

/* Analytics */
export const getDashboard  = ()           => api.get('/analytics/dashboard').then(r => r.data)
export const getPromesas   = ()           => api.get('/analytics/promesas-incumplidas').then(r => r.data)
export const getHorarios   = ()           => api.get('/analytics/mejores-horarios').then(r => r.data)

/* Clients */
export const getClients    = ()           => api.get('/clientes').then(r => r.data)
export const getClient     = (id)         => api.get(`/clientes/${id}`).then(r => r.data)
export const getTimeline   = (id)         => api.get(`/clientes/${id}/timeline`).then(r => r.data)

/* Agents */
export const getAgents     = ()           => api.get('/agentes').then(r => r.data)
export const getAgentEff   = (id)         => api.get(`/agentes/${id}/efectividad`).then(r => r.data)

/* Graph */
export const getGraphData  = (params={})  => api.get('/graph/data', { params }).then(r => r.data)
