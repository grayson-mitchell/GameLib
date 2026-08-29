/**
 * Jest manual mock for `backend/platform` (Phase 35 Plan 15, doubles moved in by Plan 18).
 *
 * WHY THIS FILE EXISTS. `src/backend/__mocks__/electron.ts` used to be a manual mock keyed to
 * the `electron` module specifier. Because `electron` was a node_modules package, jest applied
 * it AUTOMATICALLY to every suite under `src/backend/` -- no `jest.mock()` call needed, which is
 * why most suites never mentioned it. Plan 35-15 repointed the backend at `backend/platform`,
 * and that auto-application does not carry over: `backend/platform` is a USER module, and a
 * user-module manual mock is only applied when a suite asks for it by name. The mock silently
 * stopped intercepting anything, which surfaced as 128 failures across 18 suites with shapes
 * like `platform_1.BrowserWindow.setAllWindows is not a function`.
 *
 * That asymmetry -- automatic for node_modules, opt-in for user modules -- is the whole defect,
 * and it is why suites using this mock must call `jest.mock('backend/platform')` explicitly.
 *
 * WHY IT SPREADS THE REAL MODULE. The nine doubles below are a small slice of the thirty-nine
 * names `backend/platform` exports. A mock that returned only the nine would make the other
 * thirty `undefined` for any suite that opted in -- `safeStorage`, `session`, `net`, `shell`,
 * `clipboard` and `powerSaveBlocker` among them. So the real module is spread first and only
 * the nine test doubles override it. Anything not deliberately doubled behaves as it really does.
 *
 * Phase 35 Plan 18: these nine doubles used to live in `src/backend/__mocks__/electron.ts` and
 * were imported from there (so the `electron`-automock consumers and this file's explicit
 * `jest.mock('backend/platform')` consumers shared one definition each, never drifting apart).
 * Plan 18 retired the `electron` devDependency entirely, so that file is gone -- its content is
 * reproduced verbatim below instead. This comment is the record of where it came from.
 */

import { EventEmitter } from 'node:events'
import type {
  BrowserWindowConstructorOptions,
  MenuItemConstructorOptions
} from 'backend/platform'
import { tmpdir } from 'os'
import { join } from 'path'

const appBasePath = tmpdir()
const dialog = {
  // dialog override
  showErrorBox: jest.fn(),
  showMessageBox: jest.fn()
}

const app = {
  // app override
  getPath: jest.fn().mockImplementation((path: string) => {
    return join(appBasePath, path)
  }),
  // Debug/steam-install-slow-start: main_window.ts resolves its preload path
  // via app.getAppPath() (project root in dev, asar root when packaged) --
  // the real Electron API this mock did not previously expose. A PLAIN
  // method (not `jest.fn()`), matching `getVersion` below -- this config's
  // `resetMocks: true` strips any `.mockImplementation()` set on a
  // module-load-time `jest.fn()` before EVERY test body runs, so a jest.fn()
  // here would return `undefined` for any caller invoked during a test
  // (as opposed to `getPath`, whose mock survives only because
  // electron-store's own construction calls it once at import time, before
  // the first reset ever fires).
  getAppPath(): string {
    return appBasePath
  },
  getVersion(): string {
    // TODO: What should we return here?
    return '1.0.0'
  },
  // quick/260815-vvz: `bottle.ts` statically imports `app` from `backend/platform`
  // so its `raiseFrontmostBottledProcess` yield fallback calls `app.hide()`
  // through this manual mock (auto-applied to every suite that explicitly
  // calls `jest.mock('backend/platform')`) rather than getting a TypeError
  // from an undefined member.
  hide: jest.fn()
}

class Notification {
  public show() {
    return
  }

  public isSupported() {
    return false
  }
}

class BrowserWindow {
  static windows: BrowserWindow[] = []
  options: BrowserWindowConstructorOptions = {}

  constructor(options: BrowserWindowConstructorOptions) {
    this.options = options
  }

  static getAllWindows() {
    return this.windows
  }

  static setAllWindows(windows: BrowserWindow[]) {
    this.windows = windows
  }

  public getOptions() {
    return this.options
  }
}

const Menu = {
  buildFromTemplate(options: MenuItemConstructorOptions[]) {
    return options
  }
}

const nativeImage = {
  createFromPath: (path: string) => ({
    resize: (size: { width: number; height: number }) =>
      `${path} width=${size.width} height=${size.height}`
  })
}

const screen = {
  getPrimaryDisplay: () => {
    return {
      workAreaSize: {
        height: 1280,
        width: 1920
      }
    }
  }
}

class Tray {
  icon = ''
  menu: MenuItemConstructorOptions[] = []
  tooltip = ''

  constructor(icon: string) {
    this.icon = icon
  }

  on() {}

  setContextMenu(menu: MenuItemConstructorOptions[]) {
    this.menu = menu
  }

  setToolTip(tooltip: string) {
    this.tooltip = tooltip
  }
}

const ipcMain = new EventEmitter()

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
