import React, { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import './App.css'
import {
  createHashRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useRouteError
} from 'react-router-dom'
import ErrorComponent from './components/UI/ErrorComponent'
import NavShell from './components/UI/NavShell'
import { Tier2PortalProvider } from './components/UI/NavShell/Tier2PortalContext'
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
    disableAnimations,
    platform
  } = useContext(ContextProvider)

  const hasNativeOverlayControls = navigator['windowControlsOverlay']?.visible

  // D-06 REVERSAL (2026-08-13, 34.1-HUMAN-UAT.md "## D-06 reversal"): macOS now
  // drives the titlebar via `setTitleBarStyle` (plan 34.1-10) -- `framelessWindow`
  // ON -> 'overlay', OFF -> 'visible' -- and the native traffic lights are present
  // in BOTH of those states (in the native bar when 'visible', drawn over the
  // webview when 'overlay'). Rendering GameLib's own `WindowControls` on macOS in
  // EITHER state would reproduce the exact duplicate-buttons symptom D-06 was
  // originally raised about, so the hide condition below is `isMac`, UNCONDITIONAL
  // -- it does not narrow to the overlay state.
  //
  // `isMacOverlayTitlebar` is a DIFFERENT, NARROWER condition (`isMac &&
  // isFrameless`) and exists ONLY as the CSS hook (`macOverlayTitlebar` below) for
  // the 78px leading reserve that clears the lights when they are drawn OVER
  // content -- that only happens in the 'overlay' state. Do NOT collapse these two
  // booleans into one: collapsing toward the narrow form would make GameLib's own
  // buttons reappear on macOS whenever frameless is off (the D-06 symptom,
  // returning); collapsing toward the wide form would apply a 78px dead leading
  // gap next to a normal native title bar that isn't overlaying anything. This is
  // the most likely future regression in this file -- see `App.test.tsx`'s (or
  // equivalent) pinned two-boolean gate.
  //
  // `navigator.windowControlsOverlay` is undefined under WKWebView, so
  // `hasNativeOverlayControls` cannot express any of the above -- it stays scoped
  // to its original Electron/Chromium purpose below.
  //
  // Keyed on `platform`, not on a shell/runtime detection check, so the Electron
  // macOS build stops rendering the duplicate set too (declared consequence, see
  // SUMMARY).
  const isMac = platform === 'darwin'
  const isMacOverlayTitlebar = isMac && isFrameless

  const showOverlayControls = isFrameless && !hasNativeOverlayControls && !isMac

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
        macOverlayTitlebar: isMacOverlayTitlebar,
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
            <Tier2PortalProvider>
              <OfflineMessage />
              <NavShell />
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
            </Tier2PortalProvider>
          </TourProvider>
        )}
      </ThemeProvider>
    </div>
  )
}

// F-10 (34.4.1 plan 25): before this existed, no route in the tree had an
// `errorElement`, so anything that threw while resolving or rendering a route
// -- a rejected `lazy()` chunk import above all -- unmounted the whole router
// subtree and left an empty document. That failure mode is visually identical
// to F-10's real cause and cost a live gate run to tell apart. A route error
// must always land on something the user can see.
function RouteErrorSurface() {
  const { t } = useTranslation('gamelib')
  const error = useRouteError()
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)
  const message = t(
    'gamelib:app.routeError',
    'Something went wrong: {{detail}}',
    { detail }
  )
  return <ErrorComponent message={message} />
}

function makeLazyFunc(
  importedFile: Promise<Record<'default', React.ComponentType>>
) {
  return async () => {
    const component = await importedFile
    return { Component: component.default }
  }
}

const router = createHashRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <RouteErrorSurface />,
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
