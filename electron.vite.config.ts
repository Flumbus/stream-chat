import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'database-worker': resolve('src/main/database/worker.ts'),
        },
        external: ['node:sqlite'],
      },
    },
  },
  preload: {},
  renderer: { plugins: [react()] },
});
