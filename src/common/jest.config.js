// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compilerOptions } = require('../../tsconfig')

// Phase 29 (Plan 03): first `src/common` jest project. `storePolicy.ts` is the first
// file under `src/common` to get a unit suite (`src/common/types/__tests__/`) — the
// root `jest.config.js`'s `projects` array previously only covered
// backend/frontend/preload/meta, so this suite had no project to run under. Mirrors
// the existing backend/preload project shape exactly (node test environment, no jsdom
// needed — storePolicy.ts is pure data/predicates).
module.exports = {
  displayName: 'Common',

  moduleDirectories: ['node_modules', '<rootDir>'],
  // Module file extensions for importing
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: ['./node_modules/'],
  resetMocks: true,

  rootDir: '../..',

  // The root of your source code, typically /src
  // `<rootDir>` is a token Jest substitutes
  roots: ['<rootDir>/src/common'],

  testMatch: ['**/__tests__/**/*.test.ts'],
  // Jest transformations -- this adds support for TypeScript
  // using ts-jest
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  modulePaths: [compilerOptions.baseUrl]
}
