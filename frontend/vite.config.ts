import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The React app never talks to OpenRouter and never sees the API key:
// all requests go to the FastAPI backend through this proxy.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { output: { manualChunks: { recharts: ['recharts'] } } },
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
});
