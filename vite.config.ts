import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Webflow serves the extension from `dist` (see webflow.json), so every asset
// path must be relative.
export default defineConfig({
  base: './',
  plugins: [preact()],
  // Watch rebuilds keep the old files in place, so the Webflow dev server never
  // finds dist/index.html missing between rebuilds.
  build: { outDir: 'dist', emptyOutDir: !process.argv.includes('--watch'), target: 'es2020' },
  test: { environment: 'node' },
} as never);
