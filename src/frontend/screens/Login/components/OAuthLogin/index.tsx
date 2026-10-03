import { useCallback, useContext, useEffect, useRef } from 'react'

import { Dialog, DialogHeader } from 'frontend/components/UI/Dialog'
import { useSuppressStoreEmbed } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import ContextProvider from 'frontend/state/ContextProvider'
import { getStoreDisplayName } from 'frontend/helpers/storeDisplayName'
import TauriLoginPanel from '../../../WebView/components/TauriLoginPanel'
import {
  useTauriOAuthLogin,
  type OAuthLoginCompletionPayload,
  type TauriOAuthLoginState
} from '../../../WebView/useTauriOAuthLogin'
import type { OAuthRunner } from 'common/types/oauthLogin'
import './index.scss'

// D-7: Zoom is deliberately NOT part of this overlay family -- it keeps its
// own `/loginweb/zoom` route. Narrowing the prop type to exactly the other
// three (rather than accepting the full OAuthRunner union) means a future
// call site cannot hand this component a Zoom runner by accident; the type
// checker catches it before D-7 would need to be re-discovered live.
export type OAuthOverlayRunner = Exclude<OAuthRunner, 'zoom'>

interface Props {
  runner: OAuthOverlayRunner
  dismiss: () => void
}

// D-3 (operator-decided, 2026-10-03): the discriminator for whether this
// overlay renders a Dialog is "is a native sign-in window on screen?", NOT
// "is the phase terminal?". A Dialog renders only for the two windowless
// waits -- Amazon-only `preparing` (~12.8s nile-auth subprocess spawn,
// quick task 260806-teb) and every runner's `finalizing` (5-27s token
// exchange, quick task 260803-eee) -- plus the three failure phases
// (`blocked`, `error`, `timeout`), which also have no window up. `idle` and
// the phase where a native window IS on screen render nothing: an in-app
// panel behind that window is noise (it mounts underneath it, and flashes
// back on screen for Dialog's own 500ms Slide exit on teardown) -- exactly
// the regression commit `bede817fd` removed for Humble.
//
// This plan's FIRST draft used "terminal vs non-terminal" as the
// discriminator and put the two windowless waits in the silent set even
// though neither has a window to defer to -- that was wrong, and the
// operator's correction is why this is a positive membership test (listing
// the five Dialog phases) rather than a chain of negations: a phase added
// to the hook's union later fails CLOSED (renders nothing) instead of
// silently falling into the Dialog branch.
const DIALOG_PHASES: ReadonlySet<TauriOAuthLoginState['phase']> = new Set([
  'preparing',
  'finalizing',
  'blocked',
  'error',
  'timeout'
])

/**
 * The Login screen's shared overlay for the three OAuth-capture runners --
 * GOG, Epic (legendary) and Amazon (nile) -- mirroring `HumbleLogin`'s shape
 * as closely as D-1/D-2 allow (quick task 261003-s04).
 *
 * D-1: one component, parameterised by `runner`, not a `renderState`
 * render-prop split like `HumbleLogin`/`HumbleLoginSurface`. That split
 * exists there because `HumbleLoginSurface` lives in `WebView/` and is ALSO
 * used by the `/loginweb/humble` route, so hoisting its conditional into the
 * host would remount the surface (and restart the watch) on every phase
 * change. No such constraint exists here: this component owns
 * `useTauriOAuthLogin` and the phase conditional in the SAME component, so
 * React keeps the hook's state across every render regardless of what this
 * component returns.
 *
 * D-2: `useTauriOAuthLogin`'s effect dependency array is
 * `[runner, onLoginSuccess, onCancelled]`. `Login/index.tsx`'s
 * `dismissLoginOverlay` is a plain function declaration with a fresh
 * identity on every render of that component (which DOES re-render while an
 * overlay is open), so passing it straight into the hook would re-run the
 * capture effect mid-login -- opening a SECOND native sign-in window and
 * discarding a single-use OAuth code. The two callbacks below are therefore
 * built with EMPTY-dependency `useCallback`s that read `dismiss` (and
 * `completeOAuthLogin`) from refs kept current by an effect, rather than
 * closing over the props directly. This is the whole point, not a style
 * choice -- a future "cleanup" that inlines either handler reintroduces the
 * defect.
 *
 * D-5: Retry is `TauriLoginPanel`'s own (a full `window.location.reload()`),
 * matching the already-shipped Humble overlay. This component adds no
 * second retry affordance -- the panel cannot be stopped from rendering its
 * own Retry without editing it, and it is out of scope here.
 */
export default function OAuthLogin({ runner, dismiss }: Props) {
  const { completeOAuthLogin } = useContext(ContextProvider)

  // Acquired directly, mirroring HumbleLogin: the Dialog below (which would
  // otherwise acquire suppression by mounting) is absent for most of this
  // overlay's life, so this call is what keeps the suppression window as
  // wide as the overlay's whole mounted lifetime.
  useSuppressStoreEmbed()

  const dismissRef = useRef(dismiss)
  const completeOAuthLoginRef = useRef(completeOAuthLogin)
  useEffect(() => {
    dismissRef.current = dismiss
    completeOAuthLoginRef.current = completeOAuthLogin
  }, [dismiss, completeOAuthLogin])

  const onLoginSuccess = useCallback((payload: OAuthLoginCompletionPayload) => {
    completeOAuthLoginRef.current(payload)
    dismissRef.current()
  }, [])

  const onCancelled = useCallback(() => {
    dismissRef.current()
  }, [])

  const state = useTauriOAuthLogin(runner, onLoginSuccess, onCancelled)

  if (!DIALOG_PHASES.has(state.phase)) {
    return null
  }

  return (
    <Dialog
      showCloseButton={true}
      onClose={dismiss}
      className="oauthLoginDialog"
    >
      <DialogHeader onClose={dismiss}>
        {getStoreDisplayName(runner, runner)}
      </DialogHeader>
      <div className="oauthLoginBody">
        <TauriLoginPanel runner={runner} state={state} />
      </div>
    </Dialog>
  )
}
