---
phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate
plan: 06
subsystem: infra
tags: [tauri, rust, keyring, macos-keychain, safestorage, rustinvoke, sidecar]

# Dependency graph
requires:
  - phase: 28-01..05
    provides: rustInvoke channel, TokenStore seam, SidecarKeyringTokenStore, Electron-untouched proof
provides:
  - Hardware-verified real macOS Keychain round-trip (byte-identical) through the sidecar->Rust channel
  - Hardware-verified Deny-path behavior, closing RESEARCH Assumption A1 / Open Question 1
  - 28-PROOF.md — the durable proof-pair record (automated + hardware) for the whole phase
  - SEAM.md safeStorage graduated from Stubbed to Ported; openExternal drop documented as fixed
  - Scaffolding-free main.rs (self-check trigger fully removed after evidence was recorded)
affects: [29-generalize-sidecar-store, future-login-channel-port]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "seed/verify Keychain process split — a single process can never observe a macOS Keychain authorization prompt for an item it creates itself; splitting create and read across two process launches with a rebuild in between is required to reach Approve/Deny prompts"

key-files:
  created:
    - .planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/28-PROOF.md
  modified:
    - src-tauri/src/main.rs
    - .planning/phases/27-tauri-shell-walking-skeleton/SEAM.md

key-decisions:
  - "D-07: Rust (keyring crate) talks to the Keychain, reusing the rustInvoke channel rather than Node shelling /usr/bin/security"
  - "D-09: TokenStore interface + registry (Electron impl unchanged, sidecar impl over rustInvoke)"
  - "D-10: Generic named-command rustInvoke channel, not keyring-specific — reusable for future dialog/clipboard/notification/screen ports"
  - "D-11: Electron's plaintext fallback in encryptToken() KEPT as-is, out of this phase's scope"
  - "Open Question 2: openExternal fixed minimally (dedicated fire-and-forget reader branch), not converted to rustInvoke request/response"

patterns-established:
  - "rustInvoke: generic sidecar->Rust request/response frame, symmetric with the existing Rust->sidecar invoke — the reusable pattern for any future API needing a real Rust-side answer"

requirements-completed: [REQ-28-01, REQ-28-04, REQ-28-06, REQ-28-07]

# Metrics
duration: ~45min (this continuation session: Task 3 + Task 4 + closeout; Tasks 1/1b/2 ran in prior sessions)
completed: 2026-07-22
---

# Phase 28 Plan 06: Hardware Verification + Proof Pair Summary

**Real macOS Keychain round-trip and Deny-path behavior hardware-verified; Deny surfaces as `PlatformFailure(-128 errSecUserCanceled)` — closing RESEARCH Assumption A1 — with no code change required because the classification logic was already variant-agnostic.**

## Performance

- **Duration:** ~45 min for this continuation session (Task 3 write-up, Task 4 scaffolding removal, closeout). Tasks 1 (scaffolding), 1b (seed/verify redesign), and 2 (hardware checkpoint) ran in prior sessions — see `git log` commits `9c47139e`, `7b9016bd`.
- **Completed:** 2026-07-22
- **Tasks:** 4 (1, 1b, 2, 3, 4 — five task IDs total across the whole plan; this session executed 3 and 4)
- **Files modified:** 3 (`28-PROOF.md` created, `src-tauri/src/main.rs` scaffolding removed, `27-.../SEAM.md` updated)

## Accomplishments

- Recorded the full proof pair (`28-PROOF.md`): automated test/build results from plans 28-01..05
  plus the Task 2 hardware checkpoint's five verification steps, verbatim.
- Closed RESEARCH Assumption A1 / Open Question 1: a macOS Keychain Deny click surfaces as
  `keyring::Error::PlatformFailure` wrapping OSStatus `-128` (`errSecUserCanceled`), not
  `NoStorageAccess`. Checked both `dispatch_rust_channel()` (Rust) and `SidecarKeyringTokenStore`
  (TypeScript) directly against this finding — both already classify by "is it `NoEntry`, or is it
  anything else," never by matching a specific non-`NoEntry` variant name, so no code fix was
  needed. Confirmed by grep: both `PlatformFailure` and `NoStorageAccess` already appear as
  interchangeable fixtures in `keyringTokenStore.test.ts`/`electronUntouched.test.ts`.
- Graduated `safeStorage` from §2 Stubbed to §1 Ported in `27-.../SEAM.md`, closed the historical
  27-05 failure note with a pointer to `28-PROOF.md`, documented the `openExternal` drop-frame fix,
  replaced the priority-5 deferred `safeStorage` row with the now-safe-to-wire login-channel row,
  and added the `rustInvoke` pattern to the incremental-port checklist.
- Removed all self-check scaffolding from `src-tauri/src/main.rs` (`keyring_self_check`,
  `keyring_self_check_seed`, `keyring_self_check_verify`, `SELFCHECK_ACCOUNT_SUFFIX`, the
  scratch-file helpers, the `setup()` call site, and the `GAMELIB_KEYRING_SELFCHECK` env-var read)
  only after confirming `28-PROOF.md` already held the recorded evidence. `cargo build` is clean
  with zero warnings and zero remaining `selfcheck` references.

## Task Commits

Tasks 1/1b/2 (prior sessions):
1. **Task 1: Scaffolding-only boot-time keyring self-check** - `9c47139e` (feat)
2. **Task 1b: Redesign self-check into seed/verify/1 modes** - `7b9016bd` (fix)
3. **Task 2: Hardware verification checkpoint** - human-performed, no commit (verification only)

This session:
4. **Task 3: Record 28-PROOF.md and update SEAM.md** - `705cfbac` (docs)
5. **Task 4: Remove keyring self-check scaffolding** - `a1966f7b` (fix)
6. **Task 3 follow-up: record scaffolding-removal commit hash in 28-PROOF.md** - `e6375164` (docs)

**Plan metadata:** (this commit, see below)

## Files Created/Modified

- `.planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/28-PROOF.md` - The proof-pair record: automated results table, five hardware checkpoint steps verbatim, Assumption A1 closure, D-03 deferral restatement, discretionary decisions table, four findings
- `src-tauri/src/main.rs` - Self-check scaffolding fully removed; production `dispatch_rust_channel`/`KEYRING_SERVICE`/`KEYRING_ACCOUNT` untouched
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` - `safeStorage` moved from §2 Stubbed to §1 Ported; `openExternal` drop documented as fixed; §3 deferred table's priority-5 `safeStorage` row replaced with the login-channel port; `rustInvoke` pattern added to the incremental-port checklist

## Decisions Made

See `28-PROOF.md` § 5 for the full table with one-line rationales: D-07 (Rust/keyring), D-09
(TokenStore seam + registry), D-10 (generic `rustInvoke`), D-11 (Electron plaintext fallback kept),
Open Question 2 (minimal `openExternal` fix, not converted to request/response).

## Deviations from Plan

### Auto-fixed Issues

None in this session's own tasks (Task 3/4) — both executed as written.

### Regression discovered and fixed mid-phase (outside this plan's task list)

**1. [Rule 1 - Bug, REGRESSION CAUSED BY THIS PHASE'S EXECUTION] Two test suites were driving the developer's REAL production Electron store; one destroyed the developer's real Steam refresh token**

- **Found during:** Between Task 1b and Task 2, while auditing test suites this phase's plans touch.
- **Issue:** `electronUntouched.test.ts` (added by plan 28-05, commit `8cba2764`) and, more
  seriously, `skeletonFlows.test.ts` (added by **Phase 27**, commit `6a9b0d21`, not this phase)
  both exercised the REAL production Electron `configStore` at
  `~/Library/Application Support/GameLib/steam_store/config.json` rather than an isolated fixture.
  `skeletonFlows.test.ts`'s Test 4 called `steamConfigStore.clear()` unconditionally inside a
  `finally` block with no restore path. During this phase's execution, that suite ran and
  **destroyed the developer's real Steam refresh token** — the production store was left as `{}`,
  the Steam library dropped from its real entry count to 1, and the token was unrecoverable; the
  developer had to re-authenticate with Steam. Root cause detail worth preserving: an `afterAll`
  restore is not a reliable safety net in this repo, because a known, separately-tracked leaked
  install-poll timer in `library.ts` force-exits Jest workers before `afterAll` handlers run
  (documented in `deferred-items.md` and project memory).
- **Fix:** `electronUntouched.test.ts` was rewritten to be strictly read-only — all
  snapshot/restore/seeding apparatus was removed; it now only reads raw bytes
  (`fs.readFileSync`) plus the existing `raw_store`/`get`-with-no-default reads and asserts
  byte-identity before/after, so it can structurally never write to real user data again.
  `skeletonFlows.test.ts`'s Test 4 was isolated so it no longer touches the shared production
  store. Also corrected a stale docstring claiming the on-disk filename is
  `steamConfigStore.json` — `TypeCheckedStoreBackend` never forwards its `name` param into
  `electron-store`'s options, so the real filename is `config.json`.
- **Files modified:** `src/backend/sidecar/__tests__/electronUntouched.test.ts`,
  `src/backend/sidecar/__tests__/skeletonFlows.test.ts`
- **Verification:** Both suites re-run green; `electronUntouched.test.ts` now provably read-only
  by inspection (no `.set()`/`.clear()`/`.delete()` calls against the real store anywhere in the
  file).
- **Committed in:** `92c29a5e` — `fix(28-05): make electronUntouched.test.ts strictly read-only, isolate skeletonFlows Test 4` (landed before this continuation session started; folded into this summary per the parent orchestrator's instruction so the phase record is complete, since it directly affected user data during this phase's execution).

---

**Total deviations:** 1 regression fixed (Rule 1 — data-destroying test bug), landed as its own
commit outside this plan's own task list but during this phase's overall execution window.
**Impact on plan:** No scope creep — the fix was necessary to stop live data destruction and
directly touches the same test files this phase's own plans (27, 28-05) created. Recorded here,
not quietly omitted, per explicit instruction: this was a REGRESSION CAUSED BY THIS PHASE'S
EXECUTION, not a pre-existing bug this phase merely discovered.

## Issues Encountered

**A1's answer required checking, not assuming, for a code-level consequence.** The plan flagged
that if the observed Deny-path `keyring::Error` variant meant the existing classification logic
was wrong, a gap should be filed for `/gsd-plan-phase 28 --gaps` rather than silently fixed here.
Checked directly: `dispatch_rust_channel()` and `SidecarKeyringTokenStore` both classify by
"`NoEntry` vs. everything else," never by matching a specific non-`NoEntry` variant name — so the
observed `PlatformFailure` result required no code change and no gap filing. Documented in full in
`28-PROOF.md` § 3.

**Residue left on the developer's machine by the Deny-path hardware run — NOT cleaned up by this
session, commands surfaced instead.** Because `keyring_self_check_verify()`'s failed
`get_password()` call returned early (before its own cleanup code ran), the Deny run left behind:

- A Keychain entry: service `com.gamelib.launcher`, account `steam-refresh-token-selfcheck`
- A scratch file: `$TMPDIR/gamelib-keyring-selfcheck-seed.txt`

Per the executor's explicit instructions, these were NOT deleted by this agent. To remove them,
the developer (or the orchestrator, with the user's confirmation) can run:

```bash
security delete-generic-password -s com.gamelib.launcher -a steam-refresh-token-selfcheck
rm -f "$TMPDIR/gamelib-keyring-selfcheck-seed.txt"
```

Both are harmless if left in place — the entry is `-selfcheck`-suffixed and structurally distinct
from the production `steam-refresh-token` entry, and the scratch file contains only a synthetic
timestamped string, never a real token — but cleanup is offered for hygiene.

**`npm run test:ci` (full, unscoped) exits 1** on the same pre-existing `library.ts` leaked
install-poll-timer crash documented by plans 28-03/28-04/28-05 and tracked in `deferred-items.md`
(first observed 2026-07-19, predates this phase). Re-confirmed identically in this session. Every
suite this phase's own plans touch is green (see `28-PROOF.md` § 1). Not fixed here — out of
scope per the Scope Boundary rule.

## User Setup Required

None - no external service configuration required. (Optional Keychain/scratch-file cleanup
commands are listed above under Issues Encountered, for the user's discretion.)

## Next Phase Readiness

- Phase 28 is code-complete: all seven requirements (REQ-28-01..07) are now checked off in
  `REQUIREMENTS.md`. `npm start` (Electron) and `npm run tauri:dev` both still work per the
  additive/reversible invariant; the Electron session's real store is confirmed untouched.
- The natural next slice is porting the login channel (`startQRLogin`/`startCredentialLogin`),
  which is now SAFE to wire per D-04/D-06 (previously order-constrained behind this phase) — this
  is what will actually unblock Phase 27 UAT steps 2/3, which remain explicitly deferred.
- REQ-28-05's `openExternal` fix is compiled and code-reviewed but not hardware-verified
  end-to-end; whoever ports the login channel next should exercise a real `steam://` launch as
  part of that phase's own hardware checkpoint.
- Minor cleanup available but not blocking: the `-selfcheck` Keychain entry and scratch file left
  by the Deny-path hardware run (commands above).

---
*Phase: 28-tauri-keyring-real-safestorage-via-the-keyring-crate*
*Completed: 2026-07-22*

## Self-Check: PASSED

All referenced files exist; all referenced commit hashes are present in git history.
