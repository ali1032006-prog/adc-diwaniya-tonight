import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    css: { include: [/styles\.css/] },
  },
} as Parameters<typeof defineConfig>[0]);
