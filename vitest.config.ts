import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test against sources, no build step needed.
      '@filigrane/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@filigrane/ui': fileURLToPath(new URL('./packages/ui/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
