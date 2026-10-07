/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  collectCoverageFrom: [
    'src/features/hazard-reports/{domain,offline,api}/**/*.ts',
    'src/shared/api/**/*.ts',
  ],
  coverageThreshold: { global: { lines: 90, branches: 85, functions: 90, statements: 90 } },
};
