import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        timeout: 120000,
      },
    },
  },
});
