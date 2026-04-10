import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { ingestData } from '../services/api'
import ThemeToggle from './ThemeToggle'

const EXAMPLE_SCHEMA = `{
  "metadata": { ... },
  "clientes": [
    { "id": "cliente_000", "nombre": "...", "telefono": "...",
      "monto_deuda_inicial": 5000, "fecha_prestamo": "2024-01-01",
      "tipo_deuda": "tarjeta_credito" }
  ],
  "interacciones": [
    { "id": "int_000", "cliente_id": "cliente_000",
      "tipo": "llamada_saliente", "timestamp": "...",
      "agente_id": "agente_001", "resultado": "promesa_pago", ... }
  ]
}`

export default function LandingPage({ onDataLoaded }) {
  const [jsonText, setJsonText] = useState('')
  const [dragover, setDragover] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)

  const parseAndSubmit = async (raw) => {
    setError('')
    setLoading(true)
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!data.clientes || !data.interacciones) {
        throw new Error('El JSON debe contener "clientes" e "interacciones"')
      }
      const result = await ingestData(data)
      onDataLoaded(result)
    } catch (e) {
      if (e.code === 'ERR_NETWORK' || e.message?.includes('503') || e.response?.status === 503) {
        setError('Backend no disponible. Ejecuta primero: start_backend.bat (o uvicorn main:app --reload --port 8000 desde la carpeta backend)')
      } else if (e.message?.includes('JSON')) {
        setError('JSON invalido — verifica el formato del archivo')
      } else {
        setError(e.response?.data?.detail || e.message || 'Error al procesar los datos')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      setJsonText(text)
      parseAndSubmit(text)
    }
    reader.onerror = () => setError('Error al leer el archivo')
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragover(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.json')) {
      handleFile(file)
    } else {
      setError('Solo se aceptan archivos .json')
    }
  }

  const handleSubmitText = () => {
    if (!jsonText.trim()) {
      setError('Pega o escribe el JSON primero')
      return
    }
    parseAndSubmit(jsonText)
  }

  return (
    <div className="landing">
      {/* Theme toggle fixed top-right */}
      <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50 }}>
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ textAlign: 'center', marginBottom: '0' }}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.25rem',
          padding: '0.35rem 0.75rem',
          background: 'rgba(var(--primary-rgb), 0.08)',
          border: '1px solid rgba(var(--primary-rgb), 0.18)',
          borderRadius: '100px',
          fontSize: '0.72rem',
          fontWeight: '600',
          color: 'var(--primary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          <span style={{ width: 6, height: 6, background: 'var(--success)', borderRadius: '50%', display: 'inline-block' }} />
          Sistema de inteligencia para cobranzas
        </div>

        <h1 className="landing-title">
          Analizador de<br />
          <span className="accent">Patrones</span> de Llamadas
        </h1>
        <p className="landing-subtitle">
          Carga tus datos y obtén insights accionables al instante
        </p>
      </motion.div>

      <motion.div
        className="upload-zone"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
      >
        {/* Drop area */}
        <div
          className={`drop-area ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Zona de arrastrar y soltar archivo JSON"
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        >
          <span className="drop-area-icon" aria-hidden="true">
            {fileName ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="9 15 12 18 15 15"/>
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            )}
          </span>
          <div className="drop-area-text">
            {fileName || 'Arrastra tu archivo JSON aqui'}
          </div>
          <div className="drop-area-sub">
            {fileName
              ? 'Archivo cargado — procesando...'
              : 'o haz clic para seleccionar desde tu explorador'}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>

        {/* Divider */}
        <div className="upload-divider">O pega el JSON directamente</div>

        {/* Text area */}
        <textarea
          className="json-textarea"
          placeholder={EXAMPLE_SCHEMA}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          spellCheck={false}
          aria-label="Pegar JSON manualmente"
        />

        {/* Error */}
        {error && (
          <div className="upload-error" role="alert">
            {error}
          </div>
        )}

        {/* Submit */}
        <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
          <button
            className="btn btn-primary"
            style={{ padding: '0.75rem 2rem', fontSize: '0.875rem', minWidth: '180px' }}
            onClick={handleSubmitText}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-inline" aria-hidden="true" />
                Procesando...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                Analizar datos
              </>
            )}
          </button>
        </div>

        <div className="landing-format">
          Formato requerido: <code>metadata</code>, <code>clientes[]</code>,
          {' '}<code>interacciones[]</code> — Compatible con el esquema
          interacciones_clientes.json
        </div>
      </motion.div>
    </div>
  )
}
