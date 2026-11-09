// D-14 re-render harness config. Used only by `pnpm perf:rerender`; the root
// jest.config.js does not list it and testMatch is `*.perf.tsx`, so
// `pnpm test:ci` never collects it. Needs jsdom (jest-environment-jsdom).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compilerOptions } = require('../../tsconfig')

module.exports = {
  displayName: 'Rerender',
  testEnvironment: 'jsdom',

  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: ['./node_modules/'],

  rootDir: '../..',
  roots: ['<rootDir>/meta/rerender'],
  testMatch: ['**/*.perf.tsx'],
  testTimeout: 300000,

  setupFiles: ['<rootDir>/meta/rerender/setupJsdom.js'],

  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  moduleNameMapper: {
    '\\.svg\\?react$': '<rootDir>/src/frontend/__mocks__/svgReactStub.tsx',
    '\\.(css|scss)$': '<rootDir>/meta/rerender/styleStub.js',
    '\\.(svg|png|jpe?g|gif|webp)(\\?\\w+)?$':
      '<rootDir>/meta/rerender/styleStub.js'
  },

  modulePaths: [compilerOptions.baseUrl]
}
