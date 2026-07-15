import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

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
      // Most tile PNGs live only in server/public/tiles/ on the production box
      // (tiles_64/128 locally are gitignored working dirs). Proxy those, but
      // serve tiles that exist in public/ (repo-tracked, e.g. swamp_flat_v2)
      // directly via the bypass so they work in dev before they're deployed.
      '/tiles': {
        target: 'https://realmkeep.app',
        changeOrigin: true,
        bypass: (req) => {
          const url = (req.url ?? '').split('?')[0]
          return fs.existsSync(path.join(rootDir, 'public', url)) ? req.url : null
        },
      },
    },
  },
  build: {
    // Build output goes to server/public so Express can serve it
    outDir: './server/public',
    emptyOutDir: true,
  },
})
