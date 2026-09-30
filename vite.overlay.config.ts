import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'src/overlay',
  plugins: [react()],
  build: { outDir: '../../out/overlay', emptyOutDir: true },
  base: '/',
});
