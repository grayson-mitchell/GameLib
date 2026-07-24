---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 17
subsystem: infra
tags: [github-actions, tauri-action, updater-signing, minisign, ci, meta-script, gap-closure]

# Dependency graph
requires:
  - phase: 34 (gap cycle 3, wave 2)
    provides: release-tauri.yml with 34-16's Apple signing env-gate landed (this plan edits the same file immediately after)
provides:
  - "pnpm verify:updater-key" -- a decode-and-match preflight for TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD, runnable both in CI and locally by a developer before enrolling secrets
  - verifyUpdaterSigningKeypair()/keyIdFromMinisignFile()/readCommittedPubkey() (meta/updaterSigningKey.ts) -- exercises the real Tauri signer against a throwaway probe file and compares minisign key ids
affects: [34-18 (hands this exact command to a human as a blocking gate before secret re-enrollment)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real-keypair-fixture testing: generate genuine keypairs via `tauri signer generate --ci` in beforeAll (never hand-rolled crypto, never checked-in key material), assert against them, remove them in afterAll -- same discipline as the rest of Phase 34's executed-path testing."
    - "Discriminated preflight result, never throws: { ok: true, keyId } | { ok: false, kind: 'missing-key'|'password-mismatch'|'sign-failed'|'pubkey-mismatch'|'bad-pubkey', ... } -- lets the CLI entry print exactly one ::error:: line naming the concrete remedy per failure kind."
    - "Missing-key check runs BEFORE any filesystem/CLI touch, so a test can prove the Tauri CLI is never spawned by pointing confPath at a nonexistent file and asserting no throw -- no node:child_process mocking needed (this repo's existing note that node:fs/promises exports are non-configurable getters under ts-jest/CJS interop made avoiding spyOn/mock entirely the simpler, more robust choice)."

key-files:
  created:
    - meta/updaterSigningKey.ts
    - meta/verifyUpdaterSigningKey.ts
    - meta/__tests__/updaterSigningKey.test.ts
  modified:
    - package.json
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts

key-decisions:
  - "The missing-key check short-circuits before readCommittedPubkey() or resolveTauriCli() ever run -- this both matches the plan's 'CLI never spawned' requirement and let the regression test avoid mocking node:child_process entirely (pass an unreachable confPath, assert no throw)."
  - "The committed pubkey is read and decoded BEFORE spawning the signer (bad-pubkey is cheaper to detect and independent of what the candidate key/password pair would produce), while pubkey-mismatch is only reachable after a successful sign -- these are two distinct failure kinds precisely because one is a repo-config defect and the other is a secret-enrollment defect."
  - "verify:updater-key follows the existing meta-script convention byte-for-byte (esbuild --bundle --platform=node --target=node22 <file> | node), matching build:sidecar-sea's target=node22 rather than the older target=node21 scripts, since it shares the same Node >=22 engines constraint as the sidecar build it protects."

requirements-completed: [REQ-34-05, REQ-34-06, REQ-34-09]

# Metrics
duration: 25min
completed: 2026-07-24
---

# Phase 34 Plan 17: Updater signing key decode-and-match preflight (GAP-B code half) Summary

**Added `pnpm verify:updater-key`, which signs a throwaway probe file with the real Tauri signer and compares the resulting signature's minisign key id against the committed `plugins.updater.pubkey`, turning live run 30084918812's opaque 13-minute-late `Wrong password for that key` failure into a fast, named one -- wired as a release-tauri.yml preflight step and runnable identically by a developer locally.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 3

## Accomplishments

- Closed the CODE half of GAP-B: a mismatched `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` now fails within the first minutes of a CI run (before the renderer build, the SEA sidecar build, and tauri-action), not ~13 minutes into a Windows Rust build.
- Additionally catches the quieter failure WR-03's existing preflight could never detect: an enrolled key that decodes fine but does NOT match the committed `plugins.updater.pubkey` -- a green pipeline that would ship updates every installed client rejects.
- The exact same command (`pnpm verify:updater-key`) is runnable locally by a developer against a candidate secret pair before enrolling it -- the prerequisite 34-18 depends on to hand this tool to a human as a blocking gate.
- Zero new npm/CLI installs: `@tauri-apps/cli` (2.11.4) and `esbuild` were already devDependencies; the Tauri CLI is resolved via `require.resolve` + `process.execPath` (the proven GAP-2 argv-spawn pattern), never a bare `tauri`/pnpm `.bin` path.
- Nothing the live run proved working was touched -- this plan only adds one workflow step and edits comments, per the plan's hard constraint.

## Task Commits

Each task was committed atomically:

1. **Task 1: `pnpm verify:updater-key` -- prove the enrolled key/password pair decodes and matches the committed pubkey** - `e2653759` (feat)
2. **Task 2: Wire the decode preflight into release-tauri.yml before any expensive build work** - `c5722ed8` (feat)

**Plan metadata:** (this commit, immediately following)

## `pnpm verify:updater-key` -- exact invocation and output (34-18 hands this to a human)

Fixtures: a real keypair generated via `tauri signer generate --ci -p correct-horse-battery-staple -w demokey -f`, with a scratch `tauri.conf.json`-shaped file whose `plugins.updater.pubkey` is that keypair's public half (`democonf.json`).

### Matched case (exit 0)

```
$ TAURI_SIGNING_PRIVATE_KEY="$(cat demokey)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="correct-horse-battery-staple" \
  GAMELIB_UPDATER_CONF="democonf.json" \
  pnpm verify:updater-key

> gamelib@0.7.0 verify:updater-key /Users/graysonmitchell/Projects/GameLib
> esbuild --bundle --platform=node --target=node22 meta/verifyUpdaterSigningKey.ts | node

Updater signing key verified: enrolled TAURI_SIGNING_PRIVATE_KEY matches the committed plugins.updater.pubkey (key id 5ebd982a75f74e07, raw byte order -- differs from the pubkey comment by design).
EXIT=0
```

### Wrong-password case (exit 1) -- the actual live run 30084918812 failure, reproduced on demand

```
$ TAURI_SIGNING_PRIVATE_KEY="$(cat demokey)" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="totally-the-wrong-password" \
  GAMELIB_UPDATER_CONF="democonf.json" \
  pnpm verify:updater-key

> gamelib@0.7.0 verify:updater-key /Users/graysonmitchell/Projects/GameLib
> esbuild --bundle --platform=node --target=node22 meta/verifyUpdaterSigningKey.ts | node

::error::TAURI_SIGNING_PRIVATE_KEY_PASSWORD does not decrypt TAURI_SIGNING_PRIVATE_KEY. This is an ENROLMENT defect, not a repo defect -- both secrets must be re-enrolled together as a matched pair (see .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-18-PLAN.md). Signer detail: incorrect updater private key password: Wrong password for that key
       Error incorrect updater private key password: Wrong password for that key
 ELIFECYCLE  Command failed with exit code 1.
EXIT=1
```

**In production**, `GAMELIB_UPDATER_CONF` is left unset -- the tool defaults to `src-tauri/tauri.conf.json`. It is only ever set in the demo above and in `meta/__tests__/updaterSigningKey.test.ts` to point at a fixture instead of the real committed pubkey. Both demo fixtures (`demokey`, `demokey.pub`, `democonf.json`) were generated in a scratch temp directory and deleted immediately after recording the output above -- no key material was written anywhere inside the repo.

## Files Created/Modified

- `meta/updaterSigningKey.ts` (created) -- `resolveTauriCli()` (require.resolve + process.execPath, GAP-2 pattern), `keyIdFromMinisignFile()` (base64-decode-twice, `subarray(2,10)` -> 16 hex chars), `readCommittedPubkey()`, `verifyUpdaterSigningKeypair()` (discriminated result, never throws for an expected failure, probe file + `.sig` removed in a `finally`).
- `meta/verifyUpdaterSigningKey.ts` (created) -- thin CLI entry; one `::error::` line per failure kind naming the concrete remedy; on success, one clearly-labeled INFORMATIONAL line naming the matched key id (explicitly noting it is the raw byte-order form, not the pubkey comment's byte-reversed rendering).
- `meta/__tests__/updaterSigningKey.test.ts` (created) -- real keypairs A (`pw-alpha`) and B (`pw-beta`) generated via the real Tauri CLI in `beforeAll`; matched/wrong-password/wrong-key(pubkey-mismatch)/missing-key/bad-pubkey/key-id-invariant unit tests, plus an end-to-end `pnpm verify:updater-key` subprocess spawn proving both the wrong-password (non-zero exit, `::error::` line) and matched (exit 0) cases against the real packaged script -- guarded with `describeOnPosix` (Windows Git Bash pipe semantics for `esbuild ... | node` are unproven).
- `package.json` -- added `verify:updater-key` script, following the existing meta-script convention exactly (`esbuild --bundle --platform=node --target=node22 meta/verifyUpdaterSigningKey.ts | node`, matching `build:sidecar-sea`'s `target=node22`).
- `.github/workflows/release-tauri.yml` -- inserted `Verify the updater signing key and password actually decode` (`shell: bash`, `run: pnpm verify:updater-key`) immediately after `uses: ./.github/actions/install-deps` and before the CrossOver-index fetch step; no `env:` block needed (`TAURI_SIGNING_PRIVATE_KEY`/`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are already job-level env, untouched by this plan). Runs on all four matrix legs deliberately.
- `src/backend/__tests__/releaseWorkflow.test.ts` -- extended the existing `describe('release-tauri.yml updater signing key preflight (WR-03 regression guard)')` block with 3 GAP-B tests: the step exists, its index is provably greater than `install-deps` and less than each of `electron-vite build` / `build:sidecar-sea` / `tauri-action`, and `package.json` really defines the `verify:updater-key` script it invokes.

## Verification

- `pnpm exec jest --selectProjects Meta --testPathPattern updaterSigningKey` -- 8/8 green (6 unit tests + 2 end-to-end subprocess tests).
- `pnpm exec jest --selectProjects Backend --testPathPattern releaseWorkflow` -- 76/76 green (73 pre-existing, including all of 34-16's Apple gate suite, + 3 new GAP-B tests).
- Cross-plan regression sweep `tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched|updaterSigningKey` -- 192/192 green.
- `pnpm exec tsc --noEmit` -- clean.
- `pnpm exec eslint` on all changed TypeScript files -- clean (the `.yml` file only produced the expected "no matching configuration" informational warning, not an error).
- Manual sanity (no repo secrets used): verbatim invocation/output for both the matched and wrong-password cases recorded above.

## Decisions Made

See `key-decisions` in frontmatter above.

## Deviations from Plan

None -- plan executed exactly as written. Both tasks matched the plan's `<action>`/`<behavior>` specs precisely, including the exact discriminated result shape, the exact CLI-spawn pattern (mirroring `resolveEsbuildCli()`), the exact package.json script form, and the exact workflow step placement/name.

## Issues Encountered

None. The MECHANISM facts in the plan's `<interfaces>` block (minisign file layout, key-id byte offsets, `Wrong password for that key` stderr string, `--ci` generate flags) were independently re-verified empirically before writing any code (real keypair generated, real probe signed, decoded key ids compared byte-for-byte) and matched the plan exactly.

## User Setup Required

None. This plan enrolls no secrets -- it only adds a preflight check that exercises whatever secrets are (or are not) already enrolled. The human half of GAP-B (re-enrolling a matched key/password pair) is plan 34-18, which hands the developer the exact `pnpm verify:updater-key` command and both outputs recorded above.

## Next Phase Readiness

GAP-B's code half is closed and test-proven. Plan 34-18 (this gap cycle's remaining plan) can proceed -- it depends on exactly the tool this plan built (`pnpm verify:updater-key`, runnable identically locally and in CI) to let a human validate a candidate secret pair before re-enrolling it.

This plan's `files_modified` overlaps with 34-16's only at `.github/workflows/release-tauri.yml` and `src/backend/__tests__/releaseWorkflow.test.ts` -- both plans' diffs are additive and non-conflicting (34-16 touched the job-level `env:` block and the Apple gate step; this plan touched only the step list between `install-deps` and the CrossOver-index fetch, and a separate `describe` block in the test file).

This fix, together with the rest of gap cycle 3 (34-16, 34-18), removes another concrete blocker on 34-07's deferred live `v*` tag-push gate. The live gate itself has not been re-run as part of this plan -- REQ-34-09 remains unchecked pending that live proof, though this plan is itself listed against REQ-34-09 for the code-side mitigation it provides.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: meta/updaterSigningKey.ts
- FOUND: meta/verifyUpdaterSigningKey.ts
- FOUND: meta/__tests__/updaterSigningKey.test.ts
- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-17-SUMMARY.md
- FOUND: e2653759 (Task 1 commit)
- FOUND: c5722ed8 (Task 2 commit)
