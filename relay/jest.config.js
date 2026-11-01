// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compilerOptions } = require('../tsconfig')

// Relay project: runs relay/src/__tests__ under the repo's Jest. The relay is an
// independent package, but its logic is tested here with a node:sqlite D1Like.
module.exports = {
  displayName: 'Relay',

  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/relay/src/__tests__/helpers/'
  ],
  resetMocks: true,

  rootDir: '..',
  roots: ['<rootDir>/relay'],

  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  modulePaths: [compilerOptions.baseUrl]
}
