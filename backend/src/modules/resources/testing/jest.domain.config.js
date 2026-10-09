const base = require('../../../../jest.config.js');

/** Stage-one gate: resource domain tests without running another member's module. */
module.exports = {
  ...base,
  rootDir: '../../../..',
  testMatch: ['**/modules/resources/__tests__/domain/**/*.test.ts'],
  collectCoverageFrom: ['src/modules/resources/domain/**/*.ts'],
  coverageDirectory: 'coverage/resources-domain',
  coverageThreshold: {
    global: {
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    },
  },
};
