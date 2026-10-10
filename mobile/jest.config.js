// Times on screen ("Today, 14:30") are the phone's local time. The tests describe Sri Lanka, so they must
// give the same answer on a laptop in Colombo and on a CI machine set to UTC. Workers inherit this.
process.env.TZ = 'Asia/Colombo';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  // The first test of a file pays for loading React Native; on a busy machine that can pass five seconds.
  testTimeout: 20_000,
  collectCoverageFrom: [
    'src/features/hazard-reports/{domain,offline,api}/**/*.ts',
    // UC-1 alerts, sign-in and the shared foundation: plain TypeScript with no React or Expo in it.
    'src/features/alerts/{domain,api,storage}/**/*.ts',
    'src/features/auth/domain/**/*.ts',
    'src/shared/{api,contracts,i18n,session,storage}/**/*.ts',
    'src/shared/config.ts',
    '!**/__tests__/**',
    '!src/shared/storage/AsyncStorageKeyValueStore.ts',
  ],
  coverageThreshold: { global: { lines: 90, branches: 85, functions: 90, statements: 90 } },
};
