import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from '../../../../vite.config';

export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('../../../../', import.meta.url)),
  test: {
    ...base.test,
    maxWorkers: 1,
    include: ['src/features/resources/**/*.test.{ts,tsx}'],
    coverage: {
      ...base.test?.coverage,
      provider: 'v8',
      enabled: true,
      include: ['src/features/resources/**/*.{ts,tsx}'],
      exclude: ['**/__tests__/**', '**/testing/**'],
      reportsDirectory: 'coverage/resources',
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
