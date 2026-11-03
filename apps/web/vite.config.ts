import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The monorepo root: SVG assets of @ic/library are imported from outside apps/web.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [repoRoot] } },
});
