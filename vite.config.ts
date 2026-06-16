import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pin the dev port so Vite never silently falls through onto 5174 (the
    // Flask backend's port) when 5173 is busy — that collision is what makes
    // /api/* 404 and surfaces "Could not load the sample".
    port: 5173,
    strictPort: true,
    proxy: {
      // Forward API calls to the Flask backend (python -m agent.server).
      "/api": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
      },
    },
  },
})
