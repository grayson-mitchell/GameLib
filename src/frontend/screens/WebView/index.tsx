import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation, useParams } from 'react-router-dom'

import ContextProvider from 'frontend/state/ContextProvider'
import { useStoreEmbedSuppressed } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import { rememberLastStore } from 'frontend/components/UI/NavShell/navTabs'
import StoreEmbedControls from 'frontend/components/UI/StoreEmbedControls'
import './index.css'
import WebviewUnavailablePanel from './components/WebviewUnavailablePanel'
import TauriLoginPanel from './components/TauriLoginPanel'
import HumbleLoginSurface from './components/HumbleLoginSurface'
import StoreEmbedSlotContents from './components/StoreEmbedSlotContents'
import StoreEmbedTimeoutBanner from './components/StoreEmbedTimeoutBanner'
import EpicLauncherBlockedNotice from './components/EpicLauncherBlockedNotice'
import { useTauriOAuthLogin } from './useTauriOAuthLogin'
import type { OAuthLoginCompletionPayload } from './useTauriOAuthLogin'
import { useStoreEmbedHost } from './useStoreEmbedHost'
import { runStoreExitRefresh, STORE_EXIT_ROWS } from './storeExitRefresh'
import type { StoreExitStoreKey } from './storeExitRefresh'
import type { OAuthRunner } from 'common/types/oauthLogin'
import {
  isLoginPathname,
  LOGIN_PATHNAMES,
  EPIC_LOGIN_URL,
  GOG_LOGIN_URL
} from './loginRoutes'
import { resolveStoreForUrl, isEmbeddableOrigin } from './storeEmbedOrigins'
import { resolveSignInState } from 'common/signInState'
import { collectSignInInputs } from 'frontend/helpers/signInInputs'

// D-30: the key the last-URL restore reads/writes under, per store. Kept as a named helper
// (not inlined at each of the two call sites) so the read side (below) and the write side
// (`useStoreEmbedHost.ts`) can never drift onto two different key shapes.
const lastUrlStorageKey = (storeKey: string) => `last-url-${storeKey}`

export default function WebView() {
  const { i18n } = useTranslation()
  const { pathname, search } = useLocation()
  const {
    epic,
    gog,
    amazon,
    humble,
    steam,
    completeOAuthLogin,
    platform,
    signInProbeOutcomes,
    refreshLibrary,
    refreshing,
    refreshingByRunner
  } = useContext(ContextProvider)
  const navigate = useNavigate()

  // `store` is set to epic/gog/amazon depending on which storefront we're
  // supposed to show, `runner` is set to a runner if we're supposed to show its
  // login prompt
  const { store, runner } = useParams()

  // The Stores tab reopens on the storefront the user last visited.
  useEffect(() => {
    rememberLastStore(store)
  }, [store])

  // Phase 34.4.1 Plan 09 (D-04, REQ-34.4.1-08), extended by Phase 34.5 Plan 26 (F-34.5-G6-02
  // layer 2, F-34.5-G6-03): drives the real per-runner OAuth capture for the four OAuth login
  // runners. Called unconditionally alongside this component's other hooks (React's
  // rules-of-hooks) -- the hook's OWN internal guard is what makes it a no-op for
  // `runner === 'humble'`/`undefined`/any non-OAuth value, not a conditional call here. Its
  // result is only consumed by the login-pathname branch below.  `completeOAuthLogin` is
  // GlobalState.tsx's own post-login completion path (setState + handleSuccessfulLogin ->
  // refreshLibrary) -- passing it here is what makes a captured OAuth login actually refresh the
  // library instead of silently landing nowhere.
  // True-unmount flag. NOT the same thing as the hook's own `cancelled` — see
  // `handleTauriOAuthSuccess` below for why that distinction is the whole bug. Empty deps, so
  // this cleanup runs on unmount ONLY, never on a dependency-identity change.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * Post-login completion for the Tauri OAuth path: finish the login AND leave the login
   * surface, which is what every other successful-login path in this file already does
   * (`handleSuccessfulLogin` -> `navigate('/login')` for Electron's epic/gog/amazon
   * branches; the humble watch's own `navigate('/login')` at the `status === 'done'` arm).
   *
   * THE BUG THIS FIXES: the Tauri path completed the login but never navigated, so the user
   * stayed on the WebView login route staring at `TauriLoginPanel`. The panel could not
   * recover on its own either — `useTauriOAuthLogin` routes its terminal
   * `setState({ phase: 'idle' })` through `safeSetState`, which is gated on `!cancelled`, and
   * a teardown lands mid-flight on this path (`phase=cancelled-midflight at=auth
   * authStatus=done` is logged immediately before every success). So the panel stayed at
   * `awaiting` — "Signing in to Gog" — indefinitely, while the login had in fact succeeded and
   * the library had refreshed underneath it.
   *
   * Navigating rather than un-gating that state update is deliberate: `phase: 'idle'` renders
   * the DECLARED-BLOCKED copy, so forcing the panel to idle would replace "Signing in…" with a
   * message implying the sign-in channel is unported — a worse lie than the stuck spinner. The
   * correct end state after a successful login is not a better panel, it is not being on the
   * login page at all.
   *
   * Guarded by `mountedRef`, NOT by the hook's `cancelled`, mirroring the humble watch's own
   * "a late resolution after the route unmounted must not navigate" rule. The two are not
   * interchangeable: `cancelled` means "this effect instance was superseded", which is TRUE on
   * every successful login here while the user is still sitting on the route. Gating on it
   * would reintroduce the exact bug.
   *
   * Stable identity via `useCallback` over two stable inputs — `completeOAuthLogin` is a
   * GlobalState class field and `navigate` is stable in react-router v6 — because
   * `onLoginSuccess` is one of `useTauriOAuthLogin`'s effect dependencies. A wrapper that
   * changed identity per render would re-run the capture effect on every render.
   */
  const handleTauriOAuthSuccess = useCallback(
    (payload: OAuthLoginCompletionPayload) => {
      completeOAuthLogin(payload)
      if (mountedRef.current) {
        navigate('/login')
      }
    },
    [completeOAuthLogin, navigate]
  )

  /**
   * Quick task 260803-eee Task 4: the cancel-path sibling of `handleTauriOAuthSuccess` above.
   *
   * THE BUG THIS FIXES: closing the native popup without completing sign-in correctly lands
   * `useTauriOAuthLogin` on `{ phase: 'cancelled' }` (unlike the success path, this state
   * transition is NOT suppressed by the mid-flight teardown, since `TauriLoginPanel` does render
   * its cancelled surface). But nothing then leaves the login route — the user is stuck on
   * "Signing in to <Runner> was cancelled" indefinitely instead of returning to Manage Accounts.
   *
   * Guarded by `mountedRef` (true-unmount), not the hook's `cancelled`/teardown flag — same
   * reasoning as `handleTauriOAuthSuccess`: this callback itself is invoked unconditionally by
   * the hook (see `useTauriOAuthLogin.ts`'s `onCancelled` call site), so gating navigation on the
   * hook's internal flag here would be checking the wrong thing.
   *
   * Deliberately NOT wired to timeout/error/unsupported — those keep their own retry-affordance
   * surfaces (a Retry button); only the user-cancelled outcome exits automatically.
   */
  const handleTauriOAuthCancelled = useCallback(() => {
    if (mountedRef.current) {
      navigate('/login')
    }
  }, [navigate])

  const oauthLoginState = useTauriOAuthLogin(
    runner as OAuthRunner | undefined,
    handleTauriOAuthSuccess,
    handleTauriOAuthCancelled
  )

  let lang = i18n.language
  if (i18n.language === 'pt') {
    lang = 'pt-BR'
  }

  // Lifted into loginRoutes.ts (Phase 34.4.1 Plan 09) so useTauriOAuthLogin.ts can import the
  // SAME literals rather than duplicating them — one definition, two consumers.
  const epicLoginUrl = EPIC_LOGIN_URL

  const epicStore = `https://www.epicgames.com/store/${lang}/`
  const gogStore = `https://af.gog.com?as=1838482841`
  const amazonStore = `https://gaming.amazon.com`
  const steamStore = 'https://store.steampowered.com/'
  const wikiURL =
    'https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki'
  const gogLoginUrl = GOG_LOGIN_URL
  const humbleLoginUrl = 'https://www.humblebundle.com/login'

  const urls: { [pathname: string]: string } = {
    '/store/epic': epicStore,
    '/store/gog': gogStore,
    '/store/amazon': amazonStore,
    '/store/steam': steamStore,
    '/wiki': wikiURL,
    '/loginEpic': epicLoginUrl,
    '/loginGOG': gogLoginUrl,
    '/loginweb/legendary': epicLoginUrl,
    '/loginweb/gog': gogLoginUrl,
    // Phase 40 Plan 01 (D-09): the `amazonLoginData` state that used to populate this key fed
    // only the deleted Electron `<webview>` amazon-login flow (`handleAmazonLogin`, removed by
    // this plan). `useTauriOAuthLogin.ts`'s own `getAmazonLoginData()` call is the single
    // remaining owner of that fetch -- see
    // `.planning/todos/completed/2026-09-01-webview-amazonlogindata-is-permanently-null.md` for
    // the folded todo this deletion resolves. Do NOT re-add a fetch here: the double-spawn cost
    // is the measured ~12.8s-per-call regression named in the no-op effect below.
    '/loginweb/nile': '',
    '/loginweb/humble': humbleLoginUrl
  }
  let startUrl = urls[pathname]

  // RESTORE (D-30, D-31, T-40-09-03). Re-derived, not ported: plan 40-08's `hide()`-on-leave
  // already keeps the embed and its page state alive across route changes WITHIN a session, so
  // this restore now earns its keep only across an app RESTART. That changes the storage choice
  // -- measured at plan time by inspecting this shell's on-disk WebKit `WebsiteData` store
  // (`~/Library/WebKit/{gamelib-shell,com.gamelib.shell}/WebsiteData/Default/*/LocalStorage/
  // localstorage.sqlite3`, per this project's own storage-inspection technique): every origin
  // has a `LocalStorage/localstorage.sqlite3` file, an on-disk store that survives a process
  // restart, but NO equivalent SessionStorage-backed file exists anywhere in that tree --
  // WebKit's sessionStorage is memory-only, scoped to the browsing context, and is discarded
  // with it. The retired implementation stored the restore value in `sessionStorage`, which
  // could never have delivered a cross-restart restore even before this plan -- moving to
  // `localStorage` is the fix this measurement calls for, not a preference.
  //
  // Validated on READ, not only on write (T-40-09-03): a value stored under an old origin-table
  // shape must not silently feed the embed's first navigation after the table changes. The read
  // key requires the resolved store to match the ROUTE's own store, not merely "some known
  // store" -- otherwise a value that drifted to a different store's origin would still pass.
  // `useStoreEmbedHost` validates the same predicate on the WRITE side, so neither half can
  // leave the other a value it would reject.
  //
  // READ ONCE PER STORE ENTRY, not once per render (debug session
  // `linux-embed-gog-reload-loop-real-profile`). `startUrl` is the input of the embed host's
  // start-URL effect, which turns every change of it into a real `webview.navigate()`. This used
  // to be recomputed from `localStorage` on EVERY render, and the hook writes that same key on
  // every in-embed navigation -- so any unrelated re-render of this component (a context update,
  // a progress event) re-read whatever page the embed had last reported and re-pointed the live
  // embed at it. Against a redirecting page that is an unbounded loop: GOG's affiliate start URL
  // bounces through a tracker, each bounce persisted a new value and each re-render navigated to
  // it. The operator saw the URL label flick `af.gog.com` <-> `track.adtraction.com` forever.
  //
  // Keyed on `store`, so the restore is still re-read when the user switches store (GOG ->
  // Epic -> GOG), which is the only moment it should be. It is a function of `store` and of
  // storage at entry, never of how often this component happens to render.
  //
  // The stale-value CLEAR is an effect, not part of the read: removing a key is a side effect,
  // and doing it during render made the render's own input unstable (a write in one render,
  // a removal in the next, each flipping `startUrl`).
  const restoredLastUrl = useMemo(() => {
    if (!store) return null
    const lastUrl = localStorage.getItem(lastUrlStorageKey(store))
    if (!lastUrl) return null
    const resolved = resolveStoreForUrl(lastUrl)
    if (resolved && resolved.key === store) {
      return { url: lastUrl, stale: false }
    }
    return { url: null, stale: true }
  }, [store])
  useEffect(() => {
    if (store && restoredLastUrl?.stale) {
      localStorage.removeItem(lastUrlStorageKey(store))
    }
  }, [store, restoredLastUrl])
  if (restoredLastUrl?.url) {
    startUrl = restoredLastUrl.url
  }

  // DEEP LINK (D-34, D-35, T-40-09-02). `store-page?store-url=` arrives from third-party deal
  // data that returns storefronts beyond the five this app embeds, so a non-match here is the
  // NORMAL case, not an error case. `resolveStoreForUrl` is the origin gate: an embeddable match
  // reuses that store's OWN identity end to end (D-35 -- same key, same user agent, same restore
  // key, same history stack; there is no sixth "deep link" identity). Anything else -- known but
  // not embeddable (Epic, D-05), or not a configured store origin at all, or unparseable -- opens
  // externally instead of loading unvetted third-party input into a native webview.
  //
  // NOTE ON THE RUST SCHEME POLICY (plan 40-04, `store_embed_navigation_policy`): that control is
  // NOT a substitute for this one. It decides ALLOW/BLOCK/HANDOFF purely by URL SCHEME
  // (gamelib/http/https/steam), so it would happily allow any https origin, including an
  // arbitrary third-party one, straight into the embed. This origin check is what actually scopes
  // "https" down to "one of our five configured stores" -- do not delete this gate as redundant
  // with that one; they answer different questions.
  const isStorePageDeepLink = pathname.match(/store-page/) !== null
  const deepLinkUrl = isStorePageDeepLink
    ? new URLSearchParams(search).get('store-url')
    : null
  const deepLinkConfig = deepLinkUrl ? resolveStoreForUrl(deepLinkUrl) : null
  const deepLinkEmbeddable =
    deepLinkUrl !== null && isEmbeddableOrigin(deepLinkUrl, platform)
  const deepLinkShouldOpenExternally =
    isStorePageDeepLink && deepLinkUrl !== null && !deepLinkEmbeddable

  if (deepLinkEmbeddable && deepLinkUrl) {
    startUrl = deepLinkUrl
  }

  // Phase 40 Plan 08 (D-18/D-19/D-20/D-21, REQ-40-02/REQ-40-03): the embed host hook, called
  // unconditionally here alongside this file's other hooks -- NOT inside the store/wiki return
  // arm further down -- because `loginweb/:runner`'s `runner` param (and this route's `store`
  // param) can change without this component unmounting (same `path:` entry in App.tsx's
  // router), so any hook call must sit at a stable position across every re-render, not behind
  // the humble/login early returns below (mirrors this file's existing `oauthLoginState`
  // convention). Its own no-op path carries the weight instead: `slotRef` is only ever attached
  // to a real DOM node in the macOS store/wiki JSX further down, so on every other route (login,
  // humble, non-macOS) `slotRef.current` stays null for the hook's whole lifetime and its mount
  // effect logs and returns without opening anything (Task 1's own null-ref guard, D-18: no
  // fallback rect). `storeKey` falls back to a route label rather than the `store` param for the
  // `/wiki` route (no `store` param at all), and for `store-page` falls back FURTHER to the
  // resolved deep-link store's own key when the deep link is embeddable (D-35: reusing that
  // store's identity, not inventing a sixth one) -- only an unresolved/non-embeddable deep link
  // (which never reaches the embed JSX below) keeps the literal `'store-page'` label.
  //
  // Deliberately reads `LOGIN_PATHNAMES` directly rather than calling `isLoginPathname(pathname)`
  // a second time here: plan 40-01's inverted structural gate
  // (`WebviewUnavailablePanel.test.tsx`) anchors on the FIRST occurrence of the literal substring
  // `isLoginPathname(pathname)` in this file to locate the real login arm's `if (` -- a second,
  // earlier occurrence of that exact call shape (even one that means something different) would
  // make the gate extract the wrong block as "the login arm" and fail for a reason that has
  // nothing to do with an actual regression.
  const storeKey =
    store ??
    (pathname === '/wiki' ? 'wiki' : (deepLinkConfig?.key ?? 'store-page'))
  const isStoreRoute =
    !LOGIN_PATHNAMES.includes(pathname) && runner !== 'humble'
  // CR-02 (quick task 260929-qth): deliberately placed AFTER `isStoreRoute` above, not
  // immediately below `storeKey`'s own declaration -- `WebViewDeepLinkAndRestore.test.ts` extracts
  // the RAW source slice between the `isStorePageDeepLink` and `isStoreRoute` markers above and
  // compiles it standalone with no `useState`/`useCallback` in scope, to prove
  // the real D-34/D-35 deep-link logic against the real `resolveStoreForUrl`. A `useState`/
  // `useCallback` call inside that slice would break that harness for a reason unrelated to any
  // actual regression in either the deep-link logic or this fix.
  //
  // The slot div currently attached, or null while this route renders none. Set on EVERY attach
  // AND detach, so its identity follows the element: `useStoreEmbedHost` keys its open/bounds
  // effect on it, which is what makes that effect (a) re-arm once when a slot arrives late -- a
  // cold start on `/store/epic` (or any route that takes one of the early returns below) renders
  // no slot div on the first render at all (CR-02) -- and (b) re-arm again when the slot is
  // REPLACED by a new element while this component stays mounted. (b) is the Linux dead-resize
  // fix: `store/:store` is one route, so GOG -> Epic -> GOG does not remount `WebView`; the Epic
  // early return unmounts the slot and the return mounts a new one. The previous one-way
  // "a slot has attached" latch never lowered, so the hook's ResizeObserver and window listeners
  // stayed bound to the DETACHED element (rect all zero) and the embed never followed a window
  // resize again. A same-store URL change does not change the element, so plan 40-11's
  // "same-store URL changes must never re-create the observer" property is preserved.
  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null)
  // Deliberately stable (empty deps) so React does not detach and re-attach this callback on
  // every render -- an unstable ref identity would itself null and re-set `slotNode` on every
  // re-render, re-creating the hook's observer each time.
  const slotCallbackRef = useCallback((node: HTMLDivElement | null) => {
    setSlotNode(node)
  }, [])
  // Phase 50 Plan 05 (D-04, D-16): the resolved four-value Epic sign-in state, reached through
  // the shared rule table (`src/common/signInState.ts`) rather than an inlined flag comparison
  // -- its branch order is load-bearing (Phase 49 D-06/D-07). Matches the argument shape
  // `GlobalState.tsx` and `LibrarySignInNotice/index.tsx` already use for their own
  // `collectSignInInputs(...)` call sites. Never a cookie (Phase 40 D-16).
  const signInInputs = collectSignInInputs(
    {
      epicUsername: epic.username,
      gogUsername: gog.username,
      amazonUserId: amazon.user_id,
      humbleLoggedIn: humble?.isLoggedIn,
      humbleExpired: humble?.expired,
      steamUsername: steam?.username
    },
    signInProbeOutcomes
  )
  const signInState = resolveSignInState(signInInputs.legendary)
  // Quick 261030-qqh / 261030-ts4: leaving the Steam, Epic, GOG or Amazon store after an armed
  // page runs that runner's scoped library refresh, behind sign-in and in-flight gates.
  const onStoreExit = (exited: StoreExitStoreKey) => {
    const row = STORE_EXIT_ROWS[exited]
    runStoreExitRefresh(exited, {
      signInState: resolveSignInState(signInInputs[row.signInKey]),
      refreshInFlight: refreshing || refreshingByRunner?.[row.runner] === true,
      refreshLibrary: () =>
        refreshLibrary({ library: row.runner, origin: row.origin }),
      log: (line) => window.api.logInfo(line)
    })
  }
  const embedHost = useStoreEmbedHost({
    slotNode,
    startUrl,
    storeKey,
    isStoreRoute,
    platform,
    signInState,
    onStoreExit
  })
  const embedSuppressed = useStoreEmbedSuppressed()

  // Phase 50 Plan 05 (D-05/D-19): on macOS the raw Rust-managed Epic subview (`macos_epic_embed`,
  // D-02) is a SEPARATE native layer from the Tauri-managed embed this slot div otherwise hosts --
  // it is positioned by Rust directly and never passes through `useStoreEmbedSuppressed()`'s own
  // show/hide bookkeeping, so the placeholder's existing `embedSuppressed` condition alone would
  // leave this slot visibly empty under the raw subview whenever it has not yet painted. Widening
  // to "epic surface, always" (below, at the final return) treats that surface the same way a
  // not-yet-attached slot already is.
  const isEpicSurface = storeKey === 'epic' && platform === 'darwin'

  // D-14: `embedHost.launcherSchemeBlockedAt` is a fresh, distinct value per NEW blocked attempt
  // (never on the first-ever drain -- see `useStoreEmbedHost.ts`'s own baseline-tracking effect),
  // and stays `null` until the first one fires. This effect's only job is translating "a fresh
  // identity arrived" into one visible notice; `EpicLauncherBlockedNotice`'s own auto-dismiss timer
  // (not this effect) is what flips `launcherNoticeVisible` back to `false` again.
  const lastLauncherNoticeAtRef = useRef<number | null>(null)
  const [launcherNoticeVisible, setLauncherNoticeVisible] = useState(false)
  useEffect(() => {
    const at = embedHost.launcherSchemeBlockedAt
    if (at === null || at === lastLauncherNoticeAtRef.current) return
    lastLauncherNoticeAtRef.current = at
    setLauncherNoticeVisible(true)
  }, [embedHost.launcherSchemeBlockedAt])

  // Phase 50 Plan 05 (T-50-12): one shared callback, reused by both StoreEmbedControls' and
  // StoreEmbedTimeoutBanner's "Open in browser" affordance, rather than a second real external-
  // open call-site literal -- keeps this file's single-chokepoint grep count (D-19) unchanged.
  const openEmbedInBrowser = useCallback(() => {
    window.api.openExternalUrl(embedHost.currentUrl)
  }, [embedHost.currentUrl])

  useEffect(() => {
    if (pathname !== '/loginweb/nile') return
    // Quick task 260806-teb Task 1 / Phase 35 plan 17: this effect used to load Amazon
    // login data for the Electron `<webview>` amazon flow (`urls['/loginweb/nile']` feeds
    // the `<webview>` `src`; `handleAmazonLogin` is reached via the webview
    // event-listener effect). That flow no longer exists -- Tauri is the only shell, the
    // render always returns `<TauriLoginPanel>` first, and `useTauriOAuthLogin.ts`'s own
    // `getAmazonLoginData()` call is the single remaining owner of that fetch.
    //
    // Do NOT "restore" the deleted body -- not even unconditionally. This effect's own
    // `nile auth --login --non-interactive` spawn is the exact ~12.8s-per-call cost quick
    // task 260806-teb measured and fixed by preventing a SECOND, redundant spawn racing
    // `useTauriOAuthLogin.ts`'s own call (pyinstaller-onefile-spawn-tax). Re-adding a call
    // here -- guarded or not -- reintroduces that double-spawn.
    //
    // Phase 40 Plan 01 (D-09): the Model A `<webview>` this comment refers to is now fully
    // deleted (not merely dead) -- `handleAmazonLogin`, `amazonLoginData`, and every webview
    // event-listener effect are gone from this file. This effect itself stays as the
    // historical record of why no fetch belongs here.
  }, [pathname])

  const handleSuccessfulLogin = () => {
    navigate('/login')
  }

  const [showLoginWarningFor, setShowLoginWarningFor] = useState<
    null | 'epic' | 'gog' | 'amazon'
  >(null)

  useEffect(() => {
    if (
      startUrl.match(/epicgames\.com/) &&
      startUrl.indexOf('/id/login') < 0 &&
      !epic.username
    ) {
      setShowLoginWarningFor('epic')
    } else if (
      startUrl.match(/gog\.com/) &&
      !startUrl.match(/auth\.gog\.com/) &&
      !gog.username
    ) {
      setShowLoginWarningFor('gog')
    } else if (startUrl.match(/gaming\.amazon\.com/) && !amazon.user_id) {
      setShowLoginWarningFor('amazon')
    } else {
      setShowLoginWarningFor(null)
    }
  }, [startUrl])

  const onLoginWarningClosed = () => {
    setShowLoginWarningFor(null)
  }

  // D-32 GAP DECLARED (T-40-09-06, "logged, never silent" -- REPLACES the removed
  // showAdtractionWarning/dontShowAdtractionWarning state and its already-deleted Dialog, plan
  // 40-01): the retired Electron adtraction detection was a MAIN-FRAME `did-fail-load` listener
  // matching `track.adtraction.com`'s failed URL and reading the redirect target out of THAT
  // URL's own query string -- correcting this plan's own D-32 caveat text, it was never a
  // subresource detector. The real obstacle is that no re-derivable equivalent exists under
  // wry/tauri on macOS: `40-EMBED-API-VERIFICATION.md` Q3's verdict is ABSENT -- no
  // navigation-failure callback exists anywhere in the wry->tauri chain (the full vendored
  // `wry-0.55.1` `WKNavigationDelegate` impl implements no `didFail*` method at all).
  //
  // The fallback this task considered -- arm a deadline from `on_navigation` when it sees a
  // main-frame navigation to the tracker host, disarm it from `on_page_load`'s next main-frame
  // Started event -- cannot be built either: `store_embed_open`'s own `.on_navigation(` closure
  // (`main.rs`, D-29) takes only a bare URL, no frame-type flag, so arming could not be
  // RESTRICTED to main-frame-shaped navigations. This project already established that exact
  // limitation for the SAME hook (`main.rs`'s `on_document_title_changed` arm, citing spike 013:
  // "5 of 8 `on_navigation` events [are] third-party iframes, the callback carries no frame-type
  // flag to filter them"). Arming on it anyway would let a third-party ad subframe re-arm the
  // deadline indefinitely -- precisely the defect the 013-015 on_page_load-vs-on_navigation rule
  // exists to prevent. See `.planning/todos/pending/` for the filed todo carrying this citation.
  //
  // Gated on `store === 'gog'` -- the only store the retired handler ever applied to (GOG's
  // affiliate start URL is the one that redirects through `track.adtraction.com`) -- so this
  // line fires once per GOG store visit rather than on every route.
  useEffect(() => {
    if (store !== 'gog') return
    window.api.logInfo(
      '[WebView] D-32 gap: adtraction/ad-block detection is not implemented under the Tauri ' +
        'embed -- no navigation-failure signal exists (40-EMBED-API-VERIFICATION.md Q3: ABSENT) ' +
        'and on_navigation carries no frame-type flag to safely arm a fallback -- see ' +
        '.planning/todos/pending/ for the filed citation'
    )
  }, [store])

  // DEEP LINK ESCAPE HATCH (D-34, T-40-09-02): fires the SAME external-open call
  // `WebviewUnavailablePanel`'s own button uses, automatically, the moment a store-page deep
  // link resolves to something this app does not embed -- the user should not have to notice a
  // panel and click a button just to reach a store this app never intended to load into a native
  // webview. The panel still renders below (render branch, near the platform gate) as the
  // fallback in case the automatic open is blocked or the user wants to retry it. Called
  // unconditionally (rules of hooks); the effect body itself is the guard.
  useEffect(() => {
    if (!deepLinkShouldOpenExternally || !deepLinkUrl) return
    window.api.openExternalUrl(deepLinkUrl)
  }, [deepLinkShouldOpenExternally, deepLinkUrl])

  // Phase 40 Plan 01 (D-09/D-10): Task 2 deletes this file's entire Model A render --
  // the `<webview>` element, `WebviewControls`, the `UpdateComponent` loading indicator, and
  // the `LoginWarning` render -- but explicitly does NOT delete the state/effects/handlers
  // above (`handleSuccessfulLogin`, `showLoginWarningFor` and its effect,
  // `onLoginWarningClosed`) per 40-01-PLAN.md's own "Do NOT delete" list: they are Model B
  // / route logic re-consumed when plan 40-07 rebuilds this chrome around the new embed
  // slot (D-24), not ported fresh. That leaves them with no reader in THIS plan's render --
  // referenced here only to keep them alive for the linter during that interim window.
  //
  // Phase 40 Plan 09 (D-32): the adtraction `Dialog` this comment used to name was already gone
  // (deleted by plan 40-01 along with the rest of Model A) -- only its orphaned
  // `showAdtractionWarning`/`dontShowAdtractionWarning` state and their `void` refs survived
  // here. D-32's own escape clause requires removing state a declared-absent detection can never
  // set rather than leaving it "kept for later" indefinitely -- see the D-32 gap-declaration
  // comment above (near this file's `store === 'gog'` effect) for why no detection ships.
  void handleSuccessfulLogin
  void showLoginWarningFor
  void onLoginWarningClosed

  // Quick task 260821-iri: Humble's login surface (state, watch, webview,
  // navigation relay) now lives entirely in HumbleLoginSurface.tsx, hosted
  // by the Login screen's own co-mounted `HumbleLogin` overlay. This route
  // stays alive, unchanged in URL, for `HumbleExpiryToast` and
  // `Humble/Keys`, which still navigate here directly. Placed AFTER every
  // hook above (rules of hooks) and BEFORE the login-pathname branch below.
  if (runner === 'humble') {
    return (
      <HumbleLoginSurface
        onDone={() => navigate('/login')}
        onCancelled={() => navigate('/login')}
      />
    )
  }

  if (isLoginPathname(pathname)) {
    // D-06 (REQ-34.4.1-07/-08): Phase 34.4.1 shipped a real Rust
    // login-window seam, so the old blanket "not available on this
    // build" message here would now be a lie for login routes. They
    // drive TauriLoginPanel instead: Humble gets an honest in-progress
    // surface, and the four OAuth runners get a declared-blocked one
    // naming the exact backend channel and Phase 34.5.
    //
    // Phase 40 Plan 01 (D-09): this used to be one arm of a
    // `!webviewPreloadPath` guard shared with the store/wiki arm below.
    // That guard is now fully retired -- `getWebviewPreloadPath`
    // (`backend/sidecar/appShellFlowRegistration.ts`, D-12) is untouched by
    // this plan and still returns a declared-empty string under Tauri, but
    // nothing in this file reads it any longer. Both arms are unconditional
    // now, split solely on `isLoginPathname(pathname)`.
    return <TauriLoginPanel runner={runner} state={oauthLoginState} />
  }

  // Phase 40 Plan 08 (D-01/D-02/D-24): logged unconditionally, before the platform gate below,
  // so this line stays the store/wiki arm's own unconditional first statement -- plan 40-01's
  // inverted structural gate (`WebviewUnavailablePanel.test.tsx`) asserts nothing guards this
  // arm ahead of it. On macOS, Linux and Windows this is the embed's mount log; on any other
  // platform value it reads exactly as plan 40-01 left it (D-05's deferral note), which is why
  // the message and its meaning both still hold true for the fallback branch immediately below.
  window.api.logInfo(
    `[WebView] store/wiki route pathname=${pathname} startUrl=${startUrl}`
  )

  // DEEP LINK ESCAPE HATCH render (D-34, T-40-09-02): checked BEFORE the platform gate below
  // because it applies on every platform, not only non-macOS -- a deep link to an unconfigured
  // origin is never embedded regardless of what this shell can otherwise embed. Reuses
  // `WebviewUnavailablePanel`'s existing external-open button/call shape rather than a new
  // surface (its "Open in browser" button is the same `window.api.openExternalUrl` call the
  // effect above already fired automatically) -- this keeps the user off a blank screen even if
  // the automatic open above was blocked, without introducing a second escape-hatch component.
  // It passes the origin reason so a supported OS is never told its platform is the cause.
  if (deepLinkShouldOpenExternally) {
    return (
      <WebviewUnavailablePanel url={deepLinkUrl ?? undefined} reason="origin" />
    )
  }

  // D-01/D-02: the live embed runs on macOS, Linux and Windows (Linux per the positioning todo's
  // 2026-09-28 decision (a): a real GTK-box-native embed rather than none; Windows per quick
  // 261012-f25: WebView2 `add_child` through the macOS positioning path, spike 027). Reuses
  // `platform` from `ContextProvider` (the same source `App.tsx`'s own `isMac` check reads)
  // rather than `process.platform` or `navigator.platform` -- both are wrong here: `process` is
  // Node/main-process-only, and `navigator.platform` under WKWebView doesn't reflect the actual
  // host OS this app runs on (`tauri-chromium-only-web-apis` project gotcha).
  // `src/preload/tauriAttach.ts` only ever assigns 'darwin' | 'win32' | 'linux' to
  // `window.platform`, so under the shipped preload this branch is a defensive fallback, reached
  // only by ContextProvider's 'unknown' default or a future platform value. It is kept so a
  // platform the shell cannot embed on gets the `WebviewUnavailablePanel` (reworded by plan
  // 40-10 (D-02) to name the platform reason) rather than a dead slot.
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    window.api.logInfo(
      `[WebView] platform=${platform}: in-app store/wiki browsing is macOS, Linux and Windows only (D-02)`
    )
    return <WebviewUnavailablePanel url={startUrl} reason="platform" />
  }

  // Phase 40 Plan 10 (D-05/D-08, REQ-40-12), narrowed by Phase 50 Plan 01: `/store/epic` is
  // scoped OUT of the Tauri-managed child-webview embed below, on every platform. Spike 024
  // (`.planning/spikes/024-epic-store-in-embedded-child-webview/README.md`) measured across many
  // runs that the gate is webview-construction-specific -- Tauri's managed child webview is
  // Cloudflare-Turnstile-challenged every time, while a raw `WKWebView` (even attached inside the
  // same main window) is never challenged. Decided 2026-10-12 (quick 261012-d5g, D-05 Option A):
  // macOS gets a Rust-managed raw `WKWebView` subview instead (`macos_epic_embed.rs`, owned by
  // Phase 50), so on `darwin` this guard steps aside and lets `/store/epic` fall through to
  // `store_embed_open`'s existing macOS routing rather than returning the unavailable panel.
  // Every other platform has no such surface yet and keeps the original scope-out. The Epic tile
  // stays on the Stores panel either way (D-08, `NavShell/components/StoresPanel/index.tsx`).
  if (store === 'epic' && platform !== 'darwin') {
    window.api.logInfo(
      `[WebView] store=epic, platform=${platform}: /store/epic is scoped out of the Tauri-managed embed on this platform (D-05)`
    )
    return <WebviewUnavailablePanel url={startUrl} reason="epic" />
  }

  // D-24: the chrome renders ABOVE the slot, so the slot's rect is measured below (and never
  // includes) the chrome -- this is what keeps `useStoreEmbedHost`'s bounds arithmetic trivial
  // and is why NavShell needs no changes for this plan. The slot itself renders no children of
  // its own beyond `StoreEmbedSlotContents`, which picks exactly ONE of the placeholder (D-19) or,
  // on a challenged Epic surface, the `'epic-challenged'` unavailable panel (Phase 50 Plan 05,
  // D-10/D-11; review finding 6 -- stacked after the full-height placeholder, the panel sat
  // below the slot's visible rect): the native subview
  // composites over anything else drawn inside, so a non-exempt child would either be invisibly
  // covered or covered while still being hit-tested (this project's own WKWebView paint-vs-hit-test
  // gotcha) -- `'epic-challenged'` is the one exception because Rust hides the raw subview itself
  // whenever `challenged` is true, so there is nothing left compositing over it at that moment.
  return (
    <div className="WebView WebView__embedContainer">
      <StoreEmbedControls
        url={embedHost.currentUrl}
        backAvailable={embedHost.canGoBack}
        forwardAvailable={embedHost.canGoForward}
        onBack={embedHost.onBack}
        onForward={embedHost.onForward}
        onReload={embedHost.onReload}
        onOpenInBrowser={openEmbedInBrowser}
      />
      <StoreEmbedTimeoutBanner
        timedOut={embedHost.loadTimedOut}
        onReload={embedHost.onReload}
        onOpenInBrowser={openEmbedInBrowser}
      />
      <EpicLauncherBlockedNotice
        visible={launcherNoticeVisible}
        attemptKey={embedHost.launcherSchemeBlockedAt}
        onDismissed={() => setLauncherNoticeVisible(false)}
      />
      <div className="WebView__embedSlot" ref={slotCallbackRef}>
        <StoreEmbedSlotContents
          suppressed={embedSuppressed}
          isEpicSurface={isEpicSurface}
          challenged={embedHost.challenged}
          url={embedHost.currentUrl}
          onTryAgain={embedHost.onTryAgain}
        />
      </div>
    </div>
  )
}
