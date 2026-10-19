import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // SQLite-backed suites each use a temporary database; serial files avoid worker contention
    // and false 5-second timeouts on slower CI runners.
    fileParallelism: false,
  },
});
