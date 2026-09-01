---
phase: quick-260901-kl2
plan: 01
subsystem: build
tags: [zig, lld, tauri, macos, reproducible-builds, steam-bridge]

requires:
  - phase: quick-260901-i8i
    provides: "x64/darwin removal — the arm64/darwin tree this plan targets"
provides: []
affects: [".planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md item 6"]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md
  modified: []

key-decisions:
  - "Halted at Task 1 Step 1 per the plan's own explicit stop condition — the byte-identity premise the whole plan depends on did not hold on re-measurement."
  - "Diagnosed root cause (COFF TimeDateStamp + a second non-deterministic debug-directory field in zig cc -shared's lld backend) as a diagnostic-only exercise in scratch/tmp; no fix applied, no code changed."
  - "steam_api.dll restored byte-for-byte from the scratchpad backup before returning; repo tracked-file state is unchanged."

requirements-completed: []

duration: ~25min
completed: 2026-09-01
status: incomplete
---

# Quick Task 260901-kl2: Drop steam_api.pdb / steam_api_shim.lib Summary

**Blocked at Task 1 Step 1 — the plan's own reproducibility premise ("a same-path
`pnpm build-steam-bridge` rebuild reproduces `steam_api.dll` byte-for-byte") failed
on re-measurement; execution stopped exactly as the plan instructed, no code was
changed, and the repo was restored to its pre-existing state.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-01
- **Tasks:** 0/3 completed (Task 1 halted at its first step; Tasks 2–3 never started, both depend on Task 1)
- **Files modified:** 0 (repo tracked-file state unchanged; one new planning doc created)

## What happened

Task 1, Step 1 of the plan requires: run `pnpm build-steam-bridge` on the
unmodified tree, then `shasum -a 256 public/bin/arm64/darwin/steam_api.dll`, and
compare against the plan's recorded baseline
`2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960`. The plan is
explicit: **if the sha does not match, STOP — do not proceed to Step 2, do not
"fix" it, restore the DLL from the scratchpad backup, state the two hashes, and
return.**

That is exactly what happened. The rebuild produced `dea40a6f77a3a11f…`, not
`2da072ba8fc455e9…`. To characterize whether this was a fluke, four more rebuilds
were run at the identical output path with zero code changes — **every single one
produced a different sha256** (all still 805,888 B; only a handful of bytes
differ each time). This directly contradicts the plan's `<measured_facts>` claim
that "two consecutive compiles with identical argv into the identical output path
produced byte-identical `.dll` AND byte-identical `.pdb`."

Root-caused (diagnostic only, entirely in `/tmp` — never touching the repo): the
two volatile byte ranges are (1) the PE COFF header's `TimeDateStamp` field, which
`zig cc -shared`'s `lld` backend stamps with the current wall-clock second on every
invocation, and (2) an 8-byte span inside the debug directory (RSDS/PDB GUID
region) that remains non-deterministic even with `SOURCE_DATE_EPOCH` pinned (tested
in `/tmp/sde_test1` / `/tmp/sde_test2`). Full derivation, byte offsets, and hex
dumps are in `260901-kl2-MEASUREMENTS.md`.

**Consequence:** the plan's core safety argument — "prove the byproduct removal is
inert by diffing a same-path rebuild's sha before and after the code change" —
cannot be executed as written, because the "before" half of that comparison is
itself not stable. This is a property of the pinned zig 0.16.0 / lld toolchain
invocation, not something introduced by anything in this plan or session, and not
something an autonomous executor should paper over (per Rule 4 — this changes the
plan's core safety argument, so it needs a developer decision, not an inline fix).

## Repo state

`public/bin/arm64/darwin/steam_api.dll` was restored from the scratchpad backup
(`/private/tmp/claude-501/.../scratchpad/steam_api.dll.baseline`) and verified
byte-identical to the pre-existing baseline (`2da072ba…`, 805,888 B). No git-tracked
file was modified — `public/bin/**` is fully gitignored, `git status --short`
shows no change to any tracked path. No test files were added. No task commit was
made.

## Files Created/Modified

- `.planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md` — created. Records the baseline, all five rebuild attempts and their shas, the byte-level diff, the `TimeDateStamp` decode proving wall-clock non-determinism, and the `SOURCE_DATE_EPOCH` experiment showing it only partially fixes the problem.
- `public/bin/arm64/darwin/steam_api.dll` — touched then restored to its exact pre-existing bytes; net change is none (gitignored, not tracked).

## Deviations from Plan

None in the Rule 1-3 sense (nothing was auto-fixed) — the plan's own Step 1 stop
condition fired and was followed exactly as written. No deviation was taken from
the plan's instructions; the plan itself, when executed, halted execution.

## What remains for a human decision (Rule 4 — architectural)

The plan's Approach (A) (post-build unlink of the two byproducts) is still very
likely the right *code* change — nothing about the reproducibility finding argues
against it. What's blocked is the plan's chosen **proof method**. Before this plan
can proceed, a developer needs to pick one of:

1. Redefine "byte-identical" for the safety gate to exclude the two known-volatile
   ranges (COFF `TimeDateStamp` at file offset ~128, and the ~8-byte debug-directory
   span near offset 729121) rather than requiring whole-file sha equality — i.e.
   diff everything except those bytes.
2. Investigate whether `zig cc -shared` / `lld` exposes a flag that pins both
   volatile ranges (not investigated beyond `SOURCE_DATE_EPOCH`, which only fixed
   one of the two).
3. Skip the same-path-rebuild comparison entirely: unlink the byproducts from the
   already-committed... no — `public/bin/**` is gitignored, there is no committed
   `steam_api.dll` to fall back to; this option does not apply here as it would to
   a tracked file. (Included for completeness / to rule it out — do not pursue.)
4. Accept run-to-run non-determinism as expected and gate on a weaker but still
   meaningful property (e.g. "same size, same section table, same import/export
   directory content" via a PE-aware diff) instead of whole-file sha.

None of these were selected here — they all change what the plan's Task 1 Step 1
gate actually proves, which the plan's own text reserves for a "re-deciding the
approach... with the developer" step, not an autonomous continuation.

## Self-Check

- `.planning/quick/260901-kl2-drop-steam-api-pdb-lib/260901-kl2-MEASUREMENTS.md` — FOUND (created this session, verified present).
- `public/bin/arm64/darwin/steam_api.dll` sha256 == `2da072ba8fc455e9afc3dcce73ac631d0075f35deb3f19cd34b521c725f1d960` — FOUND (verified by `shasum` after restore).
- `git status --short` shows no tracked-file changes from this session — FOUND (verified).
- No commit was created this session (`git log` unchanged from session start) — FOUND (verified: HEAD is still `5eb38d2ca`).

## Self-Check: PASSED
