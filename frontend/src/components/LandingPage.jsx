import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { ingestData } from '../services/api'

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
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
      // Distinguir entre backend offline y errores de datos
      if (e.code === 'ERR_NETWORK' || e.message?.includes('503') || e.response?.status === 503) {
        setError('Backend no disponible. Ejecuta primero: start_backend.bat (o uvicorn main:app --reload --port 8000 desde la carpeta backend)')
      } else if (e.message?.includes('JSON')) {
        setError('JSON inválido — verifica el formato del archivo')
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
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="landing-title">
          ANALIZADOR<br />
          DE <span className="accent">PATRONES</span><br />
          DE LLAMADAS<span className="landing-cursor">_</span>
        </h1>
        <p className="landing-subtitle">
          Sistema de inteligencia para cobranzas
        </p>
      </motion.div>

      <motion.div
        className="upload-zone"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        {/* Drop area */}
        <div
          className={`drop-area ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <span className="drop-area-icon">{fileName ? '>' : '+'}</span>
          <div className="drop-area-text">
            {fileName || 'Arrastra tu archivo JSON aqui'}
          </div>
          <div className="drop-area-sub">
            {fileName
              ? 'Archivo cargado — procesando...'
              : 'o haz clic para seleccionar desde tu explorador'
            }
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
        />

        {/* Errors */}
        {error && <div className="upload-error">[ERROR] {error}</div>}

        {/* Submit button */}
        <div style={{ textAlign: 'center' }}>
          <button
            className="btn-brutal btn-brutal-primary"
            onClick={handleSubmitText}
            disabled={loading}
          >
            {loading ? (
              <>
                <span style={{ display: 'inline-block', width: 16, height: 16, border: '3px solid currentColor', animation: 'spin-square 0.6s steps(4) infinite' }} />
                Procesando...
              </>
            ) : (
              <>&gt; ANALIZAR DATOS</>
            )}
          </button>
        </div>

        <div className="landing-format">
          Formato requerido: <code>metadata</code>, <code>clientes[]</code>,
          <code>interacciones[]</code> — Compatible con el esquema
          interacciones_clientes.json
        </div>
      </motion.div>
    </div>
  )
}
