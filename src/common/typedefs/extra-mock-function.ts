/* eslint-disable @typescript-eslint/no-namespace */

// FIXME: This file is required because we add functionality to some objects
//        with Jest mocks. Ideally tests using these functions would do
//        their tasks using regular functions defined in the module they're
//        using. Mocks are intended to make existing functionality work inside
//        test, they're not supposed to add new functionality

// Phase 35 Plan 18 (D-35-13-02 / D-35-15-02): the ambient `declare global {
// namespace Electron { ... } }` block that used to live here is gone. It
// declaration-merged test-only members onto the `electron` package's own
// ambient namespace -- a namespace that no longer exists once Plan 18 retired
// the `electron` devDependency outright. Investigated whether the same
// declaration-merging trick could re-attach `BrowserWindow.setAllWindows` to
// `backend/platform`'s own `BrowserWindow` export via module augmentation
// (`declare module 'backend/platform' { namespace BrowserWindow { function
// setAllWindows(...): void } }`) -- TypeScript rejects this with TS2451
// ("Cannot redeclare block-scoped variable 'BrowserWindow'") at BOTH the
// augmentation site and `backend/platform/index.ts`'s own `export const
// BrowserWindow = {...}` declaration. Declaration merging only supports a
// namespace merging with a class, function, or enum -- never with a plain
// `const`/`let` variable -- and `backend/platform/index.ts` deliberately
// exports `BrowserWindow` as a const object (there is no real window class
// under the sidecar; see that file's own comment at the `BrowserWindow`
// export). Reproduced against three independent minimal repros (flat file,
// nested directory-index, commonjs and esnext `module` targets) before
// concluding this is a genuine TypeScript limitation, not a project
// misconfiguration.
//
// `BrowserWindow.options` and `Tray.menu` (the two other former members) stay
// dropped outright -- both were never consumed anywhere (grepped clean across
// `src/`), and `CrossProcessExports.Tray` in `backend/platform/types.ts`
// already declares `menu` as a first-class field for any suite that still
// needs it.
//
// `BrowserWindow.setAllWindows` IS consumed (`main_window.test.ts`,
// `progress_bar.test.ts`), so those two suites keep their own test-local
// `MockBrowserWindow` cast (`BrowserWindow as unknown as { setAllWindows:
// (windows: unknown[]) => void }`) rather than a project-wide augmentation --
// this is the correct final resolution of D-35-13-02/D-35-15-02, not a
// remaining gap: TypeScript's declaration-merging rules make the
// project-wide version impossible without changing `backend/platform`'s
// production `BrowserWindow` export from a `const` to a function+namespace
// pair purely to satisfy test typing, which is out of scope for a test-only
// convenience.

declare module 'backend/config' {
  namespace GlobalConfig {
    /** NOTE: Test-only function, not present normally */
    const setConfigValue: (key: string, value: unknown) => void
  }
}

export {}
