# Phase 33: Tauri lifecycle cluster — Research

**Researched:** 2026-07-24
**Domain:** Tauri v2 lifecycle/dialog/notification/shell porting + Node-sidecar steam-user CM connection reliability (Steam install-hang root-cause remediation)
**Confidence:** HIGH (install-hang code state, dialog/notification plugin APIs) / MEDIUM (exact live-hang residual cause — diagnose-only, needs live retest to confirm) / LOW→resolved (D-08 wake-lock plugin landscape — resolved to "none viable")

## Summary

This phase has two distinct bodies of work that must not be conflated. **(1) The G-30-02
install-hang** is *mostly already fixed in source* — Phase 30-07 already wrapped every
identified bare `getProductInfo`/`getDepotDecryptionKey`/`getRawManifest` steam-user CM call in
`withTimeout` (`games.ts`, `depot.ts`, `installLocation.ts` all confirmed wrapped, read directly
from the current tree). What is **not yet implemented** is (a) the D-01b handler-level watchdog
around the real `await install()` call, and — critically — **that call no longer lives where
CONTEXT.md's canonical_refs say it does.** Phase 32 re-routed `install`/`updateGame` off the old
direct `SteamGame.install()` bypass in `installFlowRegistration.ts` onto the real, Electron-shared
`addToQueue()` → `initQueue()` → `installQueueElement()` path in
`src/backend/downloadmanager/utils.ts`. **This file, not `installFlowRegistration.ts`, is where
`await libraryManagerMap[runner].getGame(appName).install(...)` now actually happens**, and it is
where D-01b's watchdog must wrap. (b) `SteamUser.ensureConnected()`'s fast path
(`user.ts:71`) still blindly trusts `client.steamID` without revalidating the socket — this
research found steam-user v5.3.0 (the exact installed version) ships a purpose-built `client.relog()`
API for exactly this "I think my connection may be stale" scenario, which is the correct D-02
remedy. (c) **Most likely, the actual reason the 30-07 fix "didn't hold live" is a THIRD, separate
bug**, unrelated to timeouts at all: `downloadmanager/utils.ts:139`'s `finally` guard that clears
the "installing" badge explicitly **excludes** `status === 'error'` for `runner === 'steam'` — so
even though 30-07's timeouts now correctly cause `install()` to *return* `{status:'error'}` within
25–90s instead of hanging forever, **the badge still never clears**, because nothing tells the
frontend the terminal state changed. This is exactly WR-01/D-10, already scoped into this phase —
implementing it is very likely necessary AND sufficient to make the observed symptom ("spinner
spins forever") disappear, on top of the belt-and-suspenders watchdog. **(2) The lifecycle
cluster port** (dialog/app/Notification/shell) is comparatively low-risk mechanical work following
an established pattern (3 prior phases of `electronStub.ts` → `rustInvoke` → `dispatch_rust_channel`
plumbing). The three CONTEXT.md-deferred research questions all resolved cleanly: D-02 has a
concrete steam-user API answer, D-05's notification icon question resolves to "no, `nativeImage`
stays deferred," and D-08's wake-lock plugin search turned up no plugin meeting the "cheap and
maintained" bar — confirming accept-and-document is correct.

**Primary recommendation:** Treat G-30-02 as three separate, independently necessary fixes — (1)
extend `downloadmanager/utils.ts:139`'s finally-guard condition to also clear on
`status === 'error'` for Steam (WR-01/D-10, very likely the actual visible-hang fix), (2) add the
D-01b watchdog around the `.install()` await **in `downloadmanager/utils.ts`, not
`installFlowRegistration.ts`** (belt-and-suspenders for any other never-settling await), and (3)
replace `ensureConnected`'s blind fast-path trust with a bounded canary + `client.relog()`
fallback (D-02, makes rehydrated installs actually succeed). Port the lifecycle cluster using the
existing `dispatch_rust_channel()`/`requestRustInvoke()` pattern exactly as `dialog_open`/
`dialog_message`/`dialog_save` already do; add `tauri-plugin-notification`/
`@tauri-apps/plugin-notification` (both official first-party, verified) for `Notification`; do not
pull in `nativeImage` or a wake-lock plugin.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Install-hang fix (timeout bounds, watchdog, badge-clear) | API/Backend (Node sidecar) | — | Pure backend logic; no UI/window-tier involvement |
| CM socket revalidation (`relog()`) | API/Backend (Node sidecar, steam-user client) | — | steam-user runs headless in the sidecar; no browser/renderer role |
| `dialog.showMessageBox` real multi-button | API/Backend (Node sidecar `electronStub`) | Native/Rust (Tauri `tauri-plugin-dialog`) | Sidecar forwards via `rustInvoke`; Rust owns the actual native dialog widget |
| `app` lifecycle (`quit`/`exit`/`relaunch`/single-instance) | Native/Rust (Tauri `AppHandle`) | API/Backend (Node sidecar `electronStub.app`) | Process lifecycle is owned by the OS-level Tauri process; sidecar's `app.*` calls must forward to Rust, not the reverse |
| `Notification` | Native/Rust (`tauri-plugin-notification`) | API/Backend (Node sidecar `electronStub`) | OS notification center integration is a native capability; sidecar forwards via `rustInvoke` |
| `shell.showItemInFolder`/`trashItem`/`openPath` | Native/Rust (`tauri-plugin-opener`/`tauri-plugin-fs`) | API/Backend (Node sidecar `electronStub.shell`) | File-manager/trash integration is OS-native; already-installed `tauri-plugin-opener` covers most of it |
| `session`/`powerSaveBlocker` (accept-and-document) | N/A (explicitly deferred) | — | No Steam-reachable code path exercises `session`; no viable maintained Tauri v2 wake-lock plugin found |
| `nativeImage`/tray/protocol/multi-window (re-deferred) | N/A (explicitly deferred) | — | Confirmed: `Notification` does not require an icon object, so no dependency forces `nativeImage` into scope |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions (D-01 through D-13)

- **D-01** — Fix G-30-02 with BOTH remedies: (a) surgical bound on every unbounded steam-user
  `getProductInfo`/PICS await + revalidate the stale CM socket, AND (b) a sidecar-handler watchdog
  around `await install()` that force-pushes a terminal error if it never settles.
- **D-02** — CM socket reconnect approach is research's call; fixed constraint: a rehydrated-library
  install must reliably *succeed*, not merely fail fast; the "bound so it never hangs" part is fixed
  regardless of approach.
- **D-03** — Watchdog/error UX: force a terminal `done` with error status AND surface a failure
  dialog — never a silent badge-clear.
- **D-04** — Keep boot-time auto-resume deferred to Phase 35; fix the on-demand install hang only.
- **D-05** — Port `dialog.showMessageBox` multi-button, `app` lifecycle essentials, `Notification`,
  remaining `shell` methods now; re-defer tray/protocol/multi-window/`nativeImage` to Phase 35
  cutover non-fatally.
- **D-05a** — Updater hooks → Phase 34; Phase 33 leaves updater channels as logged no-ops.
- **D-06** — `showMessageBox` real multi-button via `rustInvoke` → `tauri-plugin-dialog`, reusing
  the Phase 30/31 forward-to-transport shape. `showMessageBoxSync`/`showOpenDialogSync` stay logged
  no-ops. Planner note: re-confirm no in-scope flow genuinely calls a Sync member.
- **D-07** — Fail-safe to decline on any dialog error/timeout: return the real clicked button on
  success, but ANY error/timeout/transport failure defaults to the SAFE/cancel button, never the
  destructive one.
- **D-08** — `powerSaveBlocker`: accept + document as a logged no-op UNLESS research finds a cheap
  maintained Tauri v2 wake-lock plugin (then a shim is acceptable).
- **D-09** — `session`: accept + document as a logged no-op UNLESS research finds a session use on
  a Steam-reachable path (then shim just that slice).
- **D-10** — WR-01: a returned/thrown install error force-clears the "installing" badge AND shows a
  failure dialog. The shared `installQueueElement` force-clear condition
  (`downloadmanager/utils.ts:139`) currently excludes plain `status === 'error'` — the fix extends
  it.
- **D-11** — WR-02: re-scope, do not port. The sidecar install path is Steam-focused; Electron's
  Legendary/Epic DLC fan-out loop is NOT ported. A non-Steam install with `installDlcs` populated
  becomes a logged/guarded case, not a silent drop.
- **D-12** — WR-03: add a test driving an `error`/`abort` resolution through the real
  `install`/`updateGame` invoke channels.
- **D-13** — G-30-02 requires LIVE hardware proof under `npm run tauri:dev` to close the phase
  (click Install on a Steam title, `enableSteamNativeInstall:true`, signed-in library; badge
  resolves — succeeds or clean error dialog — and NEVER hangs). Jest was green while the live build
  hung twice already — this bug class only reproduces against a real, stale sidecar CM socket. The
  REST of the cluster may stay unit-proven + live-UAT-deferred per the usual pattern.

### Claude's Discretion

- D-02's exact CM socket reconnect approach (probe/revalidate vs full reconnect) — resolved below:
  use `client.relog()`.
- The exact watchdog bound/interval (D-01) and dialog error-timeout bound (D-07) — resolved below
  with concrete numbers grounded in measured install timing.
- Whether `nativeImage` is genuinely re-deferrable — resolved below: yes, confirmed not required by
  `@tauri-apps/plugin-notification`.
- Whether new lifecycle channels live in an extended existing `*FlowRegistration.ts` or a new
  curated module — planner call; curated-import discipline must hold (no `src/backend/sidecar/`
  file imports the real `electron` module).

### Deferred Ideas (OUT OF SCOPE)

- `updater` hooks → Phase 34.
- tray / custom-protocol registration / full multi-window (`BrowserWindow`) / `nativeImage` → Phase
  35 cutover.
- Boot-time auto-resume of interrupted installs → Phase 35.
- `session`/`powerSaveBlocker` real parity → accepted-and-documented gaps (this research confirms
  no plugin surfaced that changes this call).
- `showMessageBoxSync`/`showOpenDialogSync` real behavior → stays logged no-ops.
- WR-02 Epic/GOG DLC fan-out port → re-scoped, not ported.
- Live cross-build settings/queue/download sync (Electron↔Tauri divergence family) → Phase 35.
</user_constraints>

<phase_requirements>
## Phase Requirements

REQ-33-xx IDs have not yet been minted (ROADMAP defers this to the planner, per the phase
briefing). The table below maps CONTEXT.md's locked decisions (which the planner will mint into
REQ-33-xx) to the research finding that supports implementing each one.

| Decision | Description | Research Support |
|----------|-------------|-------------------|
| D-01/D-02/D-03 | G-30-02 surgical fix + socket revalidation + watchdog UX | "Install-Hang Root Cause: Corrected Understanding" section below; `client.relog()` verified in installed steam-user v5.3.0 source |
| D-06/D-07 | Real multi-button `showMessageBox` with fail-safe decline | "Dialog Cluster" section; `tauri-plugin-dialog` `MessageDialogButtons::OkCancelCustom` verified via official docs/GitHub |
| D-05 (Notification) | Real `Notification` via Tauri plugin | "Notification" section; `@tauri-apps/plugin-notification`/`tauri-plugin-notification` verified official, icon-optional confirmed |
| D-05 (shell) | Real `showItemInFolder`/`trashItem`/`openPath` | "Shell Cluster" section; existing `tauri-plugin-opener`/needed `tauri-plugin-fs` |
| D-05 (app lifecycle) | Real `quit`/`exit`/`relaunch`/single-instance | "App Lifecycle" section; confirms which Steam-adjacent call sites are actually reachable |
| D-08/D-09 | `powerSaveBlocker`/`session` accept-and-document | "Parity Gaps" section; wake-lock plugin landscape surveyed, none viable |
| D-10/D-12 | WR-01 badge-clear-on-error + WR-03 test | "Install-Hang Root Cause" section; exact line/condition identified |
| D-11 | WR-02 re-scope (not ported) | Confirmed: `installQueueElement` (`downloadmanager/utils.ts`) is genuinely runner-generic and Electron-shared; no Steam-only fork needed to satisfy D-11's "logged/guarded, not silent" bar |
</phase_requirements>

## Install-Hang Root Cause: Corrected Understanding (read this before planning D-01/D-02/D-03/D-10)

**This is the single most important finding in this research file.** CONTEXT.md's canonical_refs
describe the sidecar `install` handler at `installFlowRegistration.ts` (~L120-236) as the file
that "pushes `queued`→`installing` synchronously, then `await SteamGame.install()` at ~L168" — and
names it as D-01's watchdog target. **This description is stale.** Reading the current tree:

- `installFlowRegistration.ts`'s `install` handler (lines 109-133) now only builds a
  `DMQueueElement` and calls `await addToQueue(dmQueueElement)` — Phase 32 (D-01, "restoring
  Electron parity") retired the old direct `SteamGame.install()` bypass entirely. `addToQueue()`
  resolves once the element is QUEUED, not once installed.
- The real chain is: `addToQueue()` → `initQueue()` (`downloadmanager/downloadqueue.ts:121`, the
  queue-processing loop) → `await installQueueElement(element.params)`
  (`downloadmanager/downloadqueue.ts:161`) → **`downloadmanager/utils.ts:105-115`**, which does
  `await libraryManagerMap[runner].getGame(appName).install({...})` — **this is the actual,
  current location of the unbounded-await-turned-hang, and it is a file shared byte-for-byte with
  Electron** (not sidecar-only).

**This has two consequences for planning:**

1. **D-01b's watchdog must wrap the `.install()` await inside `downloadmanager/utils.ts`'s
   `installQueueElement()`, not inside `installFlowRegistration.ts`.** A watchdog placed at the
   old location would wrap a call that no longer does the real work — a no-op fix for the live
   bug.
2. **This file is runner-generic and Electron-shared.** Adding a watchdog here affects every
   runner (GOG/Legendary/etc.) under both Electron and Tauri, not just Steam under Tauri. This is
   consistent with D-01's "defense in depth" framing and does not conflict with D-11 (which is
   about NOT porting the Epic/GOG *DLC fan-out loop*, a different piece of code) — but the planner
   should scope the watchdog bound generously enough that it never false-trips a legitimately slow
   non-Steam install (see "Watchdog bound" below), or gate it to `runner === 'steam'` if a
   runner-agnostic bound cannot be chosen confidently. Given Electron's own CM connection is fresh
   at login and has never been observed to hang in this way, a runner-agnostic watchdog is very
   low-risk and is the simpler, more defense-in-depth-consistent choice.

### D-01a's surgical timeout fix already exists — verify, don't re-implement

Reading `src/backend/storeManagers/steam/depot.ts` and `installLocation.ts` on the current branch
confirms **every bare steam-user CM call identified in the debug report is already wrapped**:

- `installLocation.ts` (`fetchInstalldir` via `resolveSteamInstallTarget`) — wrapped with
  `withTimeout(..., STEAM_PICS_TIMEOUT_MS * 2, 'resolveSteamInstallTarget')` at the
  `runNativeDepotDownload` call site (`games.ts:1213-1217`).
- `depot.ts`'s `fetchAppInfo`/`getOwnedSets`/`fetchDlcInfos` (lines 429-486) — each individually
  wrapped with `withTimeout` using `STEAM_PICS_TIMEOUT_MS` (25s, single-app) or
  `STEAM_PICS_BULK_TIMEOUT_MS` (90s, bulk/many-appid).
  `withPlanBuildRetry`'s retry loop treats a stamped `isTimeout` error as non-retryable (fail-fast,
  not burn-3x).
- `depot.ts`'s `fetchDepotPlanEntry` (`getDepotDecryptionKey`/`getRawManifest`, lines 548-610) —
  also wrapped with `withTimeout(..., STEAM_PICS_TIMEOUT_MS, ...)`.
- `ensureSteamClientReady` (`clientSetup.ts`) is fully synchronous (`existsSync` probes only) — not
  a hang risk.
- `ensurePlatformsCaptured` (`games.ts:1383`, macOS-only, gates `install()` at line 701) calls
  `fetchMetadataIfNeeded`, which is bounded via an explicit `timeout: METADATA_FETCH_TIMEOUT_MS`
  option and does not touch steam-user/PICS at all (store-metadata HTTP call only) — ruled out.

**Conclusion: the "surgical fix" (D-01a) that the debug report calls for is already substantially
implemented as of Phase 30-07/WR-02/WR-03.** The planner's D-01a task should be a verification +
gap-audit pass (confirm every call site is wrapped, add any the above list missed — e.g. re-grep
for any NEW bare `client.` steam-user calls added since 30-07), not a from-scratch implementation.

### Why the live hang persisted despite 30-07 (the WR-01 badge-clear gap)

The debug report's own evidence (`## Evidence`, timestamp 2026-07-23) shows 30-07's jest suite was
green while the live retest still hung. Given the timeout wrapping above is real and already
converts a stale-socket hang into a bounded ~25-90s *rejection* (not an infinite hang), the most
likely explanation reconciling "code is bounded" with "live still hangs forever" is
**`downloadmanager/utils.ts:139`**:

```typescript
// current (excludes status === 'error' for steam):
if (runner !== 'steam' || deferredToSetup || wasAborted) {
  sendGameStatusUpdate({ appName, runner, status: 'done' })
}
```

When a Steam install's `.install()` call now correctly REJECTS/returns `{status:'error'}` after
one of the 25-90s bounds above, `installQueueElement`'s own `try { ... } catch { return {status:
'error'} }` handles it — but the **`finally` block's guard above deliberately does NOT push a
terminal `done` for a Steam runner unless `deferredToSetup` or `wasAborted` is also true.** The
comment explains why: normally, Steam's ACF poller owns clearing "installing"→"done" so a
poller-driven flow doesn't double-fire. But **a returned error never started an ACF poller** —
there is nothing left to clear the badge. **The user-visible symptom is therefore indistinguishable
from an infinite hang, even though the promise settled in well under 2 minutes.** This is precisely
WR-01/D-10, already scoped as a phase deliverable. **Implementing D-10 is very likely necessary
and possibly sufficient (combined with the already-existing 30-07 timeout bounds) to close the
visible symptom** — the watchdog (D-01b) and CM revalidation (D-02) are still required for defense
in depth and for making a rehydrated connection genuinely usable, per the fixed constraints, but
the planner should treat D-10 as load-bearing for the live-hang fix's visible success, not merely a
UX nicety.

**Other things to rule out on the live retest (diagnose-only, unconfirmed — the debug report's own
open items):** confirm the sidecar binary tested in the next live retest was rebuilt from the
current tree (a stale bundled/pre-30-07 sidecar binary would reproduce the exact "should be fixed
but isn't" symptom); confirm which branch (`installNative` vs `installBottleNative`) the reproducing
title actually takes — both route through the SAME `installDepotDownload`/`runNativeDepotDownload`
engine per `games.ts:810-836`, so this is a lower-probability culprit than the badge-clear gap
above, but should still be logged/traced during the D-13 live-verification pass.

## D-02: CM Socket Revalidation — `client.relog()` (VERIFIED against installed steam-user v5.3.0)

Read directly from `node_modules/steam-user@5.3.0` (the exact installed version — this is
source-code verification, not documentation lookup):

- **`client.steamID` is only cleared to `null` on an explicit logoff/disconnect flow**
  (`components/09-logon.js`, `_handleLogOff`). A silently-dropped connection (NAT timeout, dead
  TCP socket with no FIN/RST ever delivered) leaves `client.steamID` populated indefinitely —
  confirming the debug report's diagnosis that `ensureConnected`'s fast path
  (`this.client?.steamID` truthy → return `true`, `user.ts:71`) cannot detect this class of failure
  by inspecting local state alone. steam-user has an internal CM heartbeat
  (`_heartbeatInterval`, `09-logon.js:811-813`) driven by the server's `heartbeat_seconds`, but it
  is fire-and-forget from the client's side — a one-way keepalive send, not a liveness probe with a
  response the client can time out on.
- **`client.relog()` exists (`components/09-logon.js:604-624`) and is exactly the "I think my
  connection is stale" API.** It requires `this.steamID` truthy (throws otherwise — matches
  `ensureConnected`'s existing fast-path precondition) and `_logOnDetails.access_token` present
  (true for GameLib's refresh-token login flow — `SteamUser.connectSteamUserClient` logs on with a
  refresh/access token, matching `relogAvailable`'s `SteamID.Type.INDIVIDUAL` branch). It sets
  `_relogging = true` then calls `this.logOff()`.
- **`logOff()` → `_disconnect(false)` (`09-logon.js:513-522`) sends a `ClientLogOff` message with a
  bounded 4-second fallback**: if no `'disconnected'` event fires within 4s (i.e., the socket truly
  cannot deliver anything — the stale/half-open case), it force-tears-down the connection
  (`_connection.end(true)`), clears `steamID`, and calls `_cleanupClosedConnection()` regardless.
  Either way (clean logoff ack'd, or 4s timeout forcing teardown), `_handleLogOff` then fires with
  `_relogging === true`, which schedules a fresh reconnect via
  `_exponentialBackoff('logOn', 1000, 1000).then(() => this.logOn(true))` — reusing the same stored
  credentials, no user interaction required.

**Recommended D-02 implementation:** replace `ensureConnected`'s blind
`if (this.client?.steamID) return true` fast path with a bounded canary check before trusting the
existing connection for an install-critical call:

```typescript
// Illustrative shape — planner refines exact bound/label:
if (this.client?.steamID) {
  try {
    // Cheap canary: a single-appid getProductInfo is already the FIRST real
    // call the install path makes anyway (fetchInstalldir) — race it short.
    await withTimeout(
      this.client.getProductInfo([CANARY_APP_ID], [], true),
      CANARY_TIMEOUT_MS, // e.g. 5000 — much shorter than STEAM_PICS_TIMEOUT_MS
      'ensureConnected canary'
    )
    return true // genuinely alive — 0ms-ish healthy cost preserved for the common case
  } catch {
    // Stale/half-open — force a real revalidation instead of trusting steamID.
    this.client.relog()
    return await new Promise<boolean>((resolve) => {
      const grace = setTimeout(() => resolve(false), RELOG_GRACE_MS) // e.g. 20000, mirrors existing grace window
      this.client!.once('loggedOn', () => { clearTimeout(grace); resolve(Boolean(this.client?.steamID)) })
      this.client!.once('error', () => { clearTimeout(grace); resolve(false) })
    })
  }
}
```

This satisfies BOTH fixed constraints: bounded (canary + relog grace window are both timed, so
`ensureConnected` can never hang), and self-healing (a genuinely rehydrated-but-stale connection now
actually reconnects and the install proceeds, rather than merely failing fast). **Confidence: HIGH**
— `client.relog()`'s existence, preconditions, and teardown-then-reconnect behavior are read
directly from the installed package source, not inferred from documentation. The exact canary
app-id choice and bound values are a planner/implementation detail — reusing the existing
`fetchInstalldir` call itself as the canary (rather than a synthetic extra round-trip) may be
simpler than inventing a separate canary call; either is valid.

**One nuance to flag for the planner:** racing a *new* `getProductInfo` canary call against a
socket that steam-user's `_send()` queues onto is not guaranteed to be perfectly cheap/side-effect
free (the queued canary request is not cancelled when `withTimeout` times out locally — it's an
abandoned Promise, not a network-level cancel). This is the same caveat that already applies to
every other `withTimeout`-wrapped call in this codebase (`depot.ts`), so it is a pre-accepted,
already-consistent tradeoff, not a new risk this fix introduces.

## Watchdog Bound (D-01b) and Dialog Error-Timeout Bound (D-07)

**Watchdog bound:** Should exceed the SUM of every bounded step already inside `.install()`'s
critical path so it never false-trips a legitimately-slow-but-succeeding install. Per the verified
bounds above: `ensureSteamClientReady` (sync, ~0ms) + `resolveSteamInstallTarget`
(`STEAM_PICS_TIMEOUT_MS * 2` = 50s) + `buildDepotPlan`'s bulk calls (`STEAM_PICS_BULK_TIMEOUT_MS` =
90s, potentially retried up to `PLAN_BUILD_MAX_ATTEMPTS` times for non-timeout transient errors) +
actual depot download/decompress time (unbounded by design — this is the real download, expected to
take minutes for a large game). **The watchdog must NOT bound the actual download phase** — only
the pre-download PICS/plan-build phase already has hard bounds. Recommend: the watchdog fires only
if `.install()` has not settled within a generous ceiling that is clearly beyond any *pre-download*
phase completing (e.g., 5-10 minutes) — its job is catching a genuinely-never-settling await
somewhere NOT already covered by 30-07's wrapping (the belt-and-suspenders case), not replacing the
existing fine-grained bounds. **This is a planner/implementation discretion call within the "fixed
constraints" CONTEXT.md leaves open** — the concrete number matters less than the property "must
sit comfortably above the sum of all known-bounded pre-download steps, and must never fire during a
legitimately long depot download."

**Dialog error-timeout bound (D-07):** `requestRustInvoke()`'s existing generic RPC transport
already has its own timeout/rejection behavior (used identically by `dialog_open`/`dialog_save`
today) — D-06/D-07's real `showMessageBox` should reuse that existing transport timeout rather than
inventing a second one. On ANY rejection from `requestRustInvoke(RUST_DIALOG_MESSAGE, ...)`
(timeout, unknown channel, or a genuine Rust-side error), resolve the safe/cancel button index —
see "Dialog Cluster" below for how to determine which index that is per-caller.

## Dialog Cluster (D-06/D-07)

**Rust side is already 90% there.** `src-tauri/src/main.rs`'s existing `dialog_message` arm
(lines 368-393) already parses `message`/`kind`/`title` and calls
`app.dialog().message(message).kind(kind).blocking_show()` — but `blocking_show()` on a builder
with no `.buttons(...)` call defaults to a single OK button (returns `true` always), which is why
`electronStub` maps its bool result to `{response:-1}`-incompatible semantics today and the Phase 31
CR-01 fix chose not to wire it. **Verified via official Tauri docs/GitHub
(docs.rs/tauri-plugin-dialog, plugins-workspace v2 source, both cross-referenced):**
`tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(ok_label, cancel_label)` is a real,
current API — `blocking_show()` on a builder configured this way returns `true` if the
`ok_label` button was clicked, `false` if `cancel_label` was clicked. This maps naturally onto a
generalized `dialog_message` arm:

```rust
// Illustrative — planner refines exact arg-shape/response-index-mapping:
let buttons = args.first().and_then(|v| v.get("buttons")).and_then(|v| v.as_array());
if let Some(btns) = buttons.filter(|b| b.len() == 2) {
    let (label0, label1) = (btns[0].as_str().unwrap_or(""), btns[1].as_str().unwrap_or(""));
    builder = builder.buttons(MessageDialogButtons::OkCancelCustom(label0.into(), label1.into()));
    // blocking_show() -> true means label0/buttons[0] clicked -> response 0
    //                  -> false means label1/buttons[1] clicked -> response 1
}
```

This is a **data change to the existing `dialog_message` channel, confirming CONTEXT.md's own
suspicion** ("check whether `dialog_message` already generalized `dispatch_rust_channel` enough
that multi-button is a data change") — **yes, it does not need a new Rust channel**, only extending
the existing arm to read a `buttons` array and pick a `MessageDialogButtons` variant (2-button case
covers both current real callers; a 3+ button case is not exercised by any in-scope flow today —
confirm this before generalizing further than 2-button).

**Both real callers use `response` index-order that differs (0 vs 1 is the destructive branch)** —
verified by reading both call sites:
- `askForceUninstall` (`utils.ts:292-308`): `buttons: [no, yes]`; `response === 1` triggers
  `forceUninstall()` (destructive). Safe/cancel index = **0**.
- `promptI386Recovery` (`library.ts:1265-1296`): `buttons: [confirm, cancel]`; `response !== 0`
  declines. Safe/cancel index = **1**.

**There is no universal positional convention across these two callers** — the safe index is
caller-specific. The correct, standard mechanism for this is Electron's own real `showMessageBox`
API, which both callers could adopt: an explicit `cancelId` option (index of the button to treat as
"safe"/cancel). **Recommendation for D-07's fail-safe guarantee:** either (a) have
`electronStub.dialog.showMessageBox` read `options.cancelId` if the caller supplies it and default
to the array's last index otherwise (Electron's own documented fallback heuristic), and update both
real callers to pass an explicit `cancelId` (0 for `askForceUninstall`, 1 for `promptI386Recovery`)
removing ambiguity entirely; or (b) at minimum, verify the "default to last index" heuristic happens
to be correct for both current callers before relying on it silently (it is NOT correct for
`askForceUninstall`, where index 1/last is the destructive "yes" — so option (a), explicit
`cancelId`, is the safer choice and should be preferred). **On any `requestRustInvoke` rejection,
resolve `{response: cancelId, checkboxChecked: false}`** — never resolve `-1` once real forwarding
is wired (the `-1` sentinel was a Phase 31 stopgap specifically because there was no real dialog to
succeed OR fail against; a wired real dialog should fail toward the caller's OWN declared safe
choice).

**Sync members:** confirmed no in-scope Steam flow calls `showMessageBoxSync`/`showOpenDialogSync`
(only the two async `showMessageBox` callers above were found reachable from Steam install/uninstall
flows) — D-06's "stay logged no-op" call is confirmed correct, no escalation needed.

**Test to extend:** `src/backend/sidecar/__tests__/dialogStub.test.ts` already exists and covers
the current safe-sentinel behavior — this is the file to extend for the real multi-button + D-07
fail-safe-on-error assertions.

## Notification (D-05)

**Verified via WebSearch cross-referenced against official sources (docs.rs, v2.tauri.app,
plugins-workspace GitHub — MEDIUM-HIGH confidence, could not fetch the exact JS API reference page
content directly but multiple independent official-adjacent sources agree):** the icon parameter on
`@tauri-apps/plugin-notification`'s `sendNotification()` options is **optional**, not required.
**This resolves CONTEXT.md's open D-05 question: `nativeImage` does NOT need to be pulled into
scope** — it stays re-deferred to Phase 35 as originally proposed.

- **npm package:** `@tauri-apps/plugin-notification` — version `2.3.3` confirmed present on the npm
  registry (`npm view` succeeded). Not yet a project dependency (absent from `package.json`).
- **Rust crate:** `tauri-plugin-notification` — version `2.3.3` confirmed via `cargo search`,
  published by the official `tauri-apps/plugins-workspace` GitHub org (same org/repo as the
  already-installed `tauri-plugin-dialog`/`tauri-plugin-opener` — first-party, not a community
  fork). Not yet a Cargo dependency.
- Wiring pattern: mirror `dialog_message`'s `dispatch_rust_channel` arm — a new `notification_show`
  (or similarly named) channel that calls the Rust notification plugin's builder, forwarded from
  `electronStub.ts`'s `Notification` class (currently `isSupported()` hardcoded `false`, `show()`
  a no-op). `dialog.ts`'s `notify()` function (`backend/dialog/dialog.ts:61-79`) already gates on
  `Notification.isSupported()` and has an established "logged no-op" fallback (D-09 precedent) — no
  changes needed there beyond making `isSupported()` return `true` once wired and `show()` forward
  for real.

## Shell Cluster (D-05)

`tauri-plugin-opener` (already installed, `= "2"` in `Cargo.toml`, `@tauri-apps/plugin-opener
^2.5.4` in `package.json`) already provides `open_path`/reveal-style APIs on the Rust side for most
of what `shell.showItemInFolder`/`openPath` need. `shell.trashItem` needs either
`tauri-plugin-fs`'s trash-move capability or an OS-native trash call — this is the one item in this
cluster that may need a NEW plugin dependency (`tauri-plugin-fs` is also first-party/official).
Note also: `clipboard.writeText` in `electronStub.ts` is currently a Phase 31 D-04 "logged no-op,
deferred to Phase 33" item **not explicitly named in CONTEXT.md's D-05 scope list** — flag this for
the planner as a possible additional cheap win in the same cluster (small, already-scoped-elsewhere
gap; including or excluding it is a scope call, not a technical blocker).

## App Lifecycle Essentials (D-05)

`electronStub.ts`'s `app` object (lines 137-152) currently no-ops `quit`/`exit`/`relaunch`/`on`.
Grepping the Steam-adjacent, sidecar-reachable code (`utils.ts`, `launcher.ts` — both transitively
imported via `libraryManagerMap`) for real call sites confirms exactly two functions call these:
- `resetHeroic()` (`utils.ts:420-429`) — a "reset app data" settings feature; calls
  `app.relaunch()` + `app.quit()` after a 1s delay.
- A `handleExit`-shaped function (`utils.ts:265-290`, also called from `launcher.ts:362`) — kills
  child game processes and calls `app.exit()`.

**`main.ts`/`main_window.ts` (the REAL Electron app-lifecycle wiring: `whenReady`,
`window-all-closed`, `before-quit`, `second-instance`, single-instance lock) is NOT in the sidecar's
curated import graph at all** — window/process lifecycle under Tauri is owned entirely by
`src-tauri/src/main.rs`'s real `tauri::App`, not proxied through `electronStub`. **"App lifecycle
essentials" for this Steam-focused slice therefore means: wiring the sidecar's `app.quit()`/
`app.exit()`/`app.relaunch()` no-ops to forward a real "exit/relaunch the Tauri process" request to
Rust** (a new `rustInvoke` channel, e.g. `app_exit`/`app_relaunch`, calling Tauri's `AppHandle` exit
API) so that IF `resetHeroic()` or the child-process-kill exit path is exercised under Tauri, the
process genuinely exits/relaunches instead of leaving a zombie sidecar. This is a small, contained
change — not a general Tauri window-management port (which is explicitly out of scope,
`BrowserWindow` full management re-deferred).

## Parity Gaps: `session`/`powerSaveBlocker` (D-08/D-09)

**D-09 (`session`):** confirmed no Steam-reachable code path in the sidecar's curated import graph
touches Electron's `session` API (its only real use in `main.ts` is a `--spoof-windows` dev flag and
non-Steam login webviews — neither reachable from steam-user's headless client). Accept-and-document
is correct, no shim needed.

**D-08 (`powerSaveBlocker`):** searched for a maintained Tauri v2 wake-lock/keep-awake plugin. Three
candidates found, none met a "cheap and maintained" bar:
- `tauri-plugin-nosleep` (pevers) — latest real release `0.1.0` (May 2022); a `2.0.0-beta.1` exists
  (Feb 2024) but never graduated past beta; npm companion package last published ~2 years ago;
  dependency-freshness tooling (deps.rs) flags it as behind. **Not maintained enough.**
- `tauri-plugin-keepawake` (thewh1teagle) — exactly one release ever (`0.1.0`, npm
  `time.modified: 2024-12-23`, over a year stale as of this research date); marked `Proprietary`
  license (unusual/red flag for a plugin meant to be freely depended on). **Not maintained enough,
  single-shot release.**
- `tauri-plugin-screen-wake-lock` — surfaced in search but not independently verified for
  maintenance recency in this pass; given the other two candidates both failed the bar and this
  phase's own budget favors accept-and-document per CONTEXT.md's stated preference, this candidate
  was not pursued further. **If the planner wants to double-check before finalizing D-08, this is
  the one remaining candidate worth a five-minute look — but the weight of evidence across two
  other candidates already supports accept-and-document.**

**Conclusion: D-08 accept-and-document is confirmed correct** by this research — no viable
maintained shim exists. Document (as CONTEXT.md already specifies) that the system may sleep during
long depot downloads under Tauri, a minor UX regression vs Electron, revisit at cutover.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|--------------|
| `@tauri-apps/plugin-notification` | npm | Part of `plugins-workspace`, same release cadence as already-installed `@tauri-apps/plugin-opener` (first-party) | Official Tauri org package (high, matches `tauri-plugin-dialog`/`opener` usage already in this repo) | github.com/tauri-apps/plugins-workspace | OK | Approved |
| `tauri-plugin-notification` (Cargo crate) | crates.io | v2.3.3, official `tauri-apps` org (verified via `cargo search`) | N/A (crates.io doesn't surface weekly downloads via CLI) | github.com/tauri-apps/plugins-workspace | Not run (Cargo, no npm-registry slopcheck path) — same official org as two already-trusted, already-installed sibling crates | Approved (first-party, same repo/org as existing trusted deps) |
| `tauri-plugin-fs` (Cargo crate, only if `trashItem` needs it) | crates.io | Official `tauri-apps/plugins-workspace` | N/A | github.com/tauri-apps/plugins-workspace | Not run | Approved if adopted (first-party) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.
**Wake-lock plugin candidates surveyed but NOT recommended (per D-08 conclusion above, not a
disposition table entry since none are being installed):** `tauri-plugin-nosleep`,
`tauri-plugin-keepawake` — both rejected for maintenance-recency reasons documented above, not a
slopcheck/security concern.

**Note on research-session side effect:** running `slopcheck install @tauri-apps/plugin-notification`
during this research triggered a real `npm install` (slopcheck's own verification mechanism), which
transiently modified `package.json` and created a stray `package-lock.json`. Both were reverted
(`git checkout -- package.json`; stray `package-lock.json` removed) before this file was written —
no residual change was left in the working tree from this research session.

## Standard Stack

### Core (new dependencies for this phase)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `@tauri-apps/plugin-notification` | ^2.3.3 [VERIFIED: npm registry, official org] | JS-side Notification API | Official first-party Tauri plugin, same publisher/repo as already-installed `plugin-dialog`/`plugin-opener` |
| `tauri-plugin-notification` (Cargo) | 2.3.3 [VERIFIED: cargo search, official org] | Rust-side notification backend | Official first-party crate, matches existing `tauri-plugin-dialog = "2"` caret-major pinning convention already used in this repo |

### Supporting (already installed, reused unchanged)
| Library | Already Present | Role in this phase |
|---------|------------------|----------------------|
| `tauri-plugin-dialog` (Cargo, `"2"`) | Yes | Extend `dialog_message` arm for multi-button (D-06) — data change, not a new dependency |
| `tauri-plugin-opener` (Cargo + JS) | Yes | Backs `shell.showItemInFolder`/`openPath` (D-05) |
| `withTimeout.ts` (Phase 30 30-07) | Yes | Reused unchanged for D-01a verification pass and D-02's canary bound; do not invent a second timeout wrapper |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Accept-and-document `powerSaveBlocker` | `tauri-plugin-nosleep`/`tauri-plugin-keepawake` | Both fail the "maintained" bar (stale releases, one is single-shot with an unusual Proprietary license) — rejected |
| `tauri-plugin-fs` for `trashItem` | An OS-native shell-out (`rm` to a trash-can path per platform) | Hand-rolled trash semantics vary significantly across macOS/Windows/Linux (Recycle Bin vs `.Trash` vs freedesktop trash spec) — prefer the plugin if it covers this; verify plugin scope during planning |

**Installation:**
```bash
pnpm add @tauri-apps/plugin-notification
```
```toml
# src-tauri/Cargo.toml
tauri-plugin-notification = "2"
```

**Version verification:** confirmed live via `npm view @tauri-apps/plugin-notification version`
(→ `2.3.3`) and `cargo search tauri-plugin-notification` (→ `2.3.3`, official `tauri-apps` org,
alongside the sibling forks `tauri-plugin-notifications` 0.5.0-rc.11 and others — **do not confuse
the official singular-`notification` crate/package with the similarly-named third-party plural
`notifications` fork**; this project's existing convention (`tauri-plugin-dialog`,
`tauri-plugin-opener`) is exclusively official first-party plugins, so `tauri-plugin-notification`
(singular) is the correct match).

## Architecture Patterns

### System Architecture Diagram (install-hang fix, corrected)

```
Frontend (React)
    │ window.api.install(params)
    ▼
Sidecar: installFlowRegistration.ts  ── addToQueue(dmQueueElement) ──┐
    (registers 'install' invoke handler,                            │
     resolves once QUEUED — not once installed)                     │
                                                                     ▼
                                          downloadqueue.ts: initQueue()
                                          (queue-processing loop, runner-generic)
                                                                     │
                                                                     │ await installQueueElement(params)
                                                                     ▼
                                          downloadmanager/utils.ts: installQueueElement()
                                          ── THIS is where D-01b's watchdog wraps ──
                                          sendGameStatusUpdate('installing') [sync, already pushed]
                                                                     │
                                                                     │ await libraryManagerMap['steam']
                                                                     │       .getGame(appId).install(...)
                                                                     ▼
                                          SteamGame.install() → installNative()/installBottleNative()
                                          → installDepotDownload() → runNativeDepotDownload()
                                                                     │
                                              ┌──────────────────────┼──────────────────────┐
                                              ▼                      ▼                       ▼
                                   ensureSteamClientReady   resolveSteamInstallTarget   downloadSteamDepots
                                   (sync, no hang risk)     (withTimeout-wrapped,        → buildDepotPlan
                                                              50s bound) ── D-02's         (each PICS/manifest
                                                              ensureConnected fast-path    call withTimeout-
                                                              lives inside here            wrapped, 25s/90s)
                                                                     │
                                                                     ▼
                                          installResult: {status:'done'|'error'|'abort', ...}
                                                                     │
                                          installQueueElement's finally guard (line 139):
                                          if (runner !== 'steam' || deferredToSetup || wasAborted)
                                              sendGameStatusUpdate('done')
                                          ── D-10 extends this condition to ALSO fire on
                                             status === 'error' — the actual visible-hang fix ──
```

### Pattern: rustInvoke request/response forwarding (reuse, do not reinvent)
**What:** `requestRustInvoke(CHANNEL, args)` (sidecar) ↔ `dispatch_rust_channel(channel, args, app)`
(Rust) — a generic, already-proven correlated request/response mechanism.
**When to use:** Any new lifecycle channel needing a real answer back from Rust (dialog, shell,
notification, app-exit).
**Example (existing, to mirror):**
```typescript
// src/backend/sidecar/electronStub.ts (existing dialog_open pattern)
const result = await requestRustInvoke(RUST_DIALOG_OPEN, [options])
```
```rust
// src-tauri/src/main.rs (existing dispatch_rust_channel arm to mirror)
"dialog_open" => { /* ... */ Ok(Value::String(path.to_string())) }
```

### Anti-Patterns to Avoid
- **Placing the D-01b watchdog in `installFlowRegistration.ts`:** this file no longer performs the
  real install await (see corrected understanding above) — a watchdog there would not protect
  against the actual live hang.
- **Inventing a second timeout-wrapper utility:** `withTimeout.ts` already exists, is unit-tested,
  and is the established convention — reuse it for D-02's canary and any new D-01a gap-audit
  findings.
- **Trusting a positional "last button = safe" heuristic for `showMessageBox`:** confirmed
  incorrect for at least one of the two real callers (`askForceUninstall`'s destructive button is
  last, not first) — use an explicit `cancelId`-style mechanism instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| CM connection liveness detection | A custom TCP-level keepalive/ping prober against steam-user's internal socket | `client.relog()` | steam-user already implements the exact "revalidate + reconnect using stored credentials" flow, including its own bounded (4s) forced-teardown fallback — reinventing this at the application layer would duplicate internal steam-user socket-management logic this codebase has no visibility into |
| Multi-button native dialog | A hand-rolled correlated-callback IPC channel for button clicks | `tauri-plugin-dialog`'s `MessageDialogButtons::OkCancelCustom` + the existing `rustInvoke` request/response mechanism | Already installed, already proven for `dialog_open`/`dialog_save`; a new mechanism would duplicate `requestRustInvoke`/`dispatch_rust_channel` |
| OS notification delivery | A custom native notification binding | `tauri-plugin-notification` (official, first-party) | Cross-platform (macOS/Windows/Linux) native notification center integration is exactly what this plugin exists for |
| App process exit/relaunch under Tauri | A custom `process.exit()`/spawn-relaunch in the Node sidecar | Forward to Rust's `AppHandle` exit/relaunch via a new `rustInvoke` channel | The sidecar is a background child process — the OS-visible "app" the user perceives is the Tauri/Rust process; exiting only the Node sidecar would leave the real window open |

**Key insight:** every remaining piece of this phase's dialog/notification/app-lifecycle work has
an existing, official, already-proven forwarding pattern (`rustInvoke`) to reuse — the actual
novel engineering in this phase is concentrated entirely in the install-hang fix (D-01/D-02/D-03/
D-10), where the "don't hand-roll" lesson is: don't hand-roll a socket prober when steam-user
already ships `relog()`, and don't hand-roll a second timeout utility when `withTimeout.ts` exists.

## Common Pitfalls

### Pitfall 1: Stale canonical_refs pointing at the wrong file for the install-hang fix
**What goes wrong:** Implementing D-01b's watchdog in `installFlowRegistration.ts` (as CONTEXT.md's
canonical_refs literally describe) produces a fix that compiles, unit-tests green, but does NOT
protect the live install path, because Phase 32 already moved the real `.install()` await to
`downloadmanager/utils.ts`.
**Why it happens:** CONTEXT.md's canonical_refs were written referencing a pre-Phase-32
architecture; Phase 32's re-route (D-01, "restoring Electron parity") was a significant structural
change that post-dates the debug report's own investigation.
**How to avoid:** Wrap the watchdog around `downloadmanager/utils.ts`'s
`libraryManagerMap[runner].getGame(appName).install(...)` call (line ~105), confirmed via direct
read of the current tree.
**Warning signs:** A watchdog "implemented" per the plan that never fires even when manually
inducing a never-settling await — check whether the modified file is actually on the live call
path (`initQueue()` → `installQueueElement()`), not the queuing handler.

### Pitfall 2: Assuming a bounded rejection automatically clears the UI
**What goes wrong:** Believing that once `getProductInfo` calls reject within 25-90s (as they now
correctly do, post-30-07), the "installing" badge will clear. It will not, for a Steam runner,
unless `downloadmanager/utils.ts:139`'s finally-guard condition is also extended (D-10/WR-01).
**Why it happens:** The condition was written to suppress premature `done` pushes for Steam's
normal ACF-poller-driven flow (correct for that case) — but a returned/thrown *error* never starts
a poller, so nothing else ever clears the badge for that path.
**How to avoid:** Extend the guard to `if (runner !== 'steam' || deferredToSetup || wasAborted ||
status === 'error')` (exact boolean naming per planner's implementation) — this is D-10's whole
scope.
**Warning signs:** Live retest shows the badge STILL not clearing even after confirming (via added
logging) that `.install()` did settle with `{status:'error'}` within the expected bound.

### Pitfall 3: A "cheap CM probe" that isn't actually cheap or safe
**What goes wrong:** Issuing a synthetic canary `getProductInfo` call as a probe, without accounting
for the fact that `withTimeout`'s local race abandons (does not cancel) the underlying steam-user
call — a probe call that eventually DOES resolve late (after the local timeout already gave up and
moved on to `relog()`) can arrive and mutate PICS-cache-adjacent state unexpectedly.
**Why it happens:** `Promise.race` in JS has no way to cancel the loser — this is inherent to the
`withTimeout` pattern already used throughout this codebase, not new to D-02.
**How to avoid:** This is a pre-accepted, already-consistent tradeoff every other `withTimeout` call
site in `depot.ts` already lives with — do not treat it as a D-02-specific blocker, but do note it
in the implementation comment (matching the existing documentation style in `depot.ts`/
`withTimeout.ts`).

### Pitfall 4: Testing the dialog fail-safe guarantee against the wrong "safe" index
**What goes wrong:** Writing a D-07 test that asserts "on error, resolves index 0" (or "last
index") as a universal rule — this is wrong for one of the two real callers.
**Why it happens:** The two real callers (`askForceUninstall`, `promptI386Recovery`) use opposite
button-order conventions for their destructive action.
**How to avoid:** Test each caller's fail-safe behavior against its OWN declared safe index
(`cancelId`), not a shared assumption; extend `dialogStub.test.ts` per-caller.

## Code Examples

### Existing `withTimeout` usage to mirror for D-02's canary (verified current code)
```typescript
// Source: src/backend/storeManagers/steam/depot.ts:452-456 (current tree)
const { apps } = await withTimeout(
  client.getProductInfo([numericAppId], [], true),
  STEAM_PICS_TIMEOUT_MS,
  'fetchAppInfo getProductInfo'
)
```

### Existing rustInvoke forwarding pattern to mirror for Notification/app-exit
```typescript
// Source: src/backend/sidecar/electronStub.ts:228-249 (current tree, showOpenDialog)
showOpenDialog: async (_window?: unknown, options?: unknown) => {
  try {
    const result = await requestRustInvoke(RUST_DIALOG_OPEN, [options])
    /* ... */
  } catch (error) {
    console.warn(/* never throw to caller — total-method convention */)
    return { canceled: true, filePaths: [] }
  }
}
```

### steam-user's own `relog()` (verified from installed v5.3.0 source, for reference — not to be copied verbatim, wrap per this codebase's conventions)
```javascript
// Source: node_modules/steam-user/components/09-logon.js:604-624 (installed v5.3.0)
relog() {
  if (!this.steamID) { throw new Error('Cannot relog if not already connected'); }
  let relogAvailable = (
    this.steamID.type == SteamID.Type.ANON_USER ||
    (this.steamID.type == SteamID.Type.INDIVIDUAL && this._logOnDetails && this._logOnDetails.access_token)
  );
  if (!relogAvailable) { throw new Error('To use relog(), you must log on using a refresh token...'); }
  this._relogging = true;
  this.logOff();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `install`/`updateGame` direct `SteamGame.install()` bypass in `installFlowRegistration.ts` | Real `addToQueue()` → shared `downloadqueue.ts`/`downloadmanager/utils.ts` path | Phase 32 (D-01, "restoring Electron parity") | The install-hang fix's watchdog target moved — this is the load-bearing correction this research makes |
| `ensureConnected` trusts `client.steamID` alone | Should canary-probe + `client.relog()` on staleness | This research (D-02, not yet implemented) | Rehydrated-library installs can genuinely succeed instead of merely timing out cleanly |
| `dialog.showMessageBox` safe-sentinel no-op (`{response:-1}`) | Should forward to real `tauri-plugin-dialog` `OkCancelCustom` with an explicit `cancelId` fail-safe | This research + Phase 33 scope (not yet implemented) | Retires the Phase 31 CR-01 stopgap with a genuinely safe real dialog |

**Deprecated/outdated:**
- CONTEXT.md's canonical_refs description of `installFlowRegistration.ts` as the install-hang fix
  target: superseded by Phase 32's re-route. Use `downloadmanager/utils.ts` instead (see
  correction above).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | The visible "spinner hangs forever" symptom is primarily explained by the WR-01/D-10 badge-clear gap (not solely by a still-missing timeout) | Install-Hang Root Cause | If wrong, D-10 alone won't resolve the live symptom and the D-13 live-retest gate will still fail — the planner should treat the watchdog (D-01b) and D-02 as equally load-bearing, not as pure defense-in-depth, until the live retest confirms which fix(es) were actually necessary |
| A2 | A runner-agnostic (not Steam-gated) watchdog around `installQueueElement`'s `.install()` call is safe for Electron/other runners | Install-Hang Root Cause | If a non-Steam runner has a legitimately-slow install path this research did not audit, an over-tight watchdog bound could false-trip it under Electron too — mitigate with a generous bound (see Watchdog Bound section) |
| A3 | `tauri-plugin-screen-wake-lock` would also fail the "maintained" bar (not independently verified in this pass) | Parity Gaps (D-08) | Low risk — even if this candidate IS well-maintained, CONTEXT.md's own default (accept-and-document) remains an acceptable fallback; worth a quick planner double-check, not a blocker |
| A4 | The exact Tauri v2 `sendNotification` JS API options shape (icon optional) is confirmed via aggregated WebSearch rather than a direct fetch of the official JS reference page content | Notification | Low risk — multiple independent sources (docs.rs, official v2.tauri.app URL surfaced, GitHub source) converge on the same conclusion; if wrong, the fallback (provide a simple default icon) is cheap and does not require pulling in a full `nativeImage` port |

**If this table is empty:** N/A — see entries above.

## Open Questions (RESOLVED)

> All three were carried into the plans (33-01/33-02/33-03) during planning + pattern-mapping.
> Left here for provenance with the resolution inline.

1. **Does the D-10 badge-clear fix alone (without the watchdog/D-02) make the live D-13 retest
   pass?**
   - What we know: 30-07's timeout wrapping is real and already bounds every identified PICS call;
     the badge-clear guard gap is a plausible, sufficient explanation for the visible symptom.
   - What's unclear: whether some OTHER never-settling await (not yet identified) also contributes
     — the debug report's own diagnose-only items (stale sidecar binary, bottle-vs-native branch)
     were not independently re-verified in this research pass.
   - **RESOLVED:** defense-in-depth adopted — all three land (D-10 badge-clear + D-01b watchdog in
     Plan 33-01, D-02 relog in Plan 33-02). Sufficiency is deliberately settled by the D-13 live
     retest (Plan 33-05), not pre-determined; the watchdog guarantees the badge can never hang
     regardless of which await parks.

2. **Should the watchdog be gated to `runner === 'steam'` or left runner-generic?**
   - What we know: `installQueueElement` is genuinely shared with Electron and all runners; no
     evidence of a similar hang class in non-Steam runners was found in this pass.
   - What's unclear: whether GOG/Legendary installs have their own slow-but-legitimate phases this
     research did not audit that a runner-generic watchdog bound might not accommodate.
   - **RESOLVED:** Plan 33-01 uses a runner-generic watchdog with a generous bound (simpler, no new
     conditional); satisfies D-01/D-11.

3. **Exact `cancelId` retrofit for `askForceUninstall`/`promptI386Recovery`.**
   - What we know: their current safe indices (0 and 1 respectively) were read directly from
     source.
   - What's unclear: whether Electron's real `dialog.showMessageBox` type definitions in this
     codebase's `common/types` already support a `cancelId` field, or whether it needs adding.
   - **RESOLVED:** verified against source during pattern-mapping — `askForceUninstall`
     (`backend/utils.ts`, destructive=index 1 → `cancelId:0`), `promptI386Recovery`
     (`steam/library.ts`, destructive=index 0 → `cancelId:1`). Plan 33-03 assigns explicit
     per-caller `cancelId` values (not a positional heuristic) and adds the type field if absent.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js (sidecar runtime) | All sidecar work | ✓ | v26.2.0 (local dev env) | — |
| pnpm | Package management (project convention) | ✓ | 10.28.0 | — |
| Rust/Cargo toolchain | `src-tauri` build | ✓ (implied — `cargo search` succeeded) | not directly queried this pass | — |
| `npm run tauri:dev` | D-13 live verification gate | Not run in this research session (no live hardware retest performed here) | — | The planner/executor MUST run this live per D-13 before closing the phase; this research only confirms source-level fix locations |
| steam-user v5.3.0 (installed) | D-02's `relog()` API | ✓ | 5.3.0 (read directly from `node_modules`) | — |

**Missing dependencies with no fallback:** none identified for the coding work itself. The D-13
live hardware verification gate is a process requirement, not a missing tool — flagged here only
to note this research session did not (and could not, being investigation-only) perform it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (`jest.config.js`) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/dialogStub.test.ts` |
| Full suite command | `npm run test:ci` (`jest --runInBand --silent`) |

### Phase Requirements → Test Map
| Req ID (to be minted) | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| D-10/WR-01 | Steam install returning `{status:'error'}` force-clears the badge + shows dialog | unit | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts` (or wherever `installQueueElement` is unit-tested — verify path during planning) | ❌ Wave 0 — confirm exact existing test file for `downloadmanager/utils.ts`, not yet located in this pass |
| D-01b | Watchdog force-pushes terminal error if `.install()` never settles | unit | new test in the same file, mocking a never-resolving `install()` | ❌ Wave 0 |
| D-12/WR-03 | error/abort resolution through real `install`/`updateGame` invoke channels | unit | `npx jest src/backend/sidecar/__tests__/installFlows.test.ts` | ✅ file exists, extend it |
| D-06/D-07 | Real multi-button `showMessageBox` + fail-safe-to-decline on transport error | unit | `npx jest src/backend/sidecar/__tests__/dialogStub.test.ts` | ✅ file exists, extend it |
| D-13 | G-30-02 install-hang genuinely resolved live | manual/live-hardware | `npm run tauri:dev` + manual Install click on a Steam title with a rehydrated (stale-connection-eligible) library | N/A — cannot be automated; this is the phase's own load-bearing manual gate per D-13 |

### Sampling Rate
- **Per task commit:** the quick-run subset above.
- **Per wave merge:** `npm run test:ci`.
- **Phase gate:** Full suite green AND the D-13 live hardware retest, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Locate/confirm the existing unit test file for `downloadmanager/utils.ts`'s
      `installQueueElement`/`updateQueueElement` (not found in this research pass — search
      `src/backend/downloadmanager/__tests__/` during planning; if none exists, this is a genuine
      Wave 0 gap to create, since D-10/D-01b both need to modify this file).
- [ ] No other framework/config gaps — Jest is already fully configured and every other touched
      file (`installFlows.test.ts`, `dialogStub.test.ts`) already has a home.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|--------------------|
| V2 Authentication | No | This phase does not touch Steam auth/token flows (Phase 28/30 territory) |
| V3 Session Management | No | `session` is explicitly accept-and-documented as unreachable, not implemented |
| V4 Access Control | Yes (dialog fail-safe) | D-07's fail-safe-to-decline guarantee IS the access-control-relevant control here: a broken/timed-out confirmation dialog must never resolve to the destructive branch (`forceUninstall()`, i386 reinstall-and-reformat) — enforce via explicit `cancelId`, not a positional guess |
| V5 Input Validation | Yes | Any new `rustInvoke` channel arg (button labels, notification title/body) should be treated as untrusted-shaped data at the Rust boundary the same way `dialog_open`'s existing arms already validate/guard; no new external-input surface is introduced beyond what already exists |
| V6 Cryptography | No | No new secret/token handling in this phase; the existing Phase 28 D-04 fail-closed storage constraint (no `TOKEN_STORE_KEY`/secrets written via `configStore` from the sidecar) still applies transitively to anything this phase touches, but nothing here writes secrets |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| A degraded/timed-out confirm dialog silently defaulting to the destructive choice | Tampering / Elevation of Privilege (unintended destructive action without genuine user consent) | D-07's explicit fail-safe-to-decline via `cancelId`, verified per-caller (this research's Pitfall 4) |
| A watchdog or timeout swallowing a genuine in-progress download as a false "hang" | Denial of Service (self-inflicted — degraded UX, not an external attacker) | Generous watchdog bound sitting above the sum of all known pre-download bounds (see Watchdog Bound section) |

## Sources

### Primary (HIGH confidence — direct source-code verification)
- `node_modules/steam-user@5.3.0/components/09-logon.js`, `apps.js` — `relog()`, `logOff()`,
  `_handleLogOff()`, `getProductInfo()`'s internal 60-minute timeout, read directly from the
  installed package.
- Current repo tree: `src/backend/storeManagers/steam/{games.ts,depot.ts,installLocation.ts,
  clientSetup.ts,user.ts}`, `src/backend/downloadmanager/{utils.ts,downloadqueue.ts}`,
  `src/backend/sidecar/{installFlowRegistration.ts,electronStub.ts}`,
  `src/backend/dialog/dialog.ts`, `src/backend/main.ts`, `src/backend/main_window.ts`,
  `src/backend/utils.ts`, `src/backend/storeManagers/steam/library.ts`,
  `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`, `package.json`.
- `npm view @tauri-apps/plugin-notification version` (→ 2.3.3), `cargo search
  tauri-plugin-notification` (→ 2.3.3, official org) — direct registry queries.

### Secondary (MEDIUM confidence — WebSearch cross-referenced against official/adjacent sources)
- `docs.rs/tauri-plugin-dialog`, `github.com/tauri-apps/plugins-workspace` (dialog `lib.rs`),
  `v2.tauri.app/plugin/dialog/` — `MessageDialogButtons::OkCancelCustom` API confirmed across
  multiple official/near-official sources.
- `v2.tauri.app/reference/javascript/notification/`, `github.com/tauri-apps/plugins-workspace`
  (notification plugin) — icon-optional confirmed via aggregated search, not a direct single-page
  fetch of full API reference content.
- Wake-lock plugin landscape: `github.com/pevers/tauri-plugin-nosleep`,
  `github.com/thewh1teagle/tauri-plugin-keepawake`, `crates.io`/`npm` publish-date lookups for both.

### Tertiary (LOW confidence — not independently re-verified)
- `tauri-plugin-screen-wake-lock`'s maintenance status (surfaced in search, not independently
  checked — see Open Question / Assumption A3).
- The exact live-hang residual cause (badge-clear gap vs some undiscovered fourth cause) — this is
  a diagnose-only conclusion pending the D-13 live hardware retest; treated as the primary
  hypothesis, not a certainty.

## Metadata

**Confidence breakdown:**
- Install-hang architecture/fix locations: HIGH — verified by directly reading the current
  source tree, not inferred from stale docs.
- `client.relog()` as the D-02 mechanism: HIGH — verified from the exact installed steam-user
  version's source.
- Dialog/notification Tauri plugin APIs: MEDIUM-HIGH — verified via multiple official/near-official
  WebSearch sources, not a direct Context7 fetch (Context7 MCP tools were not available in this
  environment; CLI fallback `ctx7` was also not present — WebSearch was used per the documented
  fallback chain).
- D-08 wake-lock plugin landscape: MEDIUM — two of three candidates thoroughly checked and
  rejected; the third not independently re-verified (see A3).
- Whether D-10 alone resolves the live D-13 symptom: LOW/diagnose-only — this is the single most
  important thing the actual live retest must confirm or refute.

**Research date:** 2026-07-24
**Valid until:** ~14 days for the Tauri plugin ecosystem findings (fast-moving); the install-hang
architectural findings (source-code-verified) remain valid until the next structural re-route of
the install path (should be treated as stale again if a future phase moves `installQueueElement`'s
call site, the same way this research found CONTEXT.md's own canonical_refs already were).
