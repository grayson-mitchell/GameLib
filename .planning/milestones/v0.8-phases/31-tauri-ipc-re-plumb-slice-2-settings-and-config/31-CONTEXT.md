# Phase 31: Tauri IPC re-plumb slice 2 — settings and config - Context

**Gathered:** 2026-07-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Port the second user-facing domain slice of the ~208 still-unported IPC
endpoints onto the Node sidecar — the **settings/config cluster** — following
SEAM.md's Incremental-Port Checklist (steps 1–6). This slice extends the
`settingsFlowRegistration.ts` module Phase 30 already seeded (Phase 30 ported
the settings **read** side, `requestAppSettings`/`requestGameSettings`, as part
of the DownloadDialog minimum). Phase 31 owns the **write** side and the broader
config surface, plus the remaining five `dialog` members those flows depend on.

**In scope:**
- The settings **write path** on the sidecar: `setSetting` (listener) and
  `writeConfig` (invoke), persisting through Phase 29's store layer (**D-02**).
- The **generic** config/system reads the Settings screen needs:
  `getUserInfo`, `getSystemInfo`, `getLogContent`, `getMaxCpus`,
  `hasExecutable`, `showUpdateSetting` (**D-01**).
- Real Tauri behavior for the **async** `dialog` members reachable on ported
  flows — `showMessageBox`, `showErrorBox`, `showSaveDialog` — bound via
  `rustInvoke` → `tauri-plugin-dialog` in `electronStub.ts` (**D-03**).
- SEAM.md §1/§3 update plus a **declared ported-channel list** for this slice
  (the `31-PORTED-CHANNELS.md` artifact, mirroring `30-PORTED-CHANNELS.md`).

**Explicitly OUT of scope:**
- Epic/GOG/Amazon **runner tool-version** channels (`getLegendaryVersion`,
  `getGogdlVersion`, `getCometVersion`, `getNileVersion`), the **EOS-overlay**
  channels (`getEosOverlayStatus`/`getLatestEosOverlayVersion`/`removeEosOverlay`/
  `updateEosOverlayInfo`), and `egsSync` — they stay unported and non-fatal per
  Invariant B (**D-01**).
- The two **synchronous** dialog members `showMessageBoxSync` and
  `showOpenDialogSync` — logged no-ops returning a safe default; sync-over-async
  is a genuine impedance mismatch not worth solving for members no ported flow
  hits (**D-03**).
- `showLogFileInFolder` (`shell.showItemInFolder`) and
  `copySystemInfoToClipboard` (`clipboard`) — logged no-ops, deferred to
  Phase 33's `shell`/`clipboard` clusters (**D-04**).
- Any live cross-build **settings sync / reflect push** — Tauri↔Electron
  settings divergence is accepted (**D-02**).
- `changeTrayColor` (tray, Phase 33), `getEosOverlayStatus` group (above).
- Any change to the Electron build. `npm start` and `npm run tauri:dev` must
  both work (additive/reversible invariant).
- Windows/Linux Tauri packaging, signing, notarization.

</domain>

<decisions>
## Implementation Decisions

### Settings surface breadth

- **D-01 — Steam + generic settings only; runner-specific and EOS channels stay
  rejecting.** Port the write path (`setSetting`/`writeConfig`) plus the generic
  reads (`getUserInfo`, `getSystemInfo`, `getLogContent`, `getMaxCpus`,
  `hasExecutable`, `showUpdateSetting`). Leave the Epic/GOG/Amazon tool-version
  channels, the EOS-overlay group, and `egsSync` rejecting non-fatally per
  Invariant B. This mirrors Phase 30's D-07 branch-narrowing: a Steam-focused
  Tauri build never exercises the other runners' tool plumbing, so pulling it
  into the sidecar's import graph buys nothing. Rejected: the full settings
  surface (drags Epic/GOG/Amazon runner plumbing into the sidecar for no
  user-facing Steam value). **Planner note:** confirm during research exactly
  which reads the Steam Settings screen renders — the generic list above is the
  intended boundary, not an exhaustive grep.

### Write-path faithfulness

- **D-02 — Persist through the store layer; accept Tauri↔Electron divergence, no
  new push.** `setSetting`/`writeConfig` persist through Phase 29's store layer.
  The Tauri UI already holds the changed value locally (`SettingsContext.tsx`
  manages settings state and calls `setSetting` only to persist), so **no new
  `settingsChanged` sync/push channel is needed** for the UI to reflect a
  change. Tauri-vs-Electron settings divergence is ACCEPTED, consistent with the
  two-token divergence (Phase 30 D-03) and the cross-process config clobber
  (Phase 29 D-07) — both already recorded as SEAM.md Accepted Constraints.
  Rejected: a live-reflect push (adds a channel and reopens the convergence work
  D-03/D-07 deliberately deferred to the Phase 35 cutover).

### Dialog cluster

- **D-03 — Real behavior for the async members; the two Sync members stay
  no-ops.** `showMessageBox`, `showErrorBox`, and `showSaveDialog` get real
  behavior in `electronStub.ts` bound via `rustInvoke` → `tauri-plugin-dialog`,
  reusing the exact forward-to-transport shape Phase 30's `dialog_open`
  established (checklist step 6 — reuse `requestRustInvoke()` /
  `dispatch_rust_channel()`, do not invent a new correlated mechanism). The two
  **synchronous** members (`showMessageBoxSync`, `showOpenDialogSync`) cannot be
  truly synchronous across the async sidecar→Rust boundary, so they stay
  **logged** no-ops returning a safe default (e.g. cancelled / button 0).
  Rejected: all five real incl. solving sync-over-async (effort spent on an
  impedance mismatch no ported flow hits). **Planner note:** verify which async
  members the ported settings/config flows actually reach; if a flow needs one
  of the Sync members, escalate rather than silently degrade — the no-op default
  must not corrupt a real confirmation.

### Native API pull-forward

- **D-04 — `shell`/`clipboard` conveniences stay logged no-ops, deferred to
  Phase 33.** `showLogFileInFolder` (`shell.showItemInFolder`) and
  `copySystemInfoToClipboard` (`clipboard`) are Settings-page conveniences, not
  flow-blockers — unlike Phase 30's `dialog_open`, which blocked the install
  flow and so earned its D-09 pull-forward. Keep them **logged** no-ops (not
  silent — checklist step 3's whole point) and defer the `shell` (Priority 4)
  and `clipboard` (Priority 9) clusters to Phase 33's lifecycle work. Rejected:
  pulling them forward now (widens this slice's native surface with no
  flow-completion payoff).

### Sign-off (carried forward from Phase 30 D-04)

- **D-05 — Automated tests now; live UAT deferred.** Assert the channel wiring,
  the settings write→read round-trip, and the dialog forward-to-transport shape
  in tests (mirror `settingsFlows.test.ts` / `skeletonFlows.test.ts`). Log any
  human-in-the-loop settings/dialog UAT as a deferred item, per the Phase 21/30
  pattern. This phase's honest claim is "wired and unit-proven", not
  "hardware-proven".

### Claude's Discretion

- The exact set of async dialog members that get real behavior (D-03) follows
  from what the ported settings/config flows actually reach — grep-and-decide
  during research, but the Sync-pair no-op boundary is fixed.
- Whether `writeConfig` and `setSetting` share one registration or are wired
  separately is a planner call, as long as both land in
  `settingsFlowRegistration.ts` (D-08 curated-module discipline, carried from
  Phase 30) and neither imports the real `electron` module.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The seam this phase extends (read first)
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — **the governing
  document.** §"Incremental-Port Checklist" steps 1–6 (this phase executes all
  six); §3 the deferred backlog table — `dialog` is **priority 2** and its row
  already records "the remaining five members … deferred to Phase 31"; the IPC
  re-plumb paragraph (13 channels wired so far); §"Load-Bearing Invariants" **A**
  (`window.api` attach order) and **B** (unported channels stay non-fatal) —
  both binding; §"Accepted Constraints" (D-07 cross-process clobber, D-03
  two-token divergence — the precedent D-02 rides on).
- `.planning/phases/30-.../30-CONTEXT.md` — the slice-1 pattern this phase
  repeats: D-08 (two curated `*FlowRegistration.ts` modules, no catch-all),
  D-09 (`openDialog` real via `rustInvoke` — the exact precedent for D-03),
  D-10/D-11 (declared ported-channel list discipline), D-03 (accepted
  divergence — precedent for D-02).
- `.planning/phases/30-.../30-PORTED-CHANNELS.md` — records that
  `requestAppSettings`/`requestGameSettings` (the settings **read** side) were
  ALREADY ported in Plan 30-06 and the WRITE side (`setSetting`/`writeConfig`)
  was explicitly left for this phase. Phase 31 starts from this remainder.
- `.planning/phases/29-.../29-CONTEXT.md` — D-01 (persistence stays in the Node
  sidecar; Rust is the platform seam, not the database) and the store-layer
  coverage the write path persists through — LOCKED, do not re-litigate.
- `.planning/phases/28-.../28-CONTEXT.md` — D-04 (sidecar must never write
  `TOKEN_STORE_KEY`/secrets into the shared `configStore`) constrains what the
  settings write path may touch; `SECRET_STORE_KEYS` deny-list stays fail-closed.

### Spike blueprint
- `.planning/spikes/009-node-backend-headless-sidecar/README.md` — the 16-API /
  44-file / 220-endpoint coupling map; the `dialog ×9` touch count (Phase 30
  ported 1 member, Phase 31 ports 3 more real + 2 no-op = the whole 9-file
  cluster's renderer-facing surface); `shell ×5` and `clipboard ×1` are the
  D-04-deferred clusters.

### Existing code — the endpoints being ported (Electron parity source)
- `src/backend/main.ts:1046` — `addListener('setSetting', ...)`: the write
  listener (`{ appName, key, value }` → `writeConfig`). The D-02 write path.
- `src/backend/main.ts:1042` — `addHandler('writeConfig', (e,{appName,config}) => writeConfig(...))`.
- `src/backend/main.ts:880` — `addHandler('getUserInfo', ...)`.
- `src/backend/main.ts:989` — `addHandler('readConfig', ...)` (confirm whether
  the Steam Settings screen needs it; if so it joins D-01's generic set).
- `src/backend/main.ts:998` — `requestAppSettings` (ALREADY ported Phase 30, ref
  only).
- `src/preload/api/settings.ts` — the full settings channel surface: D-01's
  generic keepers (`getMaxCpus`, `showUpdateSetting`, `getLogContent`,
  `systemInfo.get`, `hasExecutable`) vs the deferred runner/EOS channels
  (`getLegendaryVersion`/`getGogdlVersion`/`getCometVersion`/`getNileVersion`,
  `getEosOverlayStatus` group, `egsSync`) and the D-04-deferred native ones
  (`showLogFileInFolder`, `systemInfo.copyToClipboard`, `changeTrayColor`).
- `src/backend/config.ts` — `GlobalConfig`/`getSettings()`; the read source.
- `src/backend/game_config.ts` — `GameConfig`/`writeConfig`; the write target.
- `src/common/types/ipc.ts` — `AsyncIPCFunctions` (L180) / listener section:
  the typed signatures every ported channel must match.

### Existing code — the sidecar pattern to mirror
- `src/backend/sidecar/settingsFlowRegistration.ts` — **the module this phase
  extends** (Phase 30 created it for the read side). Add the write path and
  generic reads here; keep its curated-import discipline (D-08 lineage) and the
  load-bearing `import '../storeManagers'` first-import ordering if present.
- `src/backend/sidecar/handlers.ts` — where `registerSettingsFlows()` (or
  equivalent) is called; uses `electronStub`'s `ipcMain`, never `backend/ipc`.
- `src/backend/sidecar/electronStub.ts` — where D-03's real `dialog` members go;
  mirror the existing `dialog_open` / `shell.openExternal` forward-to-transport
  pattern; the D-04 native no-ops must **log**, not be silent.
- `src/backend/sidecar/sidecarRpc.ts` — `requestRustInvoke()`; the generic
  sidecar→Rust channel D-03 reuses. Owns `UNPORTED_CHANNEL_MARKER` (Invariant B).
- `src/common/types/storePolicy.ts` + `src/backend/sidecar/storeRegistration.ts`
  — checklist step 4: any newly-needed store for the write path is declared
  here, never hand-extended into the snapshot handlers. A store missing from
  `storeRegistration.ts` silently reads as `{}`.
- `src-tauri/src/main.rs` — `dispatch_rust_channel()` (where the new
  `tauri-plugin-dialog` message-box/save-dialog channels are added, if
  `dialog_open` didn't already generalize); the `frontend_message` relay is
  already generic (no Rust change expected for any push).

### Existing code — the frontend surface the flow crosses
- `src/frontend/screens/Settings/SettingsContext.tsx` — holds settings state and
  calls `setSetting` to persist; the reason D-02 needs no reflect push.
- `src/frontend/screens/Settings/index.tsx` and `sections/GamesSettings/index.tsx`
  — the Settings screens whose reads define D-01's generic surface.
- `src/preload/ipc.ts` — `makeHandlerInvoker`/`makeListenerCaller`; the write
  channel is a **listener** (fire-and-forget), the reads are invokers.

### Tests to mirror / not break
- `src/backend/sidecar/__tests__/settingsFlows.test.ts` — **already exists**
  (Phase 30); extend it for the write path and dialog members.
- `src/backend/sidecar/__tests__/storeLayer.test.ts` — Phase 29 coverage walk
  the write path persists through.
- `src/backend/sidecar/__tests__/electronUntouched.test.ts` — the
  additive/reversible guard; both builds must still work.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`settingsFlowRegistration.ts`** — this phase's home module already exists
  (Phase 30 seeded it with the read side); Phase 31 extends rather than creates.
- **`dialog_open` (Phase 30 D-09)** — the exact forward-to-transport precedent
  for D-03's `showMessageBox`/`showErrorBox`/`showSaveDialog`; check whether it
  already generalized `dispatch_rust_channel()` enough that the new members are
  a data change, not new Rust wiring.
- **`requestRustInvoke()` / `dispatch_rust_channel()`** — the generic
  sidecar→Rust request/response channel D-03 reuses (checklist step 6).
- **Phase 29 store layer** — every config store the write path persists through
  is already constructible in the sidecar; the write is a store `set`, not new
  persistence machinery.
- **`SettingsContext.tsx` local state** — the frontend already holds the value
  it just wrote, which is why D-02 needs no push channel.

### Established Patterns
- Checklist step 2 curated import: import only what the settings flow needs;
  do NOT pull `storeManagers/index.ts`'s full map unless a flow genuinely spans
  runners (the settings write path does not — it is config, not library).
- Checklist step 3: a newly-required Electron API gets real behavior in
  `electronStub.ts` OR a **logged** no-op — never a silent one (D-03 Sync-pair
  and D-04 native conveniences are logged no-ops by design).
- Checklist step 4: stores via `storePolicy.ts` + `storeRegistration.ts`.
- No file under `src/backend/sidecar/` imports the real `electron` module.
- Invariant B: every settings/config channel NOT ported here keeps rejecting
  non-fatally; adding handlers must not turn a warning into a crash.

### Integration Points
- `settingsFlowRegistration.ts` ↔ `handlers.ts` (registration site).
- `electronStub.ts`'s `dialog` (async members) ↔ a `tauri-plugin-dialog` channel
  in `dispatch_rust_channel()` (D-03).
- `setSetting`/`writeConfig` ↔ Phase 29 store layer (`GameConfig`/`GlobalConfig`
  write target) (D-02).
- The D-01 deferred channels and D-04 native no-ops ↔ `UNPORTED_CHANNEL_MARKER`
  / logged-no-op path (Invariant B).

</code_context>

<specifics>
## Specific Ideas

- **The declared ported-channel list is the artifact Phase 32 starts from.**
  Produce `31-PORTED-CHANNELS.md` mirroring `30-PORTED-CHANNELS.md`: enumerate
  the write path, the generic reads, and the three real dialog members; name the
  Sync-pair and native no-ops explicitly as deferred so the boundary is declared,
  not discovered. Move ported rows out of SEAM.md §3 into §1.
- **The D-04 native no-ops must LOG.** Checklist step 3's whole failure mode is
  the *silent* no-op. A logged no-op is a decision; a silent one is a bug.
- **Verify `dialog_open` already generalized the Rust side.** If adding
  `showMessageBox`/`showSaveDialog` needs new Rust wiring, something diverged
  from the Phase 30 precedent — worth stopping to ask why (Phase 29's
  `storeChanged` and Phase 30's push both needed zero Rust changes).
- **Do not let the Sync-pair no-op corrupt a real confirmation.** If research
  finds a ported flow that genuinely calls `showMessageBoxSync`/`showOpenDialogSync`,
  escalate rather than returning the safe default silently (D-03 planner note).
- **This phase's claim is "wired and unit-proven", not "hardware-proven"** —
  the verifier must not read the deferred-UAT sign-off (D-05) as live proof.

</specifics>

<deferred>
## Deferred Ideas

- **Epic/GOG/Amazon runner tool-version channels + EOS-overlay group + egsSync**
  — D-01. Natural home: whichever future phase (if any) gives non-Steam runners
  first-class Tauri support; otherwise they ride to the Phase 35 cutover unported.
- **`showMessageBoxSync` / `showOpenDialogSync`** (sync-over-async) — D-03.
  Revisit only if a ported flow needs a truly synchronous dialog; natural home
  is Phase 33's lifecycle/dialog cluster.
- **`shell.showItemInFolder` (`showLogFileInFolder`) and the rest of `shell`
  (`trashItem`/`openPath`)** — D-04 / SEAM §3 Priority 4. Phase 33.
- **`clipboard` (`copySystemInfoToClipboard`)** — D-04 / SEAM §3 Priority 9.
  Phase 33.
- **`changeTrayColor` / tray** — SEAM §3; Phase 33's tray work.
- **Live cross-build settings sync / convergence** — D-02; the Electron↔Tauri
  secret/config policy convergence is Phase 35 (Phase 29 D-08 precedent).
- **Full `electron-store` semantics** (schema validation, migrations) — Phase 29
  deferred; not this slice.

### Reviewed Todos (not folded)
All three `todo.match-phase 31` hits are the same keyword false-positives Phase
30 already reviewed; none touch the settings/config IPC seam:
- *Productionize the macOS native Steam bridge* (score 0.6) — matched on
  "api, spike"; Phase 24's arc, unrelated to the settings/config port.
- *Startup download-resume auto-opens Steam-in-CrossOver for bottle games* (0.6)
  — matched on "phase"; an Electron-side startup-resume bug, adjacent to
  Phase 32's queue work, not this slice.
- *Runtime `getProductInfo` appinfo dump to lock the osarch parser* (0.4) —
  matched on "phase, config"; a Steam PICS parser concern, unrelated to the
  IPC config channels this phase ports.

</deferred>

---

*Phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config*
*Context gathered: 2026-07-23*
