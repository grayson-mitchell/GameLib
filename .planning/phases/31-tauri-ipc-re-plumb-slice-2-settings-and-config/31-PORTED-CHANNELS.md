# Phase 31 — Declared Ported-Channel List

**Purpose:** The enumerated set Phase 32 starts from, mirroring how Phase 31 itself started from
`30-PORTED-CHANNELS.md`. This is the artifact SEAM.md §1 cross-references by filename. It
describes what actually shipped in 31-01..31-02, not this phase's original intent — verified
against both plan SUMMARY.md files.

**Claim-scope note (mirrors Phase 30's framing):** every row in the "Ported this phase" table
below means the channel is **registered on the sidecar and no longer marker-rejects** (for the
seven invoke reads and the `setSetting` send/listener), OR, for the three dialog members, **real
Tauri behavior, unit-proven**. Neither claim is "the UI flow that uses it works end-to-end in the
running app." Registration/real-behavior is proven by jest coverage (`settingsFlows.test.ts`,
`storeLayer.test.ts`, `dialogStub.test.ts`), not by a live settings-screen or native-dialog
click-through. Do not read any row below as proof that the end-to-end Settings-screen flow works
under `tauri:dev` — that live UAT is deferred (D-05, logged in SEAM.md).

**D-05 note on `showErrorBox`/`showSaveDialog` (revised, Phase 31 Plan 04):** these two are
**DECLARED INFRASTRUCTURE**, not flow-driven ports. 31-RESEARCH.md Q2 traced every real call site
of the five `dialog.*` members in the backend and found **zero** Phase 31 settings/config flow
(`setSetting`, `writeConfig`, `getMaxCpus`, `showUpdateSetting`, `getLogContent`, `getSystemInfo`,
`hasExecutable`, `isNative`) reaches either of them. They were built anyway per the locked D-03
decision, to close SEAM.md §3's `dialog ×9` deferred-cluster row as much as safely possible.
Proof is a direct `electronStub.dialog.*` unit test (`dialogStub.test.ts`, mirroring the
pre-existing `showOpenDialog` coverage pattern), never a settings-screen E2E — there isn't one to
exercise them through. **`showMessageBox` is NOT among this "now real" set** — see "Deliberately
NOT ported this phase" below for the CR-01 de-scope (Phase 31 Plan 04): it DOES have pre-existing,
already-shipped backend callers (`promptI386Recovery` via the Phase-30 native-install path,
`askForceUninstall`) that branch on `response`, and forwarding an OK-only Rust dialog to a
multi-button destructive confirm auto-confirmed the destructive branch.

---

## Ported this phase

| Channel | Kind | Registration module or real code reached | Requirement |
|---|---|---|---|
| `setSetting` | send (listener) | `settingsFlowRegistration.ts` (`ipcMain.on`, never `.handle` — Pitfall 2) → `GlobalConfig.setSetting`/`GameConfig.setSetting` | REQ-31-02 |
| `writeConfig` | invoke | `settingsFlowRegistration.ts` → real `writeConfig()` (`backend/utils.ts`), persists through the real Phase 29 `configStore`/`STORE_ALLOWLIST` layer (global branch) or a raw `graceful-fs` write (per-game branch) | REQ-31-02 |
| `getMaxCpus` | invoke | `settingsFlowRegistration.ts` → real backend read | REQ-31-01 |
| `showUpdateSetting` | invoke | `settingsFlowRegistration.ts` → real backend read | REQ-31-01 |
| `getLogContent` | invoke | `settingsFlowRegistration.ts` → real backend read | REQ-31-01 |
| `getSystemInfo` | invoke | `settingsFlowRegistration.ts` → `backend/utils/systeminfo/index.ts` (boundary-mocked subprocess internals in tests; `process.getSystemVersion` polyfilled in `electronStub.ts`) | REQ-31-01 |
| `hasExecutable` | invoke | `settingsFlowRegistration.ts` → real backend read (boundary-mocked subprocess internals in tests) | REQ-31-01 |
| `isNative` | invoke | `settingsFlowRegistration.ts` → `libraryManagerMap[runner].getGame(appName).isNative()`, runner-generic, already-resident `libraryManagerMap` | REQ-31-01 |
| `showErrorBox` | rustInvoke (`RUST_DIALOG_MESSAGE`, `kind:'error'`) | `electronStub.ts` → same `dialog_message` arm, discards the boolean return | REQ-31-03 |
| `showSaveDialog` | rustInvoke (`RUST_DIALOG_SAVE`) | `electronStub.ts` → `dispatch_rust_channel`'s `dialog_save` arm → `FileDialogBuilder::blocking_save_file()`. DECLARED INFRASTRUCTURE (D-05) — zero real call sites exist anywhere in the repository | REQ-31-03 |

---

## Deliberately NOT ported this phase

Each entry below still rejects non-fatally with `UNPORTED_CHANNEL_MARKER` per Invariant B (or, for
the two send-kind no-ops, remains a logged-but-inert listener per D-04) — **except
`showMessageBox` below, which resolves a safe sentinel rather than rejecting (see its own entry).**

**`showMessageBox` — safe-sentinel logged no-op, CR-01 de-scope (Phase 31 Plan 04):**
- `showMessageBox` (`RUST_DIALOG_MESSAGE`-eligible channel, but never forwarded to it) —
  UNLIKE the other rows in this section, this is not "no in-scope caller." It has
  **pre-existing, already-shipped backend callers** reachable via the Phase-30 native install
  path: `promptI386Recovery` (`storeManagers/steam/library.ts`, via `startInstallPolling` →
  `pollInstallOnce`) and `askForceUninstall` (`utils.ts`, reached fire-and-forget from
  `launcher.ts`), both of which `await dialog.showMessageBox(...)` and branch on the returned
  `response` to decide whether to run a destructive action. Rust's dialog is OK-only
  (`blocking_show()` returns a single bool) — forwarding a multi-button confirm to it mapped the
  bool to `response:0/1`, which auto-confirmed the destructive branch every time (CR-01,
  31-VERIFICATION.md). The remedy is a de-wire, not a real multi-button port: `showMessageBox`
  now emits one `console.warn` and RESOLVES the safe sentinel `{ response: -1, checkboxChecked:
  false }` — never forwarding to `RUST_DIALOG_MESSAGE`, never rejecting/throwing (the two live
  callers `await` it unguarded and fire-and-forget with no `.catch()`, and this sidecar process
  has no `unhandledRejection` guard, so a reject would crash it). `-1` declines both reachable
  callers. A real multi-button `showMessageBox` implementation is deferred to Phase 33 (the
  lifecycle/dialog cluster).

**Dropped from D-01's original candidate list — traced call sites prove neither is reached by the
Steam Settings screen (31-RESEARCH.md Q1):**
- `getUserInfo` — Epic-only; its only real call site is `Login/components/SIDLogin/index.tsx`
  (Epic SID login), an unrelated screen.
- `readConfig` — Legendary-only helper; its only real call site is
  `frontend/helpers/index.ts:67-68` (`readFile('library')`/`readFile('user')`), unrelated to
  Settings.

**The Sync pair — logged no-ops, sync-over-async, deferred to Phase 33:**
- `showMessageBoxSync` — the sole call site in the whole repository
  (`storeManagerCommon/games.ts:89`, a sideload browser-game quit confirm) is out of Phase 31
  scope; stays a synchronous no-op that now emits `console.warn` instead of doing nothing.
- `showOpenDialogSync` — no in-scope caller; stays a synchronous no-op, now logged.

**Shell/clipboard no-ops — D-04 logged no-ops, deferred to the Phase 33 shell/clipboard clusters:**
- `shell.showItemInFolder` (backs `showLogFileInFolder`) — was 100% silent
  (`electronStub.ts:204`), now emits `console.warn` naming the no-op + D-04 + the Phase 33
  deferral.
- `clipboard.writeText` (backs `copySystemInfoToClipboard`) — was 100% silent
  (`electronStub.ts:269`), now emits `console.warn` with the same framing.

**Runner tool-version / EOS-overlay / egsSync channels — Invariant B, D-01 boundary unchanged:**
- Epic/GOG/Amazon runner-specific tool-version channels
- `getEosOverlayStatus`/`getLatestEosOverlayVersion`/`installEosOverlay`/`removeEosOverlay`/
  `enableEosOverlay`/`disableEosOverlay`/`updateEosOverlayInfo`/`isEosOverlayEnabled` (the entire
  EOS-overlay group, `AdvancedSettings/index.tsx`)
- `egsSync`

**Cosmetic/out-of-cluster, not this phase's job:**
- `clipboardWriteText` (the general "copy all settings" context-menu action, distinct from the
  D-04-named `copySystemInfoToClipboard`) — stays silent; not upgraded this phase.
- `showConfigFileInFolder` — implemented via `openUrlOrFile`, the `shell` cluster (SEAM §3
  Priority 4), not the `dialog` cluster this phase closed; stays silent; Phase 33.

---

**Note on `dialog`:** with `showErrorBox`/`showSaveDialog` real (this phase) and `showOpenDialog`
already real (Phase 30's `dialog_open`), the SEAM.md §3 `dialog ×9` deferred cluster is mostly
closed. `showMessageBox` is deliberately NOT wired (Phase 31 Plan 04, CR-01 de-scope — see above)
— a safe-sentinel logged no-op, real multi-button behavior deferred to Phase 33 alongside the two
Sync members above.
