import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['node_modules/**', 'out/**', 'test-results/**', 'stream-chat-api/**', 'release/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['tests/*desktop.mjs'],
    languageOptions: {
      globals: { window: 'readonly', document: 'readonly', getComputedStyle: 'readonly' },
    },
  },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
