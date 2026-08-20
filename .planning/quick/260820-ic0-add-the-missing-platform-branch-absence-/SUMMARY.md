---
task: quick-260820-ic0
title: Add the missing platform-branch absence gate (T-34.5-17, T-34.5-32)
requirements: [QUICK-260820-IC0, T-34.5-17, T-34.5-32]
files_modified:
  - src/backend/sidecar/__tests__/wineToolsFlows.test.ts
  - .planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md
completed: 2026-08-20
---

# Quick 260820-ic0: Add the missing platform-branch absence gate Summary

Built the CI control that `34.5-SECURITY.md` root cause **R2** (`T-34.5-17` plan 34.5-05,
`T-34.5-32` plan 34.5-09) declared but never implemented -- an assertion that
`src/backend/sidecar/wineToolsFlowRegistration.ts` contains no live `process.platform`, `isMac`,
or `isLinux` branch outside comments. The invariant was already true; only the assertion was
missing. Nothing about the guarded module changed.

## What was built

New Describe 6 in `src/backend/sidecar/__tests__/wineToolsFlows.test.ts`:
`"T-34.5-17 / T-34.5-32 (plans 34.5-05 / 34.5-09, root cause R2) -- platform-branch absence gate
over wineToolsFlowRegistration.ts"`, containing:

- A shared `PLATFORM_PATTERNS` table (`process\.platform`, `\bisMac\b`, `\bisLinux\b`) and a
  single `platformTokenHits(sourceText): string[]` helper. Every assertion in the block --
  live invariant, filled-specimen control, RED-proof, false-positive control -- routes through
  this one helper; no assertion restates a regex literal inline.
- The live invariant test.
- A filled-specimen / stripper-integrity control.
- The RED-proof test (three insertion-derived specimens).
- A false-positive control (`it.each` over five real lookalike identifiers).

## Test names added (5 new tests, all in Describe 6)

1. `T-34.5-17 / T-34.5-32 comment-stripped wineToolsFlowRegistration.ts contains zero process.platform, isMac, isLinux hits`
2. `filled-specimen control: the RAW (unstripped) source contains all three tokens, proving the gate above is stripper-dependent, not vacuous`
3. `RED-proof: the platform-token gate trips against a specimen derived by inserting the forbidden branch into the real wineToolsFlowRegistration.ts source`
4. `false-positive control: %s does not trip the gate` (`it.each` -- 5 cases: `isMacNative`, `isMacOSUpToDate`, `isLinuxNative`, `isLinuxFamily`, `effectiveIsMacNative`)

**Test count for `wineToolsFlows.test.ts`:** 15 tests before -> 23 tests after (8 new: the 4 named
above, with the `it.each` false-positive control expanding to 5 individual test cases). All 23
pass; Describes 1-5 unchanged and still green.

## RED-proof outcome (verbatim, actual observed output)

Computed directly against the real `wineToolsFlowRegistration.ts` source using the same
`stripSourceComments` + `platformTokenHits()` logic the test uses (script run standalone to
capture output outside jest's assertion machinery, for reporting purposes):

```
INVARIANT (stripped, live): []
FILLED-SPECIMEN (raw):      ["process.platform","isMac","isLinux"]
RED-PROOF specimen [if (isMac) { return true }] -> hits=["isMac"] (expected [isMac])
  If this were the real file, live invariant assertion toEqual([]) would: FAIL (RED) -- received ["isMac"]
RED-PROOF specimen [if (!isLinux) { return }] -> hits=["isLinux"] (expected [isLinux])
  If this were the real file, live invariant assertion toEqual([]) would: FAIL (RED) -- received ["isLinux"]
RED-PROOF specimen [if (process.platform === 'darwin') { return true }] -> hits=["process.platform"] (expected [process.platform])
  If this were the real file, live invariant assertion toEqual([]) would: FAIL (RED) -- received ["process.platform"]
FALSE-POSITIVE control [isMacNative] -> hits=[] (expected [])
FALSE-POSITIVE control [isMacOSUpToDate] -> hits=[] (expected [])
FALSE-POSITIVE control [isLinuxNative] -> hits=[] (expected [])
FALSE-POSITIVE control [isLinuxFamily] -> hits=[] (expected [])
FALSE-POSITIVE control [effectiveIsMacNative] -> hits=[] (expected [])
```

Interpretation: the `it()` tests in Describe 6 assert these exact values with `toEqual` and pass
(GREEN) -- that pass IS the proof, because each specimen simulates the branch actually landing in
the guarded module; if it had, the live invariant test's `toEqual([])` would receive the non-empty
array shown above and go RED. All five false-positive specimens correctly return `[]`.

### False-positive control result

All 5 lookalike identifiers listed in the plan's locked findings were tested --
`isMacNative`, `isMacOSUpToDate`, `isLinuxNative`, `isLinuxFamily`, `effectiveIsMacNative` -- and
all 5 were rejected (`platformTokenHits` returned `[]` for every one). The `\b`-anchored
`isMac`/`isLinux` patterns do not false-positive on any of them.

## What the gate does and does NOT prove

**Proves:** a future edit that reintroduces `process.platform`, a bare `isMac`, or a bare
`isLinux` as live (non-comment) code into `wineToolsFlowRegistration.ts` fails
`wineToolsFlows.test.ts`, naming `T-34.5-17` / `T-34.5-32` in the failing test title.

**Does NOT prove:**
- Coverage of `isWindows` or the `isMacNative`/`isLinuxNative` family -- the mitigation named three
  tokens; the gate covers three.
- Coverage of platform branching reached *indirectly* (a helper in another module that itself
  branches and is called from this file).
- Coverage of a token appearing inside a string literal.
- Anything about runtime behaviour -- this is a source-text gate, not a behavioural test. A
  behavioural adversarial-platform test was considered and deliberately not written: the declared
  mitigation is a source-text grep and this closure delivers the mitigation as declared.

## Evidence-shard grep result

```
grep -rn 'T-34\.5-17\b\|T-34\.5-32\b' .planning/phases/34.5-*/34.5-SECURITY-EVIDENCE-*.md
```

Confirmed: **zero hits** (grep exit code 1). Matches the plan's prediction -- R2's rows came from
the BASE shard, which wrote no evidence file. No evidence-shard amendment was needed.

## 34.5-SECURITY.md changes

- Frontmatter: `threats_open: 3 -> 1`, `threats_closed: 359 -> 361` (`threats_total: 362`,
  `threats_accepted: 3`, `status: blocked` unchanged -- R4 is still open).
- `## Open Threats` heading: `3 rows, 2 root causes -> 1 row, 1 root cause`.
- R2 retitled `### R2 -- CLOSED 2026-08-20 -- ...`, with the original two-row table and all three
  finding paragraphs (lines 104-121 pre-edit) preserved verbatim, followed by a closure block
  covering: what was built, where it lives, how it's RED-proven, the word-boundary decision, the
  filled-specimen property, a correction to the finding's own line numbers (204/207/218/220/222,
  not 207/218/222), and what the gate does not prove.
- Also fixed a **pre-existing stale drift** flagged by the plan: the Accepted Risks Log preamble
  (`**The 4 remaining open rows -- R2 x2, R3, R4 -- are NOT accepted.**`) was already wrong before
  this task -- R3 was closed earlier today under `quick-260820-fyl` without this line being
  updated. Corrected in the same pass to `**The 1 remaining open row -- R4 -- is NOT accepted.**`.
- Added one Security Audit Trail row: `2026-08-20 | 362 | 361 | 1 | quick-260820-ic0 -- ...`.
- Gate section: `threats_open: 3 -> 1`; "Remaining" now names only R4; the
  `No next-phase routing is emitted while threats_open > 0` line was left unchanged (confirmed
  present, not duplicated, in the final file).
- No `AR-` row was added -- nothing is being accepted, the control was built.

## Deviations from Plan

None -- plan executed exactly as written. The only self-correction during execution was an Edit
tool ordering slip that briefly duplicated the "No next-phase routing..." line at the end of the
Gate section; caught immediately via `grep -n` and fixed before verification, so it left no trace
in the final committed content.

## Verification results

- `npx jest src/backend/sidecar/__tests__/wineToolsFlows.test.ts`: **23/23 passed**, 0 failed.
- `git diff --quiet HEAD -- src/backend/sidecar/wineToolsFlowRegistration.ts`: exit 0 -- guarded
  module byte-identical to HEAD.
- `npx eslint src/backend/sidecar/__tests__/wineToolsFlows.test.ts`: 0 errors, 5 warnings -- all 5
  pre-existing, in untouched Describes 1-5 (lines 197-280), none in the new Describe 6.
- `npx prettier --check src/backend/sidecar/__tests__/wineToolsFlows.test.ts`: clean after one
  `--write` pass (reformatted array/object literal wrapping in the new block only).
- `npx tsc --noEmit`: no output -- no errors.
- `34.5-SECURITY.md` frontmatter confirmed: `threats_open: 1`, `threats_closed: 361`,
  `threats_total: 362`, `threats_accepted: 3`, `status: blocked`.

## Commit and working-tree isolation

Committed by explicit path only (no `git add -A`, no `git add .`, no `gsd-sdk query commit`, no
`git stash`).

Staged and committed:
- `src/backend/sidecar/__tests__/wineToolsFlows.test.ts`
- `.planning/phases/34.5-tauri-ipc-re-plumb-slice-8-non-steam-runners-wine-and-shortc/34.5-SECURITY.md`
- `.planning/quick/260820-ic0-add-the-missing-platform-branch-absence-/PLAN.md`
- `.planning/quick/260820-ic0-add-the-missing-platform-branch-absence-/SUMMARY.md`

Confirmed **before and after** the commit that the following unrelated, concurrent-session changes
remained unstaged/untracked and untouched:
- ` M .planning/STATE.md`
- `?? .planning/quick/260819-p2d-uat-3413-bottle-prefill-note/`

Commit SHA: `c1783b30d` (see final response to orchestrator for `git show --stat HEAD`).
