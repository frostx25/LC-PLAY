import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'chrome68',
    cssTarget: 'chrome68',
    outDir: 'dist',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
