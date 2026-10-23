import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        // Preserve %2F-encoded slashes in repo IDs (e.g. roshini018%2FCraftConnect)
        // without letting the proxy re-decode them before forwarding.
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.error('[vite-proxy] error:', err.message)
            if ('writeHead' in res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ detail: 'Proxy error: backend may be down.' }))
            }
          })
        },
      },
    },
  },
})

