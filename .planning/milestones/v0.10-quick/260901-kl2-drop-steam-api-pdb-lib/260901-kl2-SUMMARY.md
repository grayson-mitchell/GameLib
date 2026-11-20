---
phase: quick-260901-kl2
plan: 01
subsystem: build
tags: [zig, lld, tauri, macos, reproducible-builds, steam-bridge, gate-defect, mutation-testing]

requires:
  - phase: quick-260901-i8i
    provides: "x64/darwin removal — the arm64/darwin tree this plan targets"
provides: ["item 6 closed — the 2026-08-28 bundle-size todo, all six items done"]
affects: [".planning/todos/completed/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md"]

tech-stack:
  added: []
  patterns:
    - "seeded-mutation testing to prove call-site ORDERING behaviourally, replacing a fragile source-text regex gate"
    - "PE32 volatile-span masking (maskPeVolatile.py) to compare cross-invocation zig cc/lld output modulo wall-clock stamps"

key-files:
  created: []
  modified:
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - public/bin/.gitignore
    - .planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md
    - .planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md (moved to completed/)
    - .planning/quick/260901-i8i-drop-x64-darwin-intel-tree/260901-i8i-MEASUREMENTS.md
    - .planning/quick/260901-i8i-drop-x64-darwin-intel-tree/260901-i8i-BASELINE.md
    - .planning/quick/260901-e7o-restore-runner-symlinks-in-tauri-bundle/260901-e7o-MEASUREMENTS.md
    - .planning/quick/260901-e7o-restore-runner-symlinks-in-tauri-bundle/260901-e7o-SUMMARY.md
  created-untracked:
    - .planning/quick/260901-kl2-drop-steam-api-pdb-lib/maskPeVolatile.py

key-decisions:
  - "Approach A (post-compile-gate unlink) shipped, not a zig cc flag: measurement refuted every candidate flag — none suppresses both byproducts without perturbing the DLL bytes (-Wl,-s alone rewrites 455,308 bytes)."
  - "r1's rebuild byte-identity premise was retracted (zig cc's lld backend stamps wall-clock TimeDateStamp on every invocation) and replaced with a four-part proof: P1 structural, P2 same-build hash (unit B7 + end-to-end E1), P3 never rebuild the real tree, P4 masked comparison (maskPeVolatile.py)."
  - "r5 deleted the source-text ordering-guard regex (and its unit-test twin B4) rather than patching it a second time, after it produced a fourth false-RED on the plan's own mandated parameterized signature. Replaced with seeded M1/M2/M3 mutation testing that proves ordering behaviourally and is empirically equal-or-better coverage."
  - "Four gate defects were found and corrected across this item's full history (r1/r2, r4, and two prior sessions) before this session's clean r5 resume — documented per the standing 'stop and report, do not work around' instruction. No fifth defect was found this session; all of Task 1 and Task 2's gates matched their predicted behavior exactly."

requirements-completed: [TODO-2026-08-28-ITEM-6]

duration: ~2h across two sessions (r4 halt + r5 resume/completion)
completed: 2026-09-01
status: complete
---

# Quick Task 260901-kl2: Drop steam_api.pdb / steam_api_shim.lib Summary

**Stopped shipping the two Windows linker byproducts (`steam_api.pdb`, `steam_api_shim.lib`,
2,822,208 B combined) that `zig cc -target x86-windows-gnu -shared` drops next to
`steam_api.dll` in `public/bin/${arch}/darwin/`, via a post-compile-gate unlink proven unable
to alter the DLL four independent ways and proven unable to weaken the compile gate by seeded
mutation. This is item 6 — the last open item — of the 2026-08-28 bundle-size todo, now closed
and moved to `.planning/todos/completed/`.**

## Performance

- **Duration:** ~2h across two sessions (this session resumed cleanly at r5 after a prior
  session halted at a fourth gate defect)
- **Completed:** 2026-09-01
- **Tasks:** 3/3 completed
- **Commits this session:** `d9aa7c5ee` (Task 1), `9c36e0fda` (Task 2), `4fc65603e` (Task 3)

## What happened

This item went through five plan revisions and four halted-and-corrected gate defects before
landing cleanly. Two prior sessions are summarized here for the record; this session executed
Task 1 Steps 2-5 through Task 3 without incident.

**r1/r2 (first session, historical):** Halted at Task 1 Step 1. The original acceptance bar —
"a same-path rebuild reproduces `steam_api.dll` byte-for-byte" — did not hold. `zig cc`'s `lld`
backend stamps a wall-clock `TimeDateStamp` into the PE header on every invocation; three
consecutive scratch builds produced three different hashes. Retracted and replaced (r3/r4) with
a four-part proof (P1 structural / P2 same-build hash / P3 never rebuild the real tree / P4
masked comparison) that does not depend on rebuild determinism.

**r4 (second session, historical):** Completed Task 1 Step 0 (pinned the pre-change script two
ways) and Step 1 (removed the two byproducts from the real tree without rebuilding; DLL verified
unchanged). Halted before Step 2/3 on a **fourth** gate defect: Task 1's own embedded
ordering-guard verify script located `pruneShimBuildByproducts()`'s definition with a regex
assuming literally-empty parens (`\(\)`), which false-REDs against the parameterized signature
(`pruneShimBuildByproducts(arch: string = resolveBridgeArch())`) that Step 3 itself mandates
(required for unit test B7). No workaround was applied, per the standing "stop and report a
fourth defect rather than patch around it" instruction.

**r5 (plan revision, applied this session):** The coordinator confirmed the fourth-defect
finding and revised the plan: the ordering-guard regex and its unit-test twin B4 were **deleted
outright**, not patched a second time — a gate that has twice convicted correct code trains an
executor to reshape working code to satisfy it. In its place, Task 2's M1/M2/M3 mutation harness
was redesigned to prove call-site ordering **behaviourally**: seed the output directory with
stale sentinel byproducts before each mutation run, then assert survival (correct ordering) or
deletion (misordering, caught) — verified during planning against all three possible prune
positions to be equal-or-better coverage than the deleted regex.

**This session, resuming at r5 Task 1 Step 2:**

- **Task 1 (commit `d9aa7c5ee`):** RED tests written for `SHIM_BUILD_BYPRODUCTS`,
  `shimByproductPaths()`, `pruneShimBuildByproducts()` (B1-B3, B5, B6, B7 — B4 intentionally
  omitted per r5). GREEN implementation: `pruneShimBuildByproducts()` called in
  `compileShim()` immediately after the `Compile gate PASSED` log line, strictly after both
  `COMPILE GATE FAILED` throws. `public/bin/.gitignore` annotated (rules kept as
  belt-and-braces, not removed). 26/26 tests pass. Task 1's automated verify (now a single
  block, the ordering-guard script removed) passes: `TASK1-PASS`.
- **Task 2 (commit `9c36e0fda`):** Seeded-mutation proof on scratch copies only (never the
  real tree). M1 (zig exits non-zero via a hard C syntax error) and M2 (zig exits 0 but no
  `.dll`, via a conditional `spawnArgv` stub that does not interfere with the real helper
  compile) both leave seeded byproducts intact at the correct prune position. M3 mutated the
  prune's call-site position twice (before throw A, between throw A and B) and reproduced the
  plan's predicted three-position coverage matrix exactly — every misordering caught by at
  least one mutation. E1 proved P2 end-to-end: hashing a real compiled DLL before and after a
  prune-only invocation (no recompile in between, `JEST_WORKER_ID=1` used to suppress the
  module's own auto-`main()` side effect) gave `S1 === S2`, with both byproducts gone after.
  P4's masked comparison (`maskPeVolatile.py`) matched the real shipped baseline exactly at
  `cc3e8b4a1fba55b9ab9cb69927b9c76d`. Real-repo mirror re-certification: `pnpm
  check:build-bin-mirror` failed pre-`vite build` (both byproducts named as stale in
  `build/bin`) and passed post-build with delta=0; both trees census 277/12/97,884,865. Meta
  and backend jest suites green apart from 3 known `decompressPool.test.ts` failures and 2
  known `lzmaNativeSeaRealBuild.test.ts` skips (one transient `enrichmentFlows.test.ts` flake
  did not reproduce on rerun).
- **Task 3 (commit `4fc65603e`):** Built a real release DMG (`vite build` -> `build:sidecar-sea`
  -> `tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'`, 0 codesigning
  identities on this machine, unsigned/ad-hoc as expected), mounted read-only. C1-C6 all
  matched prediction exactly with no residual: `steam_api.pdb`/`steam_api_shim.lib` absent;
  `steam_api.dll` present, unchanged, sha256 `2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960`
  (805,888 B); `steam-bridge-helper`/`steam_appid.txt` present; `verify:runner-bundle
  --expect-files=277 --expect-symlinks=12 --expect-bytes=97884865` exited 0, 0 dangling
  symlinks (verified manually — the tool prints no explicit `DANGLING=` line); `x64/win32`
  survivor intact at 2 files/211,452 B, `x64/darwin` still absent; `.app` total = **287,130,374
  B**, exactly `289,952,582 - 2,822,208`. Detached clean. Closed all four documentation
  sub-steps: appended the packaged census to `260901-kl2-MEASUREMENTS.md`; marked the todo's
  item 6 DONE with real numbers, corrected the refuted "compile-flag change" mechanism claim
  and the r1 determinism premise via dated annotation (originals kept verbatim), kept the
  historical title unchanged, `git mv`'d the todo to `.planning/todos/completed/`; annotated
  (never rewrote) the superseded 279/12/100,707,073 figures in three prior quick-tasks'
  measurement docs and the specific refuted-mechanism line at `260901-e7o-SUMMARY.md:118`.

## Files Created/Modified

- `meta/buildSteamBridgeShims.ts` — added `SHIM_BUILD_BYPRODUCTS`, `shimByproductPaths()`,
  `pruneShimBuildByproducts()`; wired into `compileShim()` strictly after both compile-gate
  throws.
- `meta/__tests__/buildSteamBridgeShims.test.ts` — 6 new tests (B1, B2, B3, B5, B6, B7; B4
  intentionally omitted per r5), 26/26 total passing.
- `public/bin/.gitignore` — dated comment explaining the ignore rules are now belt-and-braces
  only, since the byproducts are actively unlinked at build time.
- `.planning/quick/260901-kl2-drop-steam-api-pdb-lib/maskPeVolatile.py` — validated tool
  (previously untracked scratch artifact), now committed alongside Task 2.
- `.planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md` — full
  before/after census, flag-experiment table, determinism retraction, seeded-mutation results,
  E1/P4 proofs, mirror re-certification, and the packaged DMG census.
- The 2026-08-28 bundle-size todo — DONE note, two dated mechanism-refutation annotations,
  moved `.planning/todos/pending/` -> `.planning/todos/completed/`.
- Three prior quick-tasks' measurement docs — dated supersession annotations, originals intact.

## Deviations from Plan

None in the Rule 1-3 sense. No fifth gate defect was found this session — every automated
verify block in Task 1, Task 2, and Task 3 behaved exactly as the r5 plan predicted, including
the M3 three-position coverage matrix reproducing cell-for-cell and Task 3's C6 landing on the
predicted `.app` size with zero residual to explain.

## Known Stubs

None.

## Threat Flags

None. All threats identified in the plan's `<threat_model>` (T-kl2-01 through T-kl2-05) were
mitigated exactly as specified; no new security-relevant surface was introduced.

## Self-Check

- `meta/buildSteamBridgeShims.ts` contains `pruneShimBuildByproducts` — FOUND.
- `public/bin/arm64/darwin/steam_api.dll` sha256 ==
  `2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960` — FOUND (verified on the
  real tree and again on the mounted packaged DMG).
- `public/bin/arm64/darwin/steam_api.pdb`, `steam_api_shim.lib` — both ABSENT on the real tree,
  `build/bin/arm64/darwin`, and the mounted `.app`.
- `.planning/todos/completed/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md`
  — FOUND; `.planning/todos/pending/` no longer contains it.
- Commits `d9aa7c5ee`, `9c36e0fda`, `4fc65603e` — all FOUND in `git log --oneline`.

## Self-Check: PASSED
