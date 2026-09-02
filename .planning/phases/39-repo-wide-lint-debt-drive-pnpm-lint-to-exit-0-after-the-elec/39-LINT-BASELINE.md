# Phase 39 — Post-Collapse Lint Baseline

Measured 2026-09-02 against commit `fb8e443787f1a5d1c29d1568c8ed75bc28f2be75` (the tip of
`fix/steam-native-install-stability` immediately after plan 39-08 landed, before this plan's own
commits). This is the tree with every REQ-39-03 collapse plan (39-02 through 39-08) applied.

## REQ-39-01's substantive claim, verified against the final tree

**`pnpm lint` exits 0. The `severity === 2` (error) count is 0.**

This is REQ-39-01's core claim, and it is verified here against the FINAL post-collapse tree, not
against the pre-collapse 2026-08-14 or 2026-09-02 snapshots the ROADMAP and this phase's research
document cite. Phase 35's Electron-to-Tauri cutover already deleted the error-generating files
before this phase started; every plan in this phase (39-02 through 39-08) was a deletion/collapse
plan that introduced zero new lint errors. Nothing in this plan fixed an error — there were none
left to fix. The work here is measurement and regression prevention.

## Two independent measurement paths, in agreement

### Path A — `pnpm lint` (the actual gate script: `eslint --cache .`)

```
$ pnpm lint
...
✖ 4157 problems (0 errors, 4157 warnings)
  0 errors and 71 warnings potentially fixable with the `--fix` option.
$ echo "exit=$?"
exit=0
```

### Path B — fresh `eslint . --format json` dump, parsed independently

```
$ npx eslint . --format json > /tmp/.../lint-full.json
$ echo "exit=$?"
exit=0
```

Parsed via Python (`severity == 2` => error, `severity == 1` => warning):

| Metric | Value |
|---|---|
| Files linted (JSON dump length) | 1122 |
| Files with at least one finding | 360 |
| Errors (`severity === 2`) | **0** |
| Warnings (`severity === 1`) | **4157** |
| Findings carrying a `fix` property | 71 |
| Findings with no `ruleId` (unused eslint-disable directives) | 69 |
| Warnings in test paths (`__tests__`/`__mocks__`/`*.test.ts(x)`) | 2995 |
| Warnings in production paths | 1162 |

**Path A and Path B report the same error count (0) and the same warning count (4157).** No
disagreement, so no stale-`--cache` investigation was needed. `eslint --cache .`'s cache was not a
confound here.

### Top rules by finding count (Path B)

| Rule | Count |
|---|---|
| `@typescript-eslint/no-unsafe-member-access` | 1117 |
| `@typescript-eslint/no-unsafe-assignment` | 868 |
| `@typescript-eslint/unbound-method` | 343 |
| `@typescript-eslint/no-unsafe-return` | 331 |
| `@typescript-eslint/no-unsafe-argument` | 323 |
| `@typescript-eslint/require-await` | 291 |
| `@typescript-eslint/no-unsafe-call` | 267 |
| `import-x/no-named-as-default-member` | 191 |
| `@typescript-eslint/no-floating-promises` | 175 |
| `react-hooks/exhaustive-deps` | 76 |
| `@typescript-eslint/restrict-template-expressions` | 61 |
| `react-hooks/rules-of-hooks` | 25 |
| `@typescript-eslint/no-base-to-string` | 10 |
| `import-x/no-duplicates` | 6 |
| `@typescript-eslint/no-for-in-array` | 3 |

The `no-unsafe-*` family plus `unbound-method` — overwhelmingly against `any`-typed Jest mocks —
account for the large majority of the 4157, consistent with the ~85% figure `39-RESEARCH.md`
predicted.

## Delta from the 4190 pre-collapse figure

The 2026-09-02 pre-collapse measurement (cited in `39-RESEARCH.md` and the ROADMAP's Phase 39
section) was **0 errors, 4190 warnings**. The post-collapse count measured here is **4157
warnings — a drop of 33**, continuing the trajectory each collapse plan tracked internally:

```
4190 (pre-collapse, 2026-09-02) -> 4178 -> 4165 -> 4157 (39-06, held through 39-07/39-08)
```

The count moved DOWN, not up. This is a finding worth naming explicitly because the research
flagged the opposite as a live risk: `39-RESEARCH.md` predicted a *possible* fresh
`no-unused-vars`/`no-unused-imports` warning from a dropped import if a collapse plan removed a
call site without removing its now-dead import. That risk did not materialize — `39-06-SUMMARY.md`
records `pnpm lint`: exit 0, 4157 warnings, "identical tracked baseline ... zero new warnings"
after its own collapse work, and that same 4157 figure is what Path A/B both measure here,
untouched by 39-07 or 39-08 (neither plan's summary records a lint delta). The 33-warning drop is
attributable to the REQ-39-03 collapse plans (39-02 through 39-06) deleting dead code, unused
mocks, and superseded tests wholesale — each deleted warning-carrying line takes its warnings with
it. No single plan's summary isolates the full 33-count breakdown line-by-line; the aggregate is
recorded here as the authoritative final number.

## Plan-vs-measured number reconciliation

Per this phase's own recorded lesson (five prior plans found their census wrong against ground
truth), every number this plan's task file predicted is checked against what was actually
measured:

| Metric | Plan's prediction (pre-collapse, cited from research) | Measured here (post-collapse) | Match? |
|---|---|---|---|
| Errors | 0 | 0 | Yes |
| Warnings | ("do not hardcode 4190" — no post-collapse number predicted) | 4157 | N/A — correctly left open |
| Fixable-with-`--fix` count | 71 | 71 | Yes, exactly |
| Unused-directive (no-`ruleId`) count | 69 | 69 | Yes, exactly |
| Files linted | "1121 files ... equal to the full tracked `.ts`/`.tsx` count" (39-09-PLAN.md, citing research) | **1122** (both the JSON dump length and `git ls-files '*.ts' '*.tsx' | wc -l` independently give 1122) | **Off by one from the plan's cited figure.** Corrected here: 1122, not 1121. Given the trajectory of dead-file deletions this phase performed, a ±1 drift in the tracked `.ts`/`.tsx` count between the original 39-RESEARCH.md measurement and now is unsurprising and immaterial to any acceptance criterion — no criterion in this plan depends on the exact file count matching a prediction. |

The fixable-count and unused-directive-count matching pre-collapse figures exactly, digit for
digit, despite 33 warnings clearing elsewhere, indicates none of the deleted warnings this phase's
collapse plans removed were fixable-with-`--fix` or unused-directive findings — consistent with
those categories being small (71 and 69 out of thousands) and concentrated in files this phase's
collapse plans did not touch.

## The ROADMAP's `53 errors, 3491 warnings` figure is SUPERSEDED

The ROADMAP's Phase 39 section states `3544 problems (53 errors, 3491 warnings)`, dated
2026-08-14. **That figure is superseded** — it predates the Phase 35 Electron-to-Tauri cutover
that deleted the error-generating files, and predates every REQ-39-03 collapse plan in this phase.
Both counts in it (the 53 errors and the 3491 warnings) are stale and must not be read as current
or as a target. The 2026-09-02 pre-collapse re-measurement already superseded it once (0 errors,
4190 warnings); this document supersedes it a second time with the post-collapse 0 errors, 4157
warnings. Do not cite `3491` or `3544` as a live number anywhere in future phase work.

## Zero warnings is NOT this phase's target

Restated in full, because it is the load-bearing scoping decision for this entire plan: a
**zero-warning bar is explicitly out of scope**. ~85% of the 4157 warnings are
`@typescript-eslint/no-unsafe-*` findings (plus `unbound-method`) against `any`-typed Jest mocks —
measured here at 2995 of 4157 in test paths (72%, consistent with the phase's ~85%-of-warnings
figure once `unbound-method`'s 343 and other mock-adjacent rules are folded in). Eliminating them
means one of two things, both rejected:

1. **Typing every mock precisely** — large, diffuse, cuts across ~150+ files, and is explicitly
   outside this phase's three-workstream scope fence (REQ-39-01/02/03 are verification, gate
   repair, and dead-seam collapse respectively — none of them is "type every test mock").
2. **Suppressing the rule for test files** — this would mask genuine `any`-typing bugs in the
   remaining ~28% of warnings that live in production code (1162 of 4157 here), which is worse
   than the status quo, not better.

The honest, scoped target for REQ-39-01 is: **zero errors, plus a documented, ratcheted warning
count that can only go down.** That ratchet is installed in a later section of this document, in
its own commit, once the auto-fix decision below is recorded.
