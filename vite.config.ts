import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Preview-only test-account sign-in (Ali's ruling on Agent Issue 52, ADC-LOG-775). Only
// `npm run build:preview` sets PREVIEW_SIGNIN=1; every other build gets the literal false, so the
// form's module is dropped from the bundle (scripts/check_prod_bundle.sh greps dist to prove it).
const PREVIEW_SIGNIN = process.env.PREVIEW_SIGNIN === '1';

export default defineConfig({
  plugins: [react()],
  define: { __PREVIEW_SIGNIN__: JSON.stringify(PREVIEW_SIGNIN) },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    css: { include: [/styles\.css/] },
  },
} as Parameters<typeof defineConfig>[0]);
