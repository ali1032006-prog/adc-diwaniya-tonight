import { defineConfig } from 'vite';

// Live smoke against the dev backend; run only through scripts/live_smoke.py.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/live.smoke.ts'],
    testTimeout: 60_000,
  },
} as Parameters<typeof defineConfig>[0]);
