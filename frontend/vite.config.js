import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// en desarrollo las llamadas a /api se mandan al backend local
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
});
