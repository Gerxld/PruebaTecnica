import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'
import ClientTimeline from './components/ClientTimeline'
import GraphView from './components/GraphView'
import AgentView from './components/AgentView'
import ChatWidget from './components/ChatWidget'
import ThemeToggle from './components/ThemeToggle'
import { getStatus } from './services/api'

/* ── SVG Icons ── */
const IconDashboard = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
  </svg>
)

const IconClients = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const IconGraph = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
)

const IconAgents = () => (
  <svg className="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const TABS = [
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { id: 'clientes',  label: 'Clientes',  Icon: IconClients },
  { id: 'grafo',     label: 'Grafo',     Icon: IconGraph },
  { id: 'agentes',   label: 'Agentes',   Icon: IconAgents },
]

export default function App() {
  const [dataLoaded, setDataLoaded] = useState(false)
  const [checking, setChecking]     = useState(true)
  const [tab, setTab]               = useState('dashboard')
  const [summary, setSummary]       = useState(null)

  useEffect(() => {
    getStatus()
      .then((s) => {
        if (s.data_loaded) {
          setDataLoaded(true)
          setSummary(s)
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  const handleDataLoaded = (result) => {
    setSummary(result)
    setDataLoaded(true)
  }

  const handleReset = () => {
    setDataLoaded(false)
    setSummary(null)
    setTab('dashboard')
  }

  if (checking) {
    return (
      <div className="landing">
        <div className="spinner">Conectando con el servidor...</div>
      </div>
    )
  }

  if (!dataLoaded) {
    return <LandingPage onDataLoaded={handleDataLoaded} />
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar" role="navigation" aria-label="Navegacion principal">
        <div className="sidebar-logo" aria-label="CallAnalyzer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span className="sidebar-logo-text">
            Call<span className="sidebar-logo-accent">Analyzer</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              <t.Icon />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {summary && (
            <div className="sidebar-meta">
              {summary.clientes} clientes<br />
              {summary.agentes} agentes
            </div>
          )}
          <ThemeToggle />
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.72rem' }}
            onClick={handleReset}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-4.98"/>
            </svg>
            <span>Nuevos datos</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {tab === 'dashboard' && <Dashboard />}
            {tab === 'clientes'  && <ClientTimeline />}
            {tab === 'grafo'     && <GraphView />}
            {tab === 'agentes'   && <AgentView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Chat widget */}
      <ChatWidget />
    </div>
  )
}
