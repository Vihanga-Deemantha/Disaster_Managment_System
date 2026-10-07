// Jest loads this file as CommonJS.
const fs = require('node:fs');
const path = require('node:path');

const MODULES = ['warnings', 'resources', 'hazard-reports', 'analytics'];
const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 };

/** Files that are wiring, data or test support and are deliberately outside the coverage claim. */
const NOT_MEASURED = [/__tests__/, /[\\/]seed[\\/]/, /[\\/]testing[\\/]/, /composition\.ts$/];

function listSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return full.endsWith('.ts') && !NOT_MEASURED.some((rx) => rx.test(full)) ? [full] : [];
  });
}

/**
 * Every use-case module must reach 100% (master plan §9). Jest fails a path threshold that matches
 * no files, so a module's gate switches on automatically as soon as it contains measured code.
 */
function moduleThresholds() {
  const thresholds = {};
  for (const name of MODULES) {
    const dir = path.join(__dirname, 'src', 'modules', name);
    if (listSourceFiles(dir).length > 0) thresholds[`./src/modules/${name}/`] = FULL;
  }
  return thresholds;
}

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@shared/(.*)$': '<rootDir>/src/shared/$1' },
  setupFiles: ['<rootDir>/src/shared/testing/setupEnv.ts'],
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/testing/**',
    '!src/**/seed/**',
    '!src/**/composition.ts',
    '!src/server.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'html'],
  coverageThreshold: {
    ...moduleThresholds(),
    // Shared infrastructure and identity: the plan asks for ≥ 90% (not part of the use-case claim).
    './src/shared/': { lines: 90, branches: 85, functions: 90, statements: 90 },
  },
};
