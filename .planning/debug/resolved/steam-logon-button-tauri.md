---
status: resolved
trigger: "CORRECTED 2026-07-23 (was: 'Steam login logon button unresponsive under Tauri build (G-30-01) — Manage Accounts screen renders but the logon button does not respond and the QR tab is never reached'). Actual trigger: the Steam tile was already rendering its Logout-style control (the session was already authenticated, carried over from the Electron build's on-disk steamConfigStore), and clicking Logout silently no-ops under Tauri — page reloads, nothing visibly changes, presents identically to 'unresponsive button'. The original framing was a misread of which control (Logout, not Login/'logon') the human actually clicked."
created: 2026-07-23
updated: 2026-07-23T23:00:00Z
phase: 30
gap_id: G-30-01
---

# Debug: Steam logon button unresponsive under Tauri

## Symptoms

**CORRECTED 2026-07-23 — see `## Eliminated` and `## Evidence` for the reasoning. Original text
preserved below for audit trail, struck through where superseded.**

- ~~**Expected:** Clicking the logon control on the Steam login screen advances to the QR tab,
  where the user can sign in by scanning with the Steam mobile app.~~
  **Corrected expected:** Clicking the **Logout** control on an already-authenticated Steam tile
  should sign the user out (or, given D-02 scopes real sign-out out of this Tauri slice, should at
  minimum fail *visibly* rather than silently).
- ~~**Actual:** The Manage Accounts screen renders, but the logon button appears unresponsive. The
  QR tab is never reached.~~
  **Corrected actual:** The tile was already rendering Logout-style (the session was genuinely,
  correctly authenticated — not stale/corrupted state). The human clicked **Logout**, not a QR
  "logon" button. `logoutSteam` is a fire-and-forget IPC `send` with zero registered listeners on
  the Tauri sidecar (Phase 30 D-02 deliberately scoped Steam sign-out out of this slice), so the
  click silently no-ops; `GlobalState.tsx`'s `steamLogout()` then optimistically clears local state
  and calls `window.location.reload()` regardless, masking the no-op. After reload, the untouched
  `steamConfigStore.userData` rehydrates the same signed-in identity and the tile shows Logout
  again — indistinguishable from "the button did nothing." The QR tab was never relevant to this
  session — it is unreachable by design while already signed in, not broken.
- **Console output:** Zero *distinguishable* new lines — reconciled: `steamLogout()`'s
  `console.log('Logging out from steam')` fires immediately before `window.location.reload()`,
  but the reload both (a) tears down and re-runs the boot sequence, re-printing the same four boot
  lines the human had already seen, and (b) typically clears devtools console history by default
  (no "Preserve log") — so the one differing line is wiped before/as it's read, and the human sees
  what looks like the identical pre-click boot chatter. Not a hang, not a swallowed rejection —
  genuinely nothing to see because the reload erases the one line that differed.
- **Electron build:** Still correctly unaffected — the Electron path's `addListener('logoutSteam',
  ...)` in `main.ts` genuinely calls `SteamUser.logout()`, so logout actually works there. Only the
  Tauri sidecar path lacks a registered listener (D-02, deliberate).
- **Timeline:** Observed during Phase 30 human verification (2026-07-23) on the Tauri build.
- **Reproduction (corrected):** `npm run tauri:dev` against a profile already signed in to Steam
  (shares the on-disk `steamConfigStore` with a prior Electron sign-in) → Steam tile renders
  Logout → click Logout → observe silent reload, tile still shows Logout, no user-visible feedback.

## Known-good facts (do not re-derive)

Established by Phase 30 human verification and the 30-REVIEW.md code review:

- Tauri window paints a real UI; no `is not a constructor` regression (27-05 class). Human-verified.
- `checkSteamInstalled`, `steamStartQR`, `steamPollQR` are registered on the sidecar and **no longer emit `UNPORTED_CHANNEL_MARKER`**. Human-verified via condition 4 of the phase gate. Registration is necessary but NOT sufficient. **Confirmed this round: these three channels were never implicated in the actual bug at all** — the human's session never reached the QR mount-effect code path (`SteamLogin/index.tsx`), because it was already authenticated.
- Sidecar spawns and signals READY (`__GAMELIB_SIDECAR_READY__`).
- **New this round:** `steamConfigStore` is in `BOOT_SET_STORES` (`common/types/storePolicy.ts:358-365`), hydrated eagerly via `hydrateStoreSnapshot()` which `frontend/index.tsx` awaits *before* mounting `<GlobalState>` (comment in `preload/tauriTransport.ts:192-196`). The Steam tile's `isLoggedIn` decision (`Login/index.tsx:56,100,207`, sourced from `GlobalState.tsx:237-239`'s `steamConfigStore.get_nodefault('userData')?.username`) is therefore NOT subject to a lazy-hydration race — it reads a genuinely-hydrated snapshot by the time `GlobalState`'s constructor runs.
- **New this round:** two distinct IPC shapes exist in this codebase — `invoke` (req/resp, `makeHandlerInvoker` → Tauri `sidecar_invoke` → sidecar `dispatchInvoke`/`handlerRegistry`, which rejects an unregistered channel with `UNPORTED_CHANNEL_MARKER`) and `send` (fire-and-forget, `makeListenerCaller` → Tauri `sidecar_send` → sidecar `dispatchSend`/`listenerRegistry`, which has **no response protocol at all** — an unregistered channel silently does nothing, no rejection, no error, by design). `checkSteamInstalled`/`steamStartQR`/`steamPollQR` are `invoke`-shaped. `logoutSteam` is `send`-shaped (`preload/api/steam.ts:17`: `makeListenerCaller('logoutSteam')`). These are NOT interchangeable failure modes — the `UNPORTED_CHANNEL_MARKER` convention (and `bootErrorSurface.ts`'s global `unhandledrejection` handler that logs it) only ever applies to the `invoke` shape and never fires for `logoutSteam`.

## Hypotheses

### H2 — CONFIRMED PRIMARY: `logoutSteam` silently no-ops under Tauri (D-02 unported `send` channel) + no error handling in the click path

**Mechanism, verified end-to-end from source:**

1. `Runner/index.tsx:80-82` (pre-fix) → `handleLogout()` → `await props.logoutAction()`, `logoutAction` = `steam.logout` from `ContextProvider` = `GlobalState.tsx`'s `steamLogout` (`Login/index.tsx:209`: `logoutAction={steam?.logout ?? (() => Promise.resolve())}`, `GlobalState.tsx:1509-1513`: `steam: { ..., logout: this.steamLogout }`).
2. `steamLogout` (pre-fix, `GlobalState.tsx:741-750`): `window.api.logoutSteam()` (fire-and-forget, no await) → `this.setState(...)` optimistic wipe → `console.log('Logging out from steam')` → `window.location.reload()`. No branch differs by transport.
3. `window.api.logoutSteam` = `makeListenerCaller('logoutSteam')` (`preload/ipc.ts:17-35`) → under Tauri, `tauriSend('logoutSteam', [])` (`preload/tauriTransport.ts:75-77`) → `void tauriInvoke(SIDECAR_SEND, {channel, args})`.
4. Rust `sidecar_send` (`src-tauri/src/main.rs:180-192`) is a **synchronous, non-async** `#[tauri::command]` that writes one frame to the sidecar's stdin and returns `Ok(())` immediately — no response is ever awaited or possible by this command's own contract ("ipcRenderer.send parity: fire-and-forget, no response awaited").
5. Sidecar `dispatchSend` (`sidecarRpc.ts:131-143`) looks up `listenerRegistry.get('logoutSteam')` → **empty array** (no `addListener('logoutSteam', ...)` call exists anywhere in the sidecar's registration modules — grep-confirmed across all of `src/backend/sidecar/*.ts`; the only Tauri-reachable registration file for Steam auth, `steamAuthFlowRegistration.ts`, explicitly documents in its own header comment that it "Deliberately does NOT register ... `logoutSteam`" per **Phase 30 D-02** ("Credential/SteamGuard/TOTP login and sign-out" explicitly out of scope, `30-CONTEXT.md:43,70,403`). The `main.ts` `addListener('logoutSteam', ...)` that DOES call `SteamUser.logout()` is the Electron-only main-process file, never loaded by the Tauri sidecar (`bootstrap.ts`/`handlers.ts` chain).
6. `dispatchSend` iterates zero listeners and returns — **no response frame is ever written**, because `send` requests have no response concept at all (contrast `dispatchInvoke`'s explicit `UNPORTED_CHANNEL_MARKER` response for the exact same "no handler" case on the `invoke` side).
7. Back in step 2: `steamLogout` proceeds unconditionally past the fire-and-forget call — `this.setState` wipes local React state (client-only, lost on reload anyway), `console.log` fires (immediately erased/superseded by the reload that follows — see Symptoms), `window.location.reload()` tears down and reloads the whole renderer.
8. Post-reload: `hydrateStoreSnapshot()` re-fetches `steamConfigStore.userData` from the sidecar's real, **never-modified** backing store (no `SteamUser.logout()` call ever happened) → same username → `GlobalState`'s constructor sets `steam.username` to the same value → tile renders Logout again. Net observable effect: click Logout, nothing changes, no visible feedback — indistinguishable from an unresponsive button.

**Falsification test that was run:** traced whether the failure is a *reject* (would produce an "Uncaught (in promise)"/`unhandledrejection` console entry, which `bootErrorSurface.ts`'s global handler would catch and `console.warn` for `UNPORTED_CHANNEL_MARKER` messages) or a *hang* (would require something still pending 60s later per `INVOKE_TIMEOUT`). **Neither is correct** — `sidecar_send` is synchronous and always resolves `Ok(())`; there is no invoke-side pending map involved (`SidecarState::invoke`'s `INVOKE_TIMEOUT`/pending-map logic is exclusively for `sidecar_invoke`, never touched by `sidecar_send`). This is the "one open discrepancy" flagged for this round: the send/listener transport shape genuinely has **no failure signal whatsoever** by design (mirrors `ipcRenderer.send`, which also never rejects under Electron even if no listener exists) — it is a silent, "successful" no-op, not a rejection and not a hang. This is why the [G-30-01] invoke-path instrumentation (commit `48e77187`) could never have caught this bug: it instruments `dispatchInvoke`/`SidecarState::invoke`, and this bug lives entirely in the parallel `dispatchSend`/`sidecar_send` code path.

**Confirming evidence (direct source reads, not inference):**
- `preload/api/steam.ts:17` — `logoutSteam` uses `makeListenerCaller`, not `makeHandlerInvoker`.
- `steamAuthFlowRegistration.ts:18-24` — explicit docstring: "Deliberately does NOT register ... `logoutSteam` — the credential/SteamGuard/TOTP login branches and sign-out are explicitly OUT of scope per Phase 30 D-02."
- `steamAuthFlows.test.ts:296-321` — Test 5 exists specifically to prove `logoutSteam` "still rejects non-fatally" — but this test drives the sidecar's **`invoke`**-shaped dispatch directly via `writeInvoke(..., 'logoutSteam', [])` (forcing `kind: 'invoke'`), which is NOT the real shape the frontend actually calls it with (`kind: 'send'`, via `makeListenerCaller`). This test proves `dispatchInvoke`'s fallback behavior for a hypothetical invoke-shaped call to `logoutSteam`; it does **not** cover the real `dispatchSend` path the frontend uses, and gives false confidence that `logoutSteam` "rejects" in any way the frontend would ever observe. **Test/reality mismatch — flagged, not fixed this round (out of scope for a UI click-handler bug fix; worth a follow-up test-suite gap ticket).**
- `src-tauri/src/main.rs:178-192` — `sidecar_send` is a synchronous `fn`, contrasted with `sidecar_invoke`'s `async fn` + `spawn_blocking` + `recv_timeout`.
- `sidecarRpc.ts:131-143` — `dispatchSend` has no response-writing branch at all, unlike `dispatchInvoke:93-110`.
- `30-CONTEXT.md:43,70,403` — D-02 explicitly scopes sign-out out of Phase 30.
- `bootErrorSurface.ts:29-50` — the app's one existing UNPORTED_CHANNEL_MARKER-surfacing convention is a global `unhandledrejection`/`error` listener; confirmed it cannot and does not fire for this bug (no rejection is ever produced).
- `GlobalState.tsx:1509-1513`, `Login/index.tsx:207-210` — confirmed prop wiring from tile → `isSteamLoggedIn`/`logoutAction` → `steamLogout`.
- `Login/index.tsx:56,100` — `isSteamLoggedIn` state is a `useState` seeded from `Boolean(steam?.username)` and kept in sync by a `useEffect` on `[..., steam?.username, ...]` — no lazy-store race possible here since `steamConfigStore` is boot-hydrated before mount (see Known-good facts).

### H1 — ELIMINATED: mount effect pinned at `step === 'checking'` (`checkSteamInstalled`/`steamStartQR`/`steamPollQR`)

Eliminated by direct human report, not further code tracing: the human confirmed (1) they did not reach the QR login screen, and (2) the tile rendered a **Logout**-style control, not a Login-style control. `SteamLogin/index.tsx`'s mount effect (`step === 'checking'` → `checkSteamInstalled()`) only runs when the tile's Login control is clicked and `/loginweb/steam` is navigated to (`Runner`'s `handleLogin` → `navigate(props.loginUrl)`, gated on `!props.isLoggedIn`). Since `isLoggedIn` was true, that code path — and therefore `SteamLogin/index.tsx` and `checkSteamInstalled()` entirely — was **never reached** in this session. This hypothesis was never wrong on its own static merits (the un-`catch`ed mount effect is real and would be a real bug if ever exercised with a hanging/rejecting `checkSteamInstalled()`), but it does not explain what actually happened here, because its precondition (being on the not-logged-in Login control) was never met.

#### Stale-snapshot variant (subsumed into H2, not separately eliminated)

The stale-snapshot variant of H1 speculated the Logout render might itself be a symptom of a race/staleness rather than genuine signed-in state. **This round confirmed it is genuine, correct state**, not staleness: `steamConfigStore` is boot-hydrated (in `BOOT_SET_STORES`) before `GlobalState` mounts, so there's no lazy-miss race available to it (see Known-good facts and the `GAMELIB_STORE_LAZY_MISS` reconciliation below). The variant's mechanism claim — "`logoutSteam` is deliberately unported → `await props.logoutAction()` [fails] with no `try/finally` → the control latches" — was directionally correct about `logoutSteam` being unported and about the missing error handling, but incorrect about the failure *mode* (it assumed a throw/reject; the actual mechanism is a silent no-op, not a throw). Folded into H2 above with the corrected mechanism.

### H0 — REFUTED by code review (do not re-investigate)

Routing/lazy-load stall. Unaffected by this round's findings — still correctly refuted. `Runner`'s login control is a plain `navigate('/loginweb/steam')`, and `App.tsx:129-136`'s `makeLazyFunc` receives an already-started module-scope `import()` promise, so the `SteamLogin` chunk is loaded at boot. `disabled` depends only on `oldMac`, which stays `false` when `systemInfo.get` is unported. Neither routing nor chunk loading can stall on click. (Doubly moot now — this session never reached the Login control at all.)

## `GAMELIB_STORE_LAZY_MISS` reconciliation (guidance step 2)

**Conclusion: incidental, unrelated boot noise. Does NOT participate in this bug.** Verified with file/line evidence, not assumption:

- The warning fired for `snapshotGet("configStore", "settings")` specifically.
- `configStore.get_nodefault('settings')` is called at **module scope** in `frontend/index.tsx:52` (`const globalSettings = configStore.get_nodefault('settings')`, the renderer entry file itself, NOT `GlobalState.tsx`), which executes the instant that module body runs at import time — `frontend/index.tsx:30`'s own static `import GlobalState from './state/GlobalState'` (a sibling import in the same file) triggers the `GlobalState` module's evaluation, but line 52's `configStore` read happens directly in `index.tsx` itself, synchronously, before `index.tsx:63`'s `hydrateStoreSnapshot()` call (inside an async boot function) has any chance to resolve. This specific read is *expected* to race the hydration and is a known, harmless, self-healing pattern (the miss fires the warning once, returns the caller default, and kicks off an async `hydrateStore()` — `tauriTransport.ts:318-328`).
- By contrast, the Steam tile's login-state read — `steamConfigStore.get_nodefault('userData')?.username` — happens at `GlobalState.tsx:238`, **inside the class constructor**, which only runs once React actually instantiates `<GlobalState>` (`frontend/index.tsx:183`), which is sequenced *after* the awaited `hydrateStoreSnapshot()` call completes (confirmed by `tauriTransport.ts:192-196`'s docstring: "Must be awaited before React mounts (index.tsx) -- the Steam login-gate (GlobalState.tsx:238) ... read synchronously during GlobalState's constructor").
- Since `hydrateStoreSnapshot()` populates ALL `BOOT_SET_STORES` (including both `configStore` and `steamConfigStore`) in one shot and marks each store name `hydrated` only once the *whole* eager fetch resolves, and since the constructor read at line 238 cannot execute until after that resolution, `steamConfigStore` is guaranteed hydrated by the time the Steam tile's login decision is made — genuinely different timing from the module-scope `configStore.settings` read at line 52, which races the same hydration by construction (it runs before the async call is even issued).
- Therefore: the warning is real, pre-existing, and harmless boot noise from an unrelated store+key pair, and the "logout style" render is **correct, hydrated state** — not a symptom of the same race.

## Eliminated

- hypothesis: Button click handler not wired / routing or lazy-chunk stall — refuted by code review (see H0 above).
- hypothesis: The three QR channels are still unported — refuted by human-verified condition 4 (no `UNPORTED_CHANNEL_MARKER` for them).
- hypothesis: `checkSteamInstalled`/`steamStartQR`/`steamPollQR` registration is an orphaned-module gap (WR-02 generalization) — REFUTED this session by tracing the full static import graph from `bootstrap.ts` (the real sidecar entry) through `handlers.ts` to `steamAuthFlowRegistration.ts`; registration is genuinely reachable, unlike the WR-02 `dialog.showOpenDialog` case.
- hypothesis: A Tauri v2 capability/ACL gate is silently blocking `sidecar_invoke` — REFUTED; app-defined commands registered via `invoke_handler(generate_handler![...])` are not gated by capabilities in Tauri v2 (confirmed both by Tauri v2's plugin-only ACL model and by `capabilities/default.json`'s own explanatory comment).
- hypothesis: An argument-shape or channel-name mismatch between the JS `invoke()` call and the Rust `#[tauri::command]` signature — REFUTED; channel name (`sidecar_invoke`), argument names (`channel`, `args`), and argument shapes all match exactly.
- hypothesis: H1 — `checkSteamInstalled()` mount effect at `SteamLogin/index.tsx:167-174` pinned at `step === 'checking'` (rejects or hangs) — ELIMINATED this round. Not by further tracing of `checkSteamInstalled()` itself (that code remains structurally sound, per prior rounds), but because the human's own report (tile rendered Logout-style, QR tab never reached because never needed) proves the `SteamLogin` mount effect was never even reached in this session — the precondition for H1 (being on the not-logged-in Login control) never held. See H1 section above and H2 (confirmed) for the actual mechanism.
- hypothesis: Stale-snapshot variant of H1 (the Logout render itself being a symptom of a store race) — ELIMINATED this round; `steamConfigStore` is boot-hydrated before `GlobalState` mounts (see `GAMELIB_STORE_LAZY_MISS` reconciliation above), so the Logout render is genuine, correct, hydrated state, not staleness. The "no try/catch around `logoutAction`" half of this variant's mechanism claim was correct and is folded into confirmed H2, but the assumed failure mode (throw/reject) was wrong — actual mechanism is a silent no-op (see H2).
- hypothesis: The `[G-30-01]` instrumentation's reject-vs-hang prediction table (`main.rs` `SidecarState::invoke`/`dispatchInvoke` round trip) would explain this bug — ELIMINATED; that instrumentation targets the `invoke`/`handlerRegistry` path, and this bug lives entirely in the parallel `send`/`listenerRegistry` path (`sidecar_send`/`dispatchSend`), which the instrumentation never touched. Confirmed by reading `sidecarRpc.ts`'s `dispatchSend` (no logging added there) and `main.rs`'s `sidecar_send` (no logging added there) directly.

## Evidence

- timestamp: 2026-07-23 — Human verification: button unresponsive, QR tab unreached, **zero console output**, Electron build unaffected. **(Superseded interpretation — see Symptoms correction. The underlying observations are accurate; the framing of "logon button"/"QR tab" was the misdiagnosis, not the human's raw report.)**
- timestamp: 2026-07-23 — Code review 30-REVIEW.md refuted the routing/lazy-load explanation and identified the un-`catch`ed mount effect at `SteamLogin/index.tsx:167-174` as the supported mechanism. (Structurally still true of that code; just not the mechanism exercised in this session — see H1 elimination.)
- timestamp: 2026-07-23 — Traced the FULL call graph end-to-end via graphify + direct reads for `checkSteamInstalled`, generalizing the WR-02 "registered != reachable" lesson. Result: clean — all three QR channels genuinely reachable. (Confirmed still accurate; now also confirmed irrelevant to the actual bug.)
- timestamp: 2026-07-23 — DECISIVE new human evidence this round: (1) "no i did not reach the steam login, the steam button still unresponsive"; (2) tile rendered "logout style", not login style. This reframed the entire investigation — see H2.
- timestamp: 2026-07-23 — Verified `logoutSteam` is `makeListenerCaller`-shaped (`preload/api/steam.ts:17`), not `makeHandlerInvoker`-shaped — a `send`, not an `invoke`. This is the load-bearing distinction the whole H2 mechanism rests on.
- timestamp: 2026-07-23 — Verified `steamAuthFlowRegistration.ts`'s own docstring explicitly excludes `logoutSteam` from sidecar registration, citing Phase 30 D-02. Verified via grep that no other sidecar registration module (`installFlowRegistration.ts`, `steamFlowRegistration.ts`, `storeWriteHandlers.ts`, etc.) registers a `logoutSteam` listener either — only `main.ts` (Electron-only, not part of the Tauri sidecar) does.
- timestamp: 2026-07-23 — Verified `sidecar_send` (`main.rs:178-192`) is synchronous and unconditionally returns `Ok(())` after writing the frame; verified `dispatchSend` (`sidecarRpc.ts:131-143`) has no response-writing branch for a listener-registry miss (contrast `dispatchInvoke`'s explicit `UNPORTED_CHANNEL_MARKER` handling). This resolves the reject-vs-hang question from source alone: **neither** — it's a silent, always-"successful" no-op by design.
- timestamp: 2026-07-23 — Verified `steamConfigStore` is in `BOOT_SET_STORES` (`storePolicy.ts:358-365`) and hydrated before `GlobalState`'s constructor runs (`tauriTransport.ts:192-196`'s own docstring names `GlobalState.tsx:238` as the exact call site this ordering exists to protect) — closes the `GAMELIB_STORE_LAZY_MISS` reconciliation (see dedicated section above).
- timestamp: 2026-07-23 — Verified `configStore.get_nodefault('settings')` (the call that actually produced the observed lazy-miss warning) is a **module-scope** call in `frontend/index.tsx:52` (the renderer entry file, not `GlobalState.tsx`) that unavoidably races `hydrateStoreSnapshot()` by construction — a different, pre-existing, harmless pattern unrelated to the Steam tile's login-state read.
- timestamp: 2026-07-23 — Read `steamAuthFlows.test.ts` Test 5 in full: it drives `logoutSteam` via `writeInvoke(..., 'logoutSteam', [])`, i.e. as an `invoke`-shaped request, which forces the `dispatchInvoke`/`UNPORTED_CHANNEL_MARKER` path. This does not match the real frontend call shape (`send`), so the test's "still rejects non-fatally" claim does not hold for the actual bug. Flagged as a test/reality mismatch, not fixed this round (out of scope: a click-handler bug fix, not a test-suite gap fix).
- timestamp: 2026-07-23 — Applied fix: `GlobalState.tsx`'s `steamLogout()` now branches on `isTauri()` (imported from `preload/tauriTransport`) and shows an honest `handleShowDialogModal` dialog ("Sign out unavailable... You'll remain signed in") instead of proceeding with the misleading optimistic-wipe-and-reload sequence; the Electron branch is completely unchanged (still: send + optimistic state + reload). `Runner/index.tsx`'s `handleLogout` now wraps `await props.logoutAction()` in `try/catch/finally`, guaranteeing `setIsLoggingOut(false)` always runs regardless of cause (applies to all six platforms' logout actions, not just Steam — defense in depth per the coordinator's explicit ask).
- timestamp: 2026-07-23 — `tsc --noEmit` clean, `npx eslint` on both changed files shows 0 new errors (pre-existing warning classes only, e.g. `require-await` on other already-`async`-without-`await` logout methods in the same file), `cargo check` clean after reverting the now-unnecessary `[G-30-01]` instrumentation (commit `368a25b1`, reverts `48e77187`). No `npm run tauri:dev`/`npm start` run by this agent — reserved for human per D-07 (do not race `build/main`); the live click-through and the new dialog's actual on-screen appearance are still unverified by a human.

## Resolution

- root_cause: Under the Tauri build, `logoutSteam` is registered on the preload/frontend side as a fire-and-forget IPC `send` (`makeListenerCaller`), but Phase 30 D-02 deliberately left it unregistered on the sidecar side (no `listenerRegistry` entry) as an explicit sign-out-is-out-of-scope decision. A `send` has no response protocol at all — unlike an unported `invoke` channel (which rejects with `UNPORTED_CHANNEL_MARKER`), an unregistered `send` channel silently, "successfully" does nothing. `GlobalState.tsx`'s `steamLogout()` did not distinguish this case: it always proceeded to optimistically clear local React state and force `window.location.reload()`, which (a) discarded the one differing console line before it could be read and (b) caused the reload to rehydrate the same still-authenticated `steamConfigStore.userData` (never actually cleared), so the tile reverted to Logout with zero visible feedback — indistinguishable from an unresponsive button. `Runner/index.tsx`'s `handleLogout` additionally had no error handling, so any future genuine rejection (from a different platform's logout, or a future change) would have latched the button in "Logging out..." forever. The originally-filed G-30-01 report additionally misattributed this to the QR login flow, because the human was already signed in (session state shared with the Electron build) and had clicked Logout, not a "logon"/Login control — the QR mount-effect code path (`checkSteamInstalled`/`SteamLogin/index.tsx`) was never reached and was never implicated.
- fix: (1) `src/frontend/state/GlobalState.tsx` — `steamLogout()` now checks `isTauri()` first; if true, logs a greppable `console.warn` and shows a `handleShowDialogModal` dialog telling the user sign-out isn't available in this build and they'll remain signed in, then returns without touching local state or reloading. The pre-existing Electron branch (fire `logoutSteam`, optimistic state wipe, `console.log`, `window.location.reload()`) is unchanged. (2) `src/frontend/screens/Login/components/Runner/index.tsx` — `handleLogout()` now wraps `await props.logoutAction()` in `try { } catch (error) { console.error(...) } finally { setIsLoggingOut(false) }`, so the button can never latch regardless of platform or failure mode. (3) Reverted the now-unneeded `[G-30-01]` diagnostic instrumentation (`src-tauri/src/main.rs`, `src/backend/sidecar/sidecarRpc.ts`) in a separate commit `368a25b1` — it targeted the `invoke`/`dispatchInvoke` path, which this bug never touches.
- verification: **Human-verified live, 2026-07-23 — PASSED.** Verbatim human response: "yes, both get expected behaviors" — confirming (a) Tauri build: clicking Logout shows the honest "sign-out isn't available in this build" dialog, no page reload, tile still correctly reads Logout, no latch/glitch; (b) Electron build (`npm start`): Steam Logout still works exactly as before — genuinely signs out and reloads, no regression on the shared code path. Backed by static verification the same day: `npx tsc --noEmit` clean (no errors emitted); `npx jest --selectProjects Frontend` — 24 suites / 177 tests passed (3.7s), covering the state/`__tests__` directory GlobalState.tsx lives in (SteamBottleSetup/SteamBridgeSetup/SteamClientSetup) and all other frontend unit suites; `npx jest src/preload/__tests__` — 2 suites / 25 tests passed (tauriAttach/tauriTransport, covering `isTauri()`'s home module). No test file exists specifically for `GlobalState.tsx` or `Runner/index.tsx` (no prior precedent, and `GlobalState.tsx` is a 1580+ line class component with heavy electron-store/window.api coupling) — a regression test for the `isTauri()` branch was considered but deferred; see note below.
- files_changed:
  - src/frontend/state/GlobalState.tsx (fix — steamLogout Tauri guard + dialog)
  - src/frontend/screens/Login/components/Runner/index.tsx (fix — handleLogout try/catch/finally)
  - src-tauri/src/main.rs (revert of [G-30-01] instrumentation, commit 368a25b1, already committed)
  - src/backend/sidecar/sidecarRpc.ts (revert of [G-30-01] instrumentation, commit 368a25b1, already committed)
  - .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-HUMAN-UAT.md (corrected G-30-01 description + resolution note, planning doc only)
  - .planning/debug/steam-logon-button-tauri.md (this file — finalized, moved to resolved/)

## Regression-test follow-up (deferred, not silently dropped)

Considered adding a unit test asserting `steamLogout()` takes the `isTauri()`-true branch (dialog,
no reload, no state wipe) rather than the Electron branch. **Deferred, not added, this round** —
reasons: (1) no test file exists for `GlobalState.tsx` today (grep-confirmed: zero
`GlobalState*.test.ts*` anywhere in `src/frontend`), so this would be the first, and `GlobalState`
is a 1580+ line `PureComponent` with constructor-time reads from ~10 electron-store instances
(`configStore`, `gogConfigStore`, `steamConfigStore`, etc.) plus `window.api`/`window.localStorage`
globals — importing the module at all in a test requires mocking that entire surface just to reach
`steamLogout`, disproportionate for closing out this single click-handler fix; (2) the existing
`src/frontend/state/__tests__/Steam*Setup.test.ts` suites in the same directory test standalone
exported functions (`handleSteamBottleSetupRequiredSignal`, etc.), not `GlobalState` class methods
— there's no established pattern here to extend cheaply. **Follow-up recommendation**: the next
time `GlobalState.tsx` is touched (e.g. a future Tauri migration phase per
`tauri-migration-v08-plan`), extract `steamLogout`'s Tauri-vs-Electron branch into a small
standalone pure function (`shouldShowUnportedLogoutDialog(isTauriValue): boolean` or similar) that
can be unit-tested without instantiating `GlobalState` at all — mirroring the existing
`Steam*Setup.test.ts` pattern of testing extracted standalone functions. This is the general fix
for the recurring "unported `send` channel must fail visibly" bug class flagged in this
investigation (H2 evidence), which will recur across remaining Tauri migration phases as more
`send`-shaped channels get ported.

## Current Focus

- **hypothesis:** H2 CONFIRMED — see above. Investigation and fix cycle complete; human verification passed.
- **test:** Live human verification via `npm run tauri:dev` (Tauri Logout click) and `npm start` (Electron Logout click), per D-07.
- **expecting:** Human confirms: dialog appears on Logout click under Tauri, no reload occurs, tile state stays consistent, Electron build's Logout is unaffected. — **CONFIRMED, verbatim: "yes, both get expected behaviors".**
- **next_action:** None — session resolved. Archived to `.planning/debug/resolved/steam-logon-button-tauri.md`.
