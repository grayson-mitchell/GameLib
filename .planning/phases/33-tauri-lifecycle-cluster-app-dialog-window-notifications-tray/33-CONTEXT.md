# Phase 33: Tauri lifecycle cluster — app, dialog, window, notifications, tray, protocol - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Give real Tauri behavior to the flow-unblocking parts of the 44-file lifecycle
cluster that the skeleton left stubbed, **and** close the two headline carry-ins
folded into this phase by ROADMAP: the parked **G-30-02** Steam install-spinner
hang and the Phase 32 code-review warnings **WR-01/02/03**. This continues
SEAM.md's Incremental-Port Checklist (steps 1–6) and holds both Load-Bearing
Invariants (A: `window.api` attach order; B: unported channels stay non-fatal).

The cluster is larger than one phase's worth, so the governing decision is
**scope shape** (D-05): port what unblocks a user-facing flow plus the cheap
medium-value items now; re-defer the low-value remainder to the Phase 35 cutover
non-fatally. Electron still runs byte-identically (`npm start`) — "re-defer to
cutover" remains a legitimate landing spot (additive/reversible invariant).

**In scope:**
- **G-30-02 install-hang fix** — BOTH remedies (D-01): (a) bound every unbounded
  `getProductInfo`/PICS await + revalidate the stale sidecar CM socket (surgical
  root cause), and (b) a sidecar-handler watchdog around `await install()` that
  force-pushes a terminal error if it never settles (belt-and-suspenders).
- **`dialog.showMessageBox`** real multi-button behavior (D-06) — retire the
  Phase 31 CR-01 `{response:-1}` safe-sentinel no-op, with a fail-safe-to-decline
  guarantee on any error/timeout (D-07).
- **`app` lifecycle essentials** (D-05) — window close/minimize/quit,
  single-instance, and the app-quit handlers, real under `tauri::App`.
- **`Notification`** (Tauri notification plugin) and the remaining **`shell`**
  methods (`showItemInFolder`/`trashItem`/`openPath`) — the cheap medium-value
  wins (D-05).
- **WR-01** (D-10) — restore the richer install-error surface: a returned/thrown
  install error force-clears the "installing" badge AND shows a failure dialog,
  consistent with the G-30-02 watchdog UX (D-03).
- **WR-03** (D-12) — add a test driving `error`/`abort` through the real
  `install`/`updateGame` invoke channels (the coverage gap that let WR-01 ship).
- **`session`/`powerSaveBlocker`** explicitly scoped as accept-and-document
  parity gaps (D-08/D-09) — logged no-ops, never silent.
- SEAM.md §1/§3 update + a declared `33-PORTED-CHANNELS.md` (checklist step 5).

**Explicitly OUT of scope (re-deferred non-fatal per Invariant B):**
- **tray**, custom-**protocol** registration (`gamelib://` OAuth callbacks are
  Epic/GOG/Humble, not Steam), full **multi-window** (`BrowserWindow`), and
  **`nativeImage`** — re-deferred to the Phase 35 cutover (D-05).
- The **`updater`** hooks — moved to **Phase 34** (packaging + the actual
  auto-update feed/signing/notarization); wiring update hooks with no feed to
  point at is premature here (D-05a). Updater channels stay logged no-ops.
- **Boot-time auto-resume** of interrupted installs (Phase 32 D-05) — stays
  deferred to Phase 35; fix the on-demand install hang only, don't pull the
  bottle-branch auto-open-Steam bug + startup-crash risk into scope (D-04).
- **`session`/`powerSaveBlocker`** real parity — accepted-and-documented gaps,
  not resolved this phase (D-08/D-09).
- **WR-02** as a fan-out port — re-scoped, not ported (D-11): the sidecar install
  path is declared Steam-focused; Epic/GOG DLC fan-out is NOT ported.
- The two **synchronous** dialog members (`showMessageBoxSync`/
  `showOpenDialogSync`) — stay logged no-ops (D-06); sync-over-async mismatch, no
  in-scope Steam flow hits them.
- CrossOver **bottle** / macOS **bridge** install branches (Phase 30 D-07).
- Any change to the Electron build. `npm start` and `npm run tauri:dev` must both
  work (additive/reversible invariant). Windows/Linux packaging (Phase 34).

</domain>

<decisions>
## Implementation Decisions

### G-30-02 install-hang fix (the headline user-facing item)

- **D-01 — Fix with BOTH remedies (defense in depth).** Implement (a) the
  surgical root-cause fix — bound every unbounded steam-user `getProductInfo`/PICS
  await on the native pre-download path (`fetchInstalldir` via
  `resolveSteamInstallTarget`; `fetchAppInfo`/`getOwnedSets`/`fetchDlcInfos` in
  `buildDepotPlan`) so a present-but-unresponsive CM can never park install
  forever — AND (b) a sidecar-handler watchdog around `await install()` in
  `installFlowRegistration.ts` that force-pushes a terminal error if `install()`
  never settles within a bound. The watchdog guarantees the badge can never hang
  regardless of WHICH downstream await parks; the surgical fix makes installs
  actually succeed. Debug file explicitly recommends both. Rejected: watchdog-only
  (leaves the real stale-socket bug — installs fail cleanly instead of hanging),
  surgical-only (any other never-settling await still hangs, no backstop).

- **D-02 — CM socket reconnect aggressiveness → research decides, with a fixed
  constraint.** The root cause is `ensureConnected`'s fast-path (`user.ts:71`)
  returning `true` on any truthy `client.steamID` WITHOUT revalidating a
  possibly-half-open socket. Research/planner determines whether the socket can be
  cheaply probed/revalidated vs whether a full reconnect is warranted — **but the
  constraint is fixed:** a rehydrated-library install (library came from the
  persisted 377-game store, connection stale by Install time) must reliably
  *succeed*, not merely fail fast. The "bound so it never hangs" part (D-01) is
  fixed regardless of the reconnect approach.

- **D-03 — Watchdog/error UX: clear badge + error dialog.** When the watchdog
  fires (or any install failure occurs), force a terminal `done` with error status
  AND surface a failure dialog/toast so the user knows the install failed and why
  (e.g. "Steam connection stale, try again") — not a silent badge-clear. This is
  the honest surface and anchors WR-01 (D-10) into one coherent error story.

- **D-04 — Keep boot-time auto-resume deferred to Phase 35.** Fix the on-demand
  install hang only; leave `initQueue(isStartup=true)` auto-resume suppressed
  (Phase 32 D-05). Re-enabling would pull the parked bottle-branch
  auto-open-Steam-in-CrossOver bug and startup-crash risk into scope, and it is
  not needed to prove the install fix. Rejected: re-enable now (own risk surface,
  no proven gain while the bottle branch is out of scope).

### Cluster scope shape (the governing decision)

- **D-05 — Flow-unblocking + cheap wins; re-defer the low-value remainder.**
  REAL Tauri behavior now for: `dialog.showMessageBox` multi-button (D-06), `app`
  lifecycle essentials (window close/minimize/quit, single-instance), `Notification`
  (Tauri notification plugin), and the remaining `shell` methods
  (`showItemInFolder`/`trashItem`/`openPath`). RE-DEFER non-fatal to the Phase 35
  cutover: **tray**, custom-**protocol** registration, full **multi-window**
  (`BrowserWindow`), **`nativeImage`** (only needed once tray/notifications need
  icons — research confirm whether the Tauri notification plugin needs it). Matches
  the port-by-user-value discipline every prior slice used. Rejected: minimal
  (dialog + app only — leaves cheap wins on the table), comprehensive (port the
  whole cluster — high effort on low-value items for a Steam-focused build).

- **D-05a — Updater hooks → Phase 34.** Move updater wiring to Phase 34 where the
  actual update feed/signing/notarization live; wiring update hooks with no feed to
  point at is premature. Phase 33 leaves updater channels as logged no-ops.

### Dialog cluster (the one "real now" item with a safety history)

- **D-06 — `showMessageBox` real multi-button; the two Sync members stay logged
  no-ops.** Retire the Phase 31 CR-01 safe-sentinel (`{response:-1}`) no-op —
  `showMessageBox` returns the actual clicked button via `rustInvoke` →
  `tauri-plugin-dialog` (reuse the Phase 30/31 forward-to-transport shape, do not
  invent a new correlated mechanism). `showMessageBoxSync`/`showOpenDialogSync`
  stay logged no-ops returning safe defaults (sync-over-async mismatch; **planner
  note:** re-confirm during research that no in-scope flow genuinely calls a Sync
  member — if one does, escalate, do not silently degrade).

- **D-07 — Fail-safe to decline on any dialog error/timeout.** Making
  `showMessageBox` real reopens the CR-01 risk (auto-confirming destructive
  multi-button backend confirms: `promptI386Recovery`, `askForceUninstall`). The
  guarantee: return the real clicked button on success, but ANY error/timeout/
  transport failure defaults to the SAFE/cancel button (the decline sentinel),
  never the destructive one. A broken dialog can never auto-confirm a destructive
  branch. Rejected: strict passthrough (a degraded dialog could resolve to an
  unintended button).

### session / powerSaveBlocker parity gaps (must be explicitly scoped)

- **D-08 — `powerSaveBlocker`: accept + document.** Logged no-op; document that
  under Tauri the system may sleep during long depot downloads (minor UX
  regression vs Electron). No direct Tauri v2 equivalent. Revisit at cutover if
  users complain. Rejected: shim now (macOS `caffeinate`/plugin — effort against
  low proven value for a phase already large). The gap is recorded explicitly,
  never silent. **Planner note:** if research finds a cheap maintained Tauri v2
  wake-lock plugin, a shim is acceptable — the "explicitly scoped, never silent"
  constraint is what's fixed.

- **D-09 — `session`: accept + document.** Logged no-op; document that
  session-dependent behavior (proxy config, cache clearing, non-Steam
  login-webview cookies) is deferred to the Phase 35 cutover. A Steam-focused
  Tauri build does not exercise it (steam-user is headless — no webview). Rejected:
  shim-what-Steam-needs unless research finds a session use on a Steam-reachable
  path (then shim just that slice).

### Phase 32 review carry-ins (WR-01/02/03)

- **D-10 — WR-01: restore the richer install-error surface.** A returned/thrown
  install error force-clears the "installing" badge AND shows a failure dialog —
  consistent with the D-03 watchdog UX. One coherent error story: however
  `install()` fails (never-settles → watchdog, returns `error`, throws), the user
  sees badge-clear + dialog. Rejected: strict Electron parity (badge-clear only,
  no dialog — inconsistent with the D-03 watchdog path and quieter for the user).
  This is a *design call*, not a mechanical patch — the shared
  `installQueueElement` force-clear condition (`downloadmanager/utils.ts:139`)
  currently excludes plain `status === 'error'`; the fix extends it.

- **D-11 — WR-02: re-scope the parity claim, do not port the fan-out.** Document
  that the sidecar install path is Steam-focused; Electron's Legendary/Epic DLC
  fan-out loop is NOT ported (consistent with Phase 31 D-01 leaving non-Steam
  runners rejecting non-fatally). A non-Steam install with `installDlcs`
  populated becomes a **logged/guarded** case, not a silent DLC drop — the
  boundary is declared. Rejected: port the fan-out (pulls non-Steam runner
  behavior into a Steam-focused build that otherwise defers those runners).

- **D-12 — WR-03: add the error-path test (given).** Add a test driving an
  `error`/`abort` resolution through the real `install`/`updateGame` invoke
  channels — the coverage gap that let WR-01 ship. Since D-01/D-03/D-10 all touch
  the install-error path, this test lands as part of that work.

### Sign-off (load-bearing for THIS phase specifically)

- **D-13 — G-30-02 requires LIVE hardware proof to close the phase.** Unlike
  every prior "unit-proven, live-deferred" slice, the install-hang fix MUST be
  verified live under `npm run tauri:dev` (click Install on a Steam title with
  `enableSteamNativeInstall:true`, signed-in library; the badge resolves —
  succeeds or clean error dialog — and NEVER hangs) before the phase closes. Jest
  was provably green while the live build hung TWICE (30-05, 30-07 retests) — this
  bug class only exists against a real, stale sidecar CM socket that mocks cannot
  reproduce. The REST of the cluster (dialog/app/notification/shell) may stay
  unit-proven + live-UAT-deferred per the usual pattern. Rejected: whole-phase
  unit-proven + live-deferred (the exact trap that re-declared G-30-02 "fixed"
  twice already).

### Claude's Discretion

- **D-02** CM socket reconnect approach (probe/revalidate vs full reconnect) —
  research decides; the "rehydrated install must succeed" + "bound so it never
  hangs" constraints are fixed.
- The exact watchdog bound/interval (D-01) and dialog error-timeout bound (D-07)
  follow from measured/reasonable timeouts during research.
- Whether `nativeImage` is genuinely re-deferrable depends on whether the Tauri
  notification plugin needs an icon object (D-05) — research confirm.
- Whether the new lifecycle channels live in an extended existing
  `*FlowRegistration.ts` or a new curated module is a planner call, as long as
  curated-import discipline holds and no `src/backend/sidecar/` file imports the
  real `electron` module.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The parked bug this phase closes (read FIRST)
- `.planning/debug/steam-install-spinner-hangs-tauri-live-g3002.md` — **the
  G-30-02 root-cause report.** The "PARKED → Phase 33" section names the two
  remedies D-01 adopts (surgical getProductInfo bound + handler watchdog) and the
  four diagnose-only starting points (native-vs-bottle branch, awaits before
  `resolveSteamInstallTarget`, `ensureConnected` fast-path, stale-sidecar-binary
  check). The `## Resolution` block has the full root cause: unbounded
  `getProductInfo` PICS await on a present-but-unresponsive CM (`ensureConnected`
  fast-path returns true on any truthy `client.steamID` without revalidating the
  socket → never settles → no terminal push → spinner forever).

### The seam this phase extends (read first)
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — **the governing
  document.** §3 the ranked deferred backlog (the `app`/`dialog`/`BrowserWindow`/
  `shell`/`nativeImage`/`Notification`/tray/protocol/`session`/`powerSaveBlocker`
  rows this phase acts on — priority 1/2/3/4/6/7/8/9); §"Incremental-Port
  Checklist" steps 1–6; §"Load-Bearing Invariants" A (`window.api` attach order)
  and B (unported channels stay non-fatal) — both binding; §"Accepted Constraints".
- `.planning/phases/32-.../32-CONTEXT.md` — D-05 (boot auto-resume deferred to
  "whichever phase fixes G-30-02" = HERE; D-04 keeps it deferred to Phase 35),
  D-06 (the doubly-gated deferred-UAT precedent naming G-30-02), D-01 (the
  `addToQueue` re-route whose error-force-clear condition WR-01/D-10 extends).
- `.planning/phases/31-.../31-CONTEXT.md` and `31-PORTED-CHANNELS.md` — D-03 (the
  CR-01 `showMessageBox` safe-sentinel D-06 retires; the sync-pair no-op boundary
  D-06 keeps), D-04 (`shell`/`clipboard` conveniences deferred to THIS phase — the
  `shell` remaining methods D-05 now ports).
- `.planning/phases/30-.../30-CONTEXT.md` + `30-PORTED-CHANNELS.md` — D-07 (only
  native depot branch; bottle/bridge out), D-08 (curated-module discipline), the
  `installFlowRegistration.ts` install path D-01's watchdog wraps.
- `.planning/phases/28-.../28-CONTEXT.md` — D-04 (sidecar must never write
  `TOKEN_STORE_KEY`/secrets into `configStore`) — any new lifecycle channel that
  touches storage inherits the fail-closed constraint.

### Spike blueprint
- `.planning/spikes/009-node-backend-headless-sidecar/README.md` — the 16-API /
  44-file / 220-endpoint coupling map; the per-API touch counts (`app` ×26,
  `dialog` ×9, `BrowserWindow` ×7, `shell` ×5, `nativeImage` ×4, `Notification`
  ×3, `session`/`powerSaveBlocker` ×2/×1) that rank the cluster.
- `.planning/spikes/011-*` — the spike that flagged `session`/`powerSaveBlocker`
  as the two Tauri v2 parity soft spots (D-08/D-09 accept-and-document them).

### Existing code — G-30-02 fix targets (Electron/sidecar parity source)
- `src/backend/sidecar/installFlowRegistration.ts` — the sidecar `install`
  handler (~L120-236): pushes `queued`→`installing` synchronously, then
  `await SteamGame.install()` at ~L168; the finally-guard (~L232) and catch
  (~L223) only fire if that await settles. **D-01's watchdog wraps this await;
  D-10's richer error surface fires here.**
- `src/backend/storeManagers/steam/user.ts:70-143` — `ensureConnected`; the
  fast-path at L71 returns true on any truthy `client.steamID` without
  revalidating the socket (**D-02's target**).
- `src/backend/storeManagers/steam/installLocation.ts:161` — `fetchInstalldir`'s
  bare `await client.getProductInfo(...)` reached via `resolveSteamInstallTarget`
  (L220-243) — the FIRST unbounded PICS await on the path (D-01 surgical target).
- `src/backend/storeManagers/steam/depot.ts:412,430,447` — `fetchAppInfo`/
  `getOwnedSets`/`fetchDlcInfos` bare `getProductInfo` awaits in `buildDepotPlan`
  (L579-635) via `withPlanBuildRetry` (D-01 surgical targets).
- `src/backend/storeManagers/steam/games.ts:1157-1265` — `runNativeDepotDownload`
  step ordering (client-ready gate → `resolveSteamInstallTarget` →
  `downloadSteamDepots`); confirm `installNative` vs `installBottleNative` branch
  on the LIVE path (parked-note diagnose-only item).

### Existing code — the lifecycle cluster being ported
- `src/backend/main.ts` — `app` lifecycle handlers (quit/close/single-instance),
  updater registration, protocol registration, tray setup (D-05 scope split).
- `src/backend/main_window.ts` — `getMainWindow()` / window management (D-05 app
  lifecycle essentials).
- `src/backend/dialog/dialog.ts` — `showDialogBoxModalAuto` (L8), `notify` (L61);
  the multi-button confirm surface D-06 makes real and the `Notification` path D-05
  ports.
- `src/backend/protocol.ts` — custom-protocol handler (re-deferred to Phase 35, D-05).
- `src/backend/downloadmanager/utils.ts:139` — the shared `installQueueElement`
  force-clear condition (`runner !== 'steam' || deferredToSetup || wasAborted`)
  that excludes `status === 'error'` — **WR-01/D-10 extends this.**
- `src/preload/api/` + `src/common/types/ipc.ts` — the typed signatures for the
  lifecycle channels every ported channel must match.

### Existing code — the sidecar pattern to mirror
- `src/backend/sidecar/electronStub.ts` — where D-06's real `showMessageBox`,
  D-05's `Notification`/`shell` methods, and D-08/D-09's `session`/
  `powerSaveBlocker` logged no-ops go; mirror the `dialog_open`/`dialog_message`/
  `dialog_save` forward-to-transport pattern; **every no-op must LOG.**
- `src/backend/sidecar/handlers.ts` — the registration site; the new lifecycle
  flow registration slots in here. Uses `electronStub`'s `ipcMain`, never
  `backend/ipc`.
- `src/backend/sidecar/sidecarRpc.ts` — `requestRustInvoke()` (the generic
  sidecar→Rust channel D-06 reuses); `pushFrontendMessage` (~L248-258, the
  channel-agnostic relay D-03's terminal push rides); owns `UNPORTED_CHANNEL_MARKER`
  (Invariant B).
- `src-tauri/src/main.rs` — `dispatch_rust_channel()` (where a new
  `tauri-plugin-dialog` multi-button channel is added if `dialog_message` didn't
  generalize); `frontend_message` relay is already generic (no Rust change expected
  for pushes — if one is needed, stop and ask why, per the Phase 29 `storeChanged`
  precedent).

### Tests to mirror / not break
- `src/backend/sidecar/__tests__/skeletonFlows.test.ts` /
  `settingsFlows.test.ts` / `installFlows.test.ts` — the new-channel + install
  error-path test shape (D-12 extends the install error coverage here).
- `src/backend/sidecar/__tests__/electronUntouched.test.ts` — the
  additive/reversible guard; both builds must still work.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`installFlowRegistration.ts`'s existing install handler** — D-01's watchdog
  and D-10's error surface extend it; the `queued`→`installing`→terminal push
  shape is already there, only the never-settle and error branches are missing.
- **`dialog_open`/`dialog_message`/`dialog_save` `rustInvoke` channels
  (Phase 30/31)** — the exact forward-to-transport precedent D-06's real
  multi-button `showMessageBox` reuses (check whether `dialog_message` already
  generalized `dispatch_rust_channel` enough that multi-button is a data change).
- **The `frontendMessage` → `frontend_message` push relay** — channel-agnostic,
  proven 4× (`pushGameToLibrary`/`storeChanged`/`gameStatusUpdate`/`progressUpdate`);
  D-03's terminal error push rides it (zero Rust changes expected).
- **`withTimeout.ts` (Phase 30 30-07)** — the existing bound-an-await helper; D-01's
  surgical getProductInfo bounds reuse it rather than inventing a new wrapper.

### Established Patterns
- Checklist step 2 curated import: import only what each lifecycle flow needs; no
  `src/backend/sidecar/` file imports the real `electron` module.
- Checklist step 3: a newly-required Electron API gets real behavior OR a **logged**
  no-op — never silent (D-06 sync-pair, D-08/D-09 session/powerSaveBlocker, and any
  re-deferred cluster member are all logged no-ops by design).
- Invariant B: every re-deferred lifecycle channel (tray/protocol/multi-window/
  nativeImage/updater) keeps rejecting non-fatally; adding handlers must not turn a
  warning into a crash.
- Fail-safe-to-decline for destructive confirms (D-07) — a degraded dialog defaults
  to cancel, never the destructive button (the CR-01 lesson made structural).

### Integration Points
- `installFlowRegistration.ts` handler ↔ watchdog around `await install()` ↔
  terminal `done`+error push (D-01/D-03/D-10).
- `ensureConnected` fast-path ↔ getProductInfo PICS awaits ↔ `withTimeout` bounds
  (D-01/D-02).
- `electronStub.ts` `showMessageBox` ↔ `tauri-plugin-dialog` multi-button channel
  in `dispatch_rust_channel()` (D-06), fail-safe default on error (D-07).
- `electronStub.ts` `Notification`/`shell` methods ↔ Tauri notification/opener/fs
  plugins (D-05).
- `session`/`powerSaveBlocker` ↔ logged-no-op path (D-08/D-09).

</code_context>

<specifics>
## Specific Ideas

- **The install fix is unit-untestable at its core.** Jest was green while the
  live build hung twice (30-05, 30-07). The bug only exists against a real, stale
  sidecar CM socket. D-13 makes live proof a phase-close gate for G-30-02
  specifically — do not let "wired + unit-proven" re-declare it fixed.
- **One coherent error story.** However `install()` fails — never-settles
  (watchdog), returns `error`, or throws — the user sees badge-clear + a failure
  dialog (D-03 + D-10). Don't let the three failure modes diverge in UX.
- **Both remedies, not one.** The watchdog (D-01b) is the guarantee the badge
  never hangs regardless of which await parks; the surgical fix (D-01a/D-02) is
  what makes rehydrated-library installs actually succeed. Neither alone is enough.
- **Fail-safe-to-decline is non-negotiable for the real dialog.** A broken
  `showMessageBox` must never auto-confirm force-uninstall / i386-recovery (D-07,
  the CR-01 guarantee kept).
- **Every scoped gap LOGS.** `session`/`powerSaveBlocker` (D-08/D-09), the sync
  dialog members (D-06), and every re-deferred cluster member are *decisions*, not
  silent no-ops. Declare them in `33-PORTED-CHANNELS.md`.
- **Scope shape is the discipline, not a shortcut.** Re-deferring tray/protocol/
  multi-window/nativeImage/updater to Phase 34/35 is legitimate because Electron
  still runs byte-identically — the additive/reversible invariant holds.

</specifics>

<deferred>
## Deferred Ideas

- **`updater` hooks** — moved to **Phase 34** (packaging + the auto-update feed);
  wiring update hooks with no feed is premature (D-05a). Logged no-ops until then.
- **tray / custom-protocol registration / full multi-window (`BrowserWindow`) /
  `nativeImage`** — re-deferred non-fatal to the **Phase 35 cutover** (D-05); low
  value for a Steam-focused build.
- **Boot-time auto-resume of interrupted installs** (`initQueue(isStartup=true)`)
  — stays deferred to **Phase 35** (D-04, Phase 32 D-05); the bottle-branch
  auto-open-Steam bug lives on that path.
- **`session`/`powerSaveBlocker` real parity** — accepted-and-documented gaps
  (D-08/D-09); revisit at the Phase 35 cutover (or shim earlier if a cheap
  maintained Tauri v2 plugin surfaces).
- **`showMessageBoxSync`/`showOpenDialogSync` real (sync-over-async)** — stay
  logged no-ops (D-06); revisit only if a ported flow needs a truly-sync dialog.
- **WR-02 Epic/GOG DLC fan-out port** — re-scoped, not ported (D-11); natural home
  is whichever future phase gives non-Steam runners first-class Tauri support,
  otherwise it rides to the Phase 35 cutover.
- **Live cross-build settings/queue/download sync (Electron↔Tauri divergence
  family)** — Phase 35 cutover.

### Reviewed Todos (not folded)
`todo.match-phase 33` surfaced 4 hits; none folded:
- *Productionize the macOS native Steam bridge* (score 0.9) — matched on
  "native, steam, shim"; Phase 24's arc, deferred to a future milestone
  ([[steam-bridge-interface-coverage]]). Unrelated to the Tauri lifecycle port.
- *Steam bottle GPTK/Wine engine produces a broken bottle* (0.9) — the bottle
  install branch is explicitly out of scope (Phase 30 D-07); not this phase.
- *Startup download-resume auto-opens Steam-in-CrossOver for bottle games* (0.6)
  — this is exactly the bottle-branch bug **D-04** avoids by keeping boot
  auto-resume deferred to Phase 35. Reviewed, deliberately NOT folded (fixing it
  means owning the bottle branch, which is out of scope).
- *Runtime `getProductInfo` appinfo dump to lock the osarch parser* (0.6) —
  matched on "getProductInfo/badge"; a Steam PICS osarch-parser concern, distinct
  from the getProductInfo *hang* D-01 fixes. Not this phase.

</deferred>

---

*Phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray*
*Context gathered: 2026-07-24*
