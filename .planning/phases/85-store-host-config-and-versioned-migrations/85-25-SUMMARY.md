---
phase: 85-store-host-config-and-versioned-migrations
plan: 25
subsystem: infra
tags: [proof, ci, clean-worktree, clippy, jest, d-03]

requires:
  - phase: 85-21
    provides: store flag, TS owner path and conf deleted
  - phase: 85-22
    provides: engine-side versioning unthreaded
  - phase: 85-23
    provides: config, manager and store-root versioning unthreaded
  - phase: 85-24
    provides: storeVersioning and storeMigrations deleted (post-deletion head D)
provides:
  - "Clean-worktree proof of the post-deletion head D 92495cd50, and of D' 6ef75501d after the open-time check blocked the first push"
  - "Three-OS CI proof at 88b48b70d: rust-test.yml green on windows/macos/ubuntu, test/codecheck/lint/audit green; D-03 exercised on every OS"
affects: [85-verify-work, 85-validate-phase]

actuals:
  tokens: 9000
  tasks: 3
  commits: 14

plan_head_before: 92495cd50987976ba7566d4254a3bbb03a6c6a6e
plan_head_after: 7c58276b2d826756c8c2e9d5683d5253242fc1e7

tech-stack:
  added: []
  patterns:
    - "Push from a clean detached worktree at the pushed commit when the main working tree holds other sessions' uncommitted files, so the pre-push hook judges exactly the pushed tree (never --no-verify)"

key-files:
  created:
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-25-SUMMARY.md
  modified:
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md
    - .planning/phases/85-store-host-config-and-versioned-migrations/deferred-items.md

key-decisions:
  - "Task 2 decision: push (operator's pre-authorisation in the main session, 'yes, cover 85-25 too'): push and allow CI-only fix commits within this plan, clippy ceilings only lowered to CI's count, never --no-verify, no release dispatch"
  - "First push blocked by the open-time check (quick-261122-qwk code landed between D and HEAD); orchestrator chose reproof at D' 6ef75501d within the existing authorisation; push-anyway was not authorised"
  - "Push made from a clean detached worktree at 88b48b70d after the main-tree pre-push hook failed only on another session's untracked test file"

patterns-established:
  - "Open-time push check is re-run against the latest proven head (D'), not the original D, after a re-proof"

requirements-completed: [FND-06, FND-07]

coverage:
  - id: D1
    description: "Clean-worktree proof at D 92495cd50: frozen install (pruned lockfile matches), vite, SEA sidecar, every rust-test.yml cargo step, darwin clippy ratchet, ipc contract, jest (fully green), exit-check, smoke:sidecar, pre-push gate set, sim"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "85-VALIDATION.md ## Phase proof (post-deletion) (cargo multi-crate 1811 passed; --bin gamelib-shell 687 passed; jest 24257 passed 0 failed; clippy PASS darwin)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D' 6ef75501d re-proof: same results; two load-only jest failures (diPhaseGates probe-file race, shimAbiGate zig under load) each pass alone twice"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "85-VALIDATION.md 'D' re-proof' paragraph; jest --runTestsByPath diPhaseGates.test.ts 156/156 x2, shimAbiGate.test.ts 7/7 x2"
        status: pass
    human_judgment: false
  - id: D3
    description: "Three-OS CI green at 88b48b70d: rust-test.yml windows/macos/ubuntu (atomic::windows on windows, keyring_names_are_pinned and store_boot_never_opens_migrations_json on all three, clippy PASS win32 and darwin), Test, Code check, Lint, Supply-chain audit"
    requirement: FND-06
    verification:
      - kind: integration
        ref: "gh run view 44997872609 (Rust test), 44997872575 (Test), 44997872574, 44997872599, 44997872652"
        status: pass
    human_judgment: false

duration: 44min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 25: Post-deletion phase proof and three-OS CI Summary

**The post-deletion head was proven from a clean worktree twice: at D `92495cd50`, and again at D' `6ef75501d` after another session's code blocked the first push. At the pushed head `88b48b70d` all three Rust CI legs and every other workflow are green on the first round, so D-03's deletions are exercised on Windows, Linux and macOS. No code fix and no CI fix was needed.**

## Performance

- **Duration:** 44 min
- **Started:** 2026-11-22T06:51:50Z
- **Completed:** 2026-11-22T07:36:00Z
- **Tasks:** 3 (Task 2 was the operator's pre-given decision)
- **Files modified:** 3

## Accomplishments

- **D = `92495cd50` proven from a clean `git worktree add --detach`.** Every step passed on the first run:
  - `pnpm install --frozen-lockfile` reported "Lockfile is up to date", so the lockfile pruned of `conf` matches package.json.
  - Cargo: 95 / 29 / 1811 / 687 passed, 0 failed.
  - Clippy `PASS (darwin)`, with no ceiling changed.
  - Jest: 24257 passed, 0 failed.
  - exit-check and smoke:sidecar passed.
  - All nine pre-push gates passed, plus planning-gates 12/12.
- **The first push attempt was blocked by the open-time check.** I re-proved at D' = `6ef75501d`, and every step except jest passed with the same counts. Jest had two load-only failures, and each suite passed alone twice.
- **Pushed `482625ecc..88b48b70d` and collected per-leg CI evidence.** All green: Rust test on windows, macos and ubuntu, plus Test, Code check, Lint and Supply-chain audit. The results are in `## CI proof (post-deletion)`.

## Operator decision (Task 2)

**push.** The operator gave this in the main session ahead of time. Asked whether the 85-19 approval should cover 85-25 too, they replied "yes, cover 85-25 too". Their earlier 85-19 choice, "Push and build (Recommended)", allows CI-only fixes without asking again. For this plan that means:
- push, with CI-only fix commits allowed;
- clippy ceilings only ever lowered to CI's count;
- never `--no-verify`;
- no release dispatch.

The orchestrator chose **reproof** when the first push was blocked, within that same authorisation. Pushing anyway was not authorised.

## Open-time push check

**Attempt 1 (blocked, nothing pushed).** `git diff --name-only D HEAD` (D = `92495cd50`, HEAD = `6ef75501d`) listed 23 paths outside `.planning/`. Another session had committed five commits to main while Task 1 ran: `96557e486` docs(87), plus quick-261122-qwk `17c528d82`, `b3ce729d3`, `126567da4` and `4ded9287d` (GameLib Light and Nord Light on the official palette). The paths:

```
meta/i18nCatalogPresenceBaseline.json
public/locales/en/gamelib.json
src/frontend/__tests__/muiTheme.test.ts
src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts
src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
src/frontend/components/UI/NavShell/components/NavTabs/index.scss
src/frontend/components/UI/ThemeSelector/__tests__/ThemeGallery.test.tsx
src/frontend/components/UI/ThemeSelector/__tests__/ThemeThumbnail.test.tsx
src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx
src/frontend/components/UI/ThemeSelector/themeLabels.ts
src/frontend/customThemes/__tests__/applyTheme.test.ts
src/frontend/customThemes/__tests__/customTheme.test.ts
src/frontend/customThemes/__tests__/fixtures/nordLightPreChange.json
src/frontend/customThemes/__tests__/nordLightPalette.test.ts
src/frontend/customThemes/__tests__/thumbnailPalette.test.ts
src/frontend/customThemes/builtinTokens.generated.json
src/frontend/customThemes/thumbnailPalette.ts
src/frontend/muiTheme.ts
src/frontend/screens/Library/components/LibrarySignInNotice/index.scss
src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts
src/frontend/styles/_buttons.scss
src/frontend/themes.scss
```

**Attempt 2 (pushed).** After the D' re-proof, I re-ran `git diff --name-only D' HEAD` (D' = `6ef75501d`, HEAD = `88b48b70d`) immediately before the push:

```
.planning/phases/85-store-host-config-and-versioned-migrations/85-VALIDATION.md
.planning/phases/85-store-host-config-and-versioned-migrations/deferred-items.md
```

- **Main working tree:** `git push origin main` from there was rejected by the pre-push hook. Only `pnpm backend-di-ceilings` failed, on `src/frontend/state/__tests__/libraryStoreFollowers.test.ts`, another session's untracked file that is in no commit.
- **Clean worktree:** I then pushed from a clean detached worktree at `88b48b70d`, re-running the same diff immediately before (same two paths). `git push origin HEAD:main` ran the full hook against exactly the pushed tree and passed: `482625ecc..88b48b70d`.

## Task Commits

1. **Task 1: post-deletion phase proof at D** - `6ef75501d` (docs)
2. **Task 1 (re-proof): D' re-proof, first push blocked** - `88b48b70d` (docs)
3. **Task 2: decision** - no commit (operator's pre-authorisation, recorded here)
4. **Task 3: CI proof at `88b48b70d`** - `7c58276b2` (docs)

**Plan metadata:** the final docs commit (SUMMARY, STATE, ROADMAP).

`commits: 14` is measured with `git rev-list --count 92495cd50..HEAD` at SUMMARY time. It counts this plan's three commits plus eleven from other sessions that landed on main meanwhile: docs(87), quick-261122-qwk's four, and quick-261122-rz8's six (`6ca6e9638`..`4471acdc0`, local and unpushed). It does not count the final docs commit.

## Files Created/Modified

- `85-VALIDATION.md`:
  - new `## Phase proof (post-deletion)` (D results table and the D' re-proof paragraph);
  - new `## CI proof (post-deletion)`;
  - per-task map rows 85-19..85-25 and the gates row brought up to date;
  - `status: draft` and `nyquist_compliant` left alone.
- `deferred-items.md`: the two new load-only jest failures from the D' run.

## Decisions Made

See key-decisions and the operator decision above.

## Deviations from Plan

### Auto-fixed Issues

None. No code or CI fix was needed.

### Procedural deviations

**1. [Open-time check] First push blocked; re-proof at D'**
- **Found during:** Task 3, before the first push
- **Issue:** another session's quick-261122-qwk code landed between D and HEAD
- **Resolution:** following the orchestrator's reproof decision, I proved D' `6ef75501d` in a fresh clean worktree and ran the open-time check against D'. One re-proof was used, out of the two allowed
- **Committed in:** `88b48b70d`

**2. [Rule 3 - Blocking] Pre-push hook failed in the main working tree on another session's untracked file**
- **Issue:** `pnpm backend-di-ceilings` reads the working tree. It flagged an untracked jest file that belongs to another session's in-progress work and is not in the pushed commits
- **Resolution:** I did not touch the file and did not use `--no-verify`. The push ran from a clean detached worktree at the pushed commit, so the full hook ran against exactly the pushed tree and passed
- **Committed in:** none (procedure only)

**3. [Naming] Scratch worktree name**
- The orchestrator named it `gamelib-85-proof2`, not the plan's `gamelib-85-final`. Task 1's verify checks that both are absent, and both are.

---

**Total deviations:** 0 auto-fixed, 3 procedural. **Impact:** none on the proof. Each one kept the open-time rule and the hook intact.

## Issues Encountered

- **The D' full jest run had two load-only failures** (load average about 10). Neither suite is touched by D..D', and both are recorded in `deferred-items.md`:
  - `diPhaseGates.test.ts` hit ENOENT on `meta/runTs.__probe__.cjs`. That file is written and unlinked by `runTsSignals.test.ts` while the 66.3 scan walks `meta/`, a real cross-suite race. Alone: 156/156, twice.
  - `shimAbiGate.test.ts`: `zig cc` was killed, then a spawn failed with errno -88. Alone: 7/7, twice.
- **The final docs push is gated by the same open-time rule.** At SUMMARY time, local main carries another session's six unpushed quick-261122-rz8 commits, which touch `src/frontend`. So `git diff --name-only D' HEAD` will list non-`.planning` paths, and this plan cannot push its final docs commit without also publishing them. The executor pushes only if the check passes at push time. The return message reports the outcome.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- All 25 plans in Phase 85 have SUMMARYs. The phase is ready for `/gsd-verify-work 85` (which owns the SC3 line in `## Signed baseline (D-16)`) and `/gsd-validate-phase 85` (`status` and `nyquist_compliant`).
- Still open from earlier plans: the late mirror-cell rev handshake (85-17, `deferred-items.md`), the GOG cache emptied on an offline first boot (85-20 item 3, a todo), and the 0.11.0 release notes owed before the draft v0.11.0 is published.

## Self-Check: PASSED

- `85-VALIDATION.md` holds exactly one `## Phase proof (post-deletion)` and one `## CI proof (post-deletion)`.
- Commits `6ef75501d`, `88b48b70d` and `7c58276b2` are ancestors of HEAD. `6ef75501d` and `88b48b70d` are on origin/main.
- No `gamelib-85-proof2`, `gamelib-85-final` or `gamelib-85-push` worktree remains in `git worktree list`.

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
