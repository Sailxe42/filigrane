import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Relative base: works on GitHub Pages (/filigrane/) and any static host.
  base: './',
  resolve: {
    alias: {
      '@filigranejs/core': src('../../packages/core/src/index.ts'),
      '@filigranejs/ui': src('../../packages/ui/src/index.ts'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: src('index.html'), verify: src('verify.html') },
    },
  },
  worker: { format: 'es' },
});
