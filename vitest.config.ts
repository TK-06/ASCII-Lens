import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: that one sets `root: 'playground'`
// for the dev server, which would make vitest look for tests in the wrong
// place. Only *.test.ts runs here — tests/playground.e2e.ts needs a live dev
// server and is run by `npm run verify` instead.
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
});
