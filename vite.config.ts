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
    watch: {
      // The agent pipeline WRITES its published output into the source tree at
      // publish time — src/data/conceptUnits.json (config.FRONTEND_DATA) and the
      // per-run visuals under public/ilm-images/. Because those live inside
      // Vite's watched root, each publish tripped a full page reload, which wiped
      // the in-memory React state (the just-published lesson) and dropped the user
      // back to the Ingest screen. Nothing imports these files (the renderer reads
      // the result over /api), so ignoring them is safe and keeps the review →
      // publish → lesson flow intact.
      ignored: ["**/src/data/conceptUnits.json", "**/public/ilm-images/**"],
    },
    proxy: {
      // Forward API calls to the Flask backend (python -m agent.server).
      "/api": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
      },
    },
  },
})
