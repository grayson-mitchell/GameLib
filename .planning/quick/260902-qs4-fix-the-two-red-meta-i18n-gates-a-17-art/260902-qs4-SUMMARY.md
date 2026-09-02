---
phase: quick-260902-qs4
plan: 01
status: complete
date: 2026-09-02
commit: aa16be95f
files_modified:
  - meta/hardcodedStringGate.ts
  - meta/i18nForkTouchedFiles.json
  - meta/__tests__/genI18nGateScope.test.ts
---

# Quick Task 260902-qs4 — Summary

Both red Meta suites fixed. Two commits: `21dd66e4c` (gate exemption) and `aa16be95f` (A-17
re-baseline). **The whole repo test suite is now green: 371/371 suites, 7490 passed, 3 skipped.**

## Task 1 — hardcodedStringGate (`21dd66e4c`)

**The frontend file was innocent.** The gate flagged
`repairFailure.ts:135`'s `let message = 'Repair failed. See the log for details.'`, but that
literal is unchanged — `git show c2f567064 -- <file>` renders line 135 as pure context. The
string is also demonstrably routed through `t()` at :145. What changed was the gate's judgement.

Pattern 3 (`isAssignedThenPassedToT`), **whose doc comment names `repairFailure.ts` by name as
the case it exists for**, requires the binding assigned from the literal to have a reference
that is a `t()` argument. Quick `260901-ud5`'s Bucket E rewrote :145 from
`t('box.repair.error', message)` to `t('box.repair.error', '<literal>')` — the i18next-parser
lexer resolves a default only from a **literal** second argument — removing the only reference
of `message` that reached `t()`. The fallback idiom's meaning never changed; only its syntax.

Fixed in the **gate**: a reference also qualifies when it is the assignment target of a t-alias
call whose default-text argument is a literal with the **same text** as the declaration literal
being judged. That states exactly what Pattern 3 already claims, evidenced by the call's default
instead of by the binding's presence in the argument list.

Deliberately **not** fixed by an `i18nGateAllowlist.json` entry — that file is a deferral
register for real debt, and parking a false positive there would misrepresent it as unpaid debt
forever. `repairFailure.ts` untouched; Bucket E not reverted.

**Non-vacuity proven, not asserted.** Mutating the `t()` default's text so it no longer matches
the initialiser brings the violation straight back — captured across three runs: **0 → 1 → 0**.
`repairFailure.ts` restored from a `cp` backup to byte-identical, never via `git checkout`.

**One self-inflicted problem, caught by measurement.** The change initially added a 24th
`no-unsafe-argument` warning to the file (23 → 24). `pnpm lint` sits at *exactly* its
`--max-warnings 4157` ceiling, so that alone would have broken the ratchet. Annotating
`findReferencesAsNodes()` as `Node[]` types the whole `.some()` callback and cleared 12
warnings instead (23 → 11); repo-wide 4157 → **4145**.

## Task 2 — genI18nGateScope A-17 (`aa16be95f`)

The committed `meta/i18nForkTouchedFiles.json` was stale by exactly 3 paths, all from this
morning's commit `24cdae047` (the `useOpenDialog` file-picker fix).

**Hand-edited surgically, NOT regenerated** — `pnpm gen-i18n-gate-scope` is measured to take
this suite from 1 failure to 5, because the artifact's size is pinned in A0/A2/A3/A4 and its
content is the operand of the A-03 ratchet. All three moved in one commit:

| | before | after |
|---|---|---|
| `i18nForkTouchedFiles.json` | 204 | **207** |
| literal count pins | 10 pins at 204 | **207** |
| `DECLARED_UNSCANNED_DEBT` | 43 | **46** |
| `i18nGateScope.json` | 161 | **161 (untouched)** |

The `163 -> 161, 206 -> 204` line at :124 was deliberately left alone — it is a historical
record of what `260901-w9e` did, not a live pin. Rewriting it would have falsified the log.

### The debt register does not misrepresent what it holds

Measured with audit mode (`scanScope({ extraFiles })`, verified to mutate neither committed
artifact):

| file | violations | verdict |
|---|---|---|
| `hooks/useOpenDialog.ts` | **0** | fork-authored, all strings on `t()` — a genuine SCOPE candidate |
| `Settings/components/CustomWineProton.tsx` | **0** | scope candidate |
| `Settings/components/Tools/index.tsx` | **2** | `'Winecfg'` :89, `'Winetricks'` :96 — upstream tool names |

All three are declared as unscanned because the A-03 ratchet demands it, but the doc comment now
records that **two of them are not real debt**, so nobody reads 46 as 46 units of unpaid work.

**Deliberately left undone:** promoting the two clean files into `meta/i18nGateScope.json`
(which would shrink the register to 44). Widening a hand-curated blocking scope is a curation
decision, and making it as a side effect of an unrelated red-suite fix is precisely the
accidental widening that file's own comment already warns about twice. Recorded as a follow-up.

## Verification

| Gate | Result |
|---|---|
| Meta project | **36/36 suites, 773 passed, 1 skipped, 0 failed** (from 2 failed suites / 3 tests) |
| full `pnpm test` | **371/371 suites, 7490 passed, 3 skipped, 0 failed** |
| `pnpm lint` | 4145 warnings, 0 errors, exit 0 (was 4157, at the ceiling) |
| `tsc --noEmit` | clean |
| `prettier --check` on all changed files | clean |
| `meta/i18nGateScope.json` | no diff |
| `meta/i18nGateAllowlist.json` | no diff |
| `repairFailure.ts` | no diff |
| the 1 → 5 cascade | **did not occur** — judged by whole-project delta, not the target assertion |

**Flake honesty.** Across six full-suite runs after the fix, four were fully green and two
showed 1–2 transient failures whose `FAIL` lines I did not capture before they vanished; three
consecutive runs at the end were green. That matches the recorded
"a full `pnpm test` manufactures a different failure set under load" behaviour rather than
anything this task introduced, but I am recording it rather than reporting only the clean runs.
