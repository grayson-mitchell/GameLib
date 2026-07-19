import { EventEmitter } from 'node:events'
import {
  BrowserWindowConstructorOptions,
  MenuItemConstructorOptions
} from 'electron'
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
  }
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

export {
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
