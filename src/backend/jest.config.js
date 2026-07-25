// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compilerOptions } = require('../../tsconfig')

module.exports = {
  displayName: 'Backend',

  moduleDirectories: ['node_modules', '<rootDir>'],
  // Module file extensions for importing
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: ['./node_modules/'],
  resetMocks: true,

  // LOAD-BEARING FOR CONTAINMENT (Phase 34.2, gap cycle 3, plan 34.2-19).
  // Redirects HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG_* for every
  // src/backend test file BEFORE that file's own imports run, so no suite
  // can opt out of containment by omission (a hand-maintained per-suite
  // list already rotted once — see jest.setupContainment.ts's docstring).
  // Scope is the backend project ONLY: the destruction path
  // (backend/logger/paths.ts's getBaseLogPath(), sidecar/pathShim.ts's
  // resolveAppDataDir()) is reachable only from src/backend, so the
  // frontend/common/preload/meta jest projects are deliberately untouched.
  // Do not remove this entry.
  setupFiles: ['<rootDir>/src/backend/jest.setupContainment.ts'],

  rootDir: '../..',

  // The root of your source code, typically /src
  // `<rootDir>` is a token Jest substitutes
  roots: ['<rootDir>/src/backend'],

  testMatch: ['**/__tests__/**/*.test.ts'],
  // Jest transformations -- this adds support for TypeScript
  // using ts-jest
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  modulePaths: [compilerOptions.baseUrl]
}
