import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import TauriLoginPanel from './TauriLoginPanel'
import type { TauriOAuthLoginState } from '../useTauriOAuthLogin'

interface Props {
  onDone: () => void
  onCancelled: () => void
}

/**
 * Shell-agnostic Humble login surface. Extracted verbatim (quick task
 * 260821-iri, Task 1) from `WebView/index.tsx`'s `runner === 'humble'`
 * branch so the Login screen's new `HumbleLogin` Dialog overlay (Task 2) can
 * host it in-tree without hard-navigating to `/loginweb/humble`. Every
 * comment below carries D-05/D-06/D-16/D-17, F-34.4.2-19 and quick task
 * 260808-gl6 rationale forward unchanged from its pre-extraction home.
 *
 * Phase 40 Plan 01 (D-09/D-09a): this file used to be a half-migrated
 * component -- its return path was already Model B (`TauriLoginPanel`), but
 * it still carried an entire dead Model A body behind it (a
 * `webviewPreloadPath` fetch that always resolved to a declared-empty
 * string, a fetched standard-Chrome UA no live render ever consumed, a
 * D-17 navigation relay, a login-chrome-CSS attach effect, and the
 * `<webview>` render itself). All of that is now gone: this component
 * renders `TauriLoginPanel` unconditionally. The `window.api.humbleGetLoginUserAgent`
 * fetch and its state are deleted with it (REQ-34.4.1-04's channel is
 * re-censused separately in plan 40-03 alongside D-11's
 * `humbleLoginNavigated`, since a native login path may still need it).
 */
export default function HumbleLoginSurface({ onDone, onCancelled }: Props) {
  const { t: tGamelib } = useTranslation('gamelib')
  const { humble } = useContext(ContextProvider)

  // F-34.4.2-19 fix: `result.status === 'error'`/`'waiting'` used to be silently swallowed
  // here — the promise settled, but nothing told `TauriLoginPanel` (still statically rendering
  // "a sign-in window has opened" for `runner === 'humble'` regardless of any watch outcome),
  // so the user was left staring at a lying in-progress message forever. This state is what
  // lets the two of them agree: 'error'/'timeout' route through the SAME
  // `TauriOAuthLoginState` shape the four OAuth runners already use, so `TauriLoginPanel`'s
  // existing generic error/timeout branches (heading, body, Retry button) render for humble
  // too, instead of a humble-specific copy/path having to be invented from scratch.
  const [humbleLoginState, setHumbleLoginState] =
    useState<TauriOAuthLoginState>({ phase: 'idle' })

  // Drives the main-process login watch (D-05/D-06/D-16) from this surface:
  // starts it exactly once on mount (reconnect() instead of startLogin()
  // when arriving with an expired session), applies the resulting login
  // state on acceptance, and issues the D-06 silent-cancel signal on
  // unmount / leaving the surface.
  useEffect(() => {
    let mounted = true

    async function runHumbleLoginWatch() {
      const result = humble.expired
        ? await window.api.humbleReconnect()
        : await window.api.humbleStartLogin()
      // A late resolution after this surface unmounted must not call back —
      // the user already left it (D-06 silent cancel).
      if (!mounted) return
      if (result.status === 'done') {
        await humble.login(result)
        onDone()
      } else if (result.status === 'cancelled') {
        // Quick task 260808-gl6: the user closed the sign-in window. That is how you back
        // out of signing in, not a failure — so this dismisses back to Manage Accounts and
        // leaves `humbleLoginState` at 'idle', deliberately rendering NO panel. Ordered before
        // the 'error' branch below, which keeps its failure surface for the outcomes that
        // genuinely are failures (the UNDECIDABLE / UNSUPPORTED_OR_ERROR cookie-read verdicts
        // in `humble/user.ts`'s watch).
        window.api.logInfo(
          '[WebView] runner=humble phase=cancelled (sign-in window closed by the user)'
        )
        onCancelled()
      } else if (result.status === 'error') {
        // F-34.4.2-19: the backend watch gave up (e.g. the login window became
        // unreachable — see the humble-isloggedin-never-set debug session). Surface it
        // rather than leaving the static "signing in" copy on screen forever.
        window.api.logInfo(
          '[WebView] runner=humble phase=error (login watch settled with status=error)'
        )
        setHumbleLoginState({
          phase: 'error',
          message: tGamelib(
            'webview.login.humble.error.window_unreachable',
            'the Humble sign-in window closed or could not be reached'
          )
        })
      } else if (result.status === 'waiting') {
        // Only reachable HERE (i.e. while still mounted) via WR-03's ten-minute watch
        // deadline — `stopLogin()`'s own `{ status: 'waiting' }` settle always races an
        // unmount that has already set `mounted = false` first, so that path never reaches
        // this branch. Treated exactly like the OAuth runners' own 'timeout' phase.
        window.api.logInfo(
          '[WebView] runner=humble phase=timeout (login watch deadline elapsed)'
        )
        setHumbleLoginState({ phase: 'timeout' })
      }
    }

    void runHumbleLoginWatch()

    return () => {
      mounted = false
      window.api.humbleStopLogin()
    }
    // Only ever run once per mount of this surface — re-running on every
    // `humble` context update would restart the login watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <TauriLoginPanel runner="humble" state={humbleLoginState} />
}
