import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import base from '../../../../vite.config';
export default defineConfig({
  ...base,
  root: fileURLToPath(new URL('../../../../', import.meta.url)),
  test: {
    ...base.test,
    maxWorkers: 2,
    include: ['src/features/analytics/**/*.test.{ts,tsx}'],
    coverage: {
      ...base.test?.coverage,
      provider: 'v8',
      enabled: true,
      include: ['src/features/analytics/**/*.{ts,tsx}'],
      reportsDirectory: 'src/features/analytics/evidence/coverage',
    },
  },
});
