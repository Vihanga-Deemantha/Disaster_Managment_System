const path = require('node:path');
const base = require('../../../../jest.config.js');
module.exports = {
  ...base,
  rootDir: path.resolve(__dirname, '../../../../'),
  testMatch: ['**/modules/analytics/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/modules/analytics/**/*.ts',
    '!src/**/seed/**',
    '!src/**/testing/**',
    '!src/**/composition.ts',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'src/modules/analytics/evidence/coverage',
  coverageThreshold: { global: { lines: 100, statements: 100, branches: 100, functions: 100 } },
};
