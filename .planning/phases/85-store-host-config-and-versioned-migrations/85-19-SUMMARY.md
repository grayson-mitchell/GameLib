---
phase: 85-store-host-config-and-versioned-migrations
plan: 19
subsystem: infra
tags: [proof, ci, release, codesign, notarization, clippy, jest]

requires:
  - phase: 85-05
    provides: signed v0.10.0 baseline identity (D-16)
  - phase: 85-17
    provides: renderer writes served natively (last code plan before the proof)
  - phase: 85-18
    provides: bottle version gate (last code plan before the proof)
provides:
  - "Clean-worktree proof of Phase 85's automated half at P d90e33bc8"
  - "Three-OS CI proof at 482625ecc, incl. atomic::windows (S2) and keyring_names_are_pinned on windows/ubuntu (D-10)"
  - "Signed, notarized Phase 85 build (draft v0.11.0) whose identity equals the v0.10.0 baseline; SC3 pending the 85-20 live gate"
affects: [85-20, 85-21, 85-25]

actuals:
  tokens: 16000
  tasks: 3
  commits: 7

plan_head_before: 186ffb9eb0dcd0b7557dc18cc9c499d96508f902
plan_head_after: 482625eccf23729b9f819041ca91db23701d11c3

tech-stack:
  added: []
  patterns:
    - "Version bump to a number above the signed baseline so tauri-action opens a separate draft release (v__VERSION__)"

key-files:
  created:
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-19-SUMMARY.md
  modified:
    - package.json
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/tauri.conf.json
    - public/changelog.json
    - src-tauri/src/store_dispatch.rs
    - meta/__tests__/rendererZodGuard.test.ts
    - meta/__tests__/storeCorpus.test.ts
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md
    - .planning/phases/85-store-host-config-and-versioned-migrations/deferred-items.md

key-decisions:
  - "Operator decision (Task 2): push-and-build. Push main (hook runs, never --no-verify; the push also published the other session's Phase 84 commits, which the operator accepted), dispatch release-tauri.yml with dry_run=false for a draft v0.11.0 that is never published, CI-only fixes allowed without asking again, a clippy ceiling only ever lowered to CI's count"
  - "Operator decision: keep the renderer zod guard's .json allowance (d90e33bc8); storeChannels.json stays under common/types/ipc"
  - "Version bumped 0.8.0 -> 0.11.0 so the Phase 85 build sorts above the v0.10.0 baseline for the 85-20 upgrade gate"
  - "The corpus account-name scan is disabled on GitHub-hosted runners (account `runner` collides with the GameLib `runner` key); all other scans still run there"

patterns-established:
  - "A non-dry release-tauri.yml run uploads to the draft release, not as a run artifact: read identity with gh release download"

requirements-completed: [FND-06, FND-07]

coverage:
  - id: D1
    description: "Clean-worktree proof at P d90e33bc8: every rust-test.yml cargo step, darwin clippy ratchet, check:ipc-contract, smoke:exit-check eof, smoke:sidecar and the pre-push gate set pass; jest failures only load flakes that pass alone"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "85-VALIDATION.md ## Phase proof (cargo test multi-crate 1810 passed; --bin gamelib-shell 702 passed; clippy PASS darwin)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three-OS CI green at 482625ecc: rust-test.yml on windows/macos/ubuntu, atomic::windows ran on windows-latest, keyring_names_are_pinned on windows-latest and ubuntu-latest, test.yml/codecheck/lint/audit green"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "gh run view 44980283910 (Rust test), 44980283964 (Test), 44980283978, 44980284019, 44980284022"
        status: pass
    human_judgment: false
  - id: D3
    description: "Signed, notarized, stapled Phase 85 macOS build (draft v0.11.0, run 44978855761) with TeamIdentifier and designated requirement equal to the v0.10.0 baseline"
    requirement: FND-07
    verification:
      - kind: manual_procedural
        ref: "codesign -dv/-d -r-/--verify --deep --strict, spctl -a -vv, xcrun stapler validate on GameLib_0.11.0_aarch64.app.tar.gz"
        status: pass
    human_judgment: true
    rationale: "Identity equality is proven; whether the upgrade raises zero Keychain prompts is the 85-20 live gate (SC3 pending)"

duration: 2h 18m
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 19: Phase proof, three-OS CI and the signed Phase 85 identity Summary

**Phase 85 proven from a clean worktree at d90e33bc8 after three real fixes and green on all three CI legs. The signed, notarized draft v0.11.0 build carries the same TeamIdentifier and designated requirement as the v0.10.0 baseline, so SC3 is pending, with only the 85-20 live gate left.**

## Performance

- **Duration:** 2h 18m
- **Started:** 2026-11-22T01:15:00Z (approx; first commit 02:16:05Z)
- **Completed:** 2026-11-22T03:34:00Z
- **Tasks:** 3 (Task 2 was the operator's decision)
- **Files modified:** 10

## Accomplishments

- Version bumped to 0.11.0. The clean-worktree proof at the first candidate head turned up three real failures, each fixed with a scoped commit, which moved P to `d90e33bc8`. All results are recorded in `## Phase proof`.
- Pushed under the operator's authorisation. CI found one CI-only failure, which was fixed. At `482625ecc` all three Rust legs are green, with `atomic::windows` (S2) and `keyring_names_are_pinned` (D-10) seen in the step logs. Test, Code check, Lint and Supply-chain audit are also green.
- Ran release-tauri.yml with `dry_run=false`, producing draft v0.11.0 (not published). The app's identity equals the baseline: same TeamIdentifier `S7U223QWXJ`, byte-identical designated requirement, Notarized Developer ID, stapled. SC3 is set to `pending (identities match; live gate owed by 85-20)`.

## Operator decisions (Task 2)

- **push-and-build**, given by the operator via AskUserQuestion in the main session. That covers the push (pre-push hook ran, never `--no-verify`, and it also published the other session's Phase 84 commits), the non-dry release dispatch (draft only, never published), CI-only fixes landing without asking again, and clippy ceilings only ever being lowered.
- **Zod guard:** keep the `.json` allowance (`d90e33bc8`); do not move `storeChannels.json`.

## Open-time push check

`git diff --name-only P HEAD`, re-run immediately before the first `git push origin main` with no other command in between (P = `d90e33bc8aba8c15622b5156b07113343593a101`, HEAD = `ffb8573d2`):

```
.planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md
.planning/phases/85-store-host-config-and-versioned-migrations/deferred-items.md
```

Only `.planning/` paths, so the push went ahead: `a0401bbc6..ffb8573d2`. The CI fix went out second as `ffb8573d2..c06a0c237`.

## Task Commits

1. **Version bump (orchestrator amendment 1)** - `2ce910a69` (chore)
2. **Task 1 fix: darwin clippy findings in store_dispatch** - `2bee0ba6c` (fix)
3. **Task 1 fix: changelog.json identity to 0.11.0** - `ace12ef70` (fix)
4. **Task 1 fix: renderer zod guard admits a .json data module** - `d90e33bc8` (fix)
5. **Task 1: Phase proof recorded** - `ffb8573d2` (docs)
6. **Task 3 CI-only fix: corpus account-name scan on hosted runners** - `c06a0c237` (fix)
7. **Task 3: CI proof, Phase 85 build identity, SC3, SUMMARY** - this plan-metadata commit (docs)

`commits: 7` is measured from the ledger (`git rev-list --count 186ffb9eb..HEAD` at SUMMARY time). It counts the six commits above plus `482625ecc`, a `docs(84)` commit another session made on main in the meantime. It does not count this final docs commit.

## Files Created/Modified

- `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (gamelib-shell entry only), `src-tauri/tauri.conf.json`: version 0.11.0
- `public/changelog.json`: identity fields and heading 0.11.0 (prose unchanged)
- `src-tauri/src/store_dispatch.rs`: `crate::shell_log` passed directly; `match` instead of `Option::is_none_or`
- `meta/__tests__/rendererZodGuard.test.ts`: `.json` modules under ipc exempt, with a detector test
- `meta/__tests__/storeCorpus.test.ts`: account-name scan off when `GITHUB_ACTIONS=true`
- `85-VALIDATION.md`: `## Phase proof`, `## CI proof`, Phase 85 build block, SC3 line, per-task map, Wave 0 ticked, `wave_0_complete: true`, status left draft
- `deferred-items.md`: two load-only jest flakes, owed 0.11.0 release notes

## Decisions Made

See key-decisions. The operator's two choices are recorded above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two new darwin clippy findings**
- **Found during:** Task 1, at candidate `2ce910a69`
- **Issue:** `redundant_closure` (no ceiling) and a second `incompatible_msrv` (ceiling 1) in `store_dispatch.rs`, both from 85-10 `5aca95cd1`
- **Fix:** pass `crate::shell_log` directly; use a `match`. No ceiling changed
- **Committed in:** `2bee0ba6c`

**2. [Rule 1 - Bug] changelogVersionGate failed after the bump**
- **Found during:** Task 1, at `2bee0ba6c`
- **Fix:** changed the four identity surfaces to 0.11.0, as the 0.8.0 bump `0212fecb9` did
- **Committed in:** `ace12ef70`

**3. [Rule 1 - Bug] rendererZodGuard rule d failed (preload -> storePolicy.ts -> ipc/storeChannels.json, since 85-16)**
- **Fix:** the guard admits `.json` data modules under ipc. Every `.ts` module there is still forbidden. The operator chose to keep this
- **Committed in:** `d90e33bc8`

**4. [Rule 1 - Bug, CI-only] storeCorpus redaction scan failed on the hosted runner (`runner` account vs the `runner` key)**
- **Found during:** Task 3, Test run 44978826083
- **Fix:** account-name check disabled when `GITHUB_ACTIONS=true`. Verified locally in both modes, then green on CI run 44980283964
- **Committed in:** `c06a0c237`

**5. [Orchestrator amendment] Version bump and non-dry release run**
- The plan predates both. The bump (`2ce910a69`) and `-f dry_run=false` (draft v0.11.0) were applied as the operator authorised.

---

**Total deviations:** 4 auto-fixed (all Rule 1) plus 1 orchestrator amendment
**Impact on plan:** each fix was needed for the proof or CI to pass. The zod-guard change loosens a gate narrowly; the operator chose to keep it.

## Issues Encountered

- Two jest suites fail only under full-run load and pass alone: `runnerClone.test.ts` hung once to its 900 s timeout, and `steamLoginPollLifecycle.test.tsx` failed once with empty QR markup. Neither is Phase 85 code; both are in deferred-items.md. CI's Test run at `482625ecc` was fully green.
- Another session pushed `482625ecc` right after `c06a0c237`, which cancelled the `c06a0c237` runs. The `482625ecc` runs stand in for them, since the only difference is one `.planning` doc.

## Known Stubs

None. `public/changelog.json` carries the 0.11.0 identity over the 0.8.0 release prose. Real 0.11.0 notes are owed before the draft is published (deferred-items.md).

## User Setup Required

None.

## Next Phase Readiness

- 85-20 (live macOS gate) can be scheduled. Both signed builds exist with equal identities: baseline v0.10.0 from run 44925761249 and the Phase 85 build, draft v0.11.0, from run 44978855761.
- The draft v0.11.0 release stays unpublished. Publishing is the operator's call.
- The late mirror-cell rev handshake (85-17, deferred-items.md) is still unbuilt.

## Self-Check: PASSED

- `85-VALIDATION.md` holds `## Phase proof`, `## CI proof`, `Phase 85 build`, `wave_0_complete: true` and exactly one `SC3:` line (`pending`).
- Commits `2ce910a69`, `2bee0ba6c`, `ace12ef70`, `d90e33bc8`, `ffb8573d2`, `c06a0c237` are all ancestors of HEAD and of origin/main.
- The scratch worktree `gamelib-85-proof` is gone from `git worktree list`, and the downloaded release assets are deleted.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
