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
      // Serve generated concept-unit images from Flask, NOT Vite's public dir.
      // public/ilm-images/** is in `watch.ignored` above (so a publish doesn't
      // reload the page), but that also makes Vite refuse to serve files created
      // in that folder after startup — it answers index.html instead, so a fresh
      // run's images render broken. Proxying here routes /ilm-images to the backend
      // (which reads from disk per request), so new images always load AND the
      // no-reload behaviour is kept. See agent/server.py:ilm_image.
      "/ilm-images": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
      },
    },
  },
})
