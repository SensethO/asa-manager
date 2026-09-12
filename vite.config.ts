import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.ASA_MANAGER_PORT ?? '8477';

export default defineConfig({
  plugins: [react()],
  root: 'web',
  build: {
    // Fastify serves this directory in production, so the UI and API share one origin
    outDir: '../server/public',
    emptyOutDir: true,
  },
  server: {
    port: 5273,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
