import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faClock,
  faEyeSlash,
  faMagnifyingGlass,
  faRightToBracket,
  faTriangleExclamation,
  faWrench,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'

import { useEngineState } from 'frontend/state/EngineState'
import { useSteamRequestNotice } from 'frontend/state/SteamRequestNotice'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import {
  renderNoticeSlot,
  useNoticePhaseFallback
} from 'frontend/components/UI/NoticeStack/noticeSlot'
import type { NoticePhase } from 'frontend/components/UI/NoticeStack/noticeSlot'
import './index.scss'

type Reason = 'cx-missing' | 'cx-expired' | 'cx-broken'
interface Shown {
  reason: Reason
  seq: number
  phase: NoticePhase
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
  phase: NoticePhase
}

interface ShownExit {
  seq: number
  phase: NoticePhase
}

type RequestKind = 'install-not-started' | 'uninstall-not-started'
interface ShownRequest {
  kind: RequestKind
  title: string
  seq: number
  phase: NoticePhase
}

const AUTO_HIDE_MS = 8000
const TOAST_CLASS = 'steamEngineLaunchNotice'
const TOAST_OVERLAY = `${TOAST_CLASS}--overlay`
const TOAST_PAUSED = `${TOAST_CLASS}--paused`
const TOAST_WAITING = `${TOAST_CLASS}--waiting`

const REASON_ICON: Record<Reason, IconDefinition> = {
  'cx-expired': faClock,
  'cx-broken': faWrench,
  'cx-missing': faMagnifyingGlass
}

// Mirrors the backend's OVERLAY_STEP_TEXT (a test guards drift); the frontend
// must not import backend at runtime.
// i18n-gate-exempt: each entry's `key`/`en` pair is consumed through
// `t(OVERLAY_STEP_KEYS[step].key, OVERLAY_STEP_KEYS[step].en)` in the overlay
// toast below; `en` is the i18n defaultValue, not rendered text.
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
// engine state store, fed by the backend's engineStateChanged push;
// `launchNotice` is non-null only in the push from recordLaunchDecision, so a
// page re-fetch (launchNotice null) never re-shows it. T-59-72: only the
// three closed reason values map to catalogue strings.
// Quick 261105-ast: a third stream shows the overlay early-exit notice
// (exitNotice), which used to be a modal dialog. Same rules: once per seq,
// frozen until GameLib is in front, catalogue strings only (T-ast-01).
// Quick 261106-pvk: a fourth stream shows "Steam never started your install /
// uninstall" (SteamRequestNotice store, fed by the steamRequestNotice push),
// which used to be a system notification that could land on another monitor.
// Same rules: once per seq, frozen until GameLib is in front, catalogue
// strings chosen by the closed `kind` only (T-pvk-01).
// Sketch 006 variant A. Every exit goes through a leaving phase so the store
// embed stays suppressed until the notice is actually removed (L3).
export default function SteamEngineLaunchNotice() {
  const { t } = useTranslation('gamelib')
  const byGame = useEngineState((s) => s.byGame)
  const lastSeq = useRef(0)
  const lastOverlaySeq = useRef(0)
  const lastExitSeq = useRef(0)
  const latestRequest = useSteamRequestNotice((s) => s.latest)
  const lastRequestSeq = useRef(0)
  const [shownRequest, setShownRequest] = useState<ShownRequest | null>(null)
  const [hoveredRequest, setHoveredRequest] = useState(false)
  const [waitingRequest, setWaitingRequest] = useState(false)
  const remainingRequest = useRef(AUTO_HIDE_MS)
  const pendingRequest = useRef<ShownRequest | null>(null)
  const shownRequestRef = useRef<ShownRequest | null>(null)
  shownRequestRef.current = shownRequest
  const [shown, setShown] = useState<Shown | null>(null)
  const [shownOverlay, setShownOverlay] = useState<ShownOverlay | null>(null)
  const [shownExit, setShownExit] = useState<ShownExit | null>(null)
  const [hoveredExit, setHoveredExit] = useState(false)
  const [waitingExit, setWaitingExit] = useState(false)
  const remainingExit = useRef(AUTO_HIDE_MS)
  const pendingExit = useRef<ShownExit | null>(null)
  const shownExitRef = useRef<ShownExit | null>(null)
  shownExitRef.current = shownExit
  const [hovered, setHovered] = useState(false)
  const [hoveredOverlay, setHoveredOverlay] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const remaining = useRef(AUTO_HIDE_MS)
  const remainingOverlay = useRef(AUTO_HIDE_MS)
  const pending = useRef<Shown | null>(null)
  const pendingOverlay = useRef<ShownOverlay | null>(null)
  const shownRef = useRef<Shown | null>(null)
  const shownOverlayRef = useRef<ShownOverlay | null>(null)
  shownRef.current = shown
  shownOverlayRef.current = shownOverlay

  // Removal: promote a replacement that arrived mid-exit, else clear.
  const finish = () => {
    const p = pending.current
    pending.current = null
    if (p) {
      remaining.current = AUTO_HIDE_MS
      setHovered(false)
      setShown({ ...p, phase: 'in' })
    } else {
      setShown(null)
    }
  }
  const finishOverlay = () => {
    const p = pendingOverlay.current
    pendingOverlay.current = null
    if (p) {
      remainingOverlay.current = AUTO_HIDE_MS
      setHoveredOverlay(false)
      setWaiting(!gameLibInFront())
      setShownOverlay({ ...p, phase: 'in' })
    } else {
      setShownOverlay(null)
    }
  }

  const finishExit = () => {
    const p = pendingExit.current
    pendingExit.current = null
    if (p) {
      remainingExit.current = AUTO_HIDE_MS
      setHoveredExit(false)
      setWaitingExit(!gameLibInFront())
      setShownExit({ ...p, phase: 'in' })
    } else {
      setShownExit(null)
    }
  }

  const finishRequest = () => {
    const p = pendingRequest.current
    pendingRequest.current = null
    if (p) {
      remainingRequest.current = AUTO_HIDE_MS
      setHoveredRequest(false)
      setWaitingRequest(!gameLibInFront())
      setShownRequest({ ...p, phase: 'in' })
    } else {
      setShownRequest(null)
    }
  }

  useEffect(() => {
    let newest: Shown | null = null
    for (const state of Object.values(byGame)) {
      const n = state.launchNotice
      if (!n || !isReason(n.reason) || typeof n.seq !== 'number') continue
      if (n.seq > lastSeq.current && (!newest || n.seq > newest.seq)) {
        newest = { reason: n.reason, seq: n.seq, phase: 'in' }
      }
    }
    if (!newest) return
    lastSeq.current = newest.seq
    const cur = shownRef.current
    if (!cur) {
      remaining.current = AUTO_HIDE_MS
      setHovered(false)
      setShown(newest)
    } else {
      pending.current = newest
      if (cur.phase === 'in') setShown({ ...cur, phase: 'leaving' })
    }
  }, [byGame])

  // Phase 60 G4: overlay failures. A separate seq stream, same push.
  useEffect(() => {
    let newest: ShownOverlay | null = null
    for (const state of Object.values(byGame)) {
      const n = state.overlayNotice
      if (!n || !isOverlayStep(n.step) || typeof n.seq !== 'number') continue
      if (n.seq > lastOverlaySeq.current && (!newest || n.seq > newest.seq)) {
        newest = { step: n.step, seq: n.seq, phase: 'in' }
      }
    }
    if (!newest) return
    lastOverlaySeq.current = newest.seq
    const cur = shownOverlayRef.current
    if (!cur) {
      remainingOverlay.current = AUTO_HIDE_MS
      setHoveredOverlay(false)
      setWaiting(!gameLibInFront())
      setShownOverlay(newest)
    } else {
      pendingOverlay.current = newest
      if (cur.phase === 'in') setShownOverlay({ ...cur, phase: 'leaving' })
    }
  }, [byGame])

  // Quick 261105-ast: overlay early exit. A third seq stream, same push.
  useEffect(() => {
    let newest: ShownExit | null = null
    for (const state of Object.values(byGame)) {
      const n = state.exitNotice
      if (!n || typeof n.seq !== 'number') continue
      if (n.seq > lastExitSeq.current && (!newest || n.seq > newest.seq)) {
        newest = { seq: n.seq, phase: 'in' }
      }
    }
    if (!newest) return
    lastExitSeq.current = newest.seq
    const cur = shownExitRef.current
    if (!cur) {
      remainingExit.current = AUTO_HIDE_MS
      setHoveredExit(false)
      setWaitingExit(!gameLibInFront())
      setShownExit(newest)
    } else {
      pendingExit.current = newest
      if (cur.phase === 'in') setShownExit({ ...cur, phase: 'leaving' })
    }
  }, [byGame])

  // Quick 261106-pvk: Steam never picked up a delegated request. A fourth seq
  // stream, fed by its own push rather than the engine state.
  useEffect(() => {
    const n = latestRequest
    if (!n || typeof n.seq !== 'number' || n.seq <= lastRequestSeq.current) {
      return
    }
    if (
      n.kind !== 'install-not-started' &&
      n.kind !== 'uninstall-not-started'
    ) {
      return
    }
    lastRequestSeq.current = n.seq
    const next: ShownRequest = {
      kind: n.kind,
      title: typeof n.title === 'string' ? n.title : '',
      seq: n.seq,
      phase: 'in'
    }
    const cur = shownRequestRef.current
    if (!cur) {
      remainingRequest.current = AUTO_HIDE_MS
      setHoveredRequest(false)
      setWaitingRequest(!gameLibInFront())
      setShownRequest(next)
    } else {
      pendingRequest.current = next
      if (cur.phase === 'in') setShownRequest({ ...cur, phase: 'leaving' })
    }
  }, [latestRequest])

  // The user is usually in Steam when this fires: freeze the countdown until
  // GameLib is visible and focused so they still see it on return.
  useEffect(() => {
    if (!shownRequest || !waitingRequest) return
    const check = () => {
      if (gameLibInFront()) setWaitingRequest(false)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    check()
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on seq/phase like the sibling streams
  }, [shownRequest?.seq, waitingRequest])

  // The exit notice no longer raises the window, so GameLib may still be
  // behind: freeze the countdown until it is visible and focused.
  useEffect(() => {
    if (!shownExit || !waitingExit) return
    const check = () => {
      if (gameLibInFront()) setWaitingExit(false)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    check()
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on seq/phase like the sibling streams
  }, [shownExit?.seq, waitingExit])

  // The overlay notice fires as the game comes to the front, so its countdown
  // starts only once GameLib is visible and focused. One-way latch per notice.
  useEffect(() => {
    if (!shownOverlay || !waiting) return
    const check = () => {
      if (gameLibInFront()) setWaiting(false)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    check()
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [shownOverlay?.seq, waiting])

  // Pausable auto-hide: the single source of truth for the countdown. The CSS
  // bar is display-only and paused from the same state through modifiers.
  const engineSeq = shown?.seq
  const enginePhase = shown?.phase
  useEffect(() => {
    if (!shown || shown.phase !== 'in' || hovered) return
    const startedAt = Date.now()
    const id = setTimeout(
      () => setShown({ ...shown, phase: 'leaving' }),
      remaining.current
    )
    return () => {
      clearTimeout(id)
      remaining.current = Math.max(
        0,
        remaining.current - (Date.now() - startedAt)
      )
    }
  }, [engineSeq, enginePhase, hovered])

  const overlaySeq = shownOverlay?.seq
  const overlayPhase = shownOverlay?.phase
  useEffect(() => {
    if (!shownOverlay || shownOverlay.phase !== 'in') return
    if (hoveredOverlay || waiting) return
    const startedAt = Date.now()
    const id = setTimeout(
      () => setShownOverlay({ ...shownOverlay, phase: 'leaving' }),
      remainingOverlay.current
    )
    return () => {
      clearTimeout(id)
      remainingOverlay.current = Math.max(
        0,
        remainingOverlay.current - (Date.now() - startedAt)
      )
    }
  }, [overlaySeq, overlayPhase, hoveredOverlay, waiting])

  const exitSeq = shownExit?.seq
  const exitPhase = shownExit?.phase
  useEffect(() => {
    if (!shownExit || shownExit.phase !== 'in') return
    if (hoveredExit || waitingExit) return
    const startedAt = Date.now()
    const id = setTimeout(
      () => setShownExit({ ...shownExit, phase: 'leaving' }),
      remainingExit.current
    )
    return () => {
      clearTimeout(id)
      remainingExit.current = Math.max(
        0,
        remainingExit.current - (Date.now() - startedAt)
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on seq/phase like the sibling streams
  }, [exitSeq, exitPhase, hoveredExit, waitingExit])

  const requestSeq = shownRequest?.seq
  const requestPhase = shownRequest?.phase
  useEffect(() => {
    if (!shownRequest || shownRequest.phase !== 'in') return
    if (hoveredRequest || waitingRequest) return
    const startedAt = Date.now()
    const id = setTimeout(
      () => setShownRequest({ ...shownRequest, phase: 'leaving' }),
      remainingRequest.current
    )
    return () => {
      clearTimeout(id)
      remainingRequest.current = Math.max(
        0,
        remainingRequest.current - (Date.now() - startedAt)
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on seq/phase like the sibling streams
  }, [requestSeq, requestPhase, hoveredRequest, waitingRequest])

  // Phase fallbacks (T-vvz-02): never get stuck if animationend is lost.
  useNoticePhaseFallback(
    shown?.phase ?? null,
    engineSeq,
    () => shown && setShown({ ...shown, phase: 'collapsing' }),
    finish
  )
  useNoticePhaseFallback(
    shownOverlay?.phase ?? null,
    overlaySeq,
    () =>
      shownOverlay && setShownOverlay({ ...shownOverlay, phase: 'collapsing' }),
    finishOverlay
  )
  useNoticePhaseFallback(
    shownExit?.phase ?? null,
    exitSeq,
    () => shownExit && setShownExit({ ...shownExit, phase: 'collapsing' }),
    finishExit
  )
  useNoticePhaseFallback(
    shownRequest?.phase ?? null,
    requestSeq,
    () =>
      shownRequest && setShownRequest({ ...shownRequest, phase: 'collapsing' }),
    finishRequest
  )

  // The native store embed would cover the notice, as for HumbleExpiryToast.
  useSuppressStoreEmbedWhile(
    shown !== null ||
      shownOverlay !== null ||
      shownExit !== null ||
      shownRequest !== null
  )

  if (!shown && !shownOverlay && !shownExit && !shownRequest) return null

  // A plain (non-hook) helper: one slot + toast.
  const renderSlot = (o: {
    slotKey: string
    seq: number
    phase: NoticePhase
    overlay: boolean
    paused: boolean
    waiting: boolean
    icon: IconDefinition
    title: string
    body: string
    setHover: (v: boolean) => void
    beginLeave: () => void
    toCollapsing: () => void
    remove: () => void
  }) => {
    const toastClassName = [
      TOAST_CLASS,
      o.overlay ? TOAST_OVERLAY : '',
      o.paused ? TOAST_PAUSED : '',
      o.waiting ? TOAST_WAITING : ''
    ]
      .filter(Boolean)
      .join(' ')
    return renderNoticeSlot({
      slotKey: o.slotKey,
      toastKey: o.seq,
      phase: o.phase,
      toastClassName,
      onMouseEnter: () => o.setHover(true),
      onMouseLeave: () => o.setHover(false),
      toCollapsing: o.toCollapsing,
      remove: o.remove,
      children: (
        <>
          <FontAwesomeIcon
            icon={o.icon}
            className="steamEngineLaunchNoticeIcon"
          />
          <span className="steamEngineLaunchNoticeText">
            <span className="steamEngineLaunchNoticeTitle">{o.title}</span>{' '}
            <span className="steamEngineLaunchNoticeBody">{o.body}</span>
          </span>
          <button
            className="steamEngineLaunchNoticeDismiss"
            aria-label={t('steam.engine.notice.dismiss', 'Dismiss')}
            onClick={() => {
              if (o.phase === 'in') o.beginLeave()
            }}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <span
            className="steamEngineLaunchNoticeBar"
            aria-hidden="true"
            style={{ animationDuration: `${AUTO_HIDE_MS}ms` }}
          />
        </>
      )
    })
  }

  const requestNode = shownRequest
    ? renderSlot({
        slotKey: 'request',
        seq: shownRequest.seq,
        phase: shownRequest.phase,
        overlay: false,
        paused: hoveredRequest,
        waiting: waitingRequest,
        icon: faRightToBracket,
        title:
          shownRequest.title || t('steam.requestNotice.fallbackTitle', 'Steam'),
        body:
          shownRequest.kind === 'install-not-started'
            ? t(
                'steam.install.notStarted',
                "Steam didn't start the install. Make sure Steam is signed in, then try again."
              )
            : t(
                'steam.uninstall.notStarted',
                "Steam didn't start the uninstall. Make sure Steam is signed in, then try again."
              ),
        setHover: setHoveredRequest,
        beginLeave: () =>
          setShownRequest({ ...shownRequest, phase: 'leaving' }),
        toCollapsing: () =>
          setShownRequest({ ...shownRequest, phase: 'collapsing' }),
        remove: finishRequest
      })
    : null

  const exitNode = shownExit
    ? renderSlot({
        slotKey: 'exit',
        seq: shownExit.seq,
        phase: shownExit.phase,
        overlay: true,
        paused: hoveredExit,
        waiting: waitingExit,
        icon: faTriangleExclamation,
        title: t('steam.overlay.exit.title', 'Game closed soon after starting'),
        body: t(
          'steam.overlay.exit.body',
          "The game exited within 30 seconds with the Steam overlay on. If this is a crash and keeps happening, try turning the overlay off in this game's settings: Run > Steam overlay."
        ),
        setHover: setHoveredExit,
        beginLeave: () => setShownExit({ ...shownExit, phase: 'leaving' }),
        toCollapsing: () => setShownExit({ ...shownExit, phase: 'collapsing' }),
        remove: finishExit
      })
    : null

  const overlayNode = shownOverlay
    ? renderSlot({
        slotKey: 'overlay',
        seq: shownOverlay.seq,
        phase: shownOverlay.phase,
        overlay: true,
        paused: hoveredOverlay,
        waiting,
        icon: faEyeSlash,
        title: t('steam.overlay.toast.title', 'Steam overlay unavailable'),
        body: t(
          'steam.overlay.toast.body',
          '{{step}} The game is launching without the Steam overlay.',
          {
            step: t(
              OVERLAY_STEP_KEYS[shownOverlay.step].key,
              OVERLAY_STEP_KEYS[shownOverlay.step].en
            )
          }
        ),
        setHover: setHoveredOverlay,
        beginLeave: () =>
          setShownOverlay({ ...shownOverlay, phase: 'leaving' }),
        toCollapsing: () =>
          setShownOverlay({ ...shownOverlay, phase: 'collapsing' }),
        remove: finishOverlay
      })
    : null

  let engineNode = null
  if (shown) {
    const title =
      shown.reason === 'cx-expired'
        ? t('steam.engine.toast.title.cxExpired', 'CrossOver trial expired')
        : shown.reason === 'cx-broken'
          ? t('steam.engine.toast.title.cxBroken', "CrossOver isn't working")
          : t('steam.engine.toast.title.cxMissing', 'CrossOver not found')
    engineNode = renderSlot({
      slotKey: 'engine',
      seq: shown.seq,
      phase: shown.phase,
      overlay: false,
      paused: hovered,
      waiting: false,
      icon: REASON_ICON[shown.reason],
      title,
      body: t(
        'steam.engine.toast.body',
        'Using the built-in engine for this launch.'
      ),
      setHover: setHovered,
      beginLeave: () => setShown({ ...shown, phase: 'leaving' }),
      toCollapsing: () => setShown({ ...shown, phase: 'collapsing' }),
      remove: finish
    })
  }

  // The slots go straight into NoticeStack's region (no wrapper node).
  return (
    <>
      {requestNode}
      {exitNode}
      {overlayNode}
      {engineNode}
    </>
  )
}
