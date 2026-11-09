import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    host: '0.0.0.0',
    strictPort: false,
    proxy: { '/api': 'http://127.0.0.1:3001' }
  },
  preview: {
    host: '0.0.0.0'
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    reportCompressedSize: true
  }
});
