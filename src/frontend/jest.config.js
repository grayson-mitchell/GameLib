// eslint-disable-next-line @typescript-eslint/no-var-requires
const { compilerOptions } = require('../../tsconfig')

// Phase 12 (Plan 05): first frontend jest project. Deliberately
// testEnvironment: 'node' (the jest default), NOT 'jsdom' — jsdom /
// jest-environment-jsdom / react-test-renderer are not installed in this
// project (Jest 29 requires jest-environment-jsdom as a separate package).
// Adding a new npm dependency is excluded from auto-fix (executor deviation
// Rule 3 package-manager-install carve-out) and would require a human
// package-legitimacy checkpoint. Component tests in this project therefore
// call function components directly (no ReactDOM/render tree) and mock
// 'react' (useContext) / 'react-i18next' (useTranslation) at the module
// level — this only inspects the returned React-element object graph, which
// needs no DOM. See HumbleOriginInfo.test.tsx for the pattern.
module.exports = {
  displayName: 'Frontend',

  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testPathIgnorePatterns: ['./node_modules/'],
  resetMocks: true,

  rootDir: '../..',

  roots: ['<rootDir>/src/frontend'],

  testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  // Phase 42 (D-42-03): HumbleKeyRow's store indicator imports vite's
  // `?react` SVG-as-component suffix (see StoreLogos/index.tsx for the
  // existing convention). Jest has no `vite-plugin-svgr` equivalent, and
  // this project deliberately installs no jsdom/SVG transformer, so the
  // specifier is routed to a plain stub component instead — see
  // src/frontend/__mocks__/svgReactStub.tsx for why. `<rootDir>` here is the
  // REPO root (`rootDir: '../..'` below), so the target path must be
  // `<rootDir>/src/frontend/__mocks__/...`, not `<rootDir>/__mocks__/...`.
  moduleNameMapper: {
    '\\.svg\\?react$': '<rootDir>/src/frontend/__mocks__/svgReactStub.tsx'
  },

  modulePaths: [compilerOptions.baseUrl]
}
