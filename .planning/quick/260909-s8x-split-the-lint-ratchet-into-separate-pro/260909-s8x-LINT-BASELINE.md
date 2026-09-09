# Quick 260909-s8x — Two-Ceiling Lint Baseline

Measured 2026-09-09. Task 1's config edit landed as `8f0d7ff20e13f78748185f3b10fc564bcd2213a7`
(short `8f0d7ff20`) on `fix/steam-native-install-stability`. Task 2's runner/wiring commit landed
as `1c1345064b8a68d79095b8963e76f2ee3112390c` (short `1c1345064`). Every count in this document
was either measured on the working tree immediately before/after the Task 1 edit, or re-measured
against the tree at `1c1345064` for the mutation matrix and the final scope-symmetry re-check —
each section states which. This follows `39-LINT-BASELINE.md`'s own discipline: verbatim
transcripts, independent measurement paths where available, and a plan-vs-measured
reconciliation table.

## The contradiction, stated and resolved

`eslint.config.mjs`'s existing test-file override (`files: ['**/__tests__/**/*.ts',
'**/__mocks__/**/*.ts']`) already set `@typescript-eslint/no-explicit-any: 'off'` — `any` is
explicitly sanctioned in test files. But five sibling rules, which fire precisely on
dereferencing/assigning/returning/passing an `any`, remained on globally at `warn`:

| Rule | Pre-change count in the test scope |
|---|---|
| `@typescript-eslint/no-unsafe-member-access` | 983 |
| `@typescript-eslint/no-unsafe-assignment` | 714 |
| `@typescript-eslint/no-unsafe-return` | 336 |
| `@typescript-eslint/no-unsafe-argument` | 270 |
| `@typescript-eslint/no-unsafe-call` | 235 |
| **Total** | **2538** |

Those 2538 warnings were unactionable by the project's own policy: the same block that produced
them permits the exact construct (`any`) they fire on. The fix disables those five rules in the
test override only — production keeps them at `warn`, where the debt is real.

## Pre-change and post-change measurement tables

All three scopes, measured with `npx eslint --no-cache -f json`, parsed independently with a Node
one-liner (`severity === 2` → error, `severity === 1` → warning, dump length → files linted).

### Pre-change (working tree before the `eslint.config.mjs` edit, tip `b9b8f5c50`)

| scope | files linted | errors | warnings |
|---|---|---|---|
| `eslint .` (whole tree) | 1192 | 0 | 4253 |
| production (`.` minus `__tests__`/`__mocks__`) | 751 | 0 | 1123 |
| tests (`__tests__`/`__mocks__`, `.ts` + `.tsx`) | 441 | 0 | 3130 |

751 + 441 = 1192. 1123 + 3130 = 4253. Exact — matches the planner's recorded pre-change figures
digit for digit.

### Post-change (working tree after the edit, committed as `8f0d7ff20`)

| scope | files linted | errors | warnings |
|---|---|---|---|
| `eslint .` (whole tree) | 1192 | 0 | 1761 |
| production (`.` minus `__tests__`/`__mocks__`) | 751 | 0 | **1123 (unchanged)** |
| tests (`__tests__`/`__mocks__`, `.ts` + `.tsx`) | 441 | 0 | **638** |

751 + 441 = 1192 (unchanged). 1123 + 638 = 1761. Exact.

### Top rules by count, production scope (pre- and post-change — identical, rule for rule)

| Rule | Count |
|---|---|
| `@typescript-eslint/require-await` | 180 |
| `import-x/no-named-as-default-member` | 180 |
| `@typescript-eslint/no-unsafe-assignment` | 171 |
| `@typescript-eslint/no-unsafe-member-access` | 167 |
| `@typescript-eslint/no-floating-promises` | 162 |
| `react-hooks/exhaustive-deps` | 71 |
| `@typescript-eslint/restrict-template-expressions` | 56 |
| `@typescript-eslint/no-unsafe-call` | 41 |
| `@typescript-eslint/no-unsafe-argument` | 41 |
| `react-hooks/rules-of-hooks` | 21 |
| `@typescript-eslint/no-unsafe-return` | 17 |
| `@typescript-eslint/no-base-to-string` | 6 |
| (unused eslint-disable directive) | 4 |
| `@typescript-eslint/no-for-in-array` | 3 |
| `import-x/no-duplicates` | 2 |
| `import-x/no-named-as-default` | 1 |

Every single rule count in the production scope is byte-for-byte identical pre- and post-change —
not just the 1123 aggregate. This is the strongest available evidence the override did not leak:
if it had, at least one of the five `no-unsafe-*` rows above would have dropped.

### Top rules by count, tests scope (post-change)

| Rule | Count |
|---|---|
| `@typescript-eslint/unbound-method` | 364 |
| `@typescript-eslint/require-await` | 114 |
| (unused eslint-disable directive) | 68 |
| `@typescript-eslint/no-unsafe-member-access` | 25 |
| `@typescript-eslint/no-unsafe-assignment` | 16 |
| `import-x/no-named-as-default-member` | 13 |
| `@typescript-eslint/restrict-template-expressions` | 9 |
| `@typescript-eslint/no-floating-promises` | 7 |
| `@typescript-eslint/no-base-to-string` | 7 |
| `react-hooks/rules-of-hooks` | 7 |
| `import-x/no-duplicates` | 6 |
| `@typescript-eslint/no-unsafe-return` | 1 |
| `@typescript-eslint/no-unsafe-call` | 1 |

The five `no-unsafe-*` rows sum to 43 (25+16+1+0+1) — these are the surviving warnings from the
recorded `.tsx` asymmetry (see its own section below), not a leak. `unbound-method` (364) and
`require-await` (114) are untouched, as required — the plan explicitly forbids disabling anything
else in tests.

## The scope-symmetry proof

Proven by set operations on the `filePath` field of each `-f json` dump, not by reading the
globs — both pre-change and post-change.

### Pre-change

```
whole size 1192, prod size 751, tests size 441
overlap(prod, tests) = 0
union.size 1192, whole.size 1192, unionEqualsWhole = true
missingFromUnion = 0, extraInUnion = 0
```

### Post-change (raw `eslint` invocations)

```
whole size 1192, prod size 751, tests size 441
overlap(prod, tests) = 0
union.size 1192, whole.size 1192, unionEqualsWhole = true
missingFromUnion = 0, extraInUnion = 0
warnings sum check: 1123 + 638 = 1761 = whole warnings
```

### Re-run against the NEW scripts themselves (Task 2, via `meta/lintScoped.cjs`'s own ESLint
constructor options, not raw `eslint .` invocations), at tip `1c1345064`

```json
{
  "srcFiles": 751,
  "testsFiles": 441,
  "wholeFiles": 1192,
  "overlap": 0,
  "unionSize": 1192,
  "missingFromUnion": 0,
  "extraInUnion": 0,
  "srcWarnings": 1123,
  "testsWarnings": 638,
  "wholeWarnings": 1761,
  "sumMatchesWhole": true
}
```

Zero slack in all three runs: disjoint, exact union, exact warning-count reconciliation. The two
scopes the runner uses partition exactly what `eslint .` covers today.

## Plan-vs-measured number reconciliation

| Metric | Planner's prediction | Measured | Match? |
|---|---|---|---|
| Production warnings, pre-change | 1123 | 1123 | Match |
| Production warnings, post-change | 1123 (unchanged) | 1123 | Match — rule-for-rule identical, not just the aggregate |
| Tests warnings, pre-change | 3130 | 3130 | Match |
| Tests warnings, post-change | "635, plus 1-2" (i.e. 636 or 637) | **638** | **Off by 1 from the top of the predicted range (or off by 3 from the base 635)** |
| Whole-tree files, both scopes | 751 / 441 (1192 total) | 751 / 441 (1192 total) | Match |
| No-unsafe-* removed from tests | 2495 of 2538 (43 remain in `.tsx`) | 2538 total pre-change; 43 remain post-change (all in `.tsx`); 2495 removed | Match |

**Why the tests count is 638, not 636-637:** the planner correctly identified that disabling the
five rules would turn exactly one `eslint-disable-next-line` comment
(`src/preload/__tests__/childWindows.test.ts:127`) into an unused directive, producing 1-2 new
`ruleId: null` warnings (ESLint can report one combined message for a multi-rule disable comment,
hence "1-2" rather than a fixed number). **What the planner missed: a second file also carries a
now-unused directive.** Diffing the `ruleId === null` findings between the pre-change and
post-change tests dumps surfaces exactly three new entries, from two files:

```
src/backend/__tests__/launcher_callRunner.test.ts:260 :: Unused eslint-disable directive
  (no problems were reported from '@typescript-eslint/no-unsafe-member-access').
src/backend/__tests__/launcher_callRunner.test.ts:260 :: Unused eslint-disable directive
  (no problems were reported from '@typescript-eslint/no-unsafe-assignment').
src/preload/__tests__/childWindows.test.ts:127 :: Unused eslint-disable directive
  (no problems were reported from '@typescript-eslint/no-unsafe-member-access' or
  '@typescript-eslint/no-unsafe-call').
```

`childWindows.test.ts:127` contributes exactly the 1 combined warning the planner predicted (its
comment names two rules but ESLint reports one message for it). `launcher_callRunner.test.ts:260`
— a file the planner's trap did not name — contributes 2 more, because that line's directive
lists its rules such that ESLint reports one unused-directive warning per rule rather than one
combined message. 635 (the fully-mechanical base) + 3 (1 + 2, both files) = **638**, which is
exactly what was measured. The reconciliation is exact once the second file is accounted for; the
mechanism the planner described (a disable comment naming a rule that is now off becomes an
unused-directive warning, itself a warning) was correct, only the census of which files carry such
a comment was incomplete. Per the plan's explicit instruction, `launcher_callRunner.test.ts:260`'s
directive was **not deleted** — fixing an individual warning is out of scope, and its warning
falls inside the (correctly, exactly) measured test ceiling below.

## The two ceilings

| Scope | Ceiling | Measured against | Padding |
|---|---|---|---|
| `SRC_CEILING` (production) | **1123** | `8f0d7ff20` | None — exact measured count |
| `TESTS_CEILING` (tests) | **638** | `8f0d7ff20` | None — exact measured count |

Both live in `meta/lintScoped.cjs`, the single source of truth `package.json`'s `lint`,
`lint:src` and `lint:tests` scripts all route through.

## The `minFiles` floor and what it is for

**Failure mode it closes:** a zero-headroom warning ceiling (as both of these deliberately are)
cannot, on its own, distinguish "the scope is clean" from "the scope's glob silently started
matching nothing." Both produce zero warnings, and a ceiling only fires when the count *exceeds*
it — zero warnings never exceeds anything, so a collapsed scope sails through and passes forever.

Each floor is set to 50% of the same commit's measured linted-file count for that scope, rounded
down:

| Scope | Measured files | Floor (50%, rounded down) |
|---|---|---|
| `src` (production) | 751 | **375** |
| `tests` | 441 | **220** |

This is deliberately **not** a drift ratchet — the file count is expected to move as the repo adds
and deletes files, and the floor does not track that drift. It exists solely to catch a collapse
to near-zero.

**Proof it bites (mutation case 7, full transcript in the matrix below):** the `tests` scope's
patterns were temporarily repointed at a directory that does not exist. `errorOnUnmatchedPattern:
false` let ESLint complete the run instead of throwing, so the run genuinely reached the
`minFiles` check rather than aborting for an unrelated reason:

```
Scope "tests" linted 0 file(s), below its minFiles floor of 220. A scope that silently matches
fewer files than this either collapsed to near-nothing or its patterns are wrong -- fix the
patterns, do not lower the floor.
tests: FAIL
exit=1
```

Exit non-zero, floor named, scope named, observed count (0) named. The runner file was then
restored from its `cp` backup and confirmed byte-identical by `shasum` before re-verifying
`pnpm lint:tests` passed again at 638.

## The mutation proof matrix

All seven cases below were run by mutating the live `meta/lintScoped.cjs` in place, having first
taken a byte-identical `cp` backup (`/tmp/claude-lintScoped.cjs.backup`), and restoring from that
backup after each case with the restoration confirmed by `shasum -a 256` — never by retyping the
file. Every transcript is verbatim from the actual command run.

### Case 1 — `pnpm lint:src`, `SRC_CEILING` mutated 1123 → 1122 (N_src − 1)

```
$ sed -i '' 's/const SRC_CEILING = 1123/const SRC_CEILING = 1122/' meta/lintScoped.cjs
$ rm -f .eslintcache-src
$ pnpm lint:src
...
✖ 1123 problems (0 errors, 1123 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.

ESLint found too many warnings (maximum: 1122).
production: FAIL
 ELIFECYCLE  Command failed with exit code 1.
$ echo "exit=$?"
exit=1
```

**Result: PASS.** Exit 1, message names maximum 1122.

### Case 2 — `pnpm lint:src` restored to `SRC_CEILING = 1123` (N_src)

```
$ cp /tmp/claude-lintScoped.cjs.backup meta/lintScoped.cjs
$ shasum -a 256 meta/lintScoped.cjs /tmp/claude-lintScoped.cjs.backup
f30f8a5cfb45d117446899693a1b079bd50497fedf6909de9f1ad811821f4e52  meta/lintScoped.cjs
f30f8a5cfb45d117446899693a1b079bd50497fedf6909de9f1ad811821f4e52  /tmp/claude-lintScoped.cjs.backup
$ rm -f .eslintcache-src
$ pnpm lint:src
...
✖ 1123 problems (0 errors, 1123 warnings)
  0 errors and 4 warnings potentially fixable with the `--fix` option.
production: PASS
$ echo "exit=$?"
exit=0
```

**Result: PASS.** Byte-identical restore confirmed by `shasum`; exit 0 at the exact ceiling.

### Case 3 — `pnpm lint:tests`, `TESTS_CEILING` mutated 638 → 637 (N_tests − 1)

```
$ sed -i '' 's/const TESTS_CEILING = 638/const TESTS_CEILING = 637/' meta/lintScoped.cjs
$ rm -f .eslintcache-tests
$ pnpm lint:tests
...
✖ 638 problems (0 errors, 638 warnings)
  0 errors and 71 warnings potentially fixable with the `--fix` option.

ESLint found too many warnings (maximum: 637).
tests: FAIL
 ELIFECYCLE  Command failed with exit code 1.
$ echo "exit=$?"
exit=1
```

**Result: PASS.** Exit 1, message names maximum 637.

### Case 4 — `pnpm lint:tests` restored to `TESTS_CEILING = 638` (N_tests)

```
$ cp /tmp/claude-lintScoped.cjs.backup meta/lintScoped.cjs
$ shasum -a 256 meta/lintScoped.cjs /tmp/claude-lintScoped.cjs.backup
f30f8a5cfb45d117446899693a1b079bd50497fedf6909de9f1ad811821f4e52  meta/lintScoped.cjs
f30f8a5cfb45d117446899693a1b079bd50497fedf6909de9f1ad811821f4e52  /tmp/claude-lintScoped.cjs.backup
$ rm -f .eslintcache-tests
$ pnpm lint:tests
...
✖ 638 problems (0 errors, 638 warnings)
  0 errors and 71 warnings potentially fixable with the `--fix` option.
tests: PASS
$ echo "exit=$?"
exit=0
```

**Result: PASS.** Byte-identical restore confirmed by `shasum`; exit 0 at the exact ceiling.

### Case 5 — `pnpm lint`, ONLY `SRC_CEILING` lowered (1123 → 1122), `TESTS_CEILING` left at 638

```
$ sed -i '' 's/const SRC_CEILING = 1123/const SRC_CEILING = 1122/' meta/lintScoped.cjs
$ rm -f .eslintcache-src .eslintcache-tests
$ pnpm lint
... (production half's stylish output, ending with)
ESLint found too many warnings (maximum: 1122).
... (tests half's own stylish output printed in full in the same run -- 101 lines of the
     combined transcript reference __tests__ paths, confirming the tests scope actually ran
     rather than merely being labelled)
✖ 638 problems (0 errors, 638 warnings)
  0 errors and 71 warnings potentially fixable with the `--fix` option.
production: FAIL | tests: PASS
$ echo "exit=$?"
exit=1
```

**Result: PASS.** Double duty, as the plan specifies: (a) a failing production half propagates to
a non-zero aggregate exit, and (b) the tests half's full output is present in the *same* run,
proving the aggregate does not short-circuit after the first failing scope.

### Case 6 — `pnpm lint`, ONLY `TESTS_CEILING` lowered (638 → 637), `SRC_CEILING` restored to 1123

```
$ cp /tmp/claude-lintScoped.cjs.backup meta/lintScoped.cjs   # byte-identical restore, shasum verified
$ sed -i '' 's/const TESTS_CEILING = 638/const TESTS_CEILING = 637/' meta/lintScoped.cjs
$ rm -f .eslintcache-src .eslintcache-tests
$ pnpm lint
...
ESLint found too many warnings (maximum: 637).
production: PASS | tests: FAIL
$ echo "exit=$?"
exit=1
```

**Result: PASS.** Proves propagation from the SECOND half: production alone is clean (PASS) but
the aggregate exit is still non-zero because tests failed.

### Case 7 — `pnpm lint:tests`, `tests` scope's `patterns` pointed at a nonexistent directory

```
$ (edited meta/lintScoped.cjs: tests.patterns replaced with
   ['**/__nonexistent-scope-collapse-mutation-260909-s8x__/**/*.ts',
    '**/__nonexistent-scope-collapse-mutation-260909-s8x__/**/*.tsx'])
$ rm -f .eslintcache-tests
$ pnpm lint:tests
Scope "tests" linted 0 file(s), below its minFiles floor of 220. A scope that silently matches
fewer files than this either collapsed to near-nothing or its patterns are wrong -- fix the
patterns, do not lower the floor.
tests: FAIL
 ELIFECYCLE  Command failed with exit code 1.
$ echo "exit=$?"
exit=1
```

**Result: PASS.** `errorOnUnmatchedPattern: false` let the run complete rather than throwing, so
it is genuinely the `minFiles` floor — not an ESLint abort — that caught the collapse.

**Restore + reconfirm:**

```
$ cp /tmp/claude-lintScoped.cjs.backup meta/lintScoped.cjs
$ diff meta/lintScoped.cjs /tmp/claude-lintScoped.cjs.backup
(no output -- IDENTICAL)
$ shasum -a 256 meta/lintScoped.cjs /tmp/claude-lintScoped.cjs.backup
f30f8a5cfb45d117446899693a1b079bd50497fedf6909de9f1ad811821f4e52  meta/lintScoped.cjs
f30f8a5cfb45d117446899693a1b079bd50497fedf6909de9f1ad811821f4e52  /tmp/claude-lintScoped.cjs.backup
$ rm -f .eslintcache-src .eslintcache-tests && pnpm lint:tests
... exit=0, 638 problems, tests: PASS
```

**7/7 cases behaved exactly as specified.**

## Two recorded decisions

### (a) `lint` runs both halves unconditionally and ORs their failures, rather than chaining with `&&`

`pnpm lint:src && pnpm lint:tests` is exit-code-correct but reports only half the picture: a
production failure would stop the command before the test scope ever ran, so a developer fixing
the production regression would have to push a second time to discover a test-scope regression
that was sitting there the whole time. Since the entire point of this split is that both
populations are independently visible, chaining them back together would defeat it. The runner
therefore always runs both scopes when invoked with no selector flag, collects both booleans, and
exits non-zero if either failed (case 5 and case 6 above each prove one direction of this).

### (b) `.husky/pre-push` and `.github/workflows/lint.yml` stay deliberately unmodified

Both call bare `pnpm lint`, and `pnpm lint` still runs everything and still fails on either half —
so both files are byte-unchanged (confirmed: neither appears in `git diff --name-only` for any
commit in this quick task). This is the deliberate choice, not an oversight: keeping one aggregate
entry point means there is exactly one thing every caller invokes, and no risk of some future
caller being updated to run only one half and silently losing coverage of the other.

## The recorded asymmetry — 66 `.tsx` test files stay under production rules

The test override's `files` glob is `['**/__tests__/**/*.ts', '**/__mocks__/**/*.ts']` — `*.ts`
does not match `foo.tsx`. Confirmed against the resolved config for
`src/frontend/components/UI/NavShell/__tests__/NavItem.test.tsx`:

```
$ npx eslint --print-config src/frontend/components/UI/NavShell/__tests__/NavItem.test.tsx
```

`@typescript-eslint/no-explicit-any` resolves to `[2]` (error) and `@typescript-eslint/
unbound-method` to `[2]`, while `@typescript-eslint/no-unsafe-member-access` resolves to `[1]` —
identical to a production file, not to a `.ts` test file. Measured directly against the post-
change `tests`-scope dump: **66 files** end in `.tsx`, carrying **60 warnings total**, of which
**43** are from the five `no-unsafe-*` rules (25 `no-unsafe-member-access` + 16 `no-unsafe-
assignment` + 1 `no-unsafe-return` + 1 `no-unsafe-call` + 0 `no-unsafe-argument`) — exactly the
planner's cited figures.

**This was NOT widened.** Widening the glob to `*.tsx` would turn `no-explicit-any` OFF for all 66
files, including the 63 that today pass cleanly with it ON — a policy loosening nobody asked for
and explicitly outside this task's scope. The consequence is recorded here deliberately: those 66
files are ratcheted under the **test** ceiling (their warnings count toward `TESTS_CEILING`) but
linted under **production** rules (`no-explicit-any` and `unbound-method` stay at error/warn for
them, same as any other `.tsx` file). A future reader must not "fix" this by widening the glob —
that would be a real, unrequested policy change, not a bug fix.

## The surviving unused directive

`src/preload/__tests__/childWindows.test.ts:127` carries
`// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
@typescript-eslint/no-unsafe-call`. Both named rules are now `off` for that file, so the directive
is unused, and this repo's flat config reports unused directives as warnings by default. It was
**deliberately not deleted** — removing it would be fixing an individual warning, explicitly out
of scope for this task — and its resulting warning is already inside the (exactly, correctly)
measured `TESTS_CEILING` of 638.

The plan-vs-measured reconciliation section above additionally surfaces
`src/backend/__tests__/launcher_callRunner.test.ts:260`, which carries the same shape (a disable
comment now naming rules that are off) and was likewise left untouched, for the same reason.

## How each ceiling is legitimately changed

Mirrors `39-LINT-BASELINE.md`'s own convention:

- **Lowering either ceiling** (the expected direction over time): fix warnings in that scope,
  re-run this document's measurement commands (the three-dump-plus-partition-proof sequence
  above, scoped to the relevant half) to get the new true count, lower the corresponding constant
  in `meta/lintScoped.cjs` to that new count, in its own commit citing the new number and the
  commit sha it was measured against.
- **Raising either ceiling**: requires the same deliberate act — a commit that explicitly states
  why the count needs to go up and cites the freshly measured number. It must never happen by
  drift; the only way the ceiling can be exceeded without a code change failing is if someone
  edits the exact constant in `meta/lintScoped.cjs` on purpose.
- **The `minFiles` floors** are not intended to be edited routinely. If a legitimate, large-scale
  file deletion or restructuring drops either scope's file count below its floor, lower the floor
  to a fresh 50%-of-measured value in its own commit, citing the new file count and the commit sha
  — the same discipline as the ceilings. Do not lower a floor to paper over a glob that actually
  stopped matching what it should.

## What was NOT done

- No individual lint warning was fixed or suppressed. `git diff --name-only -- src/` is empty for
  this entire task (verified after every commit).
- The inherited `// FIXME: All of these rules should be errors instead` block's global severities
  (`eslint.config.mjs`, the block starting around line 37) were not touched.
- `unbound-method` (364) and `require-await` (114) remain `warn` in the test scope, as the plan
  requires — only the five named `no-unsafe-*` rules were added to the test override.
- `.husky/pre-push` and `.github/workflows/lint.yml` were not edited.
- Neither `meta/lintScoped.cjs`'s two now-unused eslint-disable directives (in the two test files
  named above) nor any other individual warning was deleted, renamed, or suppressed.
- The zero-warning bar remains explicitly out of scope, exactly as `39-LINT-BASELINE.md` recorded
  for the single-ceiling predecessor of this gate.
