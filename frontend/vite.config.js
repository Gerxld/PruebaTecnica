import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // Muestra un error claro en consola si el backend no está corriendo
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[Proxy] Backend no disponible en localhost:8000 —', err.message)
            res.writeHead(503, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ detail: 'Backend no disponible. Ejecuta: cd backend && uvicorn main:app --reload --port 8000' }))
          })
        },
      },
    },
  },
})
