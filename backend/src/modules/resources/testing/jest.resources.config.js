const base = require('../../../../jest.config.js');
module.exports = {
  ...base,
  rootDir: '../../../..',
  testMatch: ['**/modules/resources/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/modules/resources/**/*.ts',
    '!src/modules/resources/**/__tests__/**',
    '!src/modules/resources/**/seed/**',
    '!src/modules/resources/**/testing/**',
    '!src/modules/resources/composition.ts',
  ],
  coverageDirectory: 'coverage/resources',
  coverageThreshold: { global: { lines: 100, branches: 100, functions: 100, statements: 100 } },
};
