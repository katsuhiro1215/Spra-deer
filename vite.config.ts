import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { watch: { usePolling: true, interval: 400 } },
  build: { rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } },
});
