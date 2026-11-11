/* eslint-disable @typescript-eslint/no-namespace */

// FIXME: This file is required because we add functionality to some objects
//        with Jest mocks. Ideally tests using these functions would do
//        their tasks using regular functions defined in the module they're
//        using. Mocks are intended to make existing functionality work inside
//        test, they're not supposed to add new functionality

// Phase 35 Plan 18 / 66.3 plan 18: the ambient `declare global { namespace Electron { ... } }`
// block that used to live here is gone, along with the `backend/platform` Electron facade it
// described. Only the `GlobalConfig` test-only member declaration below remains.

declare module 'backend/config' {
  namespace GlobalConfig {
    /** NOTE: Test-only function, not present normally */
    const setConfigValue: (key: string, value: unknown) => void
  }
}

export {}
