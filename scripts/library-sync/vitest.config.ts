import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'library-sync', include: ['test/**/*.test.ts'] },
});
