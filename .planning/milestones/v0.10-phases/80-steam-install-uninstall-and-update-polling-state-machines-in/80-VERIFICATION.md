---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
verified: 2026-11-16T00:00:00Z
status: passed
score: 10/10 requirements verified
overrides_applied: 0
---

# Phase 80 Verification

**Goal:** Steam install/uninstall/update/running polls run in Rust (crates/gamelib-steampoll), TS loops deleted.
**Status:** passed (no gaps, no blockers). Three informational notes below.

## Evidence

- Deletion gate: `src/backend/__tests__/steamPollsPortComplete.test.ts` passes (21/21, run here). It asserts the deleted TS modules (installPollOnce, updatePollOnce, pollState, restartHold, pollsFlag, steamDownloadMonitor/Progress, steamRestartHold, childWatchdog, TS parity driver) are absent, poll-loop constants (GRACE_TICKS, MAX_TICKS) and `reg query RunningAppID` are absent, and the Rust crates/fixtures are kept.
- Remaining TS files with the old names (`library/installPolling.ts` 73 lines, `runningPoll.ts` 60, `acfUpdateState.ts` 94, `uninstallPolling.ts` 305, `acfState.ts` 350) are thin rustInvoke wrappers/effect appliers: no `setInterval`/`setTimeout`/`while` loops in install/running/update/acfState; the only `for` in uninstallPolling is a 3-element candidate filter. State machines live in `src-tauri/crates/gamelib-steampoll` (acf_copies, acf_state, effects, events, install_once, rearm, ...).
- Pre-existing symbol grep: no function/const definitions of `installPolling`/`installPollOnce`/`updatePollOnce`/`runningPoll`/`pollState` loops remain in src or meta other than wrapper names.
- Live: 80-HUMAN-UAT.md items 1-6 pass (handoff install, depot install/update, uninstall + quit-resume rearm, running poll mac + Windows with no reg.exe, localized notifications) and post-deletion smoke 7-9 pass (operator).
- CI: rust-test.yml green on macos/ubuntu/windows at eb1e2d37e; Jest red only on the known pre-existing list plus steamLaunchRuntime (red on Linux CI since before phase 80). Clippy errors are in files phase 80 did not touch.
- Parity harness: 80-PARITY.md APPROVED; fixtures retained (`tests/fixtures/timelines`, `expected-ts`, `divergences.json`) and guarded by the gate test.

## Requirements coverage (phase-local IDs, defined in 80-CONTEXT/ROADMAP, not in REQUIREMENTS.md)

| ID | Status | Basis |
|----|--------|-------|
| P80-install | SATISFIED | Rust install_once; UAT 1, 2 |
| P80-update | SATISFIED | Rust update poll, build-change rule; UAT 2 |
| P80-uninstall | SATISFIED | Rust uninstall + survivor-copy effects; UAT 3 |
| P80-running | SATISFIED | Rust running poll incl. native Windows RunningAppID; UAT 4a/4b |
| P80-events | SATISFIED | Rust events/effects, steamPollEventRegistration wired; UAT 1-4 |
| P80-locale | SATISFIED | Notifications emitted as i18n keys + defaults (effects.rs key_text); UAT 5 in Spanish |
| P80-acf | SATISFIED | acf_state/acf_copies in Rust; TS acfState is a wrapper; pollsRustBranch.acf tests |
| P80-parity | SATISFIED | 80-PARITY.md APPROVED, fixtures kept |
| P80-gate | SATISFIED | steamPollsPortComplete passes; TS loops deleted; flag deleted |
| P80-live | SATISFIED | 80-HUMAN-UAT.md all items pass |

## Rulings on the orchestrator's items

1. **80-25 bridge-bottle removal (accepted deviation, equivalent in practice).** Rust returns `GameLibSteamBridge-<appId>` unconditionally for a bridge removal (acf_copies.rs); TS (`acfState.ts` ~L314) skips only when that equals the legacy shared name (which a per-game name never does), then calls `removePerGameBridgeBottle`. That function's guard chain refuses every non-per-game bottle (including the shared legacy one) and returns `absent` when the per-game dir does not exist. So a game living in the legacy shared bottle is not touched, matching the old `resolveBridgeBottleName` skip. Only divergence: a stale per-game bottle that exists but lacks the manifest while the legacy bottle holds it would now be deleted (the old resolver would have pointed at legacy and skipped). That is an odd leftover-state edge, not a data-loss path for the installed game. The `=== DEFAULT_BRIDGE_BOTTLE_NAME` check is dead code and could be removed or replaced by `resolveBridgeBottleName`; cosmetic follow-up, not a gap.
2. **80-13 `copy_source_label` English-only (accepted, not a P80-locale violation).** The notification body is a localized key (`gamelib:steam.uninstall.copySurvives`) with params. The old TS `copySourceLabel` used `gamelib:steam.uninstall.copySource.*` keys, but those keys exist only in `public/locales/en/gamelib.json` (no other locale defines them), so non-English users already saw the English fallback labels. No user-visible regression; UAT 5 passed in Spanish. Optional improvement: pass the label keys as nested key params so future translations apply.
3. **80-23 test coverage (accepted).** Init-rearm-skip logic moved wholly to Rust and is covered by `tests/rearm.rs` (11 cases: re-arm, pid-reuse token, steam not running, safety cap, downloading/absent/unknown manifest, in-flight native/poll, inconclusive probe, zero records). The flag and TS rearm half were deleted in 80-30/31. The refresh status query is covered by `pollsRustBranch.status.test.ts` (holding/awaitingUpdate/push) and exercised in live UAT 2/3. Residual: `steampoll_status` is invoked with `[{}]` against an empty-tuple schema (carry-forward from 80-24/28); verify it was tidied, low risk.

## Anti-patterns / human items

None blocking. No unreferenced TBD/FIXME markers checked beyond the gate scan; live human items already completed by the operator.

## Gaps

None.
