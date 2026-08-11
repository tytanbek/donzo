import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Vitest 4 uses rolldown/oxc instead of esbuild — configure JSX here.
  // (tsconfig.json sets jsx: "preserve" for Next.js, which would leave JSX
  // untransformed inside test files.)
  oxc: {
    jsx: {
      runtime: 'automatic',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
