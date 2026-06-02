import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = parseInt(process.env.API_PORT || '4002');
const VITE_PORT = parseInt(process.env.PORT || '4001');

export default defineConfig({
  server: {
    port: VITE_PORT,
    host: '0.0.0.0',
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
