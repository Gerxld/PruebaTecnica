import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { getDashboard, getHorarios, getPromesas, getAnomalias } from '../services/api'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
)

/**
 * Reads a CSS variable from the document root.
 * @param {string} varName - e.g. '--text-muted'
 * @returns {string}
 */
function cssVar(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
}

/**
 * useCountUp
 * Animates a number from 0 to `target` over `duration` ms using rAF.
 * @param {number} target
 * @param {number} duration
 * @returns {number}
 */
function useCountUp(target, duration = 500) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (target === null || target === undefined) return
    const start = performance.now()
    const from  = 0
    const to    = Number(target)

    const step = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(from + (to - from) * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}

/**
 * KPICard
 * Displays a single metric with animated counter and staggered entrance.
 */
function KPICard({ label, rawValue, displayValue, sub, color, index }) {
  // Only animate plain numeric values
  const isNumeric = typeof rawValue === 'number' && !String(displayValue).startsWith('$')
  const animated  = useCountUp(isNumeric ? rawValue : 0)
  const shown     = isNumeric ? animated : displayValue

  return (
    <motion.div
      className="kpi-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25, ease: 'easeOut' }}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>
        {shown}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </motion.div>
  )
}

/**
 * Dashboard
 * General analytics overview: KPIs, charts, promises table, and anomaly alerts.
 */
export default function Dashboard() {
  const [data, setData]         = useState(null)
  const [horarios, setHorarios] = useState(null)
  const [promesas, setPromesas] = useState([])
  const [anomalias, setAnomalias] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([getDashboard(), getHorarios(), getPromesas()])
      .then(([d, h, p]) => { setData(d); setHorarios(h); setPromesas(p) })
      .finally(() => setLoading(false))

    // New endpoints — fail silently
    getAnomalias().then(setAnomalias).catch(() => {})
  }, [])

  if (loading) return <div className="spinner" role="status">Cargando dashboard</div>
  if (!data)   return <div className="spinner" role="alert">Error al cargar datos</div>

  // Build chart options from current CSS vars (theme-aware)
  const textMuted    = cssVar('--text-muted')
  const borderColor  = cssVar('--border')
  const surface2     = cssVar('--surface2')

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: textMuted, font: { family: 'DM Sans', size: 11 } } },
    },
    scales: {
      x: { ticks: { color: textMuted, font: { size: 10 } }, grid: { color: borderColor } },
      y: { ticks: { color: textMuted, font: { size: 10 } }, grid: { color: borderColor } },
    },
  }

  const noScale = {
    ...chartDefaults,
    scales: undefined,
  }

  const PALETTE = [
    cssVar('--primary'),
    cssVar('--success'),
    cssVar('--warning'),
    cssVar('--danger'),
    cssVar('--purple'),
  ]

  /* Deuda por tipo */
  const tipoLabels = Object.keys(data.deuda_por_tipo)
  const doughnutData = {
    labels: tipoLabels.map(l => l.replace(/_/g, ' ')),
    datasets: [{
      data: Object.values(data.deuda_por_tipo),
      backgroundColor: PALETTE,
      borderColor: cssVar('--surface'),
      borderWidth: 2,
    }],
  }

  /* Resultados */
  const resLabels = Object.keys(data.resultados_interacciones)
  const barResultados = {
    labels: resLabels.map(l => l.replace(/_/g, ' ')),
    datasets: [{
      label: 'Interacciones',
      data: Object.values(data.resultados_interacciones),
      backgroundColor: [
        cssVar('--success'),
        cssVar('--primary'),
        cssVar('--warning'),
        cssVar('--danger'),
        cssVar('--purple'),
        cssVar('--orange'),
        textMuted,
      ],
      borderRadius: 4,
      borderSkipped: false,
    }],
  }

  /* Actividad diaria */
  const actDays = Object.keys(data.actividad_por_dia).slice(-45)
  const lineActivity = {
    labels: actDays,
    datasets: [{
      label: 'Interacciones',
      data: actDays.map(d => data.actividad_por_dia[d]),
      borderColor: cssVar('--primary'),
      backgroundColor: `rgba(${cssVar('--primary-rgb')}, 0.06)`,
      fill: true,
      tension: 0.35,
      pointRadius: 2,
      borderWidth: 1.5,
    }],
  }

  /* Horarios */
  const horas = horarios?.por_hora || []
  const barHoras = {
    labels: horas.map(h => `${String(h.hora).padStart(2, '0')}h`),
    datasets: [
      {
        label: 'Total',
        data: horas.map(h => h.total_llamadas),
        backgroundColor: surface2,
        borderRadius: 3,
      },
      {
        label: 'Exitosas',
        data: horas.map(h => h.exitosas),
        backgroundColor: cssVar('--success'),
        borderRadius: 3,
      },
    ],
  }

  /* Riesgo */
  const riskData = {
    labels: ['Alto', 'Medio', 'Bajo'],
    datasets: [{
      data: [data.distribucion_riesgo.alto, data.distribucion_riesgo.medio, data.distribucion_riesgo.bajo],
      backgroundColor: [cssVar('--danger'), cssVar('--warning'), cssVar('--success')],
      borderColor: cssVar('--surface'),
      borderWidth: 2,
    }],
  }

  /* Estado clientes */
  const estadoColors = {
    pago_completo:    cssVar('--success'),
    pago_parcial:     cssVar('--primary'),
    promesa_activa:   cssVar('--warning'),
    en_renegociacion: cssVar('--purple'),
    rehusa_pagar:     cssVar('--danger'),
    en_disputa:       cssVar('--orange'),
    sin_respuesta:    textMuted,
    sin_contacto:     textMuted,
    contactado:       cssVar('--primary'),
  }
  const estadoLabels = Object.keys(data.clientes_por_estado)
  const barEstados = {
    labels: estadoLabels.map(l => l.replace(/_/g, ' ')),
    datasets: [{
      label: 'Clientes',
      data: Object.values(data.clientes_por_estado),
      backgroundColor: estadoLabels.map(l => estadoColors[l] || textMuted),
      borderRadius: 3,
    }],
  }

  const kpis = [
    {
      label: 'Tasa Recuperacion',
      rawValue: parseFloat(data.tasa_recuperacion),
      displayValue: `${data.tasa_recuperacion}%`,
      sub: `$${data.total_recuperado.toLocaleString()} / $${data.total_deuda.toLocaleString()}`,
      color: 'var(--success)',
    },
    { label: 'Clientes',        rawValue: data.total_clientes,      displayValue: data.total_clientes,      sub: 'activos',        color: 'var(--primary)' },
    { label: 'Agentes',         rawValue: data.total_agentes,       displayValue: data.total_agentes,       sub: 'en sistema',     color: 'var(--purple)' },
    { label: 'Interacciones',   rawValue: data.total_interacciones, displayValue: data.total_interacciones, sub: 'registradas',    color: 'var(--warning)' },
    {
      label: 'Promesas Hechas',
      rawValue: data.total_promesas,
      displayValue: data.total_promesas,
      sub: `${data.tasa_promesas}% cumplidas`,
      color: 'var(--orange)',
    },
    {
      label: 'Promesas Vencidas',
      rawValue: data.promesas_vencidas,
      displayValue: data.promesas_vencidas,
      sub: 'sin cumplir',
      color: 'var(--danger)',
    },
    {
      label: 'Mejor Hora',
      rawValue: null,
      displayValue: horarios?.mejor_hora != null
        ? `${String(horarios.mejor_hora).padStart(2, '0')}:00`
        : '--',
      sub: 'mayor tasa de exito',
      color: 'var(--primary)',
    },
    {
      label: 'Riesgo Alto',
      rawValue: data.distribucion_riesgo.alto,
      displayValue: data.distribucion_riesgo.alto,
      sub: 'clientes alta prioridad',
      color: 'var(--danger)',
    },
  ]

  const severityColor = {
    alta:  'var(--danger)',
    media: 'var(--warning)',
    baja:  'var(--success)',
  }
  const severityBadge = {
    alta:  'badge-red',
    media: 'badge-amber',
    baja:  'badge-green',
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard General</h1>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Datos al 2025-08-12
        </span>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" role="list" aria-label="Indicadores clave de rendimiento">
        {kpis.map((kpi, i) => (
          <KPICard key={kpi.label} {...kpi} index={i} />
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="charts-grid">
        <div className="card chart-full">
          <div className="card-title">Actividad diaria de interacciones</div>
          <div style={{ height: 180 }} role="img" aria-label="Grafico de actividad diaria">
            <Line
              data={lineActivity}
              options={{ ...chartDefaults, plugins: { legend: { display: false } } }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Deuda por tipo</div>
          <div style={{ height: 220 }} role="img" aria-label="Distribucion de deuda por tipo">
            <Doughnut data={doughnutData} options={noScale} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Distribucion de riesgo</div>
          <div style={{ height: 220 }} role="img" aria-label="Distribucion de clientes por nivel de riesgo">
            <Doughnut data={riskData} options={noScale} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Resultado de llamadas</div>
          <div style={{ height: 240 }} role="img" aria-label="Resultados de interacciones">
            <Bar
              data={barResultados}
              options={{ ...chartDefaults, plugins: { legend: { display: false } } }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Estado de clientes</div>
          <div style={{ height: 240 }} role="img" aria-label="Distribucion de clientes por estado">
            <Bar
              data={barEstados}
              options={{
                ...chartDefaults,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>

        <div className="card chart-full">
          <div className="card-title">Efectividad por hora del dia</div>
          <div style={{ height: 200 }} role="img" aria-label="Llamadas y exitos por hora">
            <Bar
              data={barHoras}
              options={{
                ...chartDefaults,
                plugins: { legend: { labels: { color: textMuted, font: { family: 'DM Sans', size: 11 } } } },
              }}
            />
          </div>
        </div>
      </div>

      {/* Promises table */}
      {promesas.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title">Promesas vencidas sin cumplir ({promesas.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Lista de promesas vencidas">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Telefono</th>
                  <th>Agente</th>
                  <th>Monto prometido</th>
                  <th>Fecha promesa</th>
                </tr>
              </thead>
              <tbody>
                {promesas.slice(0, 15).map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.cliente_nombre}</td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {p.cliente_telefono}
                    </td>
                    <td>{p.agente_id}</td>
                    <td style={{ color: 'var(--warning)', fontWeight: 600 }}>
                      ${p.monto_prometido.toLocaleString()}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {p.fecha_promesa}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anomaly alerts — shown only if endpoint responds */}
      {anomalias.length > 0 && (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Alertas del sistema</div>
            <span className="badge badge-red" aria-label={`${anomalias.length} alertas`}>
              {anomalias.length}
            </span>
          </div>
          <div role="list" aria-label="Lista de anomalias detectadas">
            {[...anomalias]
              .sort((a, b) => {
                const order = { alta: 0, media: 1, baja: 2 }
                return (order[a.severidad] ?? 3) - (order[b.severidad] ?? 3)
              })
              .slice(0, 5)
              .map((item, i) => (
                <div key={i} className="alert-item" role="listitem">
                  <div
                    className="alert-severity-dot"
                    style={{ background: severityColor[item.severidad] || 'var(--text-muted)' }}
                    aria-hidden="true"
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: '0.1rem' }}>
                      {item.descripcion || item.mensaje || item.tipo || 'Anomalia detectada'}
                    </div>
                    {item.cliente && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Cliente: {item.cliente}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${severityBadge[item.severidad] || 'badge-gray'}`}>
                    {item.severidad || 'desconocida'}
                  </span>
                </div>
              ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
