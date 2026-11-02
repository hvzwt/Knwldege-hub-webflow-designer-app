import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Webflow serves the extension from `dist` (see webflow.json), so every asset
// path must be relative.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  test: { environment: 'node' },
} as never);
