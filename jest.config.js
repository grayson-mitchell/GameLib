/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {}
  },

  collectCoverageFrom: ['**/*.{js,jsx,ts,tsx}', '!**/*.config.js'],
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules',
    '<rootDir>/public',
    '<rootDir>/dist',
    '<rootDir>/build',
    '<rootDir>/coverage'
  ],
  coverageReporters: ['text', 'html'],

  // jest-runtime 29.7 compiles every CJS module with a `vm.Script` whose
  // `importModuleDynamically` closure pins the suite's whole module registry
  // (the Node >= 16.11 host-defined-options leak), so a worker's heap grows
  // with every suite it runs and is never reclaimed. Measured 2026-10-08 on
  // the Backend project alone: `--runInBand` went 41 MB -> 4179 MB over 234
  // suites. Recycling a worker once its idle heap passes this limit bounds
  // the growth (same 234 suites peaked at 1019 MB). Ignored under
  // `--runInBand`, so `test:ci` must keep using workers.
  workerIdleMemoryLimit: '1GB',

  projects: [
    '<rootDir>/src/backend',
    '<rootDir>/src/common',
    '<rootDir>/src/frontend',
    '<rootDir>/src/preload',
    '<rootDir>/meta'
  ],

  rootDir: '.'
}
