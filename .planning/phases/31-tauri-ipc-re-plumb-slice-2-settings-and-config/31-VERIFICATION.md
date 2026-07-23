---
phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config
verified: 2026-07-23T21:00:00Z
status: gaps_found
score: 6/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "The async dialog members (showMessageBox/showErrorBox/showSaveDialog) get real, correct behavior in electronStub.ts, bound through requestRustInvoke()/dispatch_rust_channel() (REQ-31-03)"
    status: failed
    reason: >
      The Rust `dialog_message` match arm (src-tauri/src/main.rs) never calls `.buttons(...)`,
      so the dialog it renders is always OK-only and `blocking_show()` always returns `true`.
      `electronStub.ts`'s `dialog.showMessageBox` forwards only `{message, title, kind}` to
      `RUST_DIALOG_MESSAGE` — the caller-supplied `buttons` array is silently discarded — then
      maps `true -> response:0` unconditionally. Net effect: every confirm dialog with more
      than one button always resolves `response:0` (the first/affirmative button), regardless
      of what the user would have clicked. This is confirmed live and unfixed at HEAD (commit
      30d02371 is the last change to electronStub.ts/main.rs; 31-REVIEW.md's CR-01, timestamped
      after that commit, remains open with no follow-up commit). It is also confirmed REACHABLE
      under the current Tauri build, not merely theoretical: `installFlowRegistration.ts` imports
      `SteamGame` (`storeManagers/steam/games.ts`), whose native install path calls
      `startInstallPolling` (`storeManagers/steam/library.ts`), whose `pollInstallOnce` on a
      `'32'` verdict calls `promptI386Recovery(appId)` — a real, already-shipped (Phase 30)
      destructive confirm dialog (force-uninstall + reinstall via CrossOver) that now auto-
      confirms without real user consent under Tauri. `utils.ts`'s `askForceUninstall` (remove
      from library) and several other confirm dialogs share the same broken contract, per
      31-REVIEW.md's trace of ~10 real callers.
    artifacts:
      - path: "src-tauri/src/main.rs"
        issue: "dialog_message match arm (~lines 368-394) builds app.dialog().message(...).kind(...) with no .buttons(...) call — blocking_show() on the resulting OK-only dialog always returns true"
      - path: "src/backend/sidecar/electronStub.ts"
        issue: "dialog.showMessageBox (~lines 193-220) forwards only {message,title,kind} to RUST_DIALOG_MESSAGE, discarding options.buttons/defaultId/cancelId, then maps the bool result as if only two fixed outcomes existed"
      - path: ".planning/phases/27-tauri-shell-walking-skeleton/SEAM.md"
        issue: "line 255 states the dialog cluster is 'CLOSED for all async members, Phase 31' and 31-PORTED-CHANNELS.md labels showMessageBox 'DECLARED INFRASTRUCTURE ... no in-scope caller' — both claims are scoped only to Phase-31 settings/config flows and do not account for the pre-existing backend callers (some already reachable via the Phase-30-ported install path) that actually branch on `response`, overstating how safely 'closed' the cluster is"
    missing:
      - "Forward options.buttons (and defaultId/cancelId) from electronStub.showMessageBox into the RUST_DIALOG_MESSAGE payload"
      - "In the Rust dialog_message arm, when a two-element buttons array is present, call .buttons(MessageDialogButtons::OkCancelCustom(ok_label, cancel_label)) and map blocking_show()'s bool back to the correct button index (not a hardcoded 0/1)"
      - "Or, per the reviewer's stated fallback: do not wire showMessageBox for real Tauri behavior this phase at all — an OK-only auto-confirm of destructive flows is worse than the prior unimplemented/marker-rejecting state"
      - "Once fixed (or scope is narrowed), correct SEAM.md's 'CLOSED for all async members' claim and 31-PORTED-CHANNELS.md's 'no in-scope caller' framing so they don't imply the cluster is safe when it currently is not"
---

# Phase 31: Tauri IPC re-plumb slice 2 — settings and config — Verification Report

**Phase Goal:** Settings/config cluster ported onto the Node sidecar, plus the Tauri `dialog`
plugin surface those flows need — wired and unit-proven (not hardware-proven, per D-05).
**Verified:** 2026-07-23T21:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `setSetting` (listener) + `writeConfig` (invoke) registered, reach `GlobalConfig`/`GameConfig`.setSetting and real `writeConfig()` (REQ-31-01/02) | VERIFIED | `settingsFlowRegistration.ts:126-158` — `ipcMain.on('setSetting', ...)` and `ipcMain.handle('writeConfig', ...)` present, mirror `main.ts:1042-1052` exactly; `settingsFlows.test.ts` asserts the mocked `GlobalConfig`/`GameConfig` targets are called with the right args; `npx jest settingsFlows.test.ts` — 79/79 suite tests pass |
| 2 | Six generic reads (`getMaxCpus`, `showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative`) return real values; `getUserInfo`/`readConfig` stay Invariant-B rejecting (REQ-31-01) | VERIFIED | `settingsFlowRegistration.ts:167-200` registers all six as real `ipcMain.handle`s; `grep -n "getUserInfo\|readConfig"` in the file shows no registration (comment-only, per module docstring lines 38-43); tests green |
| 3 | Global write persists through Phase 29's `configStore`/`STORE_ALLOWLIST`; no new push channel; secrets (`TOKEN_STORE_KEY`) never touched (REQ-31-02) | VERIFIED | `storeLayer.test.ts` round-trip case for `configStore.set('settings', ...)` passes; `settingsFlowRegistration.ts:105-118` records the D-02 divergence in a block comment; T-31-01 secret-safety assertion passes in `settingsFlows.test.ts` |
| 4 | Async `dialog` members (`showMessageBox`/`showErrorBox`/`showSaveDialog`) get real, **correct** Tauri behavior via `requestRustInvoke`/`dispatch_rust_channel` (REQ-31-03) | **FAILED** | Code confirms `dialog_message` never forwards/honors `buttons` — see Gap 1 below. `blocking_show()` always returns `true` → `response:0` always. Reachable live via the already-shipped Phase 30 install path (`promptI386Recovery`, `askForceUninstall`, and ~8 more callers per 31-REVIEW.md CR-01) |
| 5 | Sync dialog pair + `shell`/`clipboard` conveniences stay LOGGED no-ops (REQ-31-04) | VERIFIED | `electronStub.ts` — `showMessageBoxSync`/`showOpenDialogSync`/`shell.showItemInFolder`/`clipboard.writeText` each emit `console.warn`; `dialogStub.test.ts` asserts `warnSpy` called for each; tests green |
| 6 | Sign-off is automated tests; deferred live UAT logged (D-05) — claim reads "wired and unit-proven" (REQ-31-05) | VERIFIED (methodology) — undermined in substance by Gap 1 | All 4 relevant suites pass (`settingsFlows`, `storeLayer`, `dialogStub`, `electronUntouched` — 79/79); `SEAM.md` and `31-PORTED-CHANNELS.md` log the deferred live UAT. However, the unit tests only assert the (incorrect) bool→response mapping the plan itself specified — they do not exercise the `buttons` contract, so passing tests did not catch CR-01 |
| 7 | Declared ported-channel list artifact + SEAM.md reconciliation (REQ-31-06) | VERIFIED (exists/structured) — WARNING on accuracy | `31-PORTED-CHANNELS.md` exists, mirrors `30-PORTED-CHANNELS.md`'s structure, lists all 8 settings/config channels + 3 dialog members with REQ ids; `SEAM.md` §1 gained the Phase 31 subsection, §3's dialog row is retired, D-02 Accepted Constraint recorded. Its claim that showMessageBox has "no in-scope caller" / is "DECLARED INFRASTRUCTURE" is true only for Phase-31-scoped callers — it does not surface that pre-existing, already-shipped backend callers DO reach it (see Gap 1) |
| 8 | Additive/reversible invariant: both builds work, no `window.api` changes, no real `electron` import (REQ-31-07) | VERIFIED | `electronUntouched.test.ts` passes; `grep -rn "from 'electron'" src/backend/sidecar/settingsFlowRegistration.ts` / `electronStub.ts` → no match; `cargo check --manifest-path src-tauri/Cargo.toml` succeeds; `git diff src-tauri/Cargo.toml` untouched by this phase |

**Score:** 6/7 truths fully verified (Truth 4 FAILED; Truths 6/7 verified at the artifact/process level but their substantive claims are undermined by the same root cause as Truth 4).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/backend/sidecar/settingsFlowRegistration.ts` | write path + 6 generic reads registered | VERIFIED | Read in full; matches plan 31-01 exactly, both `ipcMain.on`/`ipcMain.handle` present, D-02 comment present |
| `src/backend/sidecar/__tests__/settingsFlows.test.ts` | write-path/generic-read/Invariant-B tests | VERIFIED | Present, passes |
| `src/backend/sidecar/__tests__/storeLayer.test.ts` | global-branch persistence proof | VERIFIED | Extended round-trip case passes |
| `src/common/types/sidecarTransport.ts` | `RUST_DIALOG_MESSAGE`/`RUST_DIALOG_SAVE` constants + allowlist | VERIFIED | Both constants present and in `RUST_INVOKE_CHANNELS` |
| `src-tauri/src/main.rs` | `dialog_message`/`dialog_save` match arms | ⚠️ VERIFIED-BUT-INCORRECT | Both arms exist and compile (`cargo check` green) but `dialog_message` drops `buttons` (Gap 1) |
| `src/backend/sidecar/electronStub.ts` | real `showMessageBox`/`showErrorBox`/`showSaveDialog` + D-04 logged no-ops | ⚠️ VERIFIED-BUT-INCORRECT | Forwards to Rust and maps result per plan's (incomplete) contract; D-04 no-ops correctly logged |
| `.planning/phases/31.../31-PORTED-CHANNELS.md` | declared ported-channel list | VERIFIED | Exists, structured correctly, content caveat noted above |
| `.planning/phases/27.../SEAM.md` | §1/§3 update + D-02 constraint | VERIFIED | Updated correctly; "CLOSED for all async members" claim is optimistic given Gap 1 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `settingsFlowRegistration.ts` | `GlobalConfig.setSetting`/`GameConfig.setSetting` | `ipcMain.on('setSetting', ...)` | WIRED | Confirmed by grep + passing tests |
| `settingsFlowRegistration.ts` | `backend/utils writeConfig` | `ipcMain.handle('writeConfig', ...)` | WIRED | Confirmed |
| `electronStub.ts dialog.showMessageBox` | `dispatch_rust_channel` `dialog_message` | `requestRustInvoke(RUST_DIALOG_MESSAGE)` | WIRED-BUT-LOSSY | The call reaches Rust and returns, but the `buttons` payload never crosses the wire — the link exists, its data contract is broken |
| `electronStub.ts dialog.showSaveDialog` | `dispatch_rust_channel` `dialog_save` | `requestRustInvoke(RUST_DIALOG_SAVE)` | WIRED | Correct Option<FilePath> mapping (directory-component drop is a separate, lower-severity WR-03 finding, no real callers) |
| `31-PORTED-CHANNELS.md` | `SEAM.md` §1 | cross-reference by filename | WIRED | `grep -q "31-PORTED-CHANNELS" SEAM.md` succeeds |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 4 phase-relevant jest suites pass | `npx jest settingsFlows.test.ts storeLayer.test.ts dialogStub.test.ts electronUntouched.test.ts` | 4 suites, 79/79 tests passed | ✓ PASS |
| Rust dialog arms compile | `cargo check --manifest-path src-tauri/Cargo.toml` | `Finished dev profile` | ✓ PASS |
| No real `electron` import in touched sidecar files | `grep -rn "from 'electron'" settingsFlowRegistration.ts electronStub.ts` | no match | ✓ PASS |
| `dialog_message` honors caller-supplied `buttons` | manual code read of `main.rs` `"dialog_message"` arm | no `.buttons(...)` call anywhere in the arm | ✗ FAIL (this is Gap 1) |
| `promptI386Recovery`/`askForceUninstall` reachable from the sidecar's current import graph | traced `installFlowRegistration.ts` → `games.ts` → `library.ts`'s `pollInstallOnce`/`promptI386Recovery`; `utils.ts` `askForceUninstall` | import chain confirmed live | ✗ Confirms Gap 1 is reachable, not theoretical |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| REQ-31-01 | 31-01 | Settings write path + generic reads registered; unported channels stay non-fatal | SATISFIED | settingsFlowRegistration.ts, tests green |
| REQ-31-02 | 31-01, 31-03 | Write path persists through Phase 29 store layer; no new sync/push channel; secrets untouched; D-02 documented | SATISFIED | storeLayer.test.ts, D-02 comment + SEAM.md constraint |
| REQ-31-03 | 31-02 | Async dialog members get real behavior; Sync pair stays logged no-op | **BLOCKED** | `buttons`/`response` contract dropped end-to-end (CR-01); see Gap 1 |
| REQ-31-04 | 31-02 | `shell`/`clipboard` conveniences stay logged no-ops, deferred to Phase 33 | SATISFIED | `dialogStub.test.ts` warnSpy assertions pass |
| REQ-31-05 | 31-01, 31-02, 31-03 | Sign-off via automated tests; deferred live UAT logged | SATISFIED (process) | Tests pass; UAT logged in SEAM.md/31-PORTED-CHANNELS.md — but see Gap 1 for why "unit-proven" didn't catch the defect |
| REQ-31-06 | 31-03 | Declared ported-channel list artifact; boundary declared not discovered | SATISFIED (artifact) — WARNING on accuracy | 31-PORTED-CHANNELS.md exists/structured correctly; its "no in-scope caller" framing for showMessageBox is misleading (see Gap 1) |
| REQ-31-07 | 31-01, 31-02, 31-03 | Additive/reversible invariant; SEAM Invariants A/B preserved | SATISFIED | electronUntouched.test.ts, cargo check, no electron imports |

**No orphaned requirements** — all REQ-31-01..07 are claimed by at least one plan (`31-01`: REQ-31-01/02/05/07; `31-02`: REQ-31-03/04/05/07; `31-03`: REQ-31-02/05/06/07), matching `.planning/REQUIREMENTS.md`'s Phase 31 section.

**Note:** `.planning/REQUIREMENTS.md`'s checkboxes for REQ-31-03, REQ-31-04, and REQ-31-06 are still unchecked (`[ ]`) even though the SUMMARY frontmatter for plans 31-02/31-03 claims all three as `requirements-completed`. For REQ-31-03 this checkbox is *correctly* unchecked — it should stay open pending the CR-01 fix. REQ-31-04 and REQ-31-06 are substantively satisfied and their checkboxes are simply out of sync with the SUMMARYs (a bookkeeping gap, not a functional one).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src-tauri/src/main.rs` | 368-394 | `dialog_message` arm builds an OK-only dialog regardless of caller-supplied `buttons` | 🛑 BLOCKER | Every multi-button confirm dialog auto-confirms the first/affirmative button (CR-01) |
| `src/backend/sidecar/electronStub.ts` | 200-207 | `showMessageBox` discards `options.buttons` before forwarding | 🛑 BLOCKER | Same root cause as above, TS side |
| `src/backend/sidecar/settingsFlowRegistration.ts` | 152-158 | `writeConfig` handler casts `appName as string` / `config ?? {}` with no type guard (unlike the adjacent `setSetting` guard) | ⚠️ WARNING | A malformed frame (`appName` missing/non-string) writes a bogus `undefined.json`/`[object Object].json` file instead of being dropped (code review WR-02, unfixed) |
| `src/backend/sidecar/settingsFlowRegistration.ts` | 143-158 | Per-game config write has no path-containment check on `appName` | ⚠️ WARNING | Parity-inherited from Electron; low real-world exploitability per the plan's own threat model (T-31-02); code review WR-01, unfixed |
| `src-tauri/src/main.rs` | 399-407 | `dialog_save` arm passes the full `defaultPath` to `set_file_name` instead of splitting directory/filename | ⚠️ WARNING | Save dialog ignores the caller's intended starting directory; zero real callers exist today (code review WR-03, unfixed) |
| `.planning/phases/27.../SEAM.md` | 255 | "CLOSED for all async members, Phase 31" | ℹ️ INFO | Overstates correctness given Gap 1 — should read "wired, correctness gap open (CR-01)" until fixed |

### Human Verification Required

None required to *determine* phase status — the blocking finding (CR-01) is programmatically verifiable via code inspection and was independently confirmed by re-reading `main.rs`/`electronStub.ts` and tracing the reachability chain. The following remains appropriately deferred per the phase's own D-05 decision (not a new ask from this verification):

### 1. Live settings-screen + native-dialog click-through under `tauri:dev`

**Test:** Toggle a setting in the Tauri build's Settings screen; trigger a native save/message dialog manually.
**Expected:** Setting persists and is reflected on reload; dialog renders natively.
**Why human:** Requires a running `tauri:dev` session and visual/interactive confirmation; explicitly out of scope for this phase per D-05/REQ-31-05 (deferred, logged in SEAM.md and 31-PORTED-CHANNELS.md already).

### 2. Post-fix regression check for CR-01

**Test:** Once the `buttons` contract is fixed, manually trigger `promptI386Recovery` (or a unit test standing in for it) with a "Cancel" click and confirm the native install is NOT force-uninstalled/reinstalled.
**Expected:** Cancel declines the action; only explicit user confirmation triggers the destructive path.
**Why human:** Requires either live hardware UAT or a new unit test asserting the corrected button-index mapping — not yet written.

## Gaps Summary

The phase substantially achieved its goal for the settings/config write path, the six generic
reads, the D-04 no-op logging upgrade, the declared-channel-list artifact, and the additive/
reversible invariant — all backed by passing automated tests and direct code inspection (6/7
truths cleanly verified).

The dialog cluster, however, does not achieve "real behavior" in the sense the phase goal and
REQ-31-03 require. `showMessageBox`'s `buttons`/`response` contract is dropped end-to-end: the
Rust arm never calls `.buttons(...)`, so `blocking_show()` on the resulting OK-only dialog always
returns `true`, which `electronStub.ts` unconditionally maps to `response:0`. This was correctly
flagged as a BLOCKER by the phase's own code review (`31-REVIEW.md` CR-01) and remains unfixed in
the current HEAD — no commit after the review addresses it. It is not a theoretical concern: the
sidecar's current import graph already reaches at least one real, destructive confirm dialog
(`promptI386Recovery`, via the Phase-30-ported native install path's `startInstallPolling` →
`pollInstallOnce`), meaning a live Tauri build today would auto-confirm a force-uninstall+reinstall
action without real user consent. `askForceUninstall` and ~8 more callers traced in the review share
the same broken contract, though their current sidecar-reachability was not independently re-traced
here beyond `promptI386Recovery`.

Because the phase's own documentation (`SEAM.md` line 255, `31-PORTED-CHANNELS.md`'s "DECLARED
INFRASTRUCTURE ... no in-scope caller" framing) asserts the dialog cluster is safely closed, and
that framing is based only on Phase-31-scoped callers rather than the wider codebase, this phase
should not be considered complete until either (a) the `buttons` contract is implemented correctly,
or (b) `showMessageBox` is reverted to non-wired/marker-rejecting per the reviewer's own suggested
fallback, with the SEAM.md/31-PORTED-CHANNELS.md claims corrected to match.

Three lower-severity code-review findings (WR-01 path-traversal on per-game writes, WR-02 missing
type guard on `writeConfig`, WR-03 `dialog_save` directory-component drop) remain unfixed but do
not block the phase goal — they are documented above as WARNING-level anti-patterns for the
planner to triage alongside the CR-01 gap closure.

---

_Verified: 2026-07-23T21:00:00Z_
_Verifier: Claude (gsd-verifier)_
