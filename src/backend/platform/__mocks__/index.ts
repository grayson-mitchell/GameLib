/**
 * Jest manual mock for `backend/platform` (Phase 35 Plan 15).
 *
 * WHY THIS FILE EXISTS. `src/backend/__mocks__/electron.ts` is a manual mock keyed to the
 * `electron` module specifier. Because `electron` is a node_modules package, jest applied it
 * AUTOMATICALLY to every suite under `src/backend/` -- no `jest.mock()` call needed, which is
 * why most suites never mentioned it. Plan 35-15 repointed the backend at `backend/platform`,
 * and that auto-application does not carry over: `backend/platform` is a USER module, and a
 * user-module manual mock is only applied when a suite asks for it by name. The mock silently
 * stopped intercepting anything, which surfaced as 128 failures across 18 suites with shapes
 * like `platform_1.BrowserWindow.setAllWindows is not a function`.
 *
 * That asymmetry -- automatic for node_modules, opt-in for user modules -- is the whole defect,
 * and it is why suites using this mock must now call `jest.mock('backend/platform')` explicitly.
 *
 * WHY IT SPREADS THE REAL MODULE. `__mocks__/electron.ts` exports nine names; `backend/platform`
 * exports thirty-nine. A mock that returned only the nine would make the other thirty
 * `undefined` for any suite that opted in -- `safeStorage`, `session`, `net`, `shell`,
 * `clipboard` and `powerSaveBlocker` among them. So the real module is spread first and only
 * the nine test doubles override it. Anything not deliberately doubled behaves as it really does.
 *
 * The doubles are NOT redefined here. They are imported from the existing electron mock, so
 * there is exactly one definition of each and the two mocks cannot drift apart. When plan 35-18
 * retires the `electron` devDependency and its mock, the doubles move here and this comment
 * becomes the record of where they came from.
 */

import {
  dialog,
  app,
  Notification,
  BrowserWindow,
  Menu,
  nativeImage,
  Tray,
  ipcMain,
  screen
} from '../../__mocks__/electron'

const actual = jest.requireActual('backend/platform')

module.exports = {
  ...actual,
  dialog,
  app,
  Notification,
  BrowserWindow,
  Menu,
  nativeImage,
  Tray,
  ipcMain,
  screen
}
