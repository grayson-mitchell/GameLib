---
phase: quick-260901-kl2
plan: 01
subsystem: build
tags: [zig, lld, tauri, macos, reproducible-builds, steam-bridge, gate-defect]

requires:
  - phase: quick-260901-i8i
    provides: "x64/darwin removal — the arm64/darwin tree this plan targets"
provides: []
affects: [".planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md item 6"]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md

key-decisions:
  - "r4's byte-identity proof strategy (P1 structural / P2 same-build hash / P3 never rebuild / P4 masked comparison) is sound and unaffected by this halt."
  - "Completed Task 1 Step 0 (pinned pre-change script two ways) and Step 1 (rm'd the two byproducts from the real tree without rebuilding; DLL verified unchanged; dev census matches the plan's expected 277/12/97,884,865) before halting."
  - "Halted at Step 2/3, before any code or test was written, on a FOURTH gate defect: Task 1's own embedded ordering-guard verify script cannot pass against the implementation Step 3 itself mandates, because the exported pruneShimBuildByproducts must take an arch parameter (required by B7) but the script's definition-locator regex assumes literally-empty parens."
  - "No workaround applied, per the executor brief's explicit instruction to stop and report on a fourth vacuous/false gate rather than patch around it."

requirements-completed: []

duration: ~20min
completed: 2026-09-01
status: incomplete
---

# Quick Task 260901-kl2: Drop steam_api.pdb / steam_api_shim.lib Summary

**Second execution attempt. Task 1 Step 0 and Step 1 completed cleanly (script
pinned, byproducts removed from the real tree without rebuilding, DLL verified
unchanged, dev census matches expected 277/12/97,884,865). Halted before Step 2/3 —
found a fourth gate defect in Task 1's own embedded verify script: it false-REDs the
implementation Step 3 itself instructs writing. No code or test file was touched, no
commit was made.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-01
- **Tasks:** 0/3 completed (Task 1 halted mid-way, at Step 2/3; Tasks 2–3 never started, both depend on Task 1)
- **Files modified:** 0 tracked/git files (two gitignored byproduct files removed from `public/bin/arm64/darwin/`; one planning doc updated)

## What happened

This is the second execution attempt on this quick task. The first attempt (r1/r2 of
the plan) halted at Task 1 Step 1 because the plan's original acceptance bar — "a
same-path rebuild reproduces `steam_api.dll` byte-for-byte" — did not hold (`zig
cc`'s `lld` backend stamps wall-clock time into the PE header). That premise was
retracted and replaced in plan revisions r3/r4 with a four-part proof (P1 structural,
P2 same-build hash either side of the prune, P3 never rebuild the real tree, P4
masked comparison) that does not depend on rebuild determinism. That fix is sound and
was not the issue this session.

This session followed r4's Task 1 exactly:

- **Step 0 (done):** pinned the pre-change script two ways — copied
  `meta/buildSteamBridgeShims.ts` to `<scratchpad>/prechange/` and recorded
  `git rev-parse HEAD` = `19f56777d2b60e9d145da700f27ae3372d646424`. Verified the
  saved copy does NOT already contain `pruneShimBuildByproducts` (the negative
  assertion the plan requires, guarding against a repeat of r4's own headline fix —
  E1 consuming an already-pruned script).
- **Step 1 (done):** plain `rm` of `public/bin/arm64/darwin/steam_api.pdb` and
  `steam_api_shim.lib` — no rebuild of the real tree. `steam_api.dll` verified
  unchanged at sha256 `2da072ba…`, 805,888 B. Dev tree census after removal: 277
  files / 12 symlinks / 97,884,865 B, matching the plan's expected numbers exactly.
  `steam-bridge-helper` and `steam_appid.txt` both survive. `build/bin/arm64/darwin`
  was left untouched (its mirror-prune is Task 2's job via `vite build`).

**Before writing Step 2's RED tests**, Task 1's second `<verify><automated>` block
(the Python ordering-guard script) was dry-run against the exact implementation Step
3 instructs writing, per the standing lesson on this item ("every prior defect here
was found by RUNNING a gate, never by reading it" — and the brief's explicit
instruction to assume a fourth exists). It failed on the correct implementation:

- B7 requires calling the exported prune helper with an explicit arch argument:
  `pruneShimBuildByproducts('arm64')`.
- Step 3 explicitly mandates the matching signature:
  `pruneShimBuildByproducts(arch: string = resolveBridgeArch()): void`.
- Task 1's verify script locates the definition with
  `re.search(r'function pruneShimBuildByproducts\(\)', stripped)` — literal,
  immediately-adjacent empty parens. A parameterized signature never contains that
  substring (its parens are never empty), so the script reports
  `'FAIL: pruneShimBuildByproducts() is not defined in the comment-stripped source'`
  on a correct, plan-mandated implementation.

Reproduced empirically (not just reasoned about): inserted the exact Step-3-mandated
signature and call site into a copy of the real source and ran the plan's own verify
script verbatim against it. `defn` returned `None`; the CALL site was located
correctly and its position was correctly after the gate; both `COMPILE GATE FAILED`
throws were intact. Only the definition-locator regex is wrong — it was written
against B4's illustrative, parameterless prose example rather than against the
parameterized signature Step 3 actually mandates. Full transcript and byte offsets in
`260901-kl2-MEASUREMENTS.md`.

This is the same class of defect as r2's B-1 fix (a false RED on correct code) and
the executor brief's already-catalogued failure #2 — found here a fourth time on this
item, in the definition half of the same check rather than the call half this time.

**No workaround was applied.** Per the executor brief's explicit instruction ("If you
find a fourth vacuous gate, STOP and report rather than working around it"), this
halts the plan here rather than being patched inline — e.g. loosening the regex
myself, or writing `pruneShimBuildByproducts` without a parameter and threading arch
through some other mechanism purely to dodge the string match. Either would be
shaping the implementation around a broken gate instead of fixing the gate, and the
fix is to the plan's own verification script, not to application code — outside an
autonomous inline fix's remit here.

## Repo state at halt

- `public/bin/arm64/darwin/steam_api.dll` — unchanged, sha `2da072ba…`, 805,888 B.
- `public/bin/arm64/darwin/steam_api.pdb`, `steam_api_shim.lib` — REMOVED (Step 1,
  intentional, matches the plan's target end-state; both gitignored/untracked, so
  `git status --short` shows no tracked-file change from this).
- `public/bin/arm64/darwin` census: 277 files / 12 symlinks / 97,884,865 B.
- `build/bin/arm64/darwin` — untouched (279 / 12 / 100,707,073, DLL sha `2da072ba…`);
  Task 2's job to mirror-prune, not reached.
- `meta/buildSteamBridgeShims.ts`, `meta/__tests__/buildSteamBridgeShims.test.ts` —
  byte-identical to `HEAD`. No test added. No code changed.
- No task commit was made this session. This docs-only commit (MEASUREMENTS +
  SUMMARY) is the only commit from this session.

## Files Created/Modified

- `.planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md` — updated. Adds an r4-attempt section (Step 0/Step 1 evidence, the flag-experiment table, the determinism retraction summary, and the fourth-gate reproduction with full transcript) above the preserved r1/r2 historical record, which is kept verbatim and marked superseded.
- `public/bin/arm64/darwin/steam_api.pdb`, `public/bin/arm64/darwin/steam_api_shim.lib` — removed (gitignored, not tracked; matches the plan's Step 1 and the todo item's target end-state).

## Deviations from Plan

None in the Rule 1-3 sense (nothing was auto-fixed). The plan's own Task 1 verify
script was found to false-RED the implementation the plan itself mandates; per
explicit executor-brief instruction for this class of finding, execution halted
rather than auto-patching the gate.

## What remains for a human/planner decision

The application-code plan (Approach A, post-build unlink; P1–P4 proof strategy) is
unaffected and does not need to change. What needs a decision is Task 1's own
embedded ordering-guard verify script. A sketch of the fix (not applied — a plan/gate
edit, not code):

- Widen the `defn` regex the same way `call`'s regex already tolerates the file's
  define-before-use convention and parameters — e.g.
  `re.search(r'function pruneShimBuildByproducts\(', stripped)` (open paren only,
  not `\(\)`), distinguishing definition from call the same way `call` already does
  rather than requiring literally-empty parens.

Once that regex is corrected, Task 1 Step 0 and Step 1 do not need to be redone —
the pinned pre-change script/SHA and the removed byproducts are both still valid and
recorded in `260901-kl2-MEASUREMENTS.md`.

## Self-Check

- `.planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md` — FOUND (updated this session, verified present with both new and historical sections).
- `public/bin/arm64/darwin/steam_api.dll` sha256 == `2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960` — FOUND (verified by `shasum`).
- `public/bin/arm64/darwin/steam_api.pdb`, `steam_api_shim.lib` — both ABSENT (verified by `ls`/`test`).
- `public/bin/arm64/darwin` census 277/12/97,884,865 — FOUND (verified by `find`/`stat`).
- `meta/buildSteamBridgeShims.ts` and its test file unchanged from `HEAD` — FOUND (verified by `git status --short`, `git diff`).

## Self-Check: PASSED
