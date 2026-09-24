import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const version = process.env.JAUVEX_VERSION || (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version; // the footer and the settings show it

// Renderer only. In development Electron loads this dev server; `npm start` loads the built files from dist/.
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: '127.0.0.1', port: 4340, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true },
});
