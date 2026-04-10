import { useEffect, useRef, useState } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { getGraphData, getClients } from '../services/api'

cytoscape.use(fcose)

const ESTADO_BADGE = {
  pago_completo:    'badge-green',
  pago_parcial:     'badge-blue',
  promesa_activa:   'badge-amber',
  en_renegociacion: 'badge-purple',
  rehusa_pagar:     'badge-red',
  en_disputa:       'badge-red',
  sin_respuesta:    'badge-gray',
  sin_contacto:     'badge-gray',
  contactado:       'badge-blue',
}

export default function GraphView() {
  const cyRef    = useRef(null)
  const cyInst   = useRef(null)
  const [loading, setLoading]   = useState(true)
  const [clients, setClients]   = useState([])
  const [selClient, setSelClient] = useState('')
  const [nodeInfo, setNodeInfo]   = useState(null)
  const [stats, setStats]         = useState({ nodes: 0, edges: 0 })

  useEffect(() => {
    getClients().then(setClients)
  }, [])

  const loadGraph = (clienteId = '') => {
    setLoading(true)
    setNodeInfo(null)
    getGraphData(clienteId ? { cliente_id: clienteId } : {})
      .then(({ nodes, edges }) => {
        if (cyInst.current) {
          cyInst.current.destroy()
          cyInst.current = null
        }

        setStats({ nodes: nodes.length, edges: edges.length })

        const cy = cytoscape({
          container: cyRef.current,
          elements: [...nodes, ...edges],
          style: [
            {
              selector: 'node',
              style: {
                'background-color': 'data(color)',
                label: 'data(label)',
                color: '#e2e8f0',
                'font-size': clienteId ? 10 : 8,
                'text-valign': 'bottom',
                'text-margin-y': 4,
                'text-outline-color': '#0f172a',
                'text-outline-width': 2,
                width: 28,
                height: 28,
              },
            },
            {
              selector: 'node[type="cliente"]',
              style: { width: 32, height: 32 },
            },
            {
              selector: 'node[type="agente"]',
              style: { shape: 'diamond', width: 36, height: 36 },
            },
            {
              selector: 'node[type="pago"]',
              style: { shape: 'round-rectangle', width: 24, height: 24 },
            },
            {
              selector: 'node[type="promesa"]',
              style: { shape: 'star', width: 28, height: 28 },
            },
            {
              selector: 'edge',
              style: {
                width: 1.5,
                'line-color': '#334155',
                'target-arrow-color': '#334155',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'arrow-scale': 0.7,
                label: clienteId ? 'data(label)' : '',
                color: '#64748b',
                'font-size': 8,
                'text-rotation': 'autorotate',
              },
            },
            {
              selector: 'edge[weight]',
              style: {
                width: (ele) => Math.min(1 + (ele.data('weight') || 1) * 0.4, 6),
                label: 'data(label)',
                color: '#64748b',
                'font-size': 8,
              },
            },
            {
              selector: ':selected',
              style: {
                'border-width': 3,
                'border-color': '#f59e0b',
                'background-color': '#f59e0b',
              },
            },
          ],
          layout: {
            name: 'fcose',
            animate: true,
            animationDuration: 800,
            idealEdgeLength: clienteId ? 120 : 80,
            nodeRepulsion: clienteId ? 8000 : 5000,
            gravity: 0.3,
          },
          wheelSensitivity: 0.3,
        })

        cy.on('tap', 'node', (evt) => {
          const d = evt.target.data()
          setNodeInfo(d)
        })
        cy.on('tap', (evt) => {
          if (evt.target === cy) setNodeInfo(null)
        })

        cyInst.current = cy
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadGraph() }, [])

  const handleClientChange = (e) => {
    const val = e.target.value
    setSelClient(val)
    loadGraph(val)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">🔗 Grafo de Conocimiento</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {stats.nodes} nodos · {stats.edges} aristas
          </span>
          <select
            className="form-control"
            value={selClient}
            onChange={handleClientChange}
          >
            <option value="">Vista global</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <button
            className="form-control"
            onClick={() => loadGraph(selClient)}
            style={{ cursor: 'pointer', background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 600 }}
          >
            ↺ Recargar
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
        {[
          { color: '#3b82f6', label: '● Cliente' },
          { color: '#10b981', label: '◆ Agente' },
          { color: '#ef4444', label: '● Deuda' },
          { color: '#f59e0b', label: '● Interacción' },
          { color: '#8b5cf6', label: '■ Pago' },
          { color: '#f97316', label: '★ Promesa' },
          { color: '#6b7280', label: '● Contacto' },
        ].map(({ color, label }) => (
          <span key={label} style={{ color }}>{label}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: nodeInfo ? '1fr 280px' : '1fr', gap: '1rem', alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          {loading && (
            <div className="spinner" style={{ position: 'absolute', zIndex: 10, background: 'var(--surface)' }}>
              ⏳ Construyendo grafo…
            </div>
          )}
          <div ref={cyRef} id="cy" style={{ height: '560px' }} />
        </div>

        {nodeInfo && (
          <div className="card" style={{ position: 'sticky', top: '1.5rem' }}>
            <div className="card-title">Detalles del nodo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: nodeInfo.color || '#6b7280',
              }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{nodeInfo.label}</span>
            </div>
            <div style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              padding: '0.75rem',
            }}>
              <table style={{ width: '100%', fontSize: '0.75rem' }}>
                <tbody>
                  {Object.entries(nodeInfo)
                    .filter(([k]) => !['id','label','color','source','target'].includes(k))
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ color: 'var(--text-muted)', padding: '0.2rem 0.4rem 0.2rem 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {k.replace(/_/g,' ')}
                        </td>
                        <td style={{ padding: '0.2rem 0', fontWeight: 500, wordBreak: 'break-all' }}>
                          {typeof v === 'boolean'
                            ? (v ? '✓' : '✗')
                            : typeof v === 'number' && k.includes('monto')
                            ? `$${Number(v).toLocaleString()}`
                            : String(v)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {nodeInfo.estado && (
              <div style={{ marginTop: '0.75rem' }}>
                <span className={`badge ${ESTADO_BADGE[nodeInfo.estado] || 'badge-gray'}`}>
                  {nodeInfo.estado.replace(/_/g,' ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        💡 Clic en un nodo para ver detalles · Rueda del ratón para hacer zoom · Arrastra para navegar
      </div>
    </div>
  )
}
