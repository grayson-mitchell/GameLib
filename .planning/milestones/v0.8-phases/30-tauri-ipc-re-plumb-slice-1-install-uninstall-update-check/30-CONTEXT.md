# Phase 30: Tauri IPC re-plumb slice 1 — install, uninstall, update-check - Context

**Gathered:** 2026-07-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Port the first user-facing domain slice of the ~217 unported IPC endpoints onto
the Node sidecar, following SEAM.md's Incremental-Port Checklist: curated
`<domain>FlowRegistration.ts` modules importing only the backend code each flow
needs, real behavior in `electronStub.ts` bound to real Tauri commands for any
newly-required Electron API, and the slice wired end-to-end in the Tauri build.

**Discussion changed the shape of this phase in one important way.** Scouting
found that the roadmap entry's premise — "install/uninstall/update-check reuses
the skeleton's own read + action pattern" — is only half true:

1. There is **no way to reach an Install button** in the Tauri build. The login
   channel is unported, so the library is empty and signed-out (SEAM.md §1
   `safeStorage`, `28-PROOF.md` §4). The QR login port is therefore folded into
   this phase, ahead of the install slice (**D-01**).
2. Electron's `install`/`updateGame` handlers live in
   `src/backend/downloadmanager/ipc_handler.ts` and do nothing but
   `addToQueue(...)` — the real work is inside DownloadManager, which is
   **Phase 32's** cluster. The queue-vs-bypass boundary is left to
   research/planning (**D-05**).

**In scope:**
- Steam **QR login** channel port (`startQRLogin` + its polling/push + the reads
  the login gate needs) — minimum viable, ahead of everything else.
- `install`, `uninstall`, `updateGame`, `checkGameUpdates` registered on the
  sidecar, covering the **native depot-download** install branch.
- `gameStatusUpdate` status-transition push so library button state is correct.
- Real `openDialog` behavior in `electronStub.ts` bound to a Tauri dialog
  command via `rustInvoke` (checklist step 6).
- The **minimum read-only channels** the Steam depot path's `DownloadDialog`
  needs to render and submit.
- SEAM.md §1/§3 update plus a **declared list** of every channel this phase
  ports.

**Explicitly OUT of scope:**
- Credential / SteamGuard / TOTP login branches, and sign-out (**D-02**).
- High-frequency byte/percent `progressUpdate` throughput — Phase 32 (**D-06**).
- The CrossOver **bottle** and macOS **bridge** install branches — they stay
  unported and non-fatal per Invariant B (**D-07**).
- Real `Notification`/`notify()` behavior — stays a logged no-op (**D-09**).
- The broader settings/config cluster beyond the minimum modal reads — Phase 31.
- Any change to the Electron build's behavior. `npm start` and
  `npm run tauri:dev` must both work (additive/reversible invariant).
- Windows/Linux Tauri packaging, signing, notarization.

</domain>

<decisions>
## Implementation Decisions

### Login prerequisite (the unblocking work)

- **D-01 — Fold the QR login-channel port into this phase, as its first work.**
  The install slice is not reachable without a populated library. Phase 28's
  keyring made this safe *by construction* — `keyringTokenStore.ts` imports
  neither `configStore` nor the storage-key constants, so the shared-store
  corruption trap the 27-05 note describes cannot reopen (28-CONTEXT D-04/D-06).
  Rejected: seeding the Keychain out-of-band (leaves Phase 27 UAT 2/3 blocked and
  makes the E2E depend on a manual setup step), and proving install by direct
  handler invoke only (weakens the roadmap goal's "proven E2E in the Tauri
  build" bar).

- **D-02 — Login scope is QR only.** `startQRLogin` plus its polling/push and
  whatever `getUserInfo`/status reads `GlobalState.tsx`'s Steam login gate
  actually performs. No credential flow, no SteamGuard/TOTP prompt path, no
  sign-out. Rationale: QR is the branch least likely to need real dialog/modal
  wiring, which keeps **D-09**'s narrow native-API surface honest.

- **D-03 — The two-token divergence is ACCEPTED, document-only.** Signing in
  under Tauri does NOT sign you in under Electron: the sidecar stores a
  keyring-native Keychain entry while Electron stores Chromium OSCrypt ciphertext
  in `configStore`. This is the correct consequence of Phase 28 D-01, not a bug.
  Record it as a SEAM.md "Accepted Constraints" entry plus a code comment;
  **no new proof artifact** — rely on Phase 28's existing by-construction
  argument. Rejected: mirroring `28-PROOF.md`'s "Electron session untouched"
  proof shape (cost without new information), and attempting convergence (would
  require hand-rolling OSCrypt in the sidecar — explicitly rejected by Phase 28
  D-01).

- **D-04 — Sign-off is automated tests now, live QR scan DEFERRED.** Assert the
  channel wiring and token round-trip in tests; log the live human QR scan as a
  deferred UAT item (the Phase 21 pattern).

  > **⚠ Known tension — carry this into planning.** D-01's stated motivation was
  > a real clickable E2E, and D-04 defers exactly the step that would deliver it.
  > Because every install-slice acceptance below depends on a populated library,
  > deferring the live scan **also defers the install slice's own hardware
  > proof**. This phase's honest claim is therefore "wired and unit-proven", not
  > "hardware-proven". The verifier must not be allowed to read it as the latter,
  > and the deferred UAT item should name both the login scan *and* the install
  > E2E it gates.

### Queue boundary and install mechanics

- **D-05 — Port-the-queue vs direct-bypass: Claude's discretion.** See
  Claude's Discretion below. Whichever way it goes, the *reason* must be recorded
  — Phase 32 inherits this boundary.

- **D-06 — Push: status transitions in, byte-progress deferred.** Wire
  `sendGameStatusUpdate` → `gameStatusUpdate` (queued/installing/done/
  uninstalling) so the library button state is correct end to end. Leave
  high-frequency byte/percent `progressUpdate` throughput to Phase 32 — that
  volume question is what Phase 32 exists to answer, and front-loading it means
  any throughput problem surfaces here instead. Rides the existing
  `frontendMessage` → `frontend_message` rails; Phase 29's `storeChanged` already
  proved `src-tauri/src/main.rs`'s relay is generic over channel name, so **zero
  Rust changes** should be needed for the push side. Rejected: full-fidelity
  progress now, and fire-and-forget with no push (makes the slice unprovable as a
  user-facing flow).

- **D-07 — Only the NATIVE DEPOT DOWNLOAD branch must work.**
  `SteamGame.install()` (`src/backend/storeManagers/steam/games.ts:678`) branches
  into `installNative` / `installBottleNative` / `installBridgeGame` /
  `installDepotDownload`. The depot path is pure Node + filesystem — no
  CrossOver, no bottle, no bridge helper — so it is the branch most likely to run
  unchanged in a headless sidecar, and it is where the Phase 21/23/25 investment
  went. Bottle/bridge branches stay unported and non-fatal (Invariant B).
  Rejected: depot + bottle (drags the CrossOver toolchain and Phase 24's bridge
  shim-overwrite / install-poll machinery into the sidecar's import graph), and
  "whatever the test game needs" (leaves the covered branch implicit).

### Runner breadth and module layout

- **D-08 — Two new domain modules, `steamFlowRegistration.ts` untouched.**
  `steamAuthFlowRegistration.ts` (QR login) and `installFlowRegistration.ts`
  (install/uninstall/update-check). Matches checklist step 2's
  `<domain>FlowRegistration.ts` wording and keeps each module's import graph
  auditable — that auditability is the whole property the curated-import
  discipline buys. Rejected: one combined module (mixes an auth domain with a
  game-lifecycle domain), and extending `steamFlowRegistration.ts` (it becomes
  the catch-all the discipline exists to prevent).

### Native API needs

- **D-09 — `openDialog` gets real behavior; `Notification` does not.** An install
  with no folder picker is not a completable flow, so `dialog`'s open-directory
  path is given real behavior in `electronStub.ts` bound to a Tauri command via
  the generic `rustInvoke` channel (checklist step 6 — reuse
  `requestRustInvoke()`/`dispatch_rust_channel()`, do not invent a new correlated
  request mechanism). `notify()` stays a **logged** no-op: a missing toast does
  not block the flow, and `tauri-plugin-notification`'s permission prompt is
  cost for a nicety. This deliberately pulls forward the smallest possible slice
  of Phase 31/33's `dialog` cluster (9 files per spike 009). Rejected: both real,
  and neither (routing install to a default path with no picker makes the E2E
  something other than the real user flow).

- **D-10 — Port the MINIMUM read-only channels the modal needs; declare them.**
  `DownloadDialog` calls `requestAppSettings`, `requestGameSettings`,
  `checkDiskSpace`, `getGameOverride`, `getGameSdl`, `getPrivateBranchPassword` —
  all unported, mostly Phase 31's settings cluster. They reject non-fatally per
  Invariant B, but a modal that will not submit blocks the slice. Add read-only
  handlers for exactly the channels the **Steam depot path's** modal render+submit
  needs; let the rest keep rejecting. **The boundary must be declared, not
  discovered ad hoc** — see D-11. Rejected: pure degradation (risks a modal that
  cannot submit), and bypassing the modal under Tauri (introduces Tauri-only
  frontend divergence, which the additive/reversible invariant has so far avoided
  — zero changes to the 379 `window.api.*` call-sites).

- **D-11 — Deliverable: a declared ported-channel list AND the SEAM.md update.**
  One explicit list naming every channel this phase ports — QR login,
  install/uninstall/updateGame/checkGameUpdates, and the D-10 minimum modal reads
  — with those entries moved out of SEAM.md §3's deferred table into §1, as
  checklist step 5 requires. Phase 31 starts from the remainder. The D-10 subset
  is the part most easily lost in prose, so it must appear as an enumerated list,
  not a sentence.

### Claude's Discretion

- **D-05a — Port `downloadqueue.ts` into the sidecar, or register a direct
  `SteamGame.install()` bypass?** Trade-off as scouted: porting the queue is
  truest to "the real backend code runs behind the new transport" and avoids
  writing code Phase 32 will delete, but it absorbs most of Phase 32's cluster
  and drags `downloadqueue.ts`'s import-time side effects (`initQueue`, the
  `downloadManager` store) into the sidecar. A bypass keeps the slice small and
  matches `steamFlowRegistration.ts`'s curated shape, but the sidecar's install
  semantics then diverge from Electron's (no queueing, no pause/resume/cancel).
  Research should measure the real import-time cost before choosing. Note Phase
  29 D-15 already extracted `downloadManager`'s store declaration into a thin
  module *specifically* because "`downloadManager` is exactly what Phase 30's
  install/uninstall slice needs" — that groundwork favors the port.

- **D-05b — Steam-only curated import vs the full `libraryManagerMap`?**
  `uninstallGameCallback` (`src/backend/utils/uninstaller.ts`) and
  `checkGameUpdates` (`src/backend/main.ts:742`) both iterate every runner, so
  Steam-only means reshaping handlers Electron wrote runner-generically.
  **Important scouting note that changes the arithmetic:** `storeManagers/index.ts`
  is *already* force-imported by `steamFlowRegistration.ts`'s load-bearing first
  import (the 27-05 circular-init fix), so `libraryManagerMap` and all six eagerly
  constructed managers already exist in the sidecar process today. "Full map" is
  therefore likely cheaper than it looks, and "Steam-only" does not actually
  shrink the import graph. Research should verify this before planning commits.

- **D-12 — Whether `checkGameUpdates` returns Steam-only results or attempts all
  runners** follows from D-05b; planner's call, but the behavior must be
  consistent with whatever D-05b decides rather than diverging silently.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The seam this phase extends (read first)
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — **the governing
  document for this phase.** §"Incremental-Port Checklist" steps 1–6 (this phase
  executes all six); §1 "The four wired channels" (what exists) and
  "The store layer (real, Phase 29)"; §2 Stubbed/Minimal (`shell`,
  `BrowserWindow`, the preload globals); §3 the deferred backlog table — login is
  **priority 5**, `dialog` is priority 2; §"Load-Bearing Invariants" **A**
  (`window.api` attach order is a dependency, not a convention) and **B**
  (unported channels must stay non-fatal) — both binding; §"Accepted Constraints"
  (where D-03's entry goes).
- `.planning/phases/27-tauri-shell-walking-skeleton/27-CONTEXT.md` — LOCKED
  architecture: sidecar boundary, the 3-factory renderer bridge, the
  additive/reversible invariant.
- `.planning/phases/28-.../28-CONTEXT.md` — D-04 (sidecar must never write
  `TOKEN_STORE_KEY` into the shared `configStore`) is **live and binding** on the
  new login channel. D-06's failure policy (`NoEntry` = healthy first run;
  everything else collapses to clean signed-out, never a plaintext write) governs
  what the login channel does on Keychain failure.
- `.planning/phases/28-.../28-PROOF.md` — §4 states plainly that Phase 28 did NOT
  unblock Phase 27 UAT 2/3 and names the login-channel port as the next slice;
  §5 the `openExternal` Rust-side dispatch fix (the precedent shape for D-09's
  dialog wiring).
- `.planning/phases/29-.../29-CONTEXT.md` — D-01 (persistence stays in the Node
  sidecar; Rust is the platform seam, not the database) is LOCKED and must not be
  re-litigated. D-15 extracted `downloadManager`'s store declaration for this
  phase (relevant to D-05a).

### Spike blueprint
- `.planning/spikes/009-node-backend-headless-sidecar/README.md` — the 16-API /
  44-file / 220-endpoint coupling map; the `dialog ×9` touch count behind D-09;
  the import-time-wall class D-05a/D-05b must weigh.

### Existing code — the endpoints being ported
- `src/backend/downloadmanager/ipc_handler.ts` — `install` L13 and `updateGame`
  L46: both are `addToQueue(...)` only. The D-05a boundary lives here.
- `src/backend/downloadmanager/downloadqueue.ts` — the real work + `initQueue`
  import-time side effects.
- `src/backend/main.ts:1144` — `addHandler('uninstall', uninstallGameCallback)`.
- `src/backend/main.ts:742` — `checkGameUpdates`, iterates every runner via
  `libraryManagerMap[runner].listUpdateableGames()` + `autoUpdate`.
- `src/backend/utils/uninstaller.ts` — `uninstallGameCallback`; reaches
  `notify()` (D-09 no-op), `sendGameStatusUpdate` (D-06), `libraryManagerMap`
  (D-05b), and `GlobalConfig.get()`.
- `src/backend/storeManagers/steam/games.ts` — `SteamGame.install()` L678 and its
  branches: `installNative` L809, `installBottleNative` L826,
  `installBridgeGame` L871, `installDepotDownload` L1120. **Only the depot branch
  is in scope (D-07).**
- `src/backend/utils.ts:1351` — `sendGameStatusUpdate`, the D-06 push source.
- `src/common/types/ipc.ts` — `install` L394, `uninstall` L395, `updateGame`
  L404, `checkGameUpdates` L189; `gameStatusUpdate` L550, `progressUpdate` L614,
  `installGame` L572 in the frontend-message section.

### Existing code — the sidecar pattern to mirror
- `src/backend/sidecar/steamFlowRegistration.ts` — the template for D-08's two new
  modules. **Read its module docstring in full**: it documents both the curated-
  import discipline AND the load-bearing `import '../storeManagers'` first-import
  ordering fix (the 27-05 `SteamLibraryManager is not a constructor` crash, which
  only reproduced in the esbuild bundle, not under ts-jest). Any new registration
  module inherits that hazard.
- `src/backend/sidecar/handlers.ts` — where `registerSteamFlows()` is called; the
  new registrations land alongside. Uses `electronStub`'s `ipcMain` directly, NOT
  `backend/ipc`'s typed `addHandler` — no file under `src/backend/sidecar/` may
  import the real electron module.
- `src/backend/sidecar/electronStub.ts` — where D-09's real `openDialog` behavior
  goes; mirror the existing `shell.openExternal` forward-to-transport pattern.
- `src/backend/sidecar/sidecarRpc.ts` — `requestRustInvoke()`, the generic
  sidecar→Rust request/response channel D-09 must reuse (checklist step 6). Also
  owns `UNPORTED_CHANNEL_MARKER` tagging (Invariant B).
- `src/backend/sidecar/keyringTokenStore.ts` — `SidecarKeyringTokenStore`; the
  token seam the login channel writes through.
- `src/backend/storeManagers/steam/tokenStore.ts` — the `TokenStore` interface.
- `src-tauri/src/main.rs` — `dispatch_rust_channel()` (where a dialog channel is
  added), the `frontend_message` relay (already generic — D-06 needs no change
  here), `start_reader()`'s `openExternal` branch.
- `src/common/types/sidecarTransport.ts` — frame shapes + command-name constants
  any new channel must extend consistently.
- `src/common/types/storePolicy.ts` — `BOOT_SET_STORES`/`LAZY_STORES`/
  `STORE_ALLOWLIST`; checklist step 4 — declare any newly-needed store here and
  in `storeRegistration.ts`, do NOT hand-extend the snapshot handlers.
- `src/backend/sidecar/storeRegistration.ts` — `ensureStoresRegistered()`; a
  store missing from this file silently reads as `{}` on both the eager and lazy
  paths. Its comments record the known dead/gap entries (`fontsStore`,
  `zoomSyncStore`, the `wikigameinfo` cache special case).

### Existing code — the frontend surface the flow crosses
- `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx`
  — the D-10 read set: `getPrivateBranchPassword` L177, `requestAppSettings`
  L197, `requestGameSettings` L271, `getGameOverride` L444, `getGameSdl` L446,
  `checkDiskSpace` L459.
- `src/frontend/screens/Library/components/InstallModal/index.tsx:113` —
  `getAlternativeWine` (likely NOT needed on the depot branch; confirm).
- `src/frontend/state/GlobalState.tsx` — the Steam login gate whose reads define
  D-02's minimum login surface.
- `src/frontend/index.tsx` — the `tauriAttach` first-import and the 8000ms
  hydration timeout.
- `src/preload/tauriAttach.ts` / `src/preload/ipc.ts` — Invariant A: any module
  touching `window.api` at module scope must import `tauriAttach` itself.
- `src/frontend/bootErrorSurface.ts` — the Invariant-B marker matcher; note it
  duplicates `UNPORTED_CHANNEL_MARKER` as a literal by design.

### Tests to mirror / not break
- `src/backend/sidecar/__tests__/skeletonFlows.test.ts` — the existing shape for
  a new-channel test.
- `src/backend/sidecar/__tests__/storeLayer.test.ts` — Phase 29's coverage walk.
- `src/backend/sidecar/__tests__/electronUntouched.test.ts` — the
  additive/reversible guard.

### Live constraints from adjacent, still-open work
- `.planning/STATE.md` — **Phase 23 gaps G-23-01 (a `Blocked` depot key aborts
  the whole install) and G-23-02 (native install applies no execute bits) are
  still OPEN** on the exact depot branch D-07 selects. They are not this phase's
  to fix, but an install E2E that trips either will look like a Phase 30
  regression. Planning should name them as pre-existing.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`steamFlowRegistration.ts`** — the exact template for D-08's two modules,
  including the curated-import discipline and the load-bearing first-import fix.
- **`requestRustInvoke()` / `dispatch_rust_channel()`** (Phase 28) — the generic
  sidecar→Rust request/response channel, built expressly so `dialog` (D-09's
  case, and one of its four motivating examples) would not need a bespoke
  mechanism.
- **The `frontendMessage` → `frontend_message` push path** — already generic over
  channel name (proven twice: `pushGameToLibrary`, then Phase 29's
  `storeChanged` with zero Rust changes). D-06's `gameStatusUpdate` is the third
  rider; expect no Rust work.
- **Phase 29's store layer** — `downloadManager`, `gameOverridesStore`, and the
  Steam config stores are already constructible in the sidecar; D-15 extracted
  `downloadManager`'s declaration into a thin module *for this phase*.
- **`SidecarKeyringTokenStore`** — the login channel's token sink already exists
  and is hardware-proven (Phase 28).

### Established Patterns
- Checklist step 2's curated import: import only what the flow needs, never
  `storeManagers/index.ts`'s full map "unless the flow genuinely spans multiple
  store managers" — which `uninstall`/`checkGameUpdates` arguably do (D-05b).
- Checklist step 3: a newly-required Electron API gets real behavior in
  `electronStub.ts` bound to a real Tauri command, "rather than leaving it a
  silent no-op" — D-09 follows this for `dialog` and consciously declines it for
  `Notification`, so that decline needs to be a *logged* no-op, not a silent one.
- Checklist step 4: stores go through `storePolicy.ts` + `storeRegistration.ts`;
  never hand-extend `sidecar:store-snapshot`/`sidecar:store-fetch`.
- No file under `src/backend/sidecar/` imports the real `electron` module.
- Invariant B: every channel this phase does NOT port must keep rejecting
  non-fatally. Adding handlers must not turn a warning into a crash.

### Integration Points
- `handlers.ts` ↔ the two new `*FlowRegistration.ts` modules (registration site).
- `electronStub.ts`'s `dialog` ↔ a new Rust dialog channel in
  `dispatch_rust_channel()` (D-09).
- `sendGameStatusUpdate` ↔ `sendFrontendMessage` ↔ the renderer's `on()` listener
  (D-06).
- `SteamUser`/login channel ↔ `SidecarKeyringTokenStore` ↔ Rust `keyring_*`
  (D-01/D-03).
- `installFlowRegistration.ts` ↔ either `downloadqueue.ts` or `SteamGame`
  directly — the one boundary this phase leaves to research (D-05a).

</code_context>

<specifics>
## Specific Ideas

- **The D-04 tension must survive into VERIFICATION.** "Wired and unit-proven"
  and "hardware-proven" are different claims, and every install acceptance here
  is gated on a deferred human QR scan. The deferred UAT item should name both
  the scan *and* the install E2E it blocks, in one entry, so a later reader
  cannot conclude the install slice was independently proven.
- **`Notification`'s no-op must log.** D-09 declines real behavior; checklist
  step 3's whole point is that silent no-ops are the failure mode. A logged
  no-op is the difference between a decision and a bug.
- **D-11's declared list is the artifact Phase 31 starts from.** Prose in
  SEAM.md §1 is not enough for the D-10 "minimum modal reads" subset — enumerate.
- **D-05b's premise is probably wrong in the user's favor.** Verify early that
  `storeManagers/index.ts` already constructs all six managers in the sidecar
  today (via `steamFlowRegistration.ts`'s first import). If so, "Steam-only"
  buys no import-graph savings and the runner-generic handlers should just be
  used unchanged.
- Phase 29's `storeChanged` needing **zero** Rust changes is the precedent to
  check D-06 against — if the `gameStatusUpdate` push turns out to need Rust
  work, something is being done differently and it is worth stopping to ask why.
- Phase 23's G-23-01/G-23-02 will be sitting under any real depot install run in
  this phase. Name them up front rather than rediscovering them as "Tauri bugs".

</specifics>

<deferred>
## Deferred Ideas

- **Credential / SteamGuard / TOTP login and sign-out** — D-02 scoped login to QR
  only. Natural home: whichever phase needs a tester to sign in without a phone.
- **Byte-level `progressUpdate` throughput** — D-06; this is Phase 32's headline
  question ("the push path at real volume").
- **DownloadManager queue semantics under Tauri** (pause/resume/cancel,
  `removeFromDMQueue`, `getDMQueueInformation`, startup resume) — Phase 32,
  unless D-05a pulls the queue port forward.
- **CrossOver bottle and macOS bridge install branches** — D-07. No phase owns
  these under Tauri yet; they will need one before the Phase 35 cutover.
- **Real `Notification` / `tauri-plugin-notification`** — D-09. Natural home:
  Phase 33's lifecycle cluster (`Notification ×3` in spike 009's table).
- **The full `dialog` cluster** (message boxes, save dialogs, the other 8 files) —
  D-09 ports only the open-directory path. Phase 31 owns the rest.
- **The settings/config read cluster beyond D-10's minimum** — Phase 31.
- **Converging the Electron and Tauri secret policies** — Phase 29 D-08, deferred
  to Phase 35.
- **A public `onDidChange`/reactive store API** — Phase 29 deferred.

### Reviewed Todos (not folded)
All four `todo.match-phase 30` hits were keyword false-positives; none touch the
Tauri IPC seam:
- *Productionize the macOS native Steam bridge* (score 0.7) — matched on "api" +
  area "steam"; Phase 24's arc, and D-07 explicitly excludes the bridge branch.
- *Steam bottle setup offers GPTK/Wine engines that produce a broken bottle*
  (0.7) — matched on "backend" + area "steam"; Electron-side bottle bug, and
  D-07 excludes the bottle branch.
- *Startup download-resume silently auto-opens Steam-in-CrossOver for bottle
  games* (0.6) — matched on "phase, install"; an Electron-side startup-resume
  bug, not the IPC port. Adjacent to Phase 32's queue work if D-05a defers.
- *Runtime `getProductInfo` appinfo dump to lock the osarch parser* (0.2) —
  matched on "phase"; unrelated Steam PICS concern.

</deferred>

---

*Phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check*
*Context gathered: 2026-07-22*
