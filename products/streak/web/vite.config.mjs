import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/season/',
  build: { outDir: '../public/season', emptyOutDir: true, sourcemap: false },
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:4100' } },
});
