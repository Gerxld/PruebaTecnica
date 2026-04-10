import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { sendChat } from '../services/api'

function parseMarkdown(text) {
  // Simple markdown to HTML: bold, lists, line breaks
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n/g, '<br/>')
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      content: 'Sistema listo. Preguntame sobre los datos de cobranza — clientes, agentes, metricas, promesas, o estrategias.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEnd = useRef(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || loading) return

    const userMsg = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const history = newMessages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }))

      const res = await sendChat(msg, history.slice(-10))
      setMessages((prev) => [...prev, { role: 'ai', content: res.response }])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', content: `[ERROR] ${e.message || 'No se pudo procesar'}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Toggle button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            className="chat-toggle"
            onClick={() => setOpen(true)}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            &gt;_
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="chat-header">
              <span className="chat-header-title">&gt;_ Asistente IA [Gemini]</span>
              <button className="chat-close" onClick={() => setOpen(false)}>
                X
              </button>
            </div>

            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`chat-msg ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}
                >
                  {msg.role === 'ai' ? (
                    <div dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                  ) : (
                    msg.content
                  )}
                </div>
              ))}
              {loading && <div className="chat-typing">Analizando</div>}
              <div ref={messagesEnd} />
            </div>

            <div className="chat-input-area">
              <input
                className="chat-input"
                placeholder="Escribe tu pregunta..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoFocus
              />
              <button
                className="chat-send"
                onClick={handleSend}
                disabled={loading || !input.trim()}
              >
                &gt;
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
