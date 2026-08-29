import { AppSettings, WindowProps } from 'common/types'
import { BrowserWindow, screen, app } from 'backend/platform'
import path from 'path'
import { configStore } from './constants/key_value_stores'

let mainWindow: BrowserWindow | null = null

export const getMainWindow = () => {
  if (mainWindow) return mainWindow
  return BrowserWindow.getAllWindows().at(0)
}

let windowProps: WindowProps | null = null

export const isFrameless = () => {
  return windowProps?.frame === false || windowProps?.titleBarStyle === 'hidden'
}

// creates the mainWindow based on the configuration
export const createMainWindow = () => {
  windowProps = {
    height: 690,
    width: 1200,
    x: 0,
    y: 0,
    maximized: false
  } as WindowProps

  if (configStore.has('window-props')) {
    windowProps = configStore.get('window-props', windowProps)
  } else {
    // make sure initial screen size is not bigger than the available screen space
    const screenInfo = screen.getPrimaryDisplay()

    if (screenInfo?.workAreaSize?.height < windowProps.height) {
      windowProps.height = screenInfo.workAreaSize.height * 0.8
    }

    if (screenInfo?.workAreaSize?.width < windowProps.width) {
      windowProps.width = screenInfo.workAreaSize.width * 0.8
    }
  }
  // Set up frameless window if enabled in settings
  const settings = configStore.get('settings', <AppSettings>{})
  if (settings?.framelessWindow) {
    // use native overlay controls where supported
    if (['darwin', 'win32'].includes(process.platform)) {
      windowProps.titleBarStyle = 'hidden'
      windowProps.titleBarOverlay = true
    } else {
      windowProps.frame = false
    }
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    ...windowProps,
    minHeight: 345,
    minWidth: 600,
    show: false,

    webPreferences: {
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: true,
      // sandbox: false,
      // Resolve the preload from the app root (stable) rather than __dirname:
      // the main bundle can code-split into build/main/chunks/, which shifts
      // __dirname and breaks a `../preload` relative lookup. app.getAppPath()
      // is the project root in dev and the asar root when packaged; the preload
      // is always emitted to build/preload/index.js (electron.vite.config.ts).
      preload: path.join(app.getAppPath(), 'build/preload/index.js')
    }
  })

  return mainWindow
}
