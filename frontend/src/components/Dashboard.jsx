import { useEffect, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { getDashboard, getHorarios, getPromesas } from '../services/api'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
)

/* Brutalist chart defaults — light theme */
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#0A0A0A', font: { family: 'Space Mono', size: 11 } } },
  },
  scales: {
    x: { ticks: { color: '#555', font: { family: 'Space Mono', size: 10 } }, grid: { color: '#E8E2D9' } },
    y: { ticks: { color: '#555', font: { family: 'Space Mono', size: 10 } }, grid: { color: '#E8E2D9' } },
  },
}

function KPI({ label, value, sub, color = 'text-blue' }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${color}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData]         = useState(null)
  const [horarios, setHorarios] = useState(null)
  const [promesas, setPromesas] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([getDashboard(), getHorarios(), getPromesas()])
      .then(([d, h, p]) => { setData(d); setHorarios(h); setPromesas(p) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="spinner">Cargando dashboard</div>
  if (!data)   return <div className="spinner">Error al cargar datos</div>

  const PALETTE = ['#0038FF', '#00AA44', '#E68A00', '#FF0000', '#6600CC']

  /* Deuda por tipo */
  const tipoLabels = Object.keys(data.deuda_por_tipo)
  const doughnutData = {
    labels: tipoLabels.map(l => l.replace('_', ' ')),
    datasets: [{
      data: Object.values(data.deuda_por_tipo),
      backgroundColor: PALETTE,
      borderColor: '#FFFFFF',
      borderWidth: 3,
    }],
  }

  /* Resultados */
  const resLabels = Object.keys(data.resultados_interacciones)
  const barResultados = {
    labels: resLabels.map(l => l.replace('_', ' ')),
    datasets: [{
      label: 'Llamadas',
      data: Object.values(data.resultados_interacciones),
      backgroundColor: ['#00AA44', '#0038FF', '#E68A00', '#FF0000', '#6600CC', '#FF4400', '#555'],
      borderColor: '#0A0A0A',
      borderWidth: 2,
    }],
  }

  /* Actividad diaria */
  const actDays   = Object.keys(data.actividad_por_dia).slice(-45)
  const lineActivity = {
    labels: actDays,
    datasets: [{
      label: 'Interacciones',
      data: actDays.map(d => data.actividad_por_dia[d]),
      borderColor: '#0038FF',
      backgroundColor: 'rgba(0, 56, 255, 0.06)',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2,
    }],
  }

  /* Horarios */
  const horas = horarios?.por_hora || []
  const barHoras = {
    labels: horas.map(h => `${String(h.hora).padStart(2, '0')}:00`),
    datasets: [{
      label: 'Total',
      data: horas.map(h => h.total_llamadas),
      backgroundColor: '#0A0A0A',
      borderColor: '#0A0A0A',
      borderWidth: 2,
    }, {
      label: 'Exitosas',
      data: horas.map(h => h.exitosas),
      backgroundColor: '#00AA44',
      borderColor: '#0A0A0A',
      borderWidth: 2,
    }],
  }

  /* Riesgo */
  const riskData = {
    labels: ['Alto', 'Medio', 'Bajo'],
    datasets: [{
      data: [data.distribucion_riesgo.alto, data.distribucion_riesgo.medio, data.distribucion_riesgo.bajo],
      backgroundColor: ['#FF0000', '#E68A00', '#00AA44'],
      borderColor: '#FFFFFF',
      borderWidth: 3,
    }],
  }

  /* Estado clientes */
  const estadoColors = {
    pago_completo: '#00AA44', pago_parcial: '#0038FF', promesa_activa: '#E68A00',
    en_renegociacion: '#6600CC', rehusa_pagar: '#FF0000', en_disputa: '#FF4400',
    sin_respuesta: '#555', sin_contacto: '#999', contactado: '#0078D7',
  }
  const estadoLabels = Object.keys(data.clientes_por_estado)
  const barEstados = {
    labels: estadoLabels.map(l => l.replace(/_/g, ' ')),
    datasets: [{
      label: 'Clientes',
      data: Object.values(data.clientes_por_estado),
      backgroundColor: estadoLabels.map(l => estadoColors[l] || '#555'),
      borderColor: '#0A0A0A',
      borderWidth: 2,
    }],
  }

  const noScale = {
    ...chartDefaults,
    plugins: { legend: { labels: { color: '#0A0A0A', font: { family: 'Space Mono', size: 11 } } } },
    scales: undefined,
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">[D] Dashboard General</h1>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Datos al 2025-08-12
        </span>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <KPI label="Tasa Recuperacion"
             value={`${data.tasa_recuperacion}%`}
             sub={`$${data.total_recuperado.toLocaleString()} / $${data.total_deuda.toLocaleString()}`}
             color="text-green" />
        <KPI label="Clientes"        value={data.total_clientes}      color="text-blue" />
        <KPI label="Agentes"         value={data.total_agentes}       color="text-purple" />
        <KPI label="Interacciones"   value={data.total_interacciones} color="text-amber" />
        <KPI label="Promesas Hechas" value={data.total_promesas}
             sub={`${data.tasa_promesas}% cumplidas`}
             color="text-orange" />
        <KPI label="Promesas Vencidas" value={data.promesas_vencidas}
             sub="sin cumplir" color="text-red" />
        <KPI label="Mejor Hora"
             value={horarios?.mejor_hora != null ? `${String(horarios.mejor_hora).padStart(2, '0')}:00` : '--'}
             sub="mayor tasa de exito" color="text-blue" />
        <KPI label="Riesgo Alto" value={data.distribucion_riesgo.alto}
             sub="clientes alta prioridad" color="text-red" />
      </div>

      {/* Charts row 1 */}
      <div className="charts-grid">
        <div className="card chart-full">
          <div className="card-title">Actividad diaria de interacciones</div>
          <div style={{ height: 200 }}>
            <Line data={lineActivity}
                  options={{ ...chartDefaults, plugins: { legend: { display: false } } }} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Deuda por tipo</div>
          <div style={{ height: 240 }}>
            <Doughnut data={doughnutData} options={noScale} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Distribucion de riesgo</div>
          <div style={{ height: 240 }}>
            <Doughnut data={riskData} options={noScale} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Resultado de llamadas</div>
          <div style={{ height: 260 }}>
            <Bar data={barResultados}
                 options={{ ...chartDefaults, plugins: { legend: { display: false } } }} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">Estado de clientes</div>
          <div style={{ height: 260 }}>
            <Bar data={barEstados}
                 options={{
                   ...chartDefaults,
                   indexAxis: 'y',
                   plugins: { legend: { display: false } },
                 }} />
          </div>
        </div>

        <div className="card chart-full">
          <div className="card-title">Efectividad por hora del dia</div>
          <div style={{ height: 220 }}>
            <Bar data={barHoras}
                 options={{ ...chartDefaults, plugins: { legend: { labels: { color: '#0A0A0A', font: { family: 'Space Mono' } } } } }} />
          </div>
        </div>
      </div>

      {/* Promises table */}
      {promesas.length > 0 && (
        <div className="card">
          <div className="card-title">Promesas vencidas sin cumplir ({promesas.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Telefono</th>
                  <th>Agente</th>
                  <th>Monto Prometido</th>
                  <th>Fecha Promesa</th>
                </tr>
              </thead>
              <tbody>
                {promesas.slice(0, 15).map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.cliente_nombre}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.cliente_telefono}</td>
                    <td>{p.agente_id}</td>
                    <td className="text-amber" style={{ fontWeight: 700 }}>${p.monto_prometido.toLocaleString()}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.fecha_promesa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
