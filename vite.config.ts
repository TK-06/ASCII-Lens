import { defineConfig } from 'vite';

export default defineConfig({
  root: 'playground',
  // The engine lives in ../src and is imported verbatim, so the dev server
  // must be allowed to serve files above the root.
  server: { fs: { allow: ['..'] }, port: 5173 },
  build: { outDir: '../dist-playground', emptyOutDir: true },
});
