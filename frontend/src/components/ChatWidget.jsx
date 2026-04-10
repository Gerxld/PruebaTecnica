import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { sendChat } from '../services/api'

function parseMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n/g, '<br/>')
}

const IconChat = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)

export default function ChatWidget() {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Hola. Pregúntame sobre clientes, agentes, métricas o estrategias de cobranza.' },
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEnd = useRef(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || loading) return

    const userMsg    = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const history = newMessages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))

      const res = await sendChat(msg, history.slice(-10))
      setMessages(prev => [...prev, { role: 'ai', content: res.response }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', content: `Error al procesar: ${e.message || 'intenta de nuevo'}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <>
      {/* Toggle button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            className="chat-toggle"
            onClick={() => setOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            aria-label="Abrir asistente IA"
          >
            <IconChat />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="chat-header-dot" />
                <span className="chat-header-title">Asistente IA</span>
              </div>
              <button
                className="chat-close"
                onClick={() => setOpen(false)}
                aria-label="Cerrar chat"
              >
                <IconClose />
              </button>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    className={`chat-msg ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {msg.role === 'ai'
                      ? <div dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                      : msg.content
                    }
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading && (
                <motion.div
                  className="chat-typing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <span /><span /><span />
                </motion.div>
              )}
              <div ref={messagesEnd} />
            </div>

            {/* Input */}
            <div className="chat-input-area">
              <input
                className="chat-input"
                placeholder="Escribe tu pregunta..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoFocus
              />
              <button
                className="chat-send"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                aria-label="Enviar"
              >
                <IconSend />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
