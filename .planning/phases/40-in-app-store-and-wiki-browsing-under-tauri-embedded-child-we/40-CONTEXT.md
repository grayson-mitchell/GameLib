# Phase 40: In-app store and wiki browsing under Tauri — embedded child webview - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 40 retires the Electron-era **renderer-owned `<webview>` model ("Model A")** from the
frontend entirely, and replaces the store/wiki browsing surface with a **Rust-owned Tauri child
webview ("Model B")** embedded in the existing main window via `Window::add_child`.

**Ships:** in-app browsing for `/store/gog`, `/store/amazon`, `/store/zoom`, `/store/steam`,
`/wiki`, and origin-matched `store-page?store-url=` deep links — on **macOS only** — plus the
browser chrome around them (back / forward / reload / open-in-browser / host display), the
cross-restart last-URL restore, and the adtraction detection. It deletes every remaining trace of
Model A: three `<webview>` renders, the `WebviewTag` shim and its type pin, the dead
`WebviewControls` component, and `HumbleLoginSurface`'s two dead effects.

**Does NOT ship:** `/store/epic` (scoped out — see D-05), the embed on Windows or Linux
(see D-01), or any change to the login seam.

**The architectural statement:** the codebase leaves this phase with **one** webview model, not
two. That is the deliverable, not a cleanup task appended to one.

</domain>

<decisions>
## Implementation Decisions

### Platform and shipping scope

- **D-01 — macOS only.** Every spike (016/017/018) is macOS / tauri 2.11.5 / wry 0.55.1 at
  `scale_factor` 1.0. Windows (WebView2) and Linux (webkit2gtk) child-webview behaviour is
  entirely unverified. Ship where the evidence is; do not write an untestable runtime fallback.
- **D-02 — Non-macOS keeps `WebviewUnavailablePanel`, reworded** to name the platform reason
  rather than "not available on this build". Preserves 34.4.1 **D-06**'s principle: the gap stays
  visible to *users*, not only to the roadmap.
- **D-03 — The `unstable` cargo feature is target-gated to macOS** via
  `[target.'cfg(target_os = "macos")'.dependencies]`. Windows and Linux builds never compile
  against an unstable API surface, so a future Tauri release that breaks `unstable` can only break
  the macOS leg. It is compile-time only and adds **no binary payload** — 10.8 s of recompile of
  `tauri` + `tauri-runtime-wry`, no new dependency.
- **D-04 — The Windows/Linux child-webview unknowns are filed as Phase 38 ledger items,** not as
  todos. The roadmap already names this a downstream contribution, not a dependency. Phase 38 is
  the deferred hardware/environment gate collection — it is the destination that exists for
  "needs a machine we do not have in front of us".

### Epic — scoped out, spiked alongside

- **D-05 — `/store/epic` is OUT OF SCOPE for Phase 40 and becomes its own spike.** Rationale
  (material, and it corrects the ROADMAP's framing): **a Tauri-MANAGED child webview still
  receives the injected globals.** `Window::add_child` produces a managed webview, so it inherits
  `window.isTauri`, `__TAURI_INTERNALS__`, `window.ipc` and the `__TAURI_PLUGIN_*` keys — which
  is the *confirmed, root-caused* Talon fingerprint from 2026-08-03, proven non-configurable and
  non-writable. The pristine-WKWebView escape hatch that defeated Talon was a **separate window
  with no wry webview at all**, which `add_child` cannot produce. Epic in an embed is a predicted
  failure with a known mechanism, not an open question worth spending phase budget on.
- **D-06 — The spike runs ALONGSIDE Phase 40 and does NOT block it.** Nothing in the other four
  stores depends on the Epic answer. Blocking a ready feature on it would repeat the exact
  deferral-with-no-owner failure this phase exists to correct.
- **D-07 — The spike owns the bounded live probe** of `store.epicgames.com` inside a Tauri-managed
  child webview. The confirmed 403 is on `/id/api/email/exists`, a **login** endpoint; whether
  Talon guards store browsing the same way is untested. The harness already exists at
  `.claude/skills/spike-findings-gamelib/sources/016-embedded-child-webview-basic/app/`.
- **D-08 — Epic's panel copy is provisional, not an accusation.** Wording along the lines of
  *"Epic Store browsing isn't available in-app yet"* plus the open-in-browser button. Do **not**
  assert that Epic blocks in-app browsing — that is unproven for store pages. The Epic tile stays
  in `NavShell/components/StoresPanel/index.tsx:39`; a tile leading to a working escape hatch
  beats no tile.

### Retiring Model A (the `<webview>` unwind)

- **D-09 — FULL unwind, not the minimal cut.** The census is larger than the ROADMAP states,
  because `getWebviewPreloadPath` returns a **declared-empty `''` unconditionally** under Tauri
  (D-12 of 34.4.1, `appShellFlowRegistration.ts:262-266`) and Tauri is the only shell since
  Phase 35. Therefore `!webviewPreloadPath` is *always* true and ALL of the following are dead:
  `WebView/index.tsx:548`'s `<webview>` render; the **entire `WebviewControls` component** (its
  only render site is `index.tsx:533`, inside that dead branch); `HumbleLoginSurface.tsx:186`'s
  `<webview>` render (its own guard at `:174` returns `TauriLoginPanel` first); both of
  `HumbleLoginSurface`'s `useLayoutEffect`s (`:142-160` D-17 relay, `:167-172`
  `attachHumbleLoginChromeCss`) because `webviewRef.current` is never populated; and the
  `WebviewTag` / `DidFailLoadEvent` shim itself.
- **D-09a — CORRECTION to the ROADMAP: `HumbleLoginSurface` is NOT a live consumer.** It is a
  **half-migrated file** — its return path is already Model B, but it still carries its entire
  Model-A body. The three "consumers" are better read as *the last three places Model A exists*.
- **D-10 — The unwind lands FIRST, before the embed.** Build Model B onto a clean surface. The
  panel keeps working throughout (it depends on none of the deleted code), so store routes are
  never broken, and nobody reads two webview models in `WebView/index.tsx` at once.
- **D-11 — `window.api.humbleLoginNavigated` (the D-17 force-revalidate relay): RE-CENSUS before
  deleting.** Its only renderer caller is dead, but the native Humble login seam may drive the
  same behaviour from Rust. Remove the channel only if a sweep proves zero live callers; deleting
  one the native path needs would break Humble cookie revalidation silently.
- **D-12 — Delete the `WebviewTag` assertions in
  `src/backend/platform/__tests__/types.usage.test.ts`** (`:47`, `:223`, `:259`, `:277`, `:670`).
  The test exists to prove the shim's members are load-bearing; when the shim goes, so does its
  reason to exist.
- **D-13 — The retirement gets a mechanical predicate gate** that fails if `<webview>`,
  `WebviewTag`, or `webviewPreloadPath` reappears in the frontend. **It MUST be mutation-proven in
  both directions** — a gate that cannot fail proves nothing, and a gate whose vocabulary is too
  broad convicts correct code. Measure its vocabulary before building it.

### Cookie jar and session

- **D-14 — Shared default cookie jar. Do NOT opt into `data_store_identifier`.** One jar per
  process is the default; the store page therefore carries the user's real login, which is why
  upstream Heroic's "store page doesn't know you're signed in" defect is **structurally absent**
  here (confirmed live by quick task `260902-8i2`). Isolation would *break* the single property
  that makes the store tab worth having, and is macOS 14+ only.
- **D-15 — Phase 40 FIXES the GOG/Amazon logout jar leak** (folded todo). The embed is what makes
  it user-visible for the first time — log out of GOG, open the GOG store tab, still signed in.
  Follow the Epic precedent: clear at `WKWebsiteDataStore::defaultDataStore()` level, which needs
  no window handle. **Beware: wry's cookie delete is known to lie about deleting** — verify the
  clear, do not trust the return.
- **D-16 — `LoginWarning` survives, driven by GameLib's own app auth state** for that runner —
  not by parsing third-party session cookies out of the shared jar. It answers "have you connected
  this store to GameLib", which is the question the user actually cares about, and it avoids
  owning a per-store cookie heuristic that will rot.
- **D-17 — Store embeds send a real, current Chrome UA.** Per-child `.user_agent()` is mandatory
  (spike 018) and does reach the network. Do **not** port the existing synthetic
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/200.0` — that version number does not exist
  and reads as synthetic to any anti-bot heuristic. Leave a comment marking the version as a
  maintained value, not a magic constant. **This is a header string only — zero package-size
  impact; the embed renders on the system WKWebView like the rest of the app.**

### Overlay collision (spike 017's hard constraint)

- **D-18 — Hide the embed on ANY overlay.** One rule, no exceptions: overlay opens → embed hides
  → overlay closes → embed shows. The child is a native subview above the entire web layer; DOM
  stacking contexts do not reach it, so "reserve a rect overlays avoid" would make every present
  and future overlay's layout depend on the embed's position, with silent failure when one forgets.
- **D-19 — A styled placeholder fills the slot while hidden,** matching the app surface, so hiding
  reads as the store dimming behind a modal rather than a rendering glitch. The slot div already
  exists as the geometry oracle; no new machinery.
- **D-20 — Enforcement is ONE reference-counted suppression hook/context that every overlay routes
  through.** Structural, not remembered. Reference counting is required so nested overlays and the
  multi-step tour compose correctly. Known consumers at ship time: `LoginWarning`, the adtraction
  `Dialog`, NavShell's Tier2 portal dropdowns, toasts, and the onboarding tour.
- **D-21 — Route lifecycle: `hide()` on leave, `close()` only on app teardown.** Spike 018 proved
  both `hide` and `show` return `Ok` with the webview and jar surviving. Returning to the store tab
  is then instant with page state and scroll intact, which is most of what makes a store tab feel
  native rather than like launching a browser.

### Browser chrome (rebuild, not port)

- **D-22 — Back/forward is a Rust-side history stack + `navigate()`.** Record main-frame URLs from
  `on_page_load`; drive back/forward by navigating to the recorded entry. Uses only APIs the spikes
  proved, and needs **ZERO page-side JS injection** — which is the HARD RULE from the 2026-08-03
  Talon root-cause, since document-side injection is exactly what got fingerprinted. Accepted cost:
  in-page state and scroll are not restored the way true browser history would.
- **D-23 — The chrome displays the HOST only** (e.g. `store.steampowered.com`), not the full URL
  with affiliate and session parameters. Enough for the user to know which origin the native view
  is showing — which is security-relevant information, so it is not omitted entirely.
- **D-24 — The chrome is a rebuilt component sitting above the embed slot** — the same structural
  position the dead `WebviewControls` bar had. The slot's rect is measured below the bar, keeping
  the geometry simple, and NavShell needs no changes.
- **D-25 — The FIRST task verifies Tauri 2.11.5's `Webview` history surface against the VENDORED
  CRATE SOURCE, not documentation.** This is 34.3 **D-05**'s standing rule ("no plan may be
  written on an unverified API") and the ROADMAP's explicit warning that re-deriving these answers
  from docs gets different answers than reading the source. If a native back/forward exists it
  beats D-22; if not, D-22 stands.

### Threat model (in scope HERE and nowhere else)

- **D-26 — The control on the injected Tauri global is that NO capability grants the embed
  remote-IPC eligibility.** Spike 014b found a capability with `remote.urls` grants *eligibility*
  but not ACL access; without such a capability there is no eligibility at all. So the assertion is
  that no capability lists the embed label or store origins — verifiable from config, and a gate
  can hold it true. ACL refusal (`rejected: … Plugin not found`) is defence-in-depth behind that,
  not the primary control.
- **D-27 — The threat model covers the FULL store-browser surface,** not only the injected global:
  arbitrary-origin navigation, downloads, `window.open`, external protocol handlers, and **the
  shared cookie jar the embed now sits inside — which holds every store's session** (D-14's
  accepted cost). `MANIFEST.md:340-343` calls modelling this a precondition, and this is the first
  time GameLib points a webview at arbitrary third-party pages by design.
- **D-28 — Free navigation; `window.open` and downloads route to the SYSTEM BROWSER.** Store
  checkout genuinely crosses origins — payment providers, SSO, affiliate redirects — so an origin
  allowlist would break buying things, which is the point of a store tab.
- **D-29 — Block `gamelib://`; allow `steam://` to hand off to the OS.** A third-party page
  reaching GameLib's own deep-link scheme is the sharpest edge in this phase — it would let a store
  page drive the app. `steam://` is the OS handing off to Steam, which the app already does
  deliberately. (Note: `gamelib://` is not registered on Windows anyway, because Windows has no
  single-instance guard.)

### Session restore and adtraction

- **D-30 — RE-DERIVE the `sessionStorage` last-URL restore for Model B; do not port it verbatim.**
  The standing lesson is that verbatim upstream ports ship silent defects, and this code assumed a
  different lifecycle. Note D-21's `hide()`-on-leave already preserves state *within* a session, so
  the restore now only earns its keep **across app restarts**.
- **D-31 — Replace `validStoredUrl`'s substring host check with real origin parsing.**
  `url.includes('gog.com')` matches `evil-gog.com.attacker.net`. The stored value is only narrowly
  attacker-influenceable, but it feeds a native webview's initial navigation and this is a small
  fix that removes a whole question from D-27's model.
- **D-32 — RE-DERIVE the adtraction detection against `on_page_load` / navigation failure.**
  **CAVEAT to verify before promising it:** `on_page_load` reports **main-frame** loads, so
  detecting a *blocked third-party subresource* (`track.adtraction.com`) may have no clean Model B
  equivalent. If it does not, raise it rather than shipping a detection that cannot fire.
- **D-33 — ONE live gesture proves the suppression hook:** open a store tab → trigger an overlay →
  confirm the embed hides and the placeholder shows → dismiss → confirm it returns. That single
  gesture covers the hook, the placeholder, `hide`/`show`, and the geometry sync together. Jest
  cannot see a native subview, and "no layout shift" judged from screenshots has been wrong twice
  on this project.

### Deep links, tour, and i18n

- **D-34 — `store-page?store-url=` embeds KNOWN origins and hands everything else to the system
  browser.** The URL arrives from third-party deal data (CheapShark returns Fanatical,
  GreenManGaming, Humble and others, not just the five embedded stores). Parse it; if the origin
  matches a configured embed, open it in the tab, otherwise open externally. This keeps unvetted
  third-party input out of a native webview without making the Discounts surface worse.
- **D-35 — A deep link resolves to the matching store's configuration** — same UA, same restore
  key, same history stack. A `steampowered.com` deep link is just the Steam embed pointed at a
  different starting URL. No sixth identity concept; it falls out of D-34's origin check.
- **D-36 — The onboarding tour acquires the suppression hook** like any other overlay, so a tour
  step CAN safely sit over the store region. D-20's reference counting already handles the tour's
  multi-step lifecycle. (Relevant background: introjs has known intermittent paint failures under
  WKWebView, and 34.12 exists because tour anchors kept silently breaking.)
- **D-37 — New strings go in `gamelib.json`, NEVER `translation.json`,** and get the project's
  standard localisation treatment in-phase. This phase mints several (Epic panel copy, the
  placeholder, chrome labels). **No gate will catch a violation** — the lint gate is blind to an
  absent key — so this is discipline, not enforcement.

### Claude's Discretion

- Exact wording of all new user-facing strings, judged against the existing panel copy.
- Whether the `WebviewTag` assertions in `types.usage.test.ts` are entangled with assertions for
  types that survive, and how to unpick them if so.
- The precise debounce interval on the `ResizeObserver` bounds sync (spike measured ~40 ms).
- Component and file naming for the rebuilt chrome, the slot, and the suppression hook.
- How store identity is keyed internally (D-35 says a deep link resolves to it; not how it is
  represented).

### Folded Todos

Three pending todos were folded into this phase's scope:

- **`.planning/todos/pending/2026-09-01-webview-amazonlogindata-is-permanently-null.md`** —
  "WebView/index.tsx's `amazonLoginData` state is permanently `null` — 6 read
  sites never see a value"** (score 0.9, area `login`). Dead state in the exact file this phase
  rewrites. It is removed as part of D-09's Model A retirement rather than fixed in place.
- **`.planning/todos/pending/2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md`**
  — "GOG and Amazon (nile) logout never clear the shared cookie jar their login webviews write to" (score 0.6, area `auth/webview`). Promoted from latent to user-visible by
  the embed; fixed under **D-15**.
- **`.planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md`**
  — "D-35-19-15's four Epic sibling apexes were never proven cleared" (score 0.6,
  area `auth/webview`). Cookie-clearing, adjacent to D-15's clear path. Fold it into the same
  `WKWebsiteDataStore`-level clear work rather than leaving it in zero queues, which is how it got
  lost the first time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The embed API — READ FIRST, and prefer these over any documentation
- `.claude/skills/spike-findings-gamelib/references/tauri-embedded-store-browser.md` — the whole
  `add_child` requirement set, the proven code shape, bounds-sync rules, route lifecycle, and the
  "What to Avoid" list. **Answers were derived against vendored crate sources and live hardware;
  re-deriving from docs gets different answers.**
- `.claude/skills/spike-findings-gamelib/references/tauri-login-webview-cookies.md` — the 013–015
  rules that carry over unchanged: `cookies()` never `cookies_for_url()`; `on_page_load` never
  `on_navigation` for deadline-armed relays; per-child `.user_agent()` mandatory; handles die with
  the webview.
- `.planning/spikes/MANIFEST.md` §"Requirements (Idea C — in-app store browser / embedded child
  webviews)" (lines 345-378) — the ready-made requirements block. Lines 340-343 carry the
  threat-model precondition behind D-26/D-27.
- `.claude/skills/spike-findings-gamelib/SKILL.md` — index; §75-83 and the reference table at §117.

### The deferral this phase resolves
- `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-CONTEXT.md`
  — **D-05** (line 129, the out-of-scope decision), **D-06** (line 141, the reworded panel), and
  the deferred-ideas entry at lines 518-527 naming this phase's exact scope.
- `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/34.4.1-PORTED-CHANNELS.md`
  line 420 — the third bullet of the deferred list. **Partly stale: it names `Sidebar/index.tsx:92,103`,
  which Phase 34.10's NavShell deleted. Re-census by predicate; do not copy.**
- `.planning/REQUIREMENTS.md` line 693 — REQ-34.4.1-07, the deferral's requirement text.

### Sequencing and dependencies
- `.planning/ROADMAP.md` §"Phase 40" — goal, scope, the five open questions, and the
  Depends-on/independence statement.
- `.planning/ROADMAP.md` §"Phase 38" — destination for D-04's Windows/Linux ledger items.

### Code the phase edits or deletes
- `src/frontend/screens/WebView/index.tsx` — `validStoredUrl` (`:19-34`), the route→URL map
  (`:191-196`), the adtraction workaround (`:275-300`), the `!webviewPreloadPath` guard (`:501`),
  the panel return (`:528`), the dead branch (`:533-548`).
- `src/frontend/components/UI/WebviewControls/index.tsx` — the dead chrome being rebuilt.
- `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` — the half-migrated file; dead
  effects at `:142-160` and `:167-172`, dead render at `:186`, live guard at `:174`.
- `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` — D-02/D-08's edit target.
- `src/backend/platform/types.ts:167` — the `WebviewTag` shim; re-exported at
  `src/backend/platform/index.ts:1128`.
- `src/backend/platform/__tests__/types.usage.test.ts` — D-12's pin.
- `src/backend/sidecar/appShellFlowRegistration.ts:262-266` — `getWebviewPreloadPath`'s
  declared-empty return, the fact that makes D-09's census correct.
- `src/frontend/App.tsx:207-225` — the `store/:store`, `wiki`, `store-page` route definitions.
- `src/frontend/components/UI/NavShell/components/StoresPanel/index.tsx:37-40` — the store tiles.

### Project standing rules that bind this phase
- `CLAUDE.md` — project instructions.
- The `spike-findings-gamelib` and `sketch-findings-gamelib` project skills are auto-loaded for
  this work; the sketch findings govern NavShell/tier-2 layout if D-24 is revisited.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The spike harness** at
  `.claude/skills/spike-findings-gamelib/sources/016-embedded-child-webview-basic/app/` is a full
  runnable multiwebview app (interactive panel + `SPIKE_AUTORUN=1` scripted run). It is the cheapest
  route to answering any remaining API question, including D-07's Epic probe.
- **`TauriLoginPanel`** is the working reference for a Model B surface — renderer holds no handle,
  state arrives from the backend.
- **`WebviewUnavailablePanel`** survives and is edited, not deleted (D-02, D-08).
- **`Dialog` / `DialogHeader` / `DialogContent`** are already used by the adtraction warning and
  become the first consumers of D-20's suppression hook.

### Established Patterns
- **Model B is already the app's webview pattern** — `humbleLoginFlowRegistration` plus
  `TauriLoginPanel` is the shape to follow: renderer sends intent, Rust owns the object, events
  come back over a channel.
- **Declared-dead returns are logged, never silent** (34.3 D-08 / 34.4 D-04 / 34.4.1 D-05
  discipline). `getWebviewPreloadPath` and the current panel branch both follow it.
- **Sweep gates as phase artifacts** — 34.4.1 shipped `seam-parity-sweep-gate.py`,
  `ported-channels-gate.py` and `wkwebview-silent-noop-sweep.py` in its phase directory. D-13's
  predicate gate follows that precedent.
- **The IPC port inventory** (`.planning/IPC-PORT-INVENTORY.md`) must be updated if D-11 removes a
  channel. Its Totals deliberately sit at 207, one above the 206 union — do not "fix" that.

### Integration Points
- **`App.tsx` routes** → the store screen; unchanged in shape, but `store-page` gains D-34's
  origin check.
- **Rust ↔ renderer:** a new bounds-sync command (renderer is sole writer, D-18's constraint), a
  navigation-event push feeding D-22's history stack and D-23's host display, and lifecycle
  commands for `hide`/`show`/`close`.
- **Capability config** — D-26's assertion lives here: no capability may list the embed label or
  store origins.
- **`Cargo.toml`** — D-03's target-gated `unstable` feature.
- **NavShell Tier2PortalContext** — a suppression-hook consumer (dropdowns), not a structural change.

</code_context>

<specifics>
## Specific Ideas

**The framing the user chose, in their words: "retire A and move to B."** This phase is not a port
and not a cleanup — it is the removal of one of two competing webview architectures. Every decision
above follows from that. When a choice is close, prefer the one that leaves fewer Model A artifacts
and fewer places where the codebase asserts something false about its own architecture.

Two inversions define the work, and both are why "port `WebviewControls`" is not an option:

1. **Control inverts.** `webview.canGoBack()` has no equivalent. Back/forward availability becomes
   state Rust reports to the renderer, not something the renderer can synchronously ask for.
2. **Layout inverts.** Under `<webview>` the element is *in* the document — CSS lays it out, it
   lives in the stacking context, modals paint over it for free. Under `add_child` it is a native
   subview above the entire web layer. The DOM can no longer contain it, only **describe where it
   should be**. Spike 017's two rules are consequences of this: "renderer is the sole geometry
   writer" means *one layout oracle*, and "overlays cannot render above the embed" is not a z-index
   bug — DOM stacking contexts simply do not extend to native sibling views.

**Explicitly rejected during discussion:** `<iframe>` as a cheaper embed (store sites send
`X-Frame-Options` / `frame-ancestors` — dead on arrival); per-store cookie isolation (breaks the
login-carrying property); origin allowlisting the embed (breaks checkout); `eval('history.back()')`
(page-side JS injection is the confirmed Talon fingerprint vector).

</specifics>

<deferred>
## Deferred Ideas

### Epic store browsing inside an embedded webview — SPIKE (created by D-05)
Runs **alongside** Phase 40, blocks nothing. Question: does Talon guard `store.epicgames.com`
browsing the way it guards `/id/api/email/exists`, given a Tauri-managed child webview carries the
injected globals that were root-caused as the fingerprint on 2026-08-03? Includes D-07's bounded
live probe. If the answer is "Epic is browsable", `/store/epic` becomes a small follow-up; if not,
the realistic option is a raw zero-injection `WKWebView` subview, which is a phase of work by
itself (no `WKUIDelegate`, dead Cmd+V, no inspector, `get_webview_window` lookups all break).

### Windows and Linux child-webview support (created by D-01/D-04)
Filed as **Phase 38 ledger items**. Unverified: whether `add_child` works at all on WebView2 and
webkit2gtk, retina behaviour at `scale_factor` 2.0, drag-resize latency, and input/scroll feel
(which needs a human on the interactive harness, not a screenshot).

### Reviewed Todos (not folded)
The `todo.match-phase` query returned 43 matches for Phase 40, but the great majority matched on
generic keywords rather than scope (Steam depot, i18n catalogs, Winetricks, move-install, keyring).
Only the three folded above are genuinely in this phase's files or made visible by its work. The
remainder stay queued and were not individually re-triaged here.

</deferred>

---

*Phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we*
*Context gathered: 2026-09-04*
