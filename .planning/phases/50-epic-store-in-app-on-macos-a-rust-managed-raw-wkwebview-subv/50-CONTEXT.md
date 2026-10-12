# Phase 50: Epic store in-app on macOS: a Rust-managed raw WKWebView subview for /store/epic - Context

**Gathered:** 2026-10-12
**Status:** Ready for planning

<domain>
## Phase Boundary

On macOS, `/store/epic` renders the real Epic Games Store inside the Stores tab through a
Rust-owned raw `WKWebView` (configuration built by hand, no `WebviewBuilder`, no init scripts, no
message or scheme handlers) added as a subview of the main `NSWindow`'s content view at the embed
slot's rect — the construction spike 024 found is served (0 of 22 Epic arms challenged, runs
17–27). It inherits the existing embed contract: the React slot is the single geometry owner,
`StoreEmbedControls` is the chrome, the `store_embed_navigation_policy` scheme allow-list and the
`resolveStoreForUrl` origin gate still bound what the surface may load, overlays hide it through
the Phase 40 suppression hook, and the Steam embed stays the positive control. New in this phase:
a 45 s load timeout with a reload affordance, Cloudflare-challenge detection falling back to the
panel, and the `/store/epic` guard becoming darwin-only. Windows and Linux keep
`WebviewUnavailablePanel reason="epic"`.

The ROADMAP `### Phase 50` entry is the canonical scope statement (ships / does-not-ship / live
gate arms / do-not-re-derive). Its four locked sub-decisions from the D-05 call are inputs here,
not gray areas, and are listed under "Locked inputs" below so no agent re-opens them.

</domain>

<decisions>
## Implementation Decisions

### Locked inputs (from the D-05 call, quick `261012-d5g` — do not re-open)

- **L-1 Sign in button:** no interception, no DOM hiding. The live gate measures Epic's own Sign
  in in place; a hand-off to the pristine login window becomes a task of this phase ONLY if that
  arm is challenged or 403s — and then it is a native `WKNavigationDelegate` decision, not JS.
- **L-2 Platform:** macOS only. `#[cfg(target_os = "macos")]` on every Rust piece. (The rationale
  recorded in the ROADMAP — "Windows has no Stores-tab embed at all" — is stale since quick
  `261012-f25` shipped the Windows embed on WebView2; the scope is unchanged because the raw
  `WKWebView` subview is macOS code. See Deferred Ideas.)
- **L-3 Jar:** the shared default `WKWebsiteDataStore` (`defaultDataStore()`); never
  `nonPersistentDataStore()`, never `data_store_identifier`. The live gate MUST carry a warm,
  signed-in-jar arm because the spike measured a cold jar only.
- **L-4 Challenge reputation:** accepted, unquantified. No Chrome UA spoof — the subview sends
  WKWebView's default UA (no `Version/`/`Safari/` token), exactly what runs 12–27 measured. Do NOT
  apply `STORE_EMBED_USER_AGENT` to this surface.
- **Construction:** `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs`
  `pristine_create` (in-main arm) is the reference; the shipped
  `open_pristine_epic_login_window` + `EpicPristineNavDelegate` in `src-tauri/src/main.rs` is the
  in-repo precedent for the delegate class and the main-thread marshalling.

### Subview lifetime

- **D-01: Keep the subview alive and hidden when the user leaves the Stores tab; close it only
  at app teardown.** Phase 40 D-21 parity with the Steam/GOG embed: `hide()` on route leave,
  `show()` on return, page state and scroll intact, return instant. A cold Epic load is 10–40 s
  (spike: 11 of 16 rendered by 40 s) so re-loading on every return was rejected. The ROADMAP's
  sentence "teardown when the Stores tab unmounts — no subview may outlive its route" is
  superseded by this call: the invariant becomes *no subview outlives the app, and a hidden
  subview is never visible or hit-testable*. The first plan records this amendment against the
  ROADMAP entry through the roadmap tooling (no hand edit).
- **D-02: One lifecycle rule for store switches.** Epic → Steam → Epic inside the tab hides the
  Epic subview while the Tauri embed shows, and shows it again on return; it is not closed. The
  two surfaces are never visible at once.
- **D-03: Restore the last Epic URL across app restarts**, the same `last-url-<store>` restore the
  other stores use (Phase 40 D-30), validated by the D-31 real-origin parse so only
  `epicgames.com` hosts restore. Note the reload-loop regression pinned in
  `src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx` — the Epic path must go
  through the same validated restore, never re-derive `startUrl` per render.
- **D-04: Reload on show when GameLib's own Epic auth state changed since the page loaded.** The
  jar is shared, so a sign-in through Manage Accounts (the pristine login window) or a sign-out
  leaves the hidden store page showing the stale header. Key the reload on GameLib's Epic
  logged-in / expired state (the Phase 49 selector inputs — the legendary logged-in flag and the
  Epic `expired` flag), never on parsing jar cookies (Phase 40 D-16). One reload, only when the
  state actually flipped; a plain show with no auth change reloads nothing.

### Slow-load timeout

- **D-05: 45 s.** One named constant. The timer runs from the main-frame navigation start
  (`didStartProvisionalNavigation`) until `didFinishNavigation` / `didFailNavigation` for the
  main frame; it resets on every main-frame navigation the subview starts. 45 s matches the
  project's existing bound idiom (Phase 49 D-01) and clears nearly every observed healthy cold
  load while surfacing the #9 stall well before the 120 s the spike sampled at.
- **D-06: The subview is transparent over the existing placeholder until Epic paints.** Set the
  `WKWebView` non-opaque (`drawsBackground` off via `setValue:forKey:`) so the styled
  `StoreEmbedPlaceholder` shows through the slot; no "first paint" signal is needed and nothing
  flashes white in dark themes. The placeholder therefore has to render *under* a visible subview
  as well as while hidden (D-19 today shows it only while hidden) — the planner decides how.
- **D-07: On timeout, a banner row under `StoreEmbedControls`** — "Epic is taking a while to
  load — Reload · Open in browser". The subview stays visible so a late paint still lands and
  nothing is torn down; the banner clears on the next main-frame finish. Reload re-issues the
  current URL; Open in browser uses the existing external-open path.
- **D-08: No silent retry.** One timer, one banner. The stall stays visible to the user and in
  the log; the gate can measure it.

### Challenge fallback

- **D-09: "Challenged" means the main-frame response carries Cloudflare's `cf-mitigated:
  challenge` header**, read in `decidePolicyForNavigationResponse` for the main frame only. A
  Turnstile widget inside Epic's own sign-in form is a subframe and never trips it. The gate's
  challenged arm (if one occurs) must capture the main-frame response headers to confirm the
  header is present on Epic's interstitial; keep a main-frame host/path match
  (`challenges.cloudflare.com`, `/cdn-cgi/challenge-platform/`) as the fallback signal if it is
  absent. The signal is a response, not a request: a subframe or script load to
  `challenges.cloudflare.com` (what the spike's nav log recorded) is NOT a trigger.
- **D-10: On a challenge the subview hides and the slot shows `WebviewUnavailablePanel` with a
  new reason `'epic-challenged'`**: "Epic asked for a security check this view can't complete."
  Try again navigates the subview to the configured start URL and shows it; Open in browser is
  the existing button. Copy is new `gamelib.json` strings in all 49 catalogues (Phase 40 D-37).
- **D-11: No stickiness.** Every route entry and every Try again loads the store fresh; no
  session memory of a challenge, no backoff. Challenges were 1 of 32 raw arms and transient.

### Popups, JS dialogs and foreign schemes

- **D-12: Popups go to the system browser through the existing hand-off throttle.** The
  `WKUIDelegate` `createWebViewWithConfiguration:` hook returns `None` and hands the request URL
  to the OS browser, admitted by `store_embed_handoff_admitted(&STORE_EMBED_POPUP_THROTTLE)` (the
  Tauri embed's 2 s gap). Never a second window inside GameLib; the pristine login window's
  navigate-in-place popup behaviour is a login-seam rule and does not apply here.
- **D-13: `alert` / `confirm` / `prompt` use the shipped native helpers**
  (`present_native_js_alert` / `_confirm` / `_prompt` in `src-tauri/src/main.rs`), modal to the
  main window. One code path for both raw WKWebViews.
- **D-14: `com.epicgames.launcher://` is blocked by the scheme allow-list and the user gets one
  toast** — "Install from your Library instead — this view can't open the Epic Games Launcher."
  Logged once per navigation attempt. Mapping those links onto GameLib's own Epic install is a
  new capability (Deferred Ideas). All other disallowed schemes keep the Tauri embed's behaviour.

### Claude's Discretion

- **Back / forward / URL reporting.** The raw `WKWebView` exposes `goBack` / `goForward` /
  `canGoBack` / `canGoForward` and `URL` with zero page-side injection, so native history is
  preferred over Phase 40 D-22's Rust-side URL stack; D-22's reasons (APIs the spikes proved; no
  injection) are both satisfied by the native API. URL/nav-state reporting may reuse the
  `StoreEmbedState` pending-nav-events ring and `take_nav_events` polling the renderer already
  drains, or a sibling of it.
- **IPC shape.** Whether the subview is driven through the existing `store_embed_*` arms with a
  surface discriminator or through a parallel `epic_embed_*` set. Either way `useStoreEmbedHost`
  (or a thin sibling) must be the ONLY bounds writer, and the rect it sends is the zoom-scaled
  logical rect `storeEmbedZoom.ts` already produces (quick `261012-gn8`).
- **Rust module placement.** `src-tauri/src/main.rs` is ~19k lines; a new `#[cfg(target_os =
  "macos")]` module file is reasonable. All objc2 work on the main thread via the channel
  pattern `open_pristine_epic_login_window` uses; `ns_window()` hands back an autoreleased
  pointer and must be resolved on the main thread.
- **Timer while hidden.** Whether the 45 s timer pauses or keeps running when the subview is
  hidden mid-load, and what the banner shows on return.
- **`embeddable` flag.** How the epic entry in `storeEmbedOrigins.ts` becomes platform-aware so
  the deep-link and last-URL restore paths route Epic URLs into this surface on darwin only. The
  Trap recorded in the folded sign-in todo holds: the flag and the `store === 'epic'` guard move
  together, deliberately, and the inverted structural test in `WebviewUnavailablePanel.test.tsx`
  is re-derived, not deleted.
- **Cargo features.** Which additional `objc2-web-kit` features the delegate needs
  (`WKNavigationResponse`, `WKBackForwardList`, …) — add the minimum, keep
  `default-features = false` (T-34.4.1-SC).
- **Evidence capture shape for the live gate** within the roadmap's minimum arms, following the
  `live-gate-contract-authoring` reference (append-and-archive, per-launch delimiters).

### Folded Todos

- **`.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md`**
  — "Epic's in-embed Sign in button has no decided behaviour." Original problem: three options
  (intercept and hand off / fail visibly / hide) for a surface no user could open. Re-triaged by
  `261012-d5g` to `ready: live-gate`, `blocked_by: Phase 50's live gate`. In this phase: L-1 is
  the rule; the Sign in arm of the live gate closes this todo with `resolves_phase:` on pass; on
  a challenge or 403 the hand-off becomes a task and the todo stays open with the measurement.
  The todo's "Trap for whoever un-gates Epic" section is a planning input (see Discretion).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and the decision record

- `.planning/ROADMAP.md` § `### Phase 50` — canonical scope: ships, locked sub-decisions, live
  gate arms, does-not-ship, do-not-re-derive. D-01 above amends its "teardown when the Stores
  tab unmounts" sentence.
- `.planning/todos/completed/2026-10-12-make-the-d-05-call-epic-store-embed-as-a-rust-managed-raw-wkwebview-subview.md`
  — the D-05 call, Options A/B/C reasoning, the four locked sub-decisions, and the correction
  that the login-seam window is not a no-code browsing path.
- `.planning/todos/pending/2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour.md`
  — folded; the Sign in rule, the Trap (guard and flag move together), and the Talon-403 /
  Turnstile distinction (login-scoped vs store-scoped).

### Measurements this phase stands on (do not re-derive)

- `.planning/spikes/024-epic-store-in-embedded-child-webview/README.md` § `## What IS
  established` #6–#9 — raw WKWebView served (#6), attachment not the trigger (#7), blank =
  occluded window (#8), mid-parse stall = stopped document stream → timeout + reload (#9); and
  § `## Consequence for /store/epic` (the decided note).
- `.planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs` — `pristine_create`
  (lines ~294–360): `WKWebViewConfiguration::new`, `addSubview`, autoresizing mask, `loadRequest`;
  the in-main (`SPIKE_PRISTINE_INMAIN`) arm is the construction to port. Its
  `nonPersistentDataStore()` is the one deliberate difference from L-3.
- `.planning/spikes/024-epic-store-in-embedded-child-webview/app/Cargo.toml` — the
  `objc2-foundation` / `objc2-app-kit` / `objc2-web-kit` pins and `default-features = false`
  feature lists that already resolve in the shared target dir.

### The embed contract this subview joins

- `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-CONTEXT.md`
  — D-14 (shared jar), D-16 (auth from GameLib state, never cookies), D-18/D-19/D-20 (hide on
  any overlay, placeholder, ref-counted suppression hook), D-21 (hide on leave, close at exit),
  D-22/D-23/D-24 (chrome rebuilt, host-only display, bar above the slot), D-30/D-31 (validated
  last-URL restore), D-34/D-35 (deep links resolve to a configured store), D-37 (`gamelib.json`).
- `Skill("spike-findings-gamelib")` → `references/tauri-embedded-store-browser.md` — renderer is
  the only geometry owner; overlays cannot paint above a native subview; one jar per process —
  and `references/live-gate-contract-authoring.md` for the gate's capture standard.
- `Skill("gamelib-conventions")` — `<verify>` formatter check, UAT item shape, todo frontmatter
  for the folded todo's closure, fake-HOME isolation if the gate spawns anything.
- `.planning/todos/pending/2026-10-11-stores-tab-embed-not-implemented-on-windows.md` — the
  Windows embed (WebView2, `261012-f25`/`gn8`, W1–W8 PASS); reviewed, not folded — context for
  L-2's stale rationale and the Deferred Idea.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src-tauri/src/main.rs` `open_pristine_epic_login_window` (~L4147) and `EpicPristineNavDelegate`
  (`define_class!`, ~L3923): the shipped raw-`WKWebView` construction, a `WKNavigationDelegate` +
  `WKUIDelegate` implementation (`decidePolicyForNavigationAction`, `createWebView…`, JS dialog
  hooks), the leaked-delegate rationale, and the worker-blocks-on-channel / main-thread-does-objc2
  marshalling. `present_native_js_alert` / `_confirm` / `_prompt` (~L4093–4135) are D-13.
- `src-tauri/src/main.rs` `store_embed_navigation_policy` (~L6373), `store_embed_is_valve_host`,
  the `HandoffThrottle` statics `STORE_EMBED_STEAM_THROTTLE` / `STORE_EMBED_POPUP_THROTTLE` and
  `store_embed_handoff_admitted` (~L6423–6470): the scheme allow-list, Steam hand-off and popup
  throttle the subview must share (D-12).
- `src-tauri/src/main.rs` `StoreEmbedState` (~L6137), `STORE_EMBED_NAV_EVENTS_CAP`,
  `store_embed_nav_state_json`, `take_nav_events`: the capped nav-event ring the renderer polls.
- `src/frontend/screens/WebView/useStoreEmbedHost.ts`: the single geometry oracle
  (`ResizeObserver` + `getBoundingClientRect`, ~40 ms debounce), `NAV_POLL_INTERVAL_MS` drain,
  start-URL effect, and the zoom-scaled rect via `storeEmbedZoom.ts` (`readWebviewZoomFactor`,
  `scaleRectForZoom`).
- `src/frontend/components/UI/StoreEmbedControls/index.tsx`: `url`, `onBack`, `onForward`,
  `onReload`, `onOpenInBrowser`; host-only display (D-23). The D-07 banner sits under it.
- `src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx` (D-06 shows through it) and
  `WebviewUnavailablePanel.tsx` (`reason: 'platform' | 'epic'` union gains `'epic-challenged'`).
- `src/frontend/screens/WebView/storeEmbedOrigins.ts`: the epic entry (`embeddable: false`),
  `resolveStoreForUrl`, `isEmbeddableOrigin`.
- Phase 49's sign-in state selector in `src/common` (D-06 there) — the auth input for D-04.

### Established Patterns

- **Zero page-side JS injection** on any store surface (Phase 40 D-22 hard rule from the Talon
  root cause); all behaviour is native delegate work.
- **Renderer is the sole bounds owner**; a second writer silently last-write-wins (spike 017).
- **Hide on any overlay** through the ref-counted suppression hook (D-18/D-20); the subview is a
  native view above the whole web layer.
- **Declared-dead returns are logged, never silent** (34.3 D-08 / 34.4 D-04): the Windows/Linux
  arms of any new Rust channel return a named `unsupported-platform` error.
- **Fork-owned strings** in `gamelib.json` only, all 49 catalogues with `gamelib.mt.json` stamps
  (`48-01-PLAN.md` is the worked example); no gate catches an absent key.
- **Live gate over green suite** — every WKWebView divergence on this project was found by a human
  driving the UI; Jest cannot see a native subview.

### Integration Points

- `src/frontend/screens/WebView/index.tsx` ~L574 `if (store === 'epic')` guard → darwin-only;
  ~L522 platform gate unchanged; the deep-link (`resolveStoreForUrl(...).embeddable`) and
  last-URL restore paths route Epic on darwin.
- `src-tauri/src/main.rs` `dispatch_rust_channel` (~L7260): new or extended arms; `src-tauri/
  Cargo.toml` `[target.'cfg(target_os = "macos")'.dependencies]` for any added `objc2-web-kit`
  features.
- `src/preload` / `src/common/types` channel typing for whatever the IPC shape is.
- `public/locales/*/gamelib.json` × 49 for the banner, toast and `'epic-challenged'` copy.
- The phase's `50-UAT.md` with the roadmap's minimum arms (cold jar; warm signed-in jar; Sign in;
  occlusion recovery; timeout → reload; back/forward/URL parity with GOG; Steam positive control)
  in the `gamelib-conventions` item shape.

</code_context>

<specifics>
## Specific Ideas

- The Steam embed is the positive control in every live-gate session; an Epic arm with no Steam
  render alongside proves nothing (spike 024 method note).
- Challenge detection is a *response* property (`cf-mitigated`), not a request to a Cloudflare
  host — the spike's nav log recorded the request form, which would false-positive on Epic's own
  sign-in widget.
- The 45 s timer and the Phase 49 probe bound are the same idiom: one named constant, read by the
  test rather than a literal.
- "Keep it, hidden" is the user's explicit choice over the ROADMAP's teardown wording; the reason
  is the 10–40 s cold load.

</specifics>

<deferred>
## Deferred Ideas

- **Epic store on Windows via the WebView2 embed.** Quick `261012-f25` shipped the Windows Stores
  tab (WebView2 `add_child`, W1–W8 PASS) after the D-05 call was written. Whether Chromium /
  WebView2 is Turnstile-challenged on Epic is unmeasured; spike 024's discriminator was wry's
  WKWebView setup, which says nothing about WebView2. Its own spike or phase.
- **Map `com.epicgames.launcher://` Get/Install links onto GameLib's own Epic install flow** —
  a new capability; D-14 only blocks and toasts.
- **Linux** keeps the panel; a WebKitGTK raw-view equivalent is a separate question.

### Reviewed Todos (not folded)

- `.planning/todos/pending/2026-10-11-stores-tab-embed-not-implemented-on-windows.md` — the
  Windows embed is built and at `ready: live-gate` in the operator's hands; Phase 50 is macOS
  only (L-2) and leaves the file untouched.

</deferred>

---

*Phase: 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv*
*Context gathered: 2026-10-12*
