import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // Écoute sur 0.0.0.0 pour être accessible depuis Windows (WSL2)
  },
  base: '/', // Base path for Vercel deployment
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
