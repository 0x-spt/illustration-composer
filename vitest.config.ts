import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      'scripts/*',
      { test: { name: 'server', include: ['server/test/**/*.test.ts'] } },
    ],
  },
});
