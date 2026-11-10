import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser only ever talks to this dev server. Requests to /api are passed
// on to the Python API, so there is one origin and no cross-origin setup.
// FAIRTOY_API_URL lets the end-to-end tests point at their own API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.FAIRTOY_API_URL ?? 'http://127.0.0.1:8000',
    },
  },
})
