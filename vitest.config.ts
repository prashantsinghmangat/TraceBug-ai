import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/dashboard.ts', 'src/compact-toolbar.ts', 'src/ui/**', 'src/onboarding.ts'],
    },
  },
});
