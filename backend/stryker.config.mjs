// Mutation testing: Stryker changes your code in small ways (flips a `>` to `>=`, deletes a branch...)
// and re-runs the tests. A mutant that no test notices "survived": the tests were not really checking
// that behaviour. The master plan wants a score of at least 90% on domain and application code.
//
//   npm run test:mutation -w backend                                   # everything below (slow)
//   npm run test:mutation -w backend -- --mutate "src/modules/warnings/domain/**/*.ts"   # one use case
//
// The report opens at backend/reports/mutation/index.html.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'jest',
  jest: { configFile: 'jest.config.js' },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  mutate: [
    'src/modules/*/domain/**/*.ts',
    'src/modules/*/application/**/*.ts',
    'src/shared/auth/domain/**/*.ts',
    'src/shared/auth/application/**/*.ts',
    '!src/**/__tests__/**',
  ],
  // Only run the tests that actually cover each mutant: much faster than the whole suite.
  coverageAnalysis: 'perTest',
  thresholds: { high: 95, low: 90, break: 90 },
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
  ignorePatterns: ['coverage', 'reports', 'dist', '.stryker-tmp'],
  timeoutMS: 30_000,
};
