import base from '../../../stryker.config.mjs';
export default {
  ...base,
  mutate: ['src/modules/analytics/domain/**/*.ts', 'src/modules/analytics/application/**/*.ts'],
  concurrency: 2,
  maxTestRunnerReuse: 40,
  jest: {
    configFile: 'jest.config.js',
    enableFindRelatedTests: false,
    config: {
      testMatch: ['**/modules/analytics/__tests__/{domain,application,api}.test.ts'],
      collectCoverage: false,
      coverageThreshold: {},
    },
  },
  htmlReporter: { fileName: 'src/modules/analytics/evidence/mutation/index.html' },
  jsonReporter: { fileName: 'src/modules/analytics/evidence/mutation/mutation.json' },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  incremental: true,
  incrementalFile: 'src/modules/analytics/evidence/mutation/incremental.json',
};
