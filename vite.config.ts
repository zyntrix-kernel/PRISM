import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps the production build portable: the dist/ folder can be
  // copied to another machine (or served from any sub-path) without rebuilds.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
  server: {
    port: 5173,
    host: true,
  },
});
