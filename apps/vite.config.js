import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true,        // equivale a 0.0.0.0 — acessível na rede local
    port: 5173,
    strictPort: true,
  },
  plugins: [react()],
})
