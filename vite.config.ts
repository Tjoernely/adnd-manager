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
    },
  },
  build: {
    // Build output goes to server/public so Express can serve it
    outDir: './server/public',
    emptyOutDir: true,
  },
})
