---
phase: quick-260930-vrb
plan: 01
subsystem: steam-bridge
tags: [tests, mutation-proven, phase-24, shim, gen_vtables]
requires: []
provides:
  - 24-CR-02 pin (SHIM_EXPORTED_SYMBOLS set-equals committed steam_api.def, both directions)
  - 24-CR-01 pin (isStringReturn, STRING_RETURN_BUF_BYTES, GetPersonaName shim-owned buffer)
affects:
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - meta/__tests__/gen_vtables.test.ts
  moved:
    - .planning/todos/pending/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md -> .planning/todos/completed/
decisions:
  - 'Anchor the CR-02 parity test on the COMMITTED steam_api.def (what buildShimCompileArgv compiles), read and parsed from disk, no import from meta/'
  - 'Pin STRING_RETURN_BUF_BYTES as a floor (>= 128), not the exact 256'
status: complete
completed: 2026-10-01
commits: 3
plan_head_before: cf96b930a0e1452b54b8100b3bdfd1dfd50f6af7
plan_head_after: 90aaa5b69058cc744ce440fa6fac0cc344c33f68
actuals:
  tokens: 9000
  tasks: 3
  commits: 3
---

# Phase quick-260930-vrb Plan 01: Pin Phase 24 criticals Summary

Two Phase 24 criticals are now pinned by jest tests, each proven by a mutation run that re-created the defect, observed red, restored the file and observed green: 24-CR-02 (shim/def export parity, both directions) and 24-CR-01 (GetPersonaName string-return uses a shim-owned buffer, pinned separately in generator output and committed `steam_api_shim.c`).

- BASE: `cf96b930a0e1452b54b8100b3bdfd1dfd50f6af7`
- Commits (BASE..HEAD = 3):
  - `a33fbfe3b` test(quick-260930-vrb): pin 24-CR-02 shim export set to steam_api.def in both directions
  - `88f3411ac` test(quick-260930-vrb): pin 24-CR-01 GetPersonaName shim-owned string-return buffer
  - `90aaa5b69` docs(quick-260930-vrb): resolve the phase 24 criticals pin todo and move it to completed
- Green counts on the committed, restored tree: Backend shimGenerate 12 -> 14/14; Meta gen_vtables 23 -> 27/27. Combined family run (`steam/bridge/__tests__` plus gen_vtables and buildSteamBridgeShims): 8 suites, 130 tests, all passed.
- `pnpm -s find-deadcode`: `unreachable: 46 OK | used-in-module: 0 OK` (unchanged; the test counts as a real importer of the new export).
- eslint `--max-warnings 0`, prettier (paths confirmed `ignored: false`, `--check` clean) and `pnpm codecheck` all green for every code path written. `pnpm -s planning-gates`: 12/12.

## Mutation runs

Every arm: mutation applied on the committed tree, numstat proving it applied, jest run (captured outside the checkout, then discarded), restore with `git checkout --`, `git diff --exit-code` on the file exit 0, green re-run. No mutation was committed.

| Arm | Mutation | numstat | jest `Tests:` | Predicted | Red tests and first failure line | Restore and re-run |
|---|---|---|---|---|---|---|
| CR02-a | Deleted the `SteamAPI_SteamUser_v023` and `SteamAPI_SteamFriends_v018` entries from `SHIM_EXPORTED_SYMBOLS` (re-creates 24-CR-02) | `0 2` | `2 failed, 12 passed, 14 total` | same | (1) `24-CR-02: SHIM_EXPORTED_SYMBOLS set-equals the export list of the committed ... steam_api.def, in both directions`: `missingFromShim` expected `[]`, received `["SteamAPI_SteamUser_v023", "SteamAPI_SteamFriends_v018"]`. (2) `24-CR-02: a game importing every symbol steam_api.def exports (including the SteamUser/SteamFriends interface accessors) is placed, not rejected`: received `status: "error"`, `error: "Shim does not export required symbol(s): SteamAPI_SteamUser_v023, SteamAPI_SteamFriends_v018"` instead of `status: "placed"` | exit 0; `14 passed, 14 total` |
| CR02-b | Added `SteamAPI_MutationProbe_NotInDef` (absent from the .def) after `SteamAPI_Init` | `1 0` | `1 failed, 13 passed, 14 total` | same | Parity test only: `notInDef` expected `[]`, received `["SteamAPI_MutationProbe_NotInDef"]` | exit 0; `14 passed, 14 total` |
| CR01-a | `git show 1e744d204 -- meta/gen_vtables.ts \| git apply -R` (generator half of the CR-01 fix reverted) | `1 66` | `3 failed, 24 passed, 27 total` | same | (1) `24-CR-01: isStringReturn routes exactly GetPersonaName across both pinned manifests ...`: `TypeError: undefined is not a function` at `Array.filter` (export gone; ts-jest is transpile-only, as predicted). (2) `24-CR-01: STRING_RETURN_BUF_BYTES leaves headroom over k_cchPersonaNameMax ...`: `Matcher error: received value must be a number or bigint`, `Received has value: undefined`. (3) `24-CR-01 (generateShimC output): GetPersonaName copies the wire bytes ...`: `expect(received).not.toContain(expected)`, `Expected substring: not "retbuf[4]"` (pre-fix body shown). The row `24-CR-01 (committed native/steam-bridge/generated/steam_api_shim.c)` stayed GREEN, which is expected and is the proof the two rows are independent pins | exit 0; `27 passed, 27 total` |
| CR01-b | `git show 1e744d204 -- native/steam-bridge/generated/steam_api_shim.c \| git apply -R` (committed-shim half reverted) | `5 17` | `1 failed, 26 passed, 27 total` | same | Only `24-CR-01 (committed native/steam-bridge/generated/steam_api_shim.c): GetPersonaName copies the wire bytes ...`: `expect(received).not.toContain(expected)`, `Expected substring: not "retbuf[4]"`. The generator row stayed green | exit 0; `27 passed, 27 total` |

Every count matched the plan's prediction; nothing needed correcting. The CR01-a contingency (arm CR01-a-prime) was not needed because ts-jest ran transpile-only and produced assertion-level red rather than a suite-level type error.

## Deviations from Plan

**1. [Rule 1 - Bug] Escaping slips in my own test code, found before the first commit**
- **Found during:** Task 1 and Task 2, while writing the tests
- **Issue:** My first write of the test files mangled backslash escapes (a `\r?\n` regex became a literal line break, and a C `'\0'` needle lost its second backslash), so prettier failed to parse one file and two assertions failed on the real generator output.
- **Fix:** Rewrote those lines with correct escapes (`/\r?\n/` and `'\\0'` inside TS string literals), re-ran prettier and jest. Only the final, correct versions reached a commit.
- **Commits:** folded into `a33fbfe3b` and `88f3411ac` (nothing broken was committed).

Otherwise the plan executed as written. Notes that are not deviations:
- `npx jest ...` runs a `pnpm install`-style pretest lifecycle on this machine (husky install, download-helper-binaries). It left no tracked change; `git status` stayed clean apart from the untracked quick-task directory.
- The SUMMARY `commits:` is measured as `git rev-list --count cf96b930a..HEAD` = 3, taken from the BASE recorded up front. The per-plan ledger file in protocol 0c was not created, so the base is the BASE recorded in Task 1 Step 0.
- Task 1 is `type="tracer"`; its `<verify>` is fully automated, so the feedback gate was the re-run of that verify (green) before proceeding.

## Honest limits

- (a) The CR-01 pins are structural assertions over C source text. Nothing compiles or runs the shim on this machine; the shim is built with zig on the packaging path.
- (b) `STRING_RETURN_BUF_BYTES` is pinned as a floor of at least 128, not as the exact 256.
- (c) The byte identity between generator output and the committed `.def`/`.c` is still pinned by NO test. It was measured identical at HEAD `cf96b930a` during planning. Regenerating without committing, or committing without regenerating, remains invisible to jest. That seam was outside this todo's scope and is named here, not fixed.

## Known Stubs

None.

## Threat Flags

None. No new network, auth, file-access or schema surface; `export` on `SHIM_EXPORTED_SYMBOLS` keeps its `ReadonlySet<string>` type and its only importer is the test (T-260930-vrb-04, accepted).

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts`, `meta/__tests__/gen_vtables.test.ts`, `.planning/todos/completed/2026-09-29-phase-24-criticals-correct-at-head-but-pinned-by-no-test.md`; the pending copy is gone.
- FOUND commits `a33fbfe3b`, `88f3411ac`, `90aaa5b69`.
- `git diff --quiet cf96b930a HEAD -- meta/gen_vtables.ts native/steam-bridge/generated/` exits 0; `git status --porcelain -- src meta native` is empty.
- The todo rename commit is insertion-only (numstat `39 0`, status `R057`).
