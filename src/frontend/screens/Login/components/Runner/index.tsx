import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import './index.css'

interface RunnerProps {
  loginUrl: string
  class: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  isLoggedIn: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logoutAction: () => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alternativeLoginAction?: () => any
  buttonText: string
  disabled: boolean
  // Epic-under-Tauri SIDLogin pivot (F-34.5-G6-01, 2026-08-03): when provided, the primary
  // tile invokes this action instead of navigating to `loginUrl`. Epic under Tauri passes
  // SIDLogin here (system-browser auth, the working path) so the primary tile is SIDLogin,
  // while the embedded WebKit login stays reachable via the "Alternative Login Method" tile
  // (for continued 403 experimentation). Optional and defaults to undefined for every runner
  // that does not pass it, so existing behavior is unchanged for any runner that omits it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  primaryLoginAction?: () => any
  // Purely visual deletion-pending marker (quick task 260805-d62) for the interactive
  // legendary/SID login ahead of ROADMAP Phase 34.7. Names WHICH tile is the SIDLogin
  // action, never a fixed tile position, because Epic's two tiles swap roles by shell
  // (F-34.5-G6-01 above): under Electron SIDLogin is the alternative tile, under Tauri
  // it is the primary tile. Changes no behavior -- only a class name and a title string.
  deprecatedTile?: 'primary' | 'alternative'
}

export default function Runner(props: RunnerProps) {
  const maxNameLength = 20
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await props.logoutAction()
    } catch (error) {
      // G-30-01: a logout action must never latch the button in "Logging
      // out..." forever. Most logoutAction implementations (see
      // GlobalState.tsx's per-platform logout methods) do not currently
      // throw, but this guard is the honest floor for any that do (now or
      // in the future) -- surface it and let `finally` recover the button.
      console.error('[GameLib] logoutAction failed:', error)
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
      // F-34.5-G6-01: the primary tile runs a custom action instead of navigating to the
      // embedded route (Epic under Tauri routes it to SIDLogin, the working path).
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
        {props.isLoggedIn && (
          <div className="userData">
            <span>
              {String(props.user).slice(0, maxNameLength) +
                (String(props.user).length > maxNameLength ? '...' : '')}
            </span>
          </div>
        )}
        <div className="runnerButtons">
          {!props.isLoggedIn ? (
            <div
              className={`runnerLogin${primaryDeprecated ? ' deprecated' : ''}`}
              onClick={() => handleLogin()}
              title={primaryDeprecated ? deprecatedHint : undefined}
            >
              {props.buttonText}
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
