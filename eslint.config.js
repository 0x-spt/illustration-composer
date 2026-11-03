import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.vercel/**', 'coverage/**', '.superpowers/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Figma plugin sandbox: plain script with `figma` / `__html__` globals.
    files: ['tools/figma-export-plugin/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { figma: 'readonly', __html__: 'readonly' },
    },
  },
  {
    // generated data module: the list is spliced into code.js, not imported
    files: ['tools/figma-export-plugin/nodes.generated.js'],
    rules: { '@typescript-eslint/no-unused-vars': 'off', 'no-unused-vars': 'off' },
  },
);
