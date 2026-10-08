import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts', 'src/lib/text.ts'],
      exclude: ['src/engine/__tests__/**', 'src/engine/types.ts', 'src/engine/actions.ts'],
      thresholds: { branches: 95, lines: 95, functions: 95, statements: 95 },
      reporter: ['text', 'html'],
    },
  },
});
