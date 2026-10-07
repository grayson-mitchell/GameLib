import { useContext, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ContextProvider from 'frontend/state/ContextProvider'
import './index.css'

interface RunnerProps {
  loginUrl: string
  class: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  isLoggedIn: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logoutAction: () => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alternativeLoginAction?: () => any
  buttonText: string
  disabled: boolean
  // When provided, the primary tile invokes this action instead of navigating to `loginUrl`.
  // Introduced for the Epic-under-Tauri SIDLogin pivot (F-34.5-G6-01, 2026-08-03); Epic
  // stopped using it when quick task 260822-r3g reverted that pivot, but Steam and Humble
  // both pass it to open their in-app login overlays, so this is the general "primary tile
  // runs an action" seam. Optional and defaults to undefined for every runner that does not
  // pass it, so existing behavior is unchanged for any runner that omits it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  primaryLoginAction?: () => any
  // Purely visual deletion-pending marker (quick task 260805-d62). Names WHICH tile carries
  // the doomed action rather than a fixed tile position, since a store's two tiles can swap
  // roles. Changes no behavior -- only a class name and a title string.
  //
  // CURRENTLY PASSED BY NO RUNNER. Its only consumer was Epic, marking the embedded web
  // login ahead of ROADMAP Phase 34.7; quick task 260822-r3g put that phase ON HOLD (the
  // embedded login works again under the pristine WKWebView) and removed the marker. Kept,
  // with its unit tests, because "on hold" is not "cancelled" -- if a sign-in path is ever
  // scheduled for deletion again, re-marking it is one prop.
  deprecatedTile?: 'primary' | 'alternative'
  // Quick task 261003-u48 (D-3/D-4): a sign-in for THIS tile is currently in
  // flight. Derived by the host PER TILE from its own overlay identity
  // (`openOverlay === '<this tile's overlay id>'`) -- never from the host's
  // screen-wide `loginInFlight` flag, which would spin every tile at once.
  // Drives the spinner and, since quick task 261008-fjj, `aria-busy` on the
  // tile root. It gates no behavior, guards nothing, and must not be
  // consulted in handleLogin(). Optional so the Zoom call site (which cannot
  // type-check this comparison at all, D-2) stays byte-identical.
  busy?: boolean
}

// Quick task 261008-fjj: the tiles used to be bare `<div onClick>`s -- no role,
// no tabIndex -- so a keyboard-only user could not reach them and assistive
// technology saw no control at all (todo 2026-10-03, found by 261003-u48).
// They stay divs (the CSS cascade and two source gates key on `.runnerLogin`
// being a div) but now carry button semantics. `tabIndex` drops to -1 while
// disabled so a tile that cannot act is not a tab stop either; the handler's
// own `props.disabled` early-return is still the guard that matters and runs
// first regardless. Enter and Space both activate, like a native button;
// Space is prevented so it cannot also scroll the page.
//
// Honest limit, so nobody re-opens the todo expecting more: `busy` is only
// ever true while the host's `loginInFlight` is true, which is exactly when
// `.loginContentWrapper` carries `inert` -- on WebKit >= Safari 15.5 that
// removes this whole subtree from the accessibility tree, so `aria-busy` here
// is correct but masked for as long as it is set. It is exposed on the
// macOS 12.0-12.3 slice that lacks `inert` (F-36-02) and the day the wrapper's
// `inert` is lifted; the AT-perceivable "a sign-in is in progress" state on a
// current macOS is the overlay OUTSIDE the inert wrapper, not this tile.
function tileA11yProps(disabled: boolean, onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled ? ('true' as const) : undefined,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }
      event.preventDefault()
      onActivate()
    }
  }
}

export default function Runner(props: RunnerProps) {
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const navigate = useNavigate()
  const { showDialogModal } = useContext(ContextProvider)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await props.logoutAction()
    } catch (error) {
      // G-30-01, now covering TWO responsibilities (Phase 35 gap closure,
      // plan 35-22, CR-04 renderer half): (1) a logout action must never
      // latch the button in "Logging out..." forever -- the `finally` below
      // still guarantees that on every path, including this catch and a
      // throwing showDialogModal call; (2) a failed logout is a SECURITY
      // outcome (the session may not have actually cleared), and renderer
      // console logging reaches neither `gamelib.log` nor `gamelib-shell.log`
      // under Tauri, so it was an invisible failure. Route it through the
      // sidecar logger (recoverable by a support request) and surface it to
      // the user via a dialog -- the error text itself stays out of the
      // dialog body since it may carry an internal path or domain list; only
      // the log line gets that detail.
      window.api.logError(
        `[GameLib] logoutAction failed for ${props.class}: ${String(error)}`
      )
      showDialogModal({
        showDialog: true,
        type: 'ERROR',
        title: tGamelib(
          'gamelib:login.logoutFailedTitle',
          'Sign-out incomplete'
        ),
        message: tGamelib(
          'gamelib:login.logoutFailedMessage',
          "Your account was signed out on this device, but the browser session could not be fully cleared. On a shared computer, sign out again or clear your browser data for this site to make sure your session doesn't stay accessible."
        )
      })
    } finally {
      // FIXME: only delete local storage relate to one store, or only delete if logged out from both
      //window.localStorage.clear()
      setIsLoggingOut(false)
    }
  }

  function handleLogin() {
    if (props.disabled) {
      return
    }

    if (props.primaryLoginAction) {
      // The primary tile runs a custom action instead of navigating to the embedded route
      // (Steam and Humble route it to their in-app login overlays).
      props.primaryLoginAction()
      return
    }

    navigate(props.loginUrl)
  }

  function handleAltLogin() {
    if (props.disabled || !props.alternativeLoginAction) {
      return
    }

    props.alternativeLoginAction()
  }

  const primaryDeprecated =
    props.deprecatedTile === 'primary' && !props.isLoggedIn
  const alternativeDeprecated =
    props.deprecatedTile === 'alternative' && !props.isLoggedIn
  const deprecatedHint = t(
    'login.deprecated_hint',
    'Deprecated — this sign-in method is scheduled for removal'
  )

  return (
    <>
      <div
        className={`runnerWrapper ${props.class} ${
          props.disabled ? 'disabled' : ''
        } ${primaryDeprecated ? 'deprecated' : ''}`}
      >
        <div className={`runnerIcon ${props.class}`}>{props.icon()}</div>
        {/* Quick task 260815-kt0: per-store identity was structurally inconsistent across
            runners (Humble exposed no username at all, Amazon fell back to a literal
            "Unknown", Steam/Zoom could be undefined) and this screen never needed the
            identity value in the first place -- only connection state. Every logged-in
            tile now shows a single uniform indicator instead. */}
        {props.isLoggedIn && (
          <div className="userData">
            <span className="runnerConnected">
              {tGamelib('gamelib:login.connected', 'Connected')}
            </span>
          </div>
        )}
        <div className="runnerButtons">
          {!props.isLoggedIn ? (
            <div
              className={`runnerLogin${primaryDeprecated ? ' deprecated' : ''}${
                props.busy ? ' busy' : ''
              }`}
              onClick={() => handleLogin()}
              title={primaryDeprecated ? deprecatedHint : undefined}
              aria-busy={props.busy ? 'true' : undefined}
              {...tileA11yProps(props.disabled, handleLogin)}
            >
              {props.buttonText}
              {props.busy && (
                <div className="runnerBusySpinner" aria-hidden="true" />
              )}
            </div>
          ) : isLoggingOut ? (
            <div className="runnerLogin logged">
              {t('userselector.logging_out', 'Logging out')}...
            </div>
          ) : (
            <div
              className="runnerLogin logged"
              onClick={() => {
                handleLogout()
              }}
              {...tileA11yProps(props.disabled, () => {
                handleLogout()
              })}
            >
              {t('userselector.logout', 'Logout')}
            </div>
          )}
        </div>
      </div>
      {props.alternativeLoginAction && !props.isLoggedIn && (
        <div
          className={`runnerWrapper ${props.disabled ? 'disabled' : ''} ${
            alternativeDeprecated ? 'deprecated' : ''
          }`}
        >
          <div className="runnerIcon alternative">{props.icon()}</div>
          <div className="runnerButtons">
            <div
              onClick={() => handleAltLogin()}
              className={`runnerLogin alternative${
                alternativeDeprecated ? ' deprecated' : ''
              }`}
              title={alternativeDeprecated ? deprecatedHint : undefined}
              {...tileA11yProps(props.disabled, handleAltLogin)}
            >
              {`${props.class} ${t(
                'login.alternative_method',
                'Alternative Login Method'
              )}`}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
