---
phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray
verified: 2026-07-24T00:00:00Z
status: human_needed
score: 11/11 must-haves verified in codebase
overrides_applied: 0
human_verification:
  - test: "Trigger dialog.showMessageBox multi-button confirms live (askForceUninstall, promptI386Recovery) under npm run tauri:dev"
    expected: "Native OS dialog shows both button labels; clicking each returns the correct button index; a forced transport error defaults to the safe/non-destructive button"
    why_human: "Visual dialog rendering and click-driven button-index behavior cannot be confirmed by grep/unit test — jest mocks the Rust transport"
  - test: "Trigger a real OS notification (e.g. install-complete or any Notification.show() call site) under npm run tauri:dev"
    expected: "A native OS notification banner appears with the correct title/body"
    why_human: "OS-level notification rendering is not observable from unit tests; only wiring to tauri-plugin-notification was proven"
  - test: "Call shell.showItemInFolder / shell.openPath live (e.g. from Settings > log file reveal) and app.quit / app.relaunch (e.g. resetHeroic)"
    expected: "Finder/Explorer reveals the file; openPath opens the file in its default app; quit/relaunch actually terminates/restarts the real Tauri process (no zombie sidecar)"
    why_human: "Real OS file-manager interaction and full process lifecycle (exit code, relaunch) cannot be verified by jest mocks of requestRustInvoke"
required_reading_note: "REQUIREMENTS.md line 458 (REQ-33-10) checkbox is still unchecked ([ ]) despite 33-05-SUMMARY.md documenting a human-approved D-13 PASS on 2026-07-24. This is a bookkeeping gap, not a code gap -- flagged for the orchestrator, not blocking this verification's PASS-track findings."
---

# Phase 33: Tauri lifecycle cluster — app, dialog, window, notifications, tray Verification Report

**Phase Goal:** Give real Tauri behavior to the 44-file lifecycle cluster the skeleton left
stubbed/no-op (`app`, `dialog`, remaining `shell` methods, `Notification`), close the parked
G-30-02 Steam install-spinner hang (live-hardware proof required per D-13), and fold in Phase 32's
WR-01/02/03 code-review carry-ins — while explicitly scoping (not silently dropping) the
`session`/`powerSaveBlocker` Tauri v2 parity gaps and re-deferring tray/protocol/multi-window/
`nativeImage`/updater to Phase 34/35.

**Verified:** 2026-07-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (per REQ-33-01..11)

| # | Truth (REQ) | Status | Evidence |
|---|---|---|---|
| 1 | REQ-33-01: `ensureConnected()` canary + relog self-heals a stale CM socket instead of trusting a populated `client.steamID` alone | VERIFIED | `src/backend/storeManagers/steam/user.ts:91-167` — bounded `withTimeout` canary (`getProductInfo([753],...)`, 5s) precedes the fast-path return; on failure, guarded `client.relog()` + 20s bounded grace window (`once('loggedOn'/'error')`) mirrors the existing cold-connect idiom. D-01a gap-audit fix confirmed in `bridge/launchTarget.ts` (`withTimeout`-wrapped `resolveBridgeLaunchExe`'s `getProductInfo` call). `user.test.ts` 80/80 passing (jointly with utils.test.ts) |
| 2 | REQ-33-02: `installQueueElement`'s finally-guard clears the badge + shows a failure dialog on Steam `status:'error'`; a belt-and-suspenders watchdog bounds the whole `.install()` await | VERIFIED | `src/backend/downloadmanager/utils.ts:138-217` — finally-guard condition extended to `status === 'error'`; `showDialogBoxModalAuto` fires only on error (not abort); `INSTALL_WATCHDOG_MS` (8min) wraps `.install()` via `withTimeout`/`isTimeoutError`, converging watchdog-trip onto the same terminal path |
| 3 | REQ-33-03: WR-03 error-path regression test drives `error`/`abort`/watchdog-trip through the real install path | VERIFIED | `src/backend/downloadmanager/__tests__/utils.test.ts` — dedicated `describe` blocks for watchdog-trip/non-trip (L249-307) and WR-03 error-path coverage (L308-345: throw/reject path, abort-gets-no-dialog regression guard) |
| 4 | REQ-33-04: WR-02 non-Steam DLC fan-out re-scoped as a declared/guarded boundary, not a silent drop | VERIFIED | `utils.ts:115-120` — `logWarning` fires when `runner !== 'steam' && installDlcs.length > 0`, naming the WR-02/D-11 re-scope explicitly; test coverage at `utils.test.ts:196` |
| 5 | REQ-33-05: `dialog.showMessageBox` returns the real clicked button (multi-button); any transport failure defaults to the caller's own declared `cancelId`, never a positional guess | VERIFIED | `src-tauri/src/main.rs:377-415` — `dialog_message` arm reads an optional 2-element `buttons` array, wires `MessageDialogButtons::OkCancelCustom`. `electronStub.ts:237-283` — real forward, `safeIndex = options?.cancelId ?? (buttons.length-1)`, never rejects. Both destructive callers retrofitted: `utils.ts:305` (`cancelId:0`), `steam/library.ts:1284` (`cancelId:1`) |
| 6 | REQ-33-06: `app.quit`/`exit`/`relaunch` forward to a real Tauri process exit/restart (fixes zombie-sidecar gap) | VERIFIED | `main.rs:470-485` — `app_exit` → `app.exit(0)`, `app_relaunch` → `app.restart()`. `electronStub.ts:142-179` — real `requestRustInvoke(RUST_APP_EXIT/RUST_APP_RELAUNCH,...)` forwards, fire-and-forget with `.catch` logging |
| 7 | REQ-33-07: `Notification` + remaining `shell` methods (`showItemInFolder`/`openPath`) real via first-party Tauri plugins | VERIFIED | `main.rs:416-469` — `notification_show` (via `tauri-plugin-notification`, plugin registered L743), `shell_show_item_in_folder`/`shell_open_path` (via already-installed `tauri-plugin-opener`). `electronStub.ts` — `Notification` class + `shell.showItemInFolder`/`openPath` real forwards (L341-442) |
| 8 | REQ-33-08: `session`/`powerSaveBlocker` are explicitly scoped LOGGED no-ops, never silent | VERIFIED | `electronStub.ts:539-551` (`powerSaveBlocker.start` logs), `session` export added with `fromPartition()` logged stub (per SUMMARY; grep confirms `session:` export present) |
| 9 | REQ-33-09: `33-PORTED-CHANNELS.md` declared + `SEAM.md` §1/§3 updated with every ported/no-op/re-deferred row | VERIFIED | `.planning/phases/33-.../33-PORTED-CHANNELS.md` exists, enumerates PORTED + LOGGED NO-OPS/RE-DEFERRALS tables including the 3 gate gap-fixes. `SEAM.md` §1 gained a new Phase 33 subsection (L270-314); §3 ranked table rows 1/2/4/7/8/9 rewritten with target phases; Accepted Constraints D-08/D-09/D-11 added |
| 10 | REQ-33-10: G-30-02 LIVE hardware proof under `npm run tauri:dev` — install badge resolves, never hangs | VERIFIED (functionally) — REQUIREMENTS.md checkbox stale | `33-05-SUMMARY.md` — `outcome: PASS`, `verified_by: human (live hardware...)`, log excerpt shows `Connectivity: online` → queued → installed, Baldur's Gate II EE, no hang, human-approved. **However REQUIREMENTS.md:458 still shows `- [ ]` for REQ-33-10** — a bookkeeping/tracking gap the orchestrator should reconcile, not a code deficiency |
| 11 | REQ-33-11: Additive/reversible invariant holds — `npm start`/`npm run tauri:dev` both still work, curated-import discipline, no secrets in `configStore` | VERIFIED | `grep -rn "from 'electron'" src/backend/sidecar/*.ts` → empty. `electronUntouched.test.ts` passes (part of 184/184 sidecar suite). `npx tsc --noEmit` clean. `cargo build` (src-tauri) succeeds cleanly. No new writes to `TOKEN_STORE_KEY`/secrets found in modified files |

**Score:** 11/11 truths verified in the codebase (REQ-33-10's live-gate substance is proven; only its REQUIREMENTS.md checkbox is stale)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/backend/downloadmanager/utils.ts` | badge-clear-on-error + failure dialog + install watchdog + WR-02 guard | VERIFIED | Confirmed by direct read; matches SUMMARY claims exactly |
| `src/backend/downloadmanager/__tests__/utils.test.ts` | 11+ regression cases incl. watchdog-trip, throw/reject, abort-no-dialog | VERIFIED | 80/80 passing jointly with user.test.ts; all named describe/it blocks present |
| `src/backend/storeManagers/steam/user.ts` | `ensureConnected()` canary + relog | VERIFIED | Confirmed by direct read, matches SUMMARY |
| `src/backend/storeManagers/steam/bridge/launchTarget.ts` | D-01a gap-fix `withTimeout` wrap | VERIFIED | Confirmed (not shown in this report but grep-checked as part of D-01a review) |
| `src-tauri/src/main.rs` | `dialog_message` multi-button, `notification_show`, `shell_show_item_in_folder/open_path`, `app_exit/app_relaunch` arms | VERIFIED | All 5 arms read directly, match SUMMARY/PORTED-CHANNELS claims |
| `src/backend/sidecar/electronStub.ts` | Real `showMessageBox`/`Notification`/`shell.*`/`app.*` forwards; logged `session`/`powerSaveBlocker`/`trashItem` no-ops | VERIFIED | All forwards confirmed via grep + line reads |
| `src-tauri/capabilities/default.json` | `notification:allow-is-permission-granted` capability grant | VERIFIED | Present, with detailed rationale comment matching the 33-05 gate-gap-fix #1 claim |
| `src/backend/sidecar/bootstrap.ts` | `initOnlineMonitor()` wired into sidecar `init()` with once-guard | VERIFIED | Confirmed lines 44-125 |
| `src/backend/sidecar/electronStub.ts` (`net.isOnline`) | `net.isOnline: () => true` stub | VERIFIED | Line 520 confirmed |
| `src/frontend/index.tsx` | `navigator.windowControlsOverlay?.visible` optional-chaining guard | VERIFIED | Line 217 confirmed |
| `.planning/phases/33-.../33-PORTED-CHANNELS.md` | Declared boundary artifact | VERIFIED | Exists, complete, matches SEAM.md cross-reference |
| `.planning/phases/27-.../SEAM.md` | §1/§3 updated | VERIFIED | New Phase 33 §1 subsection + rewritten §3 rows + new Accepted Constraints confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `installQueueElement` | `showDialogBoxModalAuto` | direct call in `finally` block, gated on `runner==='steam' && status==='error'` | WIRED | Confirmed L207-217 |
| `installQueueElement` | `withTimeout`/`isTimeoutError` | wraps `.install()` await, catch-block branch | WIRED | Confirmed L143-176 |
| `ensureConnected` | `withTimeout` canary + `client.relog()` | direct calls | WIRED | Confirmed L105-163 |
| `electronStub.showMessageBox` | `requestRustInvoke(RUST_DIALOG_MESSAGE,...)` | forward-to-transport | WIRED | Confirmed L237-283; `RUST_DIALOG_MESSAGE` in `RUST_INVOKE_CHANNELS` |
| `main.rs dialog_message` | `MessageDialogButtons::OkCancelCustom` | `builder.buttons(...)` when 2-el buttons array present | WIRED | Confirmed L406-414 |
| `electronStub.Notification/shell/app` | `requestRustInvoke(RUST_NOTIFICATION_SHOW / RUST_SHELL_* / RUST_APP_*)` | forward-to-transport | WIRED | All 5 new channels present in `RUST_INVOKE_CHANNELS` (sidecarTransport.ts L214-227) and registered as `main.rs` match arms |
| `main.rs` builder | `tauri_plugin_notification::init()` | `.plugin(...)` registration | WIRED | Confirmed L743 |
| `bootstrap.ts init()` | `initOnlineMonitor()` | direct call, `onlineMonitorInitialized` guard | WIRED | Confirmed L118-125 |
| `askForceUninstall` / `promptI386Recovery` | `showMessageBox({cancelId})` | direct call | WIRED | Confirmed `utils.ts:305` `cancelId:0`, `library.ts:1284` `cancelId:1` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Sidecar test suite green | `npx jest src/backend/sidecar/__tests__/` | 14 suites, 184/184 passing | PASS |
| Type-check clean | `npx tsc --noEmit` | No output (clean) | PASS |
| downloadmanager + steam/user unit tests | `npx jest src/backend/downloadmanager/__tests__/utils.test.ts src/backend/storeManagers/steam/__tests__/user.test.ts` | 2 suites, 80/80 passing | PASS |
| Rust sidecar compiles | `cargo build` (src-tauri) | `Finished dev profile` — no errors | PASS |
| Curated-import discipline | `grep -rn "from 'electron'" src/backend/sidecar/*.ts` | Empty | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or discovered for this phase — SKIPPED (phase verified via jest/tsc/cargo build + direct code reads instead, per the plan's own verification blocks).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| REQ-33-01 | 33-02 | CM-socket revalidation + D-01a gap-audit | SATISFIED | `user.ts` canary+relog, `launchTarget.ts` fix |
| REQ-33-02 | 33-01 | Install-error terminal surface + watchdog | SATISFIED | `downloadmanager/utils.ts` |
| REQ-33-03 | 33-01 | WR-03 error-path regression test | SATISFIED | `utils.test.ts` new describe blocks |
| REQ-33-04 | 33-01 | WR-02 re-scope, not port | SATISFIED | `utils.ts` guarded logWarning |
| REQ-33-05 | 33-03 | Real multi-button showMessageBox + fail-safe | SATISFIED | `main.rs` + `electronStub.ts` + 2 caller retrofits |
| REQ-33-06 | 33-04 | app lifecycle essentials | SATISFIED | `main.rs` app_exit/app_relaunch + electronStub |
| REQ-33-07 | 33-04 | Notification + remaining shell methods | SATISFIED | `main.rs` notification_show/shell_* + electronStub |
| REQ-33-08 | 33-04 | session/powerSaveBlocker accept-and-document | SATISFIED | electronStub logged no-ops |
| REQ-33-09 | 33-06 | 33-PORTED-CHANNELS.md + SEAM.md update | SATISFIED | Both artifacts confirmed |
| REQ-33-10 | 33-05 | D-13 live hardware proof gate | SATISFIED (functionally) | 33-05-SUMMARY.md human-approved PASS; REQUIREMENTS.md checkbox stale (bookkeeping only) |
| REQ-33-11 | all | Additive/reversible invariant | SATISFIED | electronUntouched green, tsc clean, cargo build clean, no curated-import violations |

No orphaned requirements found — REQUIREMENTS.md's Phase 33 block (REQ-33-01..11) maps 1:1 to the six plans' `requirements-completed` frontmatter fields across 33-01..33-06 SUMMARY.md files.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/backend/utils.ts` | 270, 1105, 1177 | `FIXME` comments | Info | Pre-existing (confirmed via `git log -S`, traces to upstream Heroic commit `f825234a`, unrelated to this phase's `cancelId` change at L305) — not introduced by Phase 33, not a debt-marker gate violation for this phase |

No `TBD`/`XXX` markers found in any file touched by Phase 33's plans. No placeholder/stub patterns (`return null`, empty handlers, hardcoded `[]`/`{}` flowing to render) found in the modified lifecycle/dialog/notification/shell/app/steam files.

### Human Verification Required

The G-30-02 install-hang fix (the phase's headline item, REQ-33-01/02/10) has already been
hardware-proven live and human-approved per `33-05-SUMMARY.md` (D-13 gate, PASS). The remaining
lifecycle-cluster ports below are, by the phase's own design and `33-PORTED-CHANNELS.md`'s explicit
claim-level distinction, **"wired and unit-proven"** only — NOT yet exercised against a real running
Tauri build. This mirrors the same "unit-proven + live-UAT-deferred" pattern Phases 30/31/32 used
for their own non-headline items, so routing these to human verification (rather than treating
"unit-proven" as sufficient) is consistent with that established precedent, not a new bar.

### 1. Real multi-button `showMessageBox` dialogs

**Test:** Trigger `askForceUninstall` and `promptI386Recovery` live under `npm run tauri:dev` (force-uninstall a game; trigger the i386-recovery prompt on an incompatible macOS Steam title) and click each button.
**Expected:** A native OS dialog appears with the correct two button labels; clicking either button resolves the correct index; if the dialog transport is artificially broken, the caller falls back to its own declared safe (non-destructive) `cancelId` button.
**Why human:** Visual dialog rendering, real click-driven button-index behavior, and the fail-safe path under an actually-broken transport cannot be observed from jest's mocked `requestRustInvoke`.

### 2. Real OS notification

**Test:** Trigger any `Notification.show()` call site live (e.g. install-complete banner) under `npm run tauri:dev`.
**Expected:** A native OS notification banner appears with the correct title/body text.
**Why human:** OS-level notification rendering (banner appearance, correct text, OS notification-center integration) is not observable from a unit test that only proves the Rust plugin API was called with the right arguments.

### 3. `shell.showItemInFolder` / `shell.openPath` / `app.quit` / `app.relaunch`

**Test:** Trigger a "reveal in Finder" action and an "open file" action; separately, trigger `resetHeroic()` (or the equivalent app.quit/relaunch code path) live under `npm run tauri:dev`.
**Expected:** Finder/Explorer opens and highlights the correct file; the file opens in its default application; the real Tauri process fully exits (for quit) or exits-and-restarts cleanly (for relaunch) with no zombie sidecar process left running.
**Why human:** Real OS file-manager interaction and full process-lifecycle behavior (actual process exit code, actual restart) cannot be verified by a jest mock of `requestRustInvoke` — this is exactly the "zombie sidecar" gap the phase set out to fix, and only a live run proves it's actually fixed.

### Gaps Summary

No code-level gaps were found. Every REQ-33-01..11 requirement has direct, verifiable evidence in
the codebase (not just SUMMARY.md narrative): the G-30-02 three-layer fix (badge-clear+dialog,
watchdog, canary+relog) reads exactly as claimed and is hardware-proven live per the human-approved
D-13 gate; the dialog/Notification/shell/app-lifecycle ports are real (not stubs), wired end-to-end
(Rust arm → sidecar forward → declared channel constant), and unit-proven (184/184 sidecar tests,
80/80 downloadmanager+steam/user tests, clean `tsc --noEmit`, clean `cargo build`). The
`33-PORTED-CHANNELS.md` and `SEAM.md` boundary-declaration artifacts are genuine and internally
consistent with what shipped.

Two non-blocking findings:
1. **REQUIREMENTS.md:458 (REQ-33-10) checkbox is unchecked** despite the underlying live gate having
   passed and being human-approved per `33-05-SUMMARY.md`. This is a bookkeeping inconsistency for
   the orchestrator to reconcile, not a code deficiency — the actual deliverable (G-30-02 hardware
   proof) exists and is documented.
2. **The non-headline lifecycle ports (dialog/Notification/shell/app) are unit-proven only.** This
   phase's own `33-PORTED-CHANNELS.md` explicitly flags this claim-level distinction, and it matches
   the precedent set by Phases 30/31/32 (which also ended `human_needed` for their own non-headline
   items). Routing these 3 items to human verification, per Step 8's "always needs human" criterion
   for visual/OS-interaction behavior, is why this report's status is `human_needed` rather than
   `passed` despite an 11/11 code-level score.

---

_Verified: 2026-07-24_
_Verifier: Claude (gsd-verifier)_
