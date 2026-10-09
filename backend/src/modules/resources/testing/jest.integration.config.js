const base = require('../../../../jest.config.js');
module.exports = {
  ...base,
  rootDir: '../../../..',
  testMatch: ['**/modules/resources/__tests__/integration/**/*.test.ts'],
  collectCoverage: false,
};
