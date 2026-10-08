import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../../../vite.config';

/** Runs unchanged shared regression tests with Node/jsdom fetch constructors reconciled. */
export default mergeConfig(
  base,
  defineConfig({
    root: fileURLToPath(new URL('../../../../', import.meta.url)),
    test: { maxWorkers: 2, setupFiles: ['./src/features/analytics/testing/fetch-compat.ts'] },
  }),
);
