import React, { useContext } from 'react'

import './App.css'
import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation
} from 'react-router-dom'
import Sidebar from './components/UI/Sidebar'
import ContextProvider from './state/ContextProvider'
import { ControllerHints, Help, OfflineMessage } from './components/UI'
import DialogHandler from './components/UI/DialogHandler'
import ExternalLinkDialog from './components/UI/ExternalLinkDialog'
import RedeemSteamKeyDialog from './components/UI/RedeemSteamKeyDialog'
import WindowControls from './components/UI/WindowControls'
import classNames from 'classnames'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import LogFileUploadDialog from './components/UI/LogFileUploadDialog'
import UploadedLogFilesList from './screens/Settings/sections/LogSettings/components/UploadedLogFilesList'
import { TourProvider } from './state/TourContext'
import { InstallGameWrapper } from './screens/Library/components/InstallModal'
import { SettingsModalWrapper } from './screens/Settings/components/SettingsModal'
import AnalyticsDialog from './screens/Settings/components/AnalyticsDialog'
import HumbleExpiryToast from './components/UI/HumbleExpiryToast'
import SteamBottleSetup from './screens/Game/GamePage/components/SteamBottleSetup'
import SteamClientSetup from './screens/Game/GamePage/components/SteamClientSetup'
import SteamBridgeSetup from './screens/Game/GamePage/components/SteamBridgeSetup'
import SteamInstallLocationPicker from './screens/Game/GamePage/components/SteamInstallLocationPicker'

function Root() {
  const {
    isRTL,
    isFullscreen,
    isFrameless,
    experimentalFeatures,
    help,
    disableAnimations
  } = useContext(ContextProvider)

  const hasNativeOverlayControls = navigator['windowControlsOverlay']?.visible
  const showOverlayControls = isFrameless && !hasNativeOverlayControls

  const isConsoleMode = useLocation().pathname.startsWith('/console')

  const theme = createTheme({
    direction: isRTL ? 'rtl' : 'ltr',
    typography: {
      fontFamily: 'var(--primary-font-family)'
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            color: 'var(--text-default)',
            backgroundColor: 'var(--background)'
          }
        }
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: 'var(--text-md)',
            backgroundColor: 'var(--background-darker)',
            color: 'var(--text-primary)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--space-sm)',
            maxWidth: '350px'
          }
        }
      }
    }
  })

  return (
    <div
      id="app"
      className={classNames('App', {
        isRTL,
        frameless: isFrameless,
        fullscreen: isFullscreen,
        disableAnimations,
        consoleMode: isConsoleMode
      })}
      // disable dragging for all elements by default
      onDragStart={(e) => e.preventDefault()}
    >
      <ThemeProvider theme={theme}>
        {isConsoleMode ? (
          <main className="content consoleContent">
            <Outlet />
          </main>
        ) : (
          <TourProvider>
            <OfflineMessage />
            <Sidebar />
            <main className="content">
              <DialogHandler />
              <InstallGameWrapper />
              <SteamBottleSetup />
              <SteamClientSetup />
              <SteamBridgeSetup />
              <SteamInstallLocationPicker />
              <SettingsModalWrapper />
              <ExternalLinkDialog />
              <RedeemSteamKeyDialog />
              <LogFileUploadDialog />
              <UploadedLogFilesList />
              <Outlet />
              <AnalyticsDialog />
              <HumbleExpiryToast />
            </main>
            <div className="controller">
              <ControllerHints />
              <dialog className="simple-keyboard-wrapper">
                <div className="simple-keyboard"></div>
              </dialog>
            </div>
            {showOverlayControls && <WindowControls />}
            {experimentalFeatures.enableHelp && <Help items={help.items} />}
          </TourProvider>
        )}
      </ThemeProvider>
    </div>
  )
}

function makeLazyFunc(
  importedFile: Promise<Record<'default', React.ComponentType>>
) {
  return async () => {
    // TEMPORARY F-10 DIAGNOSTIC, REMOVED BY PLAN 25 TASK 3. Emitted via window.api.logInfo
    // (lands in gamelib.log; sidecar/webview console output is not reliably observable under
    // Tauri) so a first-versus-second navigation's breadcrumb order can be compared.
    window.api.logInfo(
      `TEMPORARY F-10 DIAGNOSTIC: route lazy() await start seq=${Date.now()}`
    )
    const component = await importedFile.catch((err) => {
      // TEMPORARY F-10 DIAGNOSTIC, REMOVED BY PLAN 25 TASK 3. Re-thrown below — this does not
      // swallow the rejection, it only makes it visible before it propagates.
      const message = err instanceof Error ? err.message : String(err)
      window.api.logError(
        `TEMPORARY F-10 DIAGNOSTIC: route lazy() rejected seq=${Date.now()} error=${message}`
      )
      throw err
    })
    // TEMPORARY F-10 DIAGNOSTIC, REMOVED BY PLAN 25 TASK 3
    window.api.logInfo(
      `TEMPORARY F-10 DIAGNOSTIC: route lazy() await resolved seq=${Date.now()}`
    )
    return { Component: component.default }
  }
}

const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      {
        index: true,
        lazy: makeLazyFunc(import('./screens/Library'))
      },
      {
        path: 'login',
        lazy: makeLazyFunc(import('./screens/Login'))
      },
      {
        path: 'store/:store',
        lazy: makeLazyFunc(import('./screens/WebView'))
      },
      {
        path: 'wiki',
        lazy: makeLazyFunc(import('./screens/WebView'))
      },
      {
        path: 'gamepage/:runner/:appName',
        lazy: makeLazyFunc(import('./screens/Game/GamePage'))
      },
      {
        path: 'store-page',
        lazy: makeLazyFunc(import('./screens/WebView'))
      },
      {
        path: 'discounts',
        lazy: makeLazyFunc(import('./screens/Discounts'))
      },
      {
        path: 'store-search',
        lazy: makeLazyFunc(import('./screens/StoreSearch'))
      },
      {
        path: 'loginweb/steam',
        lazy: makeLazyFunc(import('./screens/Login/components/SteamLogin'))
      },
      {
        path: 'loginweb/:runner',
        lazy: makeLazyFunc(import('./screens/WebView'))
      },
      {
        path: 'settings/:type',
        lazy: makeLazyFunc(import('./screens/Settings'))
      },
      {
        path: 'wine-manager',
        lazy: makeLazyFunc(import('./screens/WineManager'))
      },
      {
        path: 'humble-keys',
        // Parent: shared route guard + sync header + tab nav + <Outlet/>.
        lazy: makeLazyFunc(import('./screens/Humble/Keys')),
        children: [
          // D-50: default tab is Keys waiting.
          { index: true, element: <Navigate to="waiting" replace /> },
          {
            path: 'waiting',
            lazy: makeLazyFunc(import('./screens/Humble/Keys/Waiting'))
          },
          {
            path: 'spares',
            lazy: makeLazyFunc(import('./screens/Humble/Keys/Spares'))
          },
          {
            path: 'all',
            lazy: makeLazyFunc(import('./screens/Humble/Keys/All'))
          }
        ]
      },
      {
        path: 'download-manager',
        lazy: makeLazyFunc(import('./screens/DownloadManager'))
      },
      {
        path: 'accessibility',
        lazy: makeLazyFunc(import('./screens/Accessibility'))
      },
      {
        path: 'console',
        lazy: makeLazyFunc(import('./screens/ConsoleMode'))
      },
      {
        path: '*',
        element: <Navigate replace to="/" />
      }
    ]
  }
])

export default function App() {
  return <RouterProvider router={router} />
}
