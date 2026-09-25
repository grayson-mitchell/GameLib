import React, { useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import './App.css'
import {
  createHashRouter,
  Navigate,
  Outlet,
  RouteObject,
  RouterProvider,
  useLocation,
  useRouteError
} from 'react-router-dom'
import ErrorComponent from './components/UI/ErrorComponent'
import Loading from './screens/Loading'
import NavShell from './components/UI/NavShell'
import { Tier2PortalProvider } from './components/UI/NavShell/Tier2PortalContext'
import { StoreEmbedSuppressionProvider } from './components/UI/NavShell/StoreEmbedSuppressionContext'
import ContextProvider from './state/ContextProvider'
import { ControllerHints, Help, OfflineMessage } from './components/UI'
import DialogHandler from './components/UI/DialogHandler'
import ExternalLinkDialog from './components/UI/ExternalLinkDialog'
import AboutDialogHost from './components/UI/AboutDialog/AboutDialogHost'
import RedeemSteamKeyDialog from './components/UI/RedeemSteamKeyDialog'
import WindowControls from './components/UI/WindowControls'
import classNames from 'classnames'
import { ThemeProvider } from '@mui/material/styles'
import LogFileUploadDialog from './components/UI/LogFileUploadDialog'
import UploadedLogFilesList from './screens/Settings/sections/LogSettings/components/UploadedLogFilesList'
import { TourProvider } from './state/TourContext'
import { InstallGameWrapper } from './screens/Library/components/InstallModal'
import { SettingsModalWrapper } from './screens/Settings/components/SettingsModal'
import HumbleExpiryToast from './components/UI/HumbleExpiryToast'
import SteamBottleSetup from './screens/Game/GamePage/components/SteamBottleSetup'
import SteamClientSetup from './screens/Game/GamePage/components/SteamClientSetup'
import SteamBridgeSetup from './screens/Game/GamePage/components/SteamBridgeSetup'
import { buildMuiTheme } from './muiTheme'

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

  const theme = buildMuiTheme(isRTL)

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
        {/*
          Phase 40 Plan 06 (D-18/D-20). Mounted here, wrapping BOTH render
          branches below, not inside `NavShell/index.tsx` -- `NavShell`
          renders a fragment (`<header/><aside/><NavShellTour/>`) that does
          not enclose `<Outlet/>`, the dialogs below, or
          `<HumbleExpiryToast/>`, all of which are `Root()`'s own children,
          siblings of `<NavShell/>`. Every overlay this plan wires
          (`Dialog`, the tier-2 dropdown, the Humble toast, the tour) must
          be a React descendant of this provider or it silently falls back
          to the no-op-but-warning default value -- see
          `StoreEmbedSuppressionContext.tsx`'s doc comment.
        */}
        <StoreEmbedSuppressionProvider>
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
                  <SettingsModalWrapper />
                  <ExternalLinkDialog />
                  <AboutDialogHost />
                  <RedeemSteamKeyDialog />
                  <LogFileUploadDialog />
                  <UploadedLogFilesList />
                  <Outlet />
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
        </StoreEmbedSuppressionProvider>
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

/**
 * A route module import that REJECTS lands on `errorElement` (see `RouteErrorSurface` above).
 * One that never settles lands nowhere at all: the router stays in its initial-load state
 * forever, and before `fallbackElement` existed that was an empty `#root` and a blank window
 * with nothing logged. The bound turns that into the rejecting case, which is visible.
 *
 * 20s is deliberately far above any observed value -- these modules are local assets served by
 * Tauri's own protocol handler, and the whole boot reaches `Frontend Ready` in 1-5s on this
 * machine -- so it can only fire on a genuine stall, never on a slow-but-working launch.
 */
const ROUTE_MODULE_TIMEOUT_MS = 20_000

function makeLazyFunc(
  importedFile: Promise<Record<'default', React.ComponentType>>
) {
  return async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const component = await Promise.race([
        importedFile,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `route module did not load within ${ROUTE_MODULE_TIMEOUT_MS}ms`
                )
              ),
            ROUTE_MODULE_TIMEOUT_MS
          )
        })
      ])
      return { Component: component.default }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

// Phase 43 (Task 2 deviation, Rule 3 -- blocking issue): exported as a
// plain, side-effect-free route-config array rather than passed straight
// into `createHashRouter(...)` at module scope. `createHashRouter` reaches
// for `document` immediately when called (confirmed: `node -e
// "require('react-router-dom').createHashRouter([])"` throws "document is
// not defined") -- calling it here, at module top level, meant this whole
// file could never be imported by a plain Node/jest environment (this
// repo's frontend jest project deliberately runs with no jsdom -- see
// jest.config.js's own comment). That blocked a route-config test (this
// plan's Task 3) from importing App.tsx at all. `routes` itself is inert
// data (JSX elements are just objects until rendered, and every screen
// import is deferred behind `lazy`), so exporting it costs nothing and
// `createHashRouter(routes)` is deferred into `App()` below, memoised so it
// is still constructed exactly once per app lifetime, same as the old
// module-scope singleton.
export const routes: RouteObject[] = [
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
        // Phase 43: the three-tab shell (Keys waiting / Giftable spares /
        // All keys, each its own routed child + <Outlet/>) is retired --
        // one leaf route renders the unified, searchable/sortable flat list
        // directly, no children.
        path: 'humble-keys',
        lazy: makeLazyFunc(import('./screens/Humble/Keys'))
      },
      // Phase 43: the three old tab routes are now flat sibling redirects
      // (not nested under 'humble-keys', matching this array's existing
      // flat-path convention -- see 'store/:store', 'settings/:type', etc.
      // above) so any bookmarked/deep-linked old tab URL still resolves
      // instead of falling through to the catch-all '*' redirect below.
      {
        path: 'humble-keys/waiting',
        element: <Navigate to="/humble-keys" replace />
      },
      {
        path: 'humble-keys/spares',
        element: <Navigate to="/humble-keys" replace />
      },
      {
        path: 'humble-keys/all',
        element: <Navigate to="/humble-keys" replace />
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
]

export default function App() {
  const router = useMemo(() => createHashRouter(routes), [])
  // `fallbackElement` is what the data router renders while it resolves the INITIAL route's
  // `lazy()` module. Without it that state renders `null` -- and because every route element
  // (including `Root`, which owns `<div className="App">`) lives inside the router, `#root`
  // goes completely empty for the duration.
  //
  // Measured on the packaged build 2026-09-23, three launches out of three: React's own
  // `<Suspense>` fallback `div.UpdateComponent` is REMOVED with nothing added, `#root` sits
  // empty for ~260-290ms, and only then does `div#app.App` appear. On 1 launch in 39 it never
  // appeared and the window stayed blank with `#root` at 1280x0 -- a dead-looking app with no
  // error anywhere. See
  // `.planning/todos/pending/2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four.md`.
  //
  // Two earlier hypotheses were measured and REFUTED before this one: `withTranslation()` on
  // `GlobalState` (above the Suspense boundary) and the `useTranslation()` calls in the
  // fallback pair. Fixing either left the gap at 10 launches out of 10; do not re-try them.
  return <RouterProvider router={router} fallbackElement={<Loading />} />
}
