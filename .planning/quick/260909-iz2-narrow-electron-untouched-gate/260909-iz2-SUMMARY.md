---
phase: quick-260909-iz2
plan: 01
status: complete
subsystem: backend-sidecar-containment
tags: [jest, by-construction-gate, D-04, keyring, sha256-pin, todo-close]
requires: []
provides:
  - "findSteamTokenSurfaceViolations() — binding-level D-04 gate helper in electronUntouched.test.ts, matched on the imported name so aliasing cannot evade"
  - "steam token surface binding gate helper describe — 10 guard tests proving the narrowing still trips on real violations and no longer convicts bootstrap.ts's Epic/GOG import"
  - "Rewired by-construction gate (was a bare configStore substring ban, now binds-from-surface)"
  - "Re-pinned gameDetailsImportGate.test.ts Gate 8 sha256 digest (mechanical consequence of editing the pinned file)"
  - "Closed todo: 2026-09-08-electronuntouched-gate-red-at-head-bans-any-configstore.md, RESOLVED"
affects: [backend-sidecar, steam-token-store, jest-gates]
tech-stack:
  added: []
patterns:
  - "A negative gate narrowed by NAME must be proven by a guard block driving the same helper against synthetic sources, not just asserted -- otherwise narrowing risks widening a blind spot"
  - "A pinned-sha256 do-not-touch gate on a file you are legitimately editing is a mechanical follow-on, not scope creep -- update it per its own documented re-pin procedure and say so in the commit"
key-files:
  created:
    - .planning/quick/260909-iz2-narrow-electron-untouched-gate/260909-iz2-PLAN.md
  modified:
    - src/backend/sidecar/__tests__/electronUntouched.test.ts
    - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
    - .planning/todos/completed/2026-09-08-electronuntouched-gate-red-at-head-bans-any-configstore.md
key-decisions:
  - "Reading 1 taken (the gate is over-broad); reading 2 refuted -- both gated files already legitimately import from the Steam token surface (keyringTokenStore.ts:6 binds the TokenStore type, bootstrap.ts:73 binds setTokenStore, D-04's own seam), so a specifier-level ban would be red on arrival. The ban had to move to the binding level."
  - "configStore is no longer bare-banned by substring; TOKEN_STORE_KEY/TOKEN_PREFIX remain bare-banned anywhere in source because they are unique to the Steam token surface."
  - "Deviation: also edited gameDetailsImportGate.test.ts (outside the plan's declared file list) to re-pin its Gate 8 sha256 digest of electronUntouched.test.ts -- a mechanical, documented-procedure consequence of legitimately editing the pinned file, required to reach the plan's own 0-failures verification bar. appShellImportGate.test.ts's parallel Gate 6 needed no edit: it diffs the working tree against `git show HEAD:...` and self-resolved on commit."
requirements-completed:
  - REQ-28-02
  - REQ-28-04
  - D-04
tasks-completed: 3
tasks-total: 3
duration: single session
completed: 2026-09-09
---

# Quick 260909-iz2 — narrow the electronUntouched by-construction gate

**Rewired `electronUntouched.test.ts`'s by-construction gate from a bare `configStore` substring ban to a binding-level check on the Steam token surface, proven by a 10-case guard block, and cleared the Backend suite from 1 failing to 0 failing.**

## What the todo asked for

`2026-09-08-electronuntouched-gate-red-at-head-bans-any-configstore.md` recorded the Backend
suite deterministically red on `electronUntouched.test.ts`'s by-construction gate:
`204025b39` added `bootstrap.ts:100`'s real, correct `import { configStore } from
'../constants/key_value_stores'` (Epic/GOG, used only for `configStore.delete('userInfo')`,
never a token write) and the gate's bare `/TOKEN_STORE_KEY|TOKEN_PREFIX|configStore/` substring
ban convicted it. The todo's own decision was already made and locked in the plan (not
re-litigated here): reading 1, the gate is over-broad; reading 2, a specifier-level ban, is
refuted because both `keyringTokenStore.ts` and `bootstrap.ts` already legitimately bind names
from the Steam token surface (the `TokenStore` type and `setTokenStore`, D-04's own seam).

## What shipped

**Task 1 — `src/backend/sidecar/__tests__/electronUntouched.test.ts`.** Added
`findSteamTokenSurfaceViolations(source, label)`, a named source-text helper (string in, array
out) implementing:
- Rule A: `TOKEN_STORE_KEY`/`TOKEN_PREFIX` remain bare-banned anywhere in source (both names are
  unique to the Steam token surface, so a bare-anywhere ban is exact).
- Rule B: no `import`/`require()`/dynamic `import()` whose specifier matches the Steam token
  surface (`storeManagers/steam/{electronStores,tokenStore,constants}` or its sibling `./` form)
  may bind `configStore`, `TOKEN_STORE_KEY`, `TOKEN_PREFIX` or `ElectronTokenStore` -- matched on
  the imported name (left of `as`/`:`) so aliasing cannot evade, and whole-module bindings
  (`* as X`, bare `import X`, bare `require()`) are flagged as binding every export.

Added a new `steam token surface binding gate helper` describe with 10 guard tests (cases
a-j from the plan, all included, not just the 4 mandatory ones): direct/aliased/require/dynamic
Steam-surface `configStore` imports all trip; the real `bootstrap.ts` Epic/GOG import, the real
D-04 seam import (`setTokenStore`), a real type-only `TokenStore` import, a real GOG
`electronStores` import, and a trailing-comment-only mention all do not trip. Normalization
chains `stripSourceComments` (block comments + full comment lines) then
`stripTrailingLineCommentTs` per line, per the plan's explicit instruction not to hand-roll a
naive `//` strip (the WR-08 regression class).

**Task 2 — same file.** Rewired the existing by-construction `it` to call the helper and assert
`toEqual([])` (so a failure names the offending binding and file), renamed it to state what it
now encodes, and rewrote the module docstring's closing paragraph to describe the binding-level
contract, why the old bare-substring form was wrong, and to point future readers at the guard
block as the required proof to extend if this gate is narrowed again.

**Task 3.** Ran the full Backend suite, checked formatting, closed the todo via `git mv` with a
`status:` field recording the reading taken, the refutation, what shipped, and the measured
before/after counts; ran `pnpm planning-gates`.

## Deviation from the plan's declared file list (Rule 3 — auto-fix blocking issue)

Editing `electronUntouched.test.ts`'s bytes broke two independent do-not-touch gates that pin
that file, neither of which is in this plan's `files:` list:

- **`gameDetailsImportGate.test.ts` Gate 8** hardcodes a sha256 digest of
  `electronUntouched.test.ts`'s content. This gate has five prior precedents of exactly this
  situation, each documented inline as "Re-pinned YYYY-MM-DD by [task/phase], per this gate's own
  documented procedure" with a stated diff and a prior-digest trail. I followed that established
  procedure: recomputed the digest after both edits (`466327c30fca...`), added a sixth
  "Re-pinned 2026-09-09 by quick task 260909-iz2" entry describing exactly what changed, and
  updated the constant. **This required editing a file outside the plan's exhaustive `files:`
  list**, but the plan's own verification bar (0 failures on the full Backend suite) is
  unreachable without it -- the pin is a mechanical, unavoidable consequence of legitimately
  editing the pinned file, not a new feature or an architectural change.
- **`appShellImportGate.test.ts` Gate 6** diffs the working tree against `git show
  HEAD:src/backend/sidecar/__tests__/electronUntouched.test.ts` (not a hardcoded hash) -- it
  needed no edit and self-resolved as soon as the electronUntouched.test.ts changes were
  committed.

No other file was touched. `bootstrap.ts` and `keyringTokenStore.ts` are byte-unchanged --
confirmed via `git diff --stat HEAD -- src/backend/sidecar/bootstrap.ts
src/backend/sidecar/keyringTokenStore.ts` returning empty at every checkpoint.

## Verification Evidence

- `npx jest --selectProjects Backend src/backend/sidecar/__tests__/electronUntouched.test.ts -t
  'steam token surface binding gate helper'` — **10 passed**, non-zero test count confirmed (not
  a false-green `-t` regex miss).
- `npx jest --selectProjects Backend src/backend/sidecar/__tests__/electronUntouched.test.ts` —
  whole file GREEN, by-construction gate present under its new name.
- `npx jest --selectProjects Backend` (full suite) — **before: 1 failed / 4744 passed / 2 skipped
  / 211 suites** (the single failure was this gate). **After: 0 failed / 4755 passed / 2 skipped
  / 211 suites total, 4757 tests total.** (+10 guard tests, +1 previously-failing test now
  passing = +11 passing tests, matching 4744 + 11 = 4755.) Confirmed the suite count stayed ~211,
  not a `--selectProjects` false-green.
- `npx prettier --check` on both touched source files (`electronUntouched.test.ts`,
  `gameDetailsImportGate.test.ts`), run from the repo root — clean on both.
- `git diff --stat HEAD -- src/backend/sidecar/bootstrap.ts
  src/backend/sidecar/keyringTokenStore.ts` — empty.
- `pnpm planning-gates` — **9/9 passed**, including `todo-frontmatter-gate.py` after the pending
  → completed move.

## What is NOT fixed / not attempted

Nothing from the plan's tasks was skipped or narrowed. All 4 mandatory guard cases (a)-(d) plus
all 6 optional cases (e)-(j) were implemented (the plan only required (a)-(c) mandatory and
listed (d) as also mandatory per the must_haves truths; (e)-(j) were "if they fit in the task
budget" and all fit). The one thing beyond the plan's literal file list -- the
`gameDetailsImportGate.test.ts` re-pin -- is documented above as a necessary deviation, not a
silent scope change.

## Issues Encountered

The only surprise was discovering, only after editing `electronUntouched.test.ts`, that two
*other* test files pin its bytes by construction (`gameDetailsImportGate.test.ts` via hardcoded
sha256, `appShellImportGate.test.ts` via a live `git show HEAD:...` diff). Neither was
foreshadowed by the plan's `files:` list or its `<threat_model>`. The sha256 one required an
edit; the HEAD-diff one self-resolved on commit.

---

*Phase: quick-260909-iz2*
*Completed: 2026-09-09*

## Self-Check: PASSED

- FOUND: `src/backend/sidecar/__tests__/electronUntouched.test.ts`
- FOUND: `src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts`
- FOUND: `.planning/todos/completed/2026-09-08-electronuntouched-gate-red-at-head-bans-any-configstore.md`
- CONFIRMED: not present in `.planning/todos/pending/`
- FOUND commit `17b1cbdf7` (test: add binding-level D-04 gate helper and guard tests)
- FOUND commit `267a5c36a` (fix: narrow electronUntouched by-construction gate + re-pin gameDetailsImportGate Gate 8)
- FOUND commit `e226e4b81` (docs: close electronUntouched gate-red todo)
