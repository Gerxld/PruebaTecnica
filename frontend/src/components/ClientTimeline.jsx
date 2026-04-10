import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, LineElement,
  PointElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { getClients, getTimeline, getPrediccion } from '../services/api'

function cssVar(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim()
}

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend, Filler)

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

const TIPO_COLOR = {
  llamada_saliente: '#3b82f6',
  llamada_entrante: '#10b981',
  pago:             '#8b5cf6',
  email:            '#6b7280',
  sms:              '#6b7280',
}

const RESULTADO_BADGE = {
  pago_inmediato:  'badge-green',
  promesa_pago:    'badge-amber',
  renegociacion:   'badge-purple',
  se_niega_pagar:  'badge-red',
  disputa:         'badge-red',
  sin_respuesta:   'badge-gray',
}

function EventCard({ event }) {
  const isPago = event.category === 'pago'
  const color  = isPago ? '#8b5cf6' : (TIPO_COLOR[event.tipo] || '#6b7280')

  return (
    <div className="timeline-item">
      <div className="timeline-dot" style={{ background: color }} />
      <div className="timeline-time">
        {new Date(event.timestamp).toLocaleString('es-PA', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        })}
      </div>
      <div className="timeline-content">
        <div className="timeline-title" style={{ color }}>
          {isPago
            ? `💰 Pago recibido — $${event.monto?.toLocaleString()}`
            : event.tipo === 'llamada_saliente' ? '📞 Llamada saliente'
            : event.tipo === 'llamada_entrante' ? '📲 Llamada entrante'
            : event.tipo === 'email' ? '✉️ Email'
            : '💬 SMS'}
        </div>

        {isPago && (
          <div style={{ marginTop: '0.25rem' }}>
            <span className={event.pago_completo ? 'badge badge-green' : 'badge badge-blue'}>
              {event.pago_completo ? 'Completo' : 'Parcial'}
            </span>
            {' '}
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              vía {event.metodo_pago}
            </span>
          </div>
        )}

        {event.resultado && (
          <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span className={`badge ${RESULTADO_BADGE[event.resultado] || 'badge-gray'}`}>
              {event.resultado.replace(/_/g, ' ')}
            </span>
            {event.sentimiento && event.sentimiento !== 'n/a' && (
              <span className="badge badge-gray">{event.sentimiento}</span>
            )}
          </div>
        )}

        {event.agente_id && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Agente: {event.agente_id}
            {event.duracion_segundos > 0 && ` · ${Math.round(event.duracion_segundos / 60)}m`}
          </div>
        )}

        {event.monto_prometido && (
          <div style={{ fontSize: '0.75rem', color: 'var(--amber)', marginTop: '0.2rem' }}>
            Promesa: ${event.monto_prometido?.toLocaleString()} para {event.fecha_promesa}
          </div>
        )}

        {event.cuotas && (
          <div style={{ fontSize: '0.75rem', color: 'var(--purple)', marginTop: '0.2rem' }}>
            Plan: {event.cuotas} cuotas de ${event.monto_mensual}/mes
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClientTimeline() {
  const [clients, setClients]       = useState([])
  const [selected, setSelected]     = useState('')
  const [timeline, setTimeline]     = useState(null)
  const [prediccion, setPrediccion] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')

  useEffect(() => { getClients().then(setClients) }, [])

  const filtered = clients.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.id.includes(search)
  )

  const handleSelect = (id) => {
    setSelected(id)
    setLoading(true)
    setPrediccion(null)
    getTimeline(id)
      .then(setTimeline)
      .finally(() => setLoading(false))
    getPrediccion(id)
      .then(setPrediccion)
      .catch(() => {}) // silencioso si endpoint no disponible
  }

  const client = timeline?.cliente
  const events = timeline?.eventos || []
  const evo    = timeline?.evolucion_deuda || []
  const proms  = timeline?.promesas || []

  /* Debt evolution chart */
  const debtLabels = evo.map(e =>
    new Date(e.timestamp).toLocaleDateString('es-PA', { day: '2-digit', month: 'short' })
  )
  const debtChart = {
    labels: debtLabels,
    datasets: [
      {
        label: 'Pendiente',
        data: evo.map(e => e.monto_pendiente),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.06)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
      {
        label: 'Pagado',
        data: evo.map(e => e.monto_pagado),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.06)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      },
    ],
  }

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: cssVar('--text-muted'), font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: cssVar('--text-muted'), maxTicksLimit: 12 }, grid: { color: cssVar('--border') } },
      y: { ticks: { color: cssVar('--text-muted') }, grid: { color: cssVar('--border') } },
    },
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">👥 Clientes</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Client list */}
        <div className="card" style={{ position: 'sticky', top: '1.5rem' }}>
          <div className="card-title">Seleccionar cliente</div>
          <input
            className="form-control"
            style={{ width: '100%', marginBottom: '0.75rem' }}
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {filtered.map(c => (
              <div
                key={c.id}
                onClick={() => handleSelect(c.id)}
                style={{
                  padding: '0.6rem 0.5rem',
                  borderRadius: '0.4rem',
                  cursor: 'pointer',
                  marginBottom: '0.1rem',
                  background: selected === c.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                  borderLeft: selected === c.id ? '3px solid var(--blue)' : '3px solid transparent',
                  transition: 'all 0.1s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.nombre}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.4rem', marginTop: '0.1rem' }}>
                  <span className={`badge ${ESTADO_BADGE[c.estado] || 'badge-gray'}`} style={{ fontSize: '0.65rem' }}>
                    {c.estado?.replace(/_/g,' ')}
                  </span>
                  <span>Score: {c.risk_score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline panel */}
        <div>
          {!selected && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Selecciona un cliente para ver su timeline
            </div>
          )}

          {loading && <div className="spinner">⏳ Cargando…</div>}

          {!loading && client && (
            <>
              {/* Client header */}
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{client.nombre}</h2>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {client.telefono} · {client.tipo_deuda?.replace(/_/g,' ')}
                    </div>
                  </div>
                  <span className={`badge ${ESTADO_BADGE[client.estado] || 'badge-gray'}`}>
                    {client.estado?.replace(/_/g,' ')}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                  {[
                    { label: 'Deuda inicial',   value: `$${client.monto_deuda_inicial?.toLocaleString()}`, color: 'var(--red)' },
                    { label: 'Total pagado',     value: `$${client.total_pagado?.toLocaleString()}`,       color: 'var(--green)' },
                    { label: 'Pendiente',        value: `$${client.monto_pendiente?.toLocaleString()}`,    color: 'var(--amber)' },
                    { label: 'Recuperación',     value: `${client.tasa_recuperacion}%`,                    color: 'var(--blue)' },
                    { label: 'Risk score',       value: client.risk_score,                                  color: client.risk_score < 35 ? 'var(--red)' : client.risk_score < 65 ? 'var(--amber)' : 'var(--green)' },
                    { label: 'Promesas',         value: `${client.promesas_cumplidas}/${client.promesas_hechas}`, color: 'var(--orange)' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'var(--surface2)', borderRadius: '0.5rem', padding: '0.65rem' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</div>
                      <div style={{ fontWeight: 700, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prediction */}
              {prediccion && (
                <motion.div
                  className="card"
                  style={{ marginBottom: '1rem' }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="card-title">Probabilidad de pago — próximos 7 días</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round(prediccion.probabilidad_pago_7d * 100)}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{
                            height: '100%',
                            borderRadius: 4,
                            background: prediccion.probabilidad_pago_7d > 0.6
                              ? 'var(--success)' : prediccion.probabilidad_pago_7d > 0.3
                              ? 'var(--warning)' : 'var(--danger)',
                          }}
                        />
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', minWidth: '3rem', textAlign: 'right' }}>
                      {Math.round(prediccion.probabilidad_pago_7d * 100)}%
                    </span>
                    <span className={`badge ${prediccion.confianza === 'alta' ? 'badge-green' : prediccion.confianza === 'media' ? 'badge-amber' : 'badge-gray'}`}>
                      {prediccion.confianza}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.78rem' }}>
                    {prediccion.factores_positivos?.length > 0 && (
                      <div>
                        <div style={{ color: 'var(--success)', fontWeight: 600, marginBottom: '0.3rem' }}>Factores positivos</div>
                        {prediccion.factores_positivos.map((f, i) => (
                          <div key={i} style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>+ {f}</div>
                        ))}
                      </div>
                    )}
                    {prediccion.factores_negativos?.length > 0 && (
                      <div>
                        <div style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '0.3rem' }}>Factores negativos</div>
                        {prediccion.factores_negativos.map((f, i) => (
                          <div key={i} style={{ color: 'var(--text-muted)', marginBottom: '0.15rem' }}>− {f}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Modelo: {prediccion.modelo}
                  </div>
                </motion.div>
              )}

              {/* Debt chart */}
              {evo.length > 1 && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <div className="card-title">Evolución de la deuda</div>
                  <div style={{ height: 200 }}>
                    <Line data={debtChart} options={chartOpts} />
                  </div>
                </div>
              )}

              {/* Promises */}
              {proms.length > 0 && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                  <div className="card-title">Promesas de pago ({proms.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {proms.map(p => (
                      <div key={p.id} style={{
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        borderRadius: '0.5rem',
                        padding: '0.65rem 0.85rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--amber)' }}>
                            ${p.monto_prometido?.toLocaleString()}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                            para {p.fecha_promesa}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                            Agente: {p.agente_id}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {p.cumplida
                            ? <span className="badge badge-green">✓ Cumplida</span>
                            : p.vencida
                            ? <span className="badge badge-red">✗ Vencida</span>
                            : <span className="badge badge-amber">Pendiente</span>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="card">
                <div className="card-title">Timeline de interacciones ({events.length})</div>
                <div className="timeline">
                  {events.map(e => <EventCard key={e.id} event={e} />)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
