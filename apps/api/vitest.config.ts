import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    fileParallelism: false,
    setupFiles: ['src/test/env.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
