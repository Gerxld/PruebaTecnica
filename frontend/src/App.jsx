import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'
import ClientTimeline from './components/ClientTimeline'
import GraphView from './components/GraphView'
import AgentView from './components/AgentView'
import ChatWidget from './components/ChatWidget'
import { getStatus } from './services/api'

const TABS = [
  { id: 'dashboard', label: 'Dashboard',  icon: '[D]' },
  { id: 'clientes',  label: 'Clientes',   icon: '[C]' },
  { id: 'grafo',     label: 'Grafo',      icon: '[G]' },
  { id: 'agentes',   label: 'Agentes',    icon: '[A]' },
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
      <div className="landing" style={{ justifyContent: 'center' }}>
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
      <aside className="sidebar">
        <div className="sidebar-logo">
          &gt;_ <span>CallAnalyzer</span>
        </div>
        <nav className="sidebar-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '3px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}>
          {summary && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              {summary.clientes} clientes / {summary.agentes} agentes
            </div>
          )}
          <button
            className="btn-brutal btn-brutal-ghost"
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem', marginTop: 0 }}
            onClick={handleReset}
          >
            [ Nuevos datos ]
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
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
