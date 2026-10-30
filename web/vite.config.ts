import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5010,
    proxy: {
      '/api': { target: 'http://localhost:4010', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4010', ws: true },
    },
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
