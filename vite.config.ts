import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development, proxy /api requests to the Express server
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Tile PNGs live only in server/public/tiles/ on the production box
      // (tiles_64/ locally is a gitignored working dir). Proxy so the sketch
      // editor + procedural renderer work in local dev.
      '/tiles': {
        target: 'https://realmkeep.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Build output goes to server/public so Express can serve it
    outDir: './server/public',
    emptyOutDir: true,
  },
})
