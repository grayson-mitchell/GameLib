import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTriangleExclamation,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { useSteamEngineState } from 'frontend/state/SteamEngineState'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import './index.scss'

type Reason = 'cx-missing' | 'cx-expired' | 'cx-broken'
interface Shown {
  reason: Reason
  seq: number
}

type OverlayStepId =
  | 'steam-dylibs'
  | 'shim'
  | 'crossover-detect'
  | 'clone'
  | 'resign'
  | 'env'
interface ShownOverlay {
  step: OverlayStepId
  seq: number
}

const AUTO_HIDE_MS = 8000

// Mirrors the backend's OVERLAY_STEP_TEXT (a test guards drift); the frontend
// must not import backend at runtime.
// ts-prune-ignore-next
export const OVERLAY_STEP_KEYS: Record<
  OverlayStepId,
  { key: string; en: string }
> = {
  'steam-dylibs': {
    key: 'steam.overlay.step.steamDylibs',
    en: "Mac Steam's overlay files were not found."
  },
  shim: {
    key: 'steam.overlay.step.shim',
    en: "GameLib's overlay helper is missing from this build."
  },
  'crossover-detect': {
    key: 'steam.overlay.step.crossoverDetect',
    en: 'CrossOver could not be found.'
  },
  clone: {
    key: 'steam.overlay.step.clone',
    en: 'The overlay copy of CrossOver could not be prepared.'
  },
  resign: {
    key: 'steam.overlay.step.resign',
    en: 'The overlay copy of CrossOver could not be signed.'
  },
  env: {
    key: 'steam.overlay.step.env',
    en: 'An overlay path contains a character GameLib cannot pass to the game.'
  }
}

const isOverlayStep = (s: unknown): s is OverlayStepId =>
  typeof s === 'string' &&
  Object.prototype.hasOwnProperty.call(OVERLAY_STEP_KEYS, s)

const gameLibInFront = (): boolean =>
  document.visibilityState === 'visible' && document.hasFocus()

const isReason = (r: unknown): r is Reason =>
  r === 'cx-missing' || r === 'cx-expired' || r === 'cx-broken'

// D-06 and 59-UAT G6: a launch that drops to the built-in engine is announced
// inside the app, so it does not depend on a system notification (which
// `tauri dev` never delivers and a packaged build may have turned off).
// Non-blocking and dismissible, like HumbleExpiryToast. It reads only the
// engine state store, fed by the backend's steamEngineStateChanged push;
// `launchNotice` is non-null only in the push from recordLaunchDecision, so a
// page re-fetch (launchNotice null) never re-shows it. T-59-72: only the
// three closed reason values map to catalogue strings.
export default function SteamEngineLaunchNotice() {
  const { t } = useTranslation('gamelib')
  const byAppId = useSteamEngineState((s) => s.byAppId)
  const lastSeq = useRef(0)
  const lastOverlaySeq = useRef(0)
  const [shown, setShown] = useState<Shown | null>(null)
  const [shownOverlay, setShownOverlay] = useState<ShownOverlay | null>(null)

  useEffect(() => {
    let newest: Shown | null = null
    for (const state of Object.values(byAppId)) {
      const n = state.launchNotice
      if (!n || !isReason(n.reason) || typeof n.seq !== 'number') continue
      if (n.seq > lastSeq.current && (!newest || n.seq > newest.seq)) {
        newest = { reason: n.reason, seq: n.seq }
      }
    }
    if (newest) {
      lastSeq.current = newest.seq
      setShown(newest)
    }
  }, [byAppId])

  // Phase 60 G4: overlay failures. A separate seq stream, same push.
  useEffect(() => {
    let newest: ShownOverlay | null = null
    for (const state of Object.values(byAppId)) {
      const n = state.overlayNotice
      if (!n || !isOverlayStep(n.step) || typeof n.seq !== 'number') continue
      if (n.seq > lastOverlaySeq.current && (!newest || n.seq > newest.seq)) {
        newest = { step: n.step, seq: n.seq }
      }
    }
    if (newest) {
      lastOverlaySeq.current = newest.seq
      setShownOverlay(newest)
    }
  }, [byAppId])

  // The overlay notice fires as the game comes to the front, so its auto-hide
  // starts only once GameLib is visible and focused.
  useEffect(() => {
    if (!shownOverlay) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const start = () => {
      if (timer !== null || !gameLibInFront()) return
      timer = setTimeout(() => setShownOverlay(null), AUTO_HIDE_MS)
    }
    const stop = () => {
      window.removeEventListener('focus', start)
      document.removeEventListener('visibilitychange', start)
      if (timer !== null) clearTimeout(timer)
    }
    window.addEventListener('focus', start)
    document.addEventListener('visibilitychange', start)
    start()
    return stop
  }, [shownOverlay])

  useEffect(() => {
    if (!shown) return
    const id = setTimeout(() => setShown(null), AUTO_HIDE_MS)
    return () => clearTimeout(id)
  }, [shown])

  // The native store embed would cover the notice, as for HumbleExpiryToast.
  useSuppressStoreEmbedWhile(shown !== null || shownOverlay !== null)

  const overlayNode = shownOverlay ? (
    <div
      className="steamEngineLaunchNotice steamEngineLaunchNotice--overlay"
      role="status"
    >
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="steamEngineLaunchNoticeIcon"
      />
      <span className="steamEngineLaunchNoticeMessage">
        <strong>
          {t('steam.overlay.toast.title', 'Steam overlay unavailable')}
        </strong>{' '}
        {t(
          'steam.overlay.toast.body',
          '{{step}} The game is launching without the Steam overlay.',
          {
            step: t(
              OVERLAY_STEP_KEYS[shownOverlay.step].key,
              OVERLAY_STEP_KEYS[shownOverlay.step].en
            )
          }
        )}
      </span>
      <button
        className="steamEngineLaunchNoticeDismiss"
        aria-label={t('steam.engine.notice.dismiss', 'Dismiss')}
        onClick={() => setShownOverlay(null)}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  ) : null

  if (!shown) return overlayNode

  const message =
    shown.reason === 'cx-expired'
      ? t(
          'steam.engine.toast.cxExpired',
          'CrossOver trial expired — using built-in engine'
        )
      : shown.reason === 'cx-broken'
        ? t(
            'steam.engine.toast.cxBroken',
            "CrossOver isn't working — using built-in engine"
          )
        : t(
            'steam.engine.toast.cxMissing',
            'CrossOver not found — using built-in engine'
          )

  const engineNode = (
    <div className="steamEngineLaunchNotice" role="status">
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="steamEngineLaunchNoticeIcon"
      />
      <span className="steamEngineLaunchNoticeMessage">{message}</span>
      <button
        className="steamEngineLaunchNoticeDismiss"
        aria-label={t('steam.engine.notice.dismiss', 'Dismiss')}
        onClick={() => setShown(null)}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  )
  if (!overlayNode) return engineNode
  return (
    <>
      {engineNode}
      {overlayNode}
    </>
  )
}
