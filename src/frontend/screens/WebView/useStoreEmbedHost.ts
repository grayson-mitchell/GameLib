import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { useStoreEmbedSuppressed } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'

/**
 * Store embed host hook (Phase 40 Plan 08, D-18/D-19/D-20/D-21, REQ-40-02/REQ-40-03).
 *
 * Under the retired Electron `<webview>` model the element was IN the document and CSS laid it
 * out. Under `Window::add_child` (spike 016-018) the embed is a native subview the DOM cannot
 * contain, only describe the position of. This hook is that description: it owns the ONE thing
 * that makes the inversion work (bounds sync, T-40-08-03/T-40-08-01) plus the three things a
 * long-lived native subview needs that a DOM element gets for free (open/re-point, a
 * hide-not-close route lifecycle, and hiding under app-UI suppression).
 *
 * SINGLE GEOMETRY ORACLE (D-18, spike 017): the interactive spike panel's own `ResizeObserver`
 * silently overrode a scripted run's bounds with zero error — a second writer always wins
 * silently, so the only defence is structural, not a runtime check. This hook contains the ONE
 * `storeEmbedSetBounds` call site in the entire renderer (T-40-08-03), fed by nothing but
 * `slot.getBoundingClientRect()`. There is no fallback rect anywhere in this file: a missing slot
 * ref sends nothing at all and only logs — computing a rect from `window.innerWidth/innerHeight`,
 * a CSS custom property, or a parent element's box would be a second writer wearing a disguise.
 */

// Spike 017's measured bounds-sync interval (`tauri-embedded-store-browser.md`, "Bounds sync"
// section: "ResizeObserver on the slot div, debounced ~40 ms"). Named so a future retune is a
// one-line diff against a comment, not a search for a buried magic number.
//
// This is a THROTTLE interval, not a debounce delay -- see `scheduleFlush` below. The distinction
// is not cosmetic: it is the difference between an embed that tracks a live window drag and one
// that visibly lags it (plan 40-11 live gate, Item 3, 2026-09-05).
const BOUNDS_SYNC_INTERVAL_MS = 40

// Drain cadence for Rust's in-embed navigation queue (GAP-D, D-22, REQ-40-06). This is the ONE
// thing standing between an in-embed link click and the chrome: Rust's `on_page_load` queues a
// navigation state and emits nothing, so if nobody drains, `canGoBack` stays false forever and
// the host label stays frozen on the START URL's host.
//
// 250 ms, not the 40 ms above. The two intervals answer different questions. Bounds sync tracks
// a CONTINUOUS gesture (a window drag) where a human eye reads any lag as jank, so it must be
// near frame rate. This one waits on a page load -- already hundreds of milliseconds of network
// -- and its output is a button's enabled state and a text label, neither of which a user can
// perceive arriving a quarter-second late. Polling it at 40 ms would multiply the embed's IPC
// round-trips for no perceivable gain.
const NAV_POLL_INTERVAL_MS = 250

// Derived from the real IPC return type rather than re-declared here, so this file cannot drift
// from `common/types/ipc.ts` the way the four nav methods' types already had (Rule 1 fix, this
// plan's SUMMARY) — if that type changes again, this one follows it instead of going stale next
// to it.
type StoreEmbedNavCallResult = Awaited<
  ReturnType<typeof window.api.storeEmbedBack>
>
type StoreEmbedNavState = Extract<
  StoreEmbedNavCallResult,
  { status: 'ok' }
>['navState']

/**
 * Display-only host derivation for the hook's OWN initial state, before any real navigation
 * event has arrived from the Rust history stack. Mirrors `StoreEmbedControls`'s own
 * `parseDisplayUrl` fail-soft shape (empty string, never a thrown error) — duplicated rather than
 * imported because that component's parser is private to its display concerns, not a shared
 * utility, and this hook needs only the host, not the insecure-scheme flag.
 */
function deriveInitialHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

function logNavCallFailure(label: string, error: unknown): void {
  window.api.logInfo(`[useStoreEmbedHost] ${label} threw: ${String(error)}`)
}

export interface UseStoreEmbedHostOptions {
  /** The slot div's ref — the single geometry oracle. Read, never written, by this hook. */
  slotRef: RefObject<HTMLDivElement>
  /** The route's resolved start URL (from `WebView/index.tsx`'s existing `urls` map/session restore). */
  startUrl: string
  /** Which store the caller is opening (e.g. `'steam'`) — bookkeeping only, per `storeEmbedSeam.open`'s own doc comment. */
  storeKey: string
  /**
   * True while the route currently rendering this hook is a store/wiki route. Guards the
   * suppression-release transition (T-40-08-02): a suppression released after the user has
   * already navigated away must not resurrect the embed on whatever screen they landed on next.
   */
  isStoreRoute: boolean
}

export interface StoreEmbedHostState {
  currentUrl: string
  host: string
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onNavigate: (url: string) => void
}

export function useStoreEmbedHost({
  slotRef,
  startUrl,
  storeKey,
  isStoreRoute
}: UseStoreEmbedHostOptions): StoreEmbedHostState {
  const [navState, setNavState] = useState<StoreEmbedNavState>(() => ({
    url: startUrl,
    host: deriveInitialHost(startUrl),
    canGoBack: false,
    canGoForward: false
  }))

  // D-22: `canGoBack`/`canGoForward` are FIELDS pushed by the Rust history stack, never a
  // synchronous query — this is the one place that state lands, from whichever call resolved it.
  const applyNavResult = useCallback((result: StoreEmbedNavCallResult) => {
    if (result.status === 'ok') {
      setNavState(result.navState)
      return
    }
    // T-40-08-05: tolerate an absent/erroring embed by leaving the last-known state in place
    // rather than throwing into the render path — the handle dies with the webview (planning
    // finding 5), so a failed nav call is a normal condition, not a bug to surface as a crash.
    window.api.logInfo(
      `[useStoreEmbedHost] navigation call resolved with status=error error=${result.error}`
    )
  }, [])

  // ── IN-EMBED NAVIGATION DRAIN (GAP-D, D-22, REQ-40-06) ─────────────────────────────────────
  //
  // The four callbacks at the bottom of this file learn about navigations the CHROME initiated,
  // from the return value of the call they themselves made. Nothing learns about the ones the
  // PAGE initiated -- a link clicked inside the embed -- because there is no handle in the
  // renderer to attach a `did-navigate` listener to, and (D-25, vendored-source-verified) no
  // native history API on the Rust side either. Rust's `on_page_load` Finished handler queues
  // the resulting state; this effect is the only thing that collects it.
  //
  // ANCHORED TO A SURVIVOR (the 013-015 rule). The interval belongs to THIS hook, which lives
  // in the main webview and outlives the embed. It holds no embed handle -- `storeEmbedTakeNavEvents`
  // reads a process-static queue in Rust, not the webview -- so a drain issued while the embed
  // is hidden, closed, or was never opened resolves empty rather than erroring.
  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const drain = () => {
      // A slow round-trip must not stack a second drain behind the first: two in flight would
      // race, and whichever resolved last would win with whichever half of the queue it got.
      if (inFlight) return
      inFlight = true
      window.api
        .storeEmbedTakeNavEvents()
        .then((events) => {
          if (cancelled) return
          // Apply the LAST event only. The earlier ones are intermediate states this drain
          // already superseded -- setting each in turn would render a burst of stale hosts.
          const latest = events[events.length - 1]
          if (latest) setNavState(latest)
        })
        .catch((error) => {
          logNavCallFailure('storeEmbedTakeNavEvents', error)
        })
        .finally(() => {
          inFlight = false
        })
    }

    const handle = setInterval(drain, NAV_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [])

  // ── D-30 RESTORE PERSISTENCE — write on navigation, not on route entry ─────────────────────
  // This hook's own `navState` initializer (above) is a DISPLAY-ONLY derivation of `startUrl`,
  // not a navigation -- persisting it here on mount would write the caller's own resolved start
  // URL straight back to storage on every route entry, defeating "write on navigation, not on
  // route entry" (D-30's own wording) before a single real navigation ever happened.
  // `hasNavigatedRef` skips exactly that first effect run; every run after it corresponds to a
  // REAL change to `navState`, from either of the two writers above: `applyNavResult`
  // (back/forward/reload/navigate -- navigations the chrome initiated) or the drain effect
  // (in-embed link clicks -- navigations the page initiated). Before GAP-D was fixed the second
  // writer did not exist, so an in-embed click was never persisted; it is now.
  const hasNavigatedRef = useRef(false)

  useEffect(() => {
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      return
    }
    try {
      localStorage.setItem(`last-url-${storeKey}`, navState.url)
    } catch (error) {
      logNavCallFailure(`persisting last-url-${storeKey}`, error)
    }
  }, [navState.url, storeKey])

  // ── BOUNDS SYNC + OPEN — the single geometry oracle (D-18, T-40-08-01/03) ──────────────────
  const openedRef = useRef(false)

  useEffect(() => {
    const slot = slotRef.current
    if (!slot) {
      window.api.logInfo(
        '[useStoreEmbedHost] slot ref is null on mount -- no ResizeObserver attached, no bounds sent (D-18: no fallback rect)'
      )
      return undefined
    }

    let trailingHandle: ReturnType<typeof setTimeout> | null = null
    let lastFlushAt = 0

    // The ONLY place in the renderer that reads a rect and sends bounds (grep-checked by this
    // plan's own acceptance criteria). `slot.getBoundingClientRect()` is the sole input to both
    // the initial `open()` and every later `setBounds()` — never `window.innerWidth/innerHeight`,
    // a CSS custom property, or a parent element's box, not even as a fallback for a momentarily
    // zero-sized slot.
    const flush = () => {
      const rect = slot.getBoundingClientRect()
      const bounds = { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
      if (!openedRef.current) {
        openedRef.current = true
        window.api.storeEmbedOpen(startUrl, bounds, storeKey).catch((error) => {
          logNavCallFailure('storeEmbedOpen', error)
        })
      } else {
        window.api.storeEmbedSetBounds(bounds)
      }
    }

    // LEADING-EDGE THROTTLE WITH A TRAILING FLUSH (D-18 unchanged: `flush` above is still the
    // only call site that reads a rect and sends bounds).
    //
    // The retired implementation was a pure trailing-edge debounce -- every tick called
    // `clearTimeout` and restarted the timer, so during a CONTINUOUS drag-resize the timer was
    // perpetually reset and `flush()` never ran until the drag paused for a full interval. The
    // plan 40-11 live gate caught this on real hardware: the embed updated "only on mouse
    // stopping or maybe being quite slow movement", against a browser that tracked the pointer
    // smoothly. A slow drag left inter-tick gaps longer than the interval and so looked fine,
    // which is why it survived every automated test and a first eyeball pass.
    //
    // The throttle keeps the debounce's actual purpose -- bounding IPC round-trips, since every
    // flush is renderer -> sidecar -> Rust -- while guaranteeing forward progress:
    //   * leading edge: the first tick after an idle interval sends IMMEDIATELY, so motion is
    //     visible from its first frame rather than after a delay;
    //   * max-wait: during sustained motion a send lands at least once per interval, because the
    //     pending trailing timer is NEVER cleared and restarted by a later tick (that restart was
    //     precisely the defect);
    //   * trailing edge: the final rect always lands, so the embed cannot come to rest misaligned.
    const scheduleFlush = () => {
      const now = Date.now()
      const sinceLastFlush = now - lastFlushAt

      if (sinceLastFlush >= BOUNDS_SYNC_INTERVAL_MS) {
        if (trailingHandle !== null) {
          clearTimeout(trailingHandle)
          trailingHandle = null
        }
        lastFlushAt = now
        flush()
        return
      }

      // Inside the interval: ensure exactly one trailing flush is pending. Deliberately NOT
      // rescheduled on subsequent ticks -- an already-armed timer is left alone so it fires on
      // schedule and motion keeps progressing.
      if (trailingHandle === null) {
        trailingHandle = setTimeout(() => {
          trailingHandle = null
          lastFlushAt = Date.now()
          flush()
        }, BOUNDS_SYNC_INTERVAL_MS - sinceLastFlush)
      }
    }

    const observer = new ResizeObserver(scheduleFlush)
    observer.observe(slot)

    // T-40-08-06: `getBoundingClientRect` is viewport-relative, so a scroll that moves the slot
    // changes its rect WITHOUT changing its size — a resize-only observer would strand the
    // embed. Determined (not assumed) for THIS layout: the slot renders inside `<Outlet/>`,
    // which App.css places inside `.App .content` — and that element is `overflow-y: auto`
    // (F-34.10-06), the app's real scroll container for every routed screen. So yes, the slot
    // CAN move without resizing here. `scroll` does not bubble, but a capturing-phase listener
    // on `window` still observes it on the way down to whichever element actually scrolled, so
    // one listener here catches `.App .content` (or any other scrollable ancestor introduced
    // later) without this hook needing to know which ancestor it is.
    window.addEventListener('resize', scheduleFlush)
    window.addEventListener('scroll', scheduleFlush, true)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleFlush)
      window.removeEventListener('scroll', scheduleFlush, true)
      if (trailingHandle !== null) clearTimeout(trailingHandle)
    }
    // Mount-once by design: this effect opens the embed exactly once (guarded by `openedRef`)
    // and re-points it via `storeEmbedNavigate` on a `startUrl` change (the effect below), never
    // by tearing down and re-attaching the observer — the observer's identity must outlive a
    // same-store URL change or the throttle window above would be defeated on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── SAME-STORE NAVIGATION ON A START-URL CHANGE — navigate, never re-open ──────────────────
  const previousUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (previousUrlRef.current === null) {
      previousUrlRef.current = startUrl
      return
    }
    if (previousUrlRef.current === startUrl) return
    previousUrlRef.current = startUrl
    window.api
      .storeEmbedNavigate(startUrl)
      .then(applyNavResult)
      .catch((error) => {
        logNavCallFailure('storeEmbedNavigate (start-url change)', error)
      })
  }, [startUrl, applyNavResult])

  // ── SUPPRESSION (D-19/D-20, T-40-08-02) ─────────────────────────────────────────────────────
  const suppressed = useStoreEmbedSuppressed()
  const wasSuppressedRef = useRef(false)

  useEffect(() => {
    if (suppressed) {
      wasSuppressedRef.current = true
      window.api.storeEmbedHide().catch((error) => {
        logNavCallFailure('storeEmbedHide (suppression)', error)
      })
      return
    }
    if (wasSuppressedRef.current) {
      wasSuppressedRef.current = false
      if (isStoreRoute) {
        window.api.storeEmbedShow().catch((error) => {
          logNavCallFailure('storeEmbedShow (suppression)', error)
        })
      }
    }
  }, [suppressed, isStoreRoute])

  // ── ROUTE LIFECYCLE — hide on leave, close only at app teardown (D-21) ─────────────────────
  const tearingDownRef = useRef(false)

  useEffect(() => {
    const handleBeforeUnload = () => {
      tearingDownRef.current = true
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // This cleanup fires when the hook unmounts, i.e. when the user leaves the store/wiki
      // route. `beforeunload` firing FIRST is the only signal that this unmount is instead part
      // of the whole app tearing down — in that case, and ONLY that case, close() rather than
      // hide(). Never close() on an ordinary route change: that would throw away the webview and
      // its cookie jar, defeating the "instant, state-intact return" this hook exists to give.
      if (tearingDownRef.current) {
        window.api.storeEmbedClose().catch((error) => {
          logNavCallFailure('storeEmbedClose (app teardown)', error)
        })
      } else {
        window.api.storeEmbedHide().catch((error) => {
          logNavCallFailure('storeEmbedHide (route leave)', error)
        })
      }
    }
  }, [])

  const onBack = useCallback(() => {
    window.api
      .storeEmbedBack()
      .then(applyNavResult)
      .catch((error) => logNavCallFailure('storeEmbedBack', error))
  }, [applyNavResult])

  const onForward = useCallback(() => {
    window.api
      .storeEmbedForward()
      .then(applyNavResult)
      .catch((error) => logNavCallFailure('storeEmbedForward', error))
  }, [applyNavResult])

  const onReload = useCallback(() => {
    window.api
      .storeEmbedReload()
      .then(applyNavResult)
      .catch((error) => logNavCallFailure('storeEmbedReload', error))
  }, [applyNavResult])

  const onNavigate = useCallback(
    (url: string) => {
      window.api
        .storeEmbedNavigate(url)
        .then(applyNavResult)
        .catch((error) => logNavCallFailure('storeEmbedNavigate', error))
    },
    [applyNavResult]
  )

  return {
    currentUrl: navState.url,
    host: navState.host,
    canGoBack: navState.canGoBack,
    canGoForward: navState.canGoForward,
    onBack,
    onForward,
    onReload,
    onNavigate
  }
}
