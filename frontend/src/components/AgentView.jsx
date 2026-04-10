import { useEffect, useState } from 'react'
import { Bar, Radar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  RadialLinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { getAgents, getAgentEff } from '../services/api'

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  RadialLinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
)

const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
  scales: {
    x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
    y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
  },
}

function ScoreBar({ value, max, color }) {
  return (
    <div className="risk-bar-wrap">
      <div className="risk-bar">
        <div className="risk-bar-fill"
             style={{ width: `${Math.round((value / max) * 100)}%`, background: color }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color }}>{value}</span>
    </div>
  )
}

export default function AgentView() {
  const [agents, setAgents]         = useState([])
  const [selected, setSelected]     = useState(null)
  const [detail, setDetail]         = useState(null)
  const [loading, setLoading]       = useState(false)

  useEffect(() => { getAgents().then(setAgents) }, [])

  const handleSelect = (agent) => {
    setSelected(agent.id)
    setLoading(true)
    getAgentEff(agent.id)
      .then(setDetail)
      .finally(() => setLoading(false))
  }

  const maxContacts = Math.max(...agents.map(a => a.total_contactos || 1), 1)

  /* ── Comparison bar chart ── */
  const compChart = {
    labels: agents.map(a => a.id),
    datasets: [
      { label: 'Pagos inmediatos', data: agents.map(a => a.pagos_inmediatos || 0), backgroundColor: '#10b981', borderRadius: 3 },
      { label: 'Promesas',         data: agents.map(a => a.promesas_generadas || 0), backgroundColor: '#f59e0b', borderRadius: 3 },
      { label: 'Renegociaciones',  data: agents.map(a => a.renegociaciones || 0),  backgroundColor: '#8b5cf6', borderRadius: 3 },
      { label: 'Se niega',         data: agents.map(a => a.se_niega || 0),          backgroundColor: '#ef4444', borderRadius: 3 },
      { label: 'Disputas',         data: agents.map(a => a.disputas || 0),          backgroundColor: '#f97316', borderRadius: 3 },
    ],
  }

  /* ── Tasa de éxito bar ── */
  const tasaChart = {
    labels: agents.map(a => a.id),
    datasets: [{
      label: 'Tasa de éxito (%)',
      data: agents.map(a => a.tasa_exito || 0),
      backgroundColor: agents.map(a =>
        a.tasa_exito >= 50 ? '#10b981' : a.tasa_exito >= 30 ? '#f59e0b' : '#ef4444'
      ),
      borderRadius: 4,
    }],
  }

  /* ── Detail charts ── */
  let radarChart = null
  let actChart   = null

  if (detail) {
    const max = Math.max(
      detail.pagos_inmediatos || 0,
      detail.promesas_generadas || 0,
      detail.renegociaciones || 0,
      detail.se_niega || 0,
      detail.disputas || 0,
      detail.sin_respuesta || 0,
      1,
    )
    radarChart = {
      labels: ['Pagos\nInmediatos','Promesas','Renegociaciones','Se niega','Disputas','Sin respuesta'],
      datasets: [{
        label: detail.id,
        data: [
          detail.pagos_inmediatos || 0,
          detail.promesas_generadas || 0,
          detail.renegociaciones || 0,
          detail.se_niega || 0,
          detail.disputas || 0,
          detail.sin_respuesta || 0,
        ],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.15)',
        pointBackgroundColor: '#3b82f6',
      }],
    }

    const days = Object.keys(detail.actividad_por_dia || {}).sort()
    actChart = {
      labels: days,
      datasets: [{
        label: 'Llamadas / día',
        data: days.map(d => detail.actividad_por_dia[d]),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.25)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#10b981',
      }],
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">👤 Efectividad de Agentes</h1>
      </div>

      {/* Comparison charts */}
      <div className="charts-grid" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <div className="card-title">Resultados por agente</div>
          <div style={{ height: 250 }}>
            <Bar data={compChart} options={{ ...chartBase, plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } } }} />
          </div>
        </div>
        <div className="card">
          <div className="card-title">Tasa de éxito (%)</div>
          <div style={{ height: 250 }}>
            <Bar data={tasaChart} options={{ ...chartBase, plugins: { legend: { display: false } } }} />
          </div>
        </div>
      </div>

      {/* Agent table */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">Resumen de agentes</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Agente</th>
                <th>Contactos</th>
                <th>Pagos inmediatos</th>
                <th>Promesas</th>
                <th>Renegociaciones</th>
                <th>Se niega</th>
                <th>Disputas</th>
                <th>Sin respuesta</th>
                <th>Tasa éxito</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => (
                <tr key={a.id} onClick={() => handleSelect(a)}
                    style={{ borderLeft: selected === a.id ? '3px solid var(--blue)' : '3px solid transparent' }}>
                  <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{a.id}</td>
                  <td>
                    <ScoreBar value={a.total_contactos || 0} max={maxContacts} color="var(--text-muted)" />
                  </td>
                  <td><span className="text-green" style={{ fontWeight: 600 }}>{a.pagos_inmediatos || 0}</span></td>
                  <td><span className="text-amber" style={{ fontWeight: 600 }}>{a.promesas_generadas || 0}</span></td>
                  <td><span className="text-purple" style={{ fontWeight: 600 }}>{a.renegociaciones || 0}</span></td>
                  <td><span className="text-red" style={{ fontWeight: 600 }}>{a.se_niega || 0}</span></td>
                  <td><span className="text-orange" style={{ fontWeight: 600 }}>{a.disputas || 0}</span></td>
                  <td><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{a.sin_respuesta || 0}</span></td>
                  <td>
                    <span className={`badge ${
                      a.tasa_exito >= 50 ? 'badge-green' :
                      a.tasa_exito >= 30 ? 'badge-amber' : 'badge-red'
                    }`}>{a.tasa_exito}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {loading && <div className="spinner">⏳ Cargando detalle…</div>}

      {!loading && detail && (
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>
            Detalle: <span className="text-blue">{detail.id}</span>
            <span style={{ marginLeft: '0.75rem' }}>
              <span className={`badge ${detail.tasa_exito >= 50 ? 'badge-green' : detail.tasa_exito >= 30 ? 'badge-amber' : 'badge-red'}`}>
                {detail.tasa_exito}% éxito
              </span>
            </span>
          </div>

          <div className="charts-grid">
            <div className="card">
              <div className="card-title">Perfil de resultados</div>
              <div style={{ height: 260 }}>
                <Radar data={radarChart} options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    r: {
                      ticks: { color: '#64748b', backdropColor: 'transparent' },
                      grid: { color: '#334155' },
                      pointLabels: { color: '#94a3b8', font: { size: 10 } },
                    },
                  },
                }} />
              </div>
            </div>

            {actChart && (
              <div className="card">
                <div className="card-title">Actividad diaria (llamadas por día)</div>
                <div style={{ height: 260 }}>
                  <Line data={actChart} options={{
                    ...chartBase,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { ticks: { color: '#64748b', maxTicksLimit: 8 }, grid: { color: '#1e293b' } },
                      y: {
                        ticks: { color: '#64748b', stepSize: 1, precision: 0 },
                        grid: { color: '#1e293b' },
                        min: 0,
                      },
                    },
                  }} />
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-title">Distribución de resultados</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                {Object.entries(detail.resultados || {})
                  .sort((a,b) => b[1]-a[1])
                  .map(([res, cnt]) => {
                    const total = Object.values(detail.resultados || {}).reduce((s,v)=>s+v,0) || 1
                    const pct   = Math.round(cnt/total*100)
                    const colors = {
                      pago_inmediato: '#10b981', promesa_pago: '#f59e0b',
                      renegociacion: '#8b5cf6', se_niega_pagar: '#ef4444',
                      disputa: '#f97316', sin_respuesta: '#6b7280',
                    }
                    const color = colors[res] || '#6b7280'
                    return (
                      <div key={res}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', marginBottom:'0.2rem' }}>
                          <span style={{ color }}>{res.replace(/_/g,' ')}</span>
                          <span style={{ color:'var(--text-muted)' }}>{cnt} ({pct}%)</span>
                        </div>
                        <div style={{ height:6, background:'var(--border)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3, transition:'width 0.3s' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
