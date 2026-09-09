---
phase: quick-260909-s8x
verified: 2026-09-09T00:00:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Quick 260909-s8x: Split the Lint Ratchet Into Separate Production/Test Ceilings — Verification Report

**Task Goal:** Split the lint ratchet into separate production and test ceilings, and stop
flagging sanctioned `any` in test files. `pnpm lint` was RED since 2026-09-06 (0 errors / 4253
warnings against a 4157 ceiling), blocking every push via `.husky/pre-push` and
`.github/workflows/lint.yml`.

**Verified:** 2026-09-09
**Status:** passed

## Already Confirmed by Orchestrator (not re-run)

- `pnpm lint` exits 0. Production 1123 warnings, tests 638, "production: PASS | tests: PASS".
- Each half independently turns the gate red without short-circuiting (`SRC_CEILING` 1123→1122 and
  `TESTS_CEILING` 638→637 both proven, runner restored byte-identical, `git status` clean on
  `meta/`, `package.json`, `eslint.config.mjs`).
- Post-change partition reconciles exactly (751+441=1192 files, 1123+638=1761 warnings, overlap 0,
  uncovered 0, outside-all 0).

## Goal Achievement

### Observable Truths (PLAN frontmatter `must_haves.truths`)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Five `no-unsafe-*` rules resolve OFF for test `.ts`, WARN for production, provable via `--print-config` | ✓ VERIFIED | Independently re-ran `npx eslint --print-config` on `src/preload/__tests__/childWindows.test.ts` (all five `[0]`, `no-explicit-any` `[0]`, `unbound-method` `[1]`, `require-await` `[1]`) and `src/backend/utils.ts` (`no-unsafe-argument` `[1]`, `no-unsafe-member-access` `[1]`) |
| 2 | `pnpm lint` exits 0 on HEAD, exits 1 if either ceiling exceeded, proven by mutation both directions on each half independently | ✓ VERIFIED | Orchestrator pre-verified (see above) |
| 3 | `pnpm lint` runs both halves unconditionally; failing production half does not block test half reporting | ✓ VERIFIED | `meta/lintScoped.cjs:172-195` (`main()`) pushes both scope results unconditionally when no selector flag is given, no early return; orchestrator pre-verified via case 5/6 mutation |
| 4 | Production and test ceilings independent — no cross-absorption | ✓ VERIFIED | Two separate `SCOPES.src`/`SCOPES.tests` objects, two separate `maxWarnings` constants, evaluated independently in `runScope()` |
| 5 | Two scopes partition exactly what `eslint .` covered, proven by set operations on `-f json` dumps | ✓ VERIFIED | Orchestrator pre-verified; LINT-BASELINE.md also shows the proof re-run against the new scripts themselves at tip `1c1345064` (overlap 0, unionSize 1192, sumMatchesWhole true) |
| 6 | Each ceiling at its measured count with zero padding; N-1 RED, N GREEN | ✓ VERIFIED | `SRC_CEILING = 1123`, `TESTS_CEILING = 638` in code with no headroom comment; orchestrator pre-verified both N-1/N boundaries |
| 7 | A scope matching nothing FAILS rather than passing — linted-file floor per half | ✓ VERIFIED | See dedicated section below — floor exists, runs unconditionally (not skipped when ceiling would otherwise pass at 0 warnings), and the mutation proof (case 7) is recorded |
| 8 | `.husky/pre-push` and `.github/workflows/lint.yml` still invoke bare `pnpm lint`, unmodified, both re-run and green | ✓ VERIFIED | `grep` confirms both files still read `pnpm lint` verbatim; `git diff --name-only` for `8f0d7ff20~1..41591dbee` does not list either file; `pnpm lint` (production+tests) exits 0 per orchestrator |
| 9 | New per-half cache files gitignored; a `pnpm lint` run leaves `git status` clean | ✓ VERIFIED | `.gitignore:26-27` adds `.eslintcache-src` and `.eslintcache-tests` as explicit entries; orchestrator confirmed `git status` clean on relevant paths after a run |
| 10 | `git diff` against `src/` empty — no individual warning fixed/suppressed | ✓ VERIFIED | `git diff --name-only 8f0d7ff20~1 41591dbee -- src/` returns empty across all three task commits (checked commit range, not just working tree) |
| 11 | Production warning count identical before/after config edit | ✓ VERIFIED | `git diff --name-only 8f0d7ff20~1 8f0d7ff20` shows only `eslint.config.mjs` changed for Task 1; LINT-BASELINE.md shows rule-for-rule identical production counts pre/post; orchestrator's post-change partition also reconciles at 1123 |
| 12 | `39-LINT-BASELINE.md`'s `4157` ratchet marked SUPERSEDED in place | ✓ VERIFIED | See dedicated section below |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `meta/lintScoped.cjs` | Single source of truth for scopes/ceilings/caches/floors/exit-join; contains `SRC_CEILING` | ✓ VERIFIED | Exists, 202 lines, contains `SRC_CEILING`/`TESTS_CEILING`/`SRC_MIN_FILES`/`TESTS_MIN_FILES`, uses `require('eslint').ESLint` (no spawn), wired into `package.json` |
| `package.json` | `lint`, `lint:src`, `lint:tests` all route through `meta/lintScoped.cjs`; contains `lint:src` | ✓ VERIFIED | Lines 45-47: `"lint": "node meta/lintScoped.cjs"`, `"lint:src": "node meta/lintScoped.cjs --src"`, `"lint:tests": "node meta/lintScoped.cjs --tests"` |
| `eslint.config.mjs` | Test override disables five `no-unsafe-*` alongside `no-explicit-any: off`; contains `no-unsafe-member-access` | ✓ VERIFIED | Test-file override block (files `['**/__tests__/**/*.ts', '**/__mocks__/**/*.ts']`) carries all five rules at `'off'` plus a rationale comment; `no-explicit-any` and `unbound-method` unchanged; global severities block (line ~37) untouched |
| `.gitignore` | Two per-half cache entries; contains `.eslintcache-src` | ✓ VERIFIED | Lines 25-27: `.eslintcache`, `.eslintcache-src`, `.eslintcache-tests` — explicit names, no wildcard |
| `260909-s8x-LINT-BASELINE.md` | Verbatim measurements, symmetry proof, six/seven-case mutation matrix, decisions; ≥80 lines | ✓ VERIFIED | 488 lines; contains all required sections (contradiction, pre/post tables, symmetry proof, plan-vs-measured reconciliation, ceilings, minFiles rationale + proof, 7-case matrix, two decisions, `.tsx` asymmetry, surviving unused directive, "how to change a ceiling", "what was not done") |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json` `lint` script | `meta/lintScoped.cjs` | node invocation, no selector flag | ✓ WIRED | `"lint": "node meta/lintScoped.cjs"` matches exactly |
| `meta/lintScoped.cjs` | eslint Node API | `require('eslint').ESLint` | ✓ WIRED | Line 38: `const { ESLint } = require('eslint')`; no `spawnSync`/`.bin` shim anywhere in the file |
| `.husky/pre-push` | `package.json` `lint` script | bare `pnpm lint` | ✓ WIRED, unmodified | `.husky/pre-push` line 2: `pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update` — not in this task's commit diffs |
| `.github/workflows/lint.yml` | `package.json` `lint` script | bare `pnpm lint` | ✓ WIRED, unmodified | `run: pnpm lint` at line 17 — not in this task's commit diffs |

### Data-Flow / Behavioral Verification — `minFiles` Floor (focus area 2)

Read `meta/lintScoped.cjs` directly (lines 109-158, `runScope`):

- `SRC_MIN_FILES = 375` and `TESTS_MIN_FILES = 220` match the LINT-BASELINE.md claim (50% of 751
  and 441 measured files respectively, rounded down).
- The three checks (`errorCount > 0`, `results.length < scope.minFiles`, `warningCount >
  scope.maxWarnings`) are evaluated **unconditionally in sequence** and every failing one is
  pushed into a `failures` array — there is no early return after the error check and no `if
  (warningCount === 0) return true` shortcut that could let a collapsed-to-zero scope skip the
  floor check. Because a collapsed glob produces 0 files → 0 warnings, the ceiling check alone
  would never fire (0 is never `>` any ceiling) — the floor check is what catches it, and it runs
  regardless of the ceiling outcome.
- `tests` scope sets `errorOnUnmatchedPattern: false` specifically so a fully-collapsed glob
  doesn't throw before reaching this logic (comment at lines 83-87 states this explicitly, and the
  code matches the comment).
- LINT-BASELINE.md records a mutation proof (case 7): tests patterns repointed at a nonexistent
  directory → `Scope "tests" linted 0 file(s), below its minFiles floor of 220` → exit 1 → restored
  and reconfirmed by `shasum`. This is a plausible, correctly-targeted proof — pointing the glob at
  a directory that cannot match anything is the direct test of "scope silently matches nothing,"
  and the transcript's messages match the runner's actual error-message strings verbatim
  (cross-checked against the source lines 133-140).

**Judgment: the `minFiles` floor is real, correctly ordered relative to the ceiling check (both
checks are unconditional, so ordering is moot but the requirement is nonetheless satisfied), and
the implementation would fire on a genuinely collapsed glob** — confirmed by code reading, not
just by trusting the transcript.

### The 638 Figure's Provenance (focus area 4)

Independently re-ran `npx eslint --no-cache -f json` against both cited files
(`src/backend/__tests__/launcher_callRunner.test.ts` and
`src/preload/__tests__/childWindows.test.ts`) on the current tree and filtered for `ruleId ===
null` (unused-directive) messages:

```
launcher_callRunner.test.ts:260  Unused eslint-disable directive (no problems were reported from
  '@typescript-eslint/no-unsafe-member-access').
launcher_callRunner.test.ts:260  Unused eslint-disable directive (no problems were reported from
  '@typescript-eslint/no-unsafe-assignment').
childWindows.test.ts:127         Unused eslint-disable directive (no problems were reported from
  '@typescript-eslint/no-unsafe-member-access' or '@typescript-eslint/no-unsafe-call').
```

This is exactly three messages from exactly two files, matching the SUMMARY/BASELINE claim
digit-for-digit: `childWindows.test.ts:127` produces one **combined** message (both its named
rules reported in a single message), `launcher_callRunner.test.ts:260` produces **two separate**
messages (one per rule). 635 + 1 + 2 = 638. Both source lines were read directly and confirmed to
contain the described `eslint-disable`/`eslint-disable-next-line` comments naming the now-off
rules. **The reconciliation is real and independently re-derivable, not just narrated.**

### Callers Still Work (focus area 5)

`grep -n "pnpm lint" .husky/pre-push .github/workflows/lint.yml` confirms both still call bare
`pnpm lint` verbatim (`.husky/pre-push:2` and `.github/workflows/lint.yml:17`). `git diff
--name-only` across the three task commits (`8f0d7ff20~1..41591dbee`) does not list either path.
`pnpm lint` at HEAD still runs and reports both scopes (orchestrator pre-verified exit 0). Given
`lint` now delegates to `meta/lintScoped.cjs` which runs both scopes unconditionally on no
selector, bare `pnpm lint` remains meaningful — it still fails if either half regresses.

### `39-LINT-BASELINE.md` Superseded Marker (focus area 6)

`git diff 8f0d7ff20~1 41591dbee -- .planning/phases/39-.../39-LINT-BASELINE.md` shows a
**pure 9-line insertion** immediately under the `## Task 3: the --max-warnings ratchet` heading —
no deletions, no rewritten numbers. The inserted blockquote states the `4157` ceiling was replaced
by two independent ceilings in `260909-s8x`, that `4157` must not be cited as live, and links to
the new baseline document — while explicitly stating "The record below is left in place,
unmodified, per this document's own convention." The rest of the file (mutation proof, the
`4157` measurement transcript, etc.) is untouched. **Confirmed: additive-only, in place, not a
silent rewrite.**

### `src/` Diff Across the Three Commits (focus area 3)

`git diff --name-only 8f0d7ff20~1 41591dbee -- src/` returns **empty** — checked against the
actual commit range (not the working tree, which could differ if other sessions had touched
`src/` in between; other quick tasks did land commits in this same window, e.g. `07f6ae173`/
`a440a4366`, but their diffs against `src/` were not part of this task's own commit-to-commit
span and don't appear in this task's file list). Additionally verified the Task 1 commit
(`8f0d7ff20~1..8f0d7ff20`) touches only `eslint.config.mjs`, and the Task 3 commit
(`1c1345064..41591dbee`) touches only the two baseline `.md` files — so no `src/` edit is hiding
inside any individual task commit either.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `260909-s8x-LINT-BASELINE.md` | 479 | `FIXME` | ℹ️ Info | Quoting the **pre-existing, untouched** `eslint.config.mjs` FIXME comment in a "what was not done" bullet — not a new debt marker introduced by this task |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` found in any file this task created or modified
(`meta/lintScoped.cjs`, `package.json`, `.gitignore` checked directly).

### Requirements Coverage

`QUICK-260909-s8x` does not appear in `.planning/REQUIREMENTS.md` — expected, as this is a quick
task (not a roadmap phase) and quick tasks are not required to have a REQUIREMENTS.md entry.

### Human Verification Required

None. This is a policy/tooling change fully verifiable by direct code reading, git history
inspection, and command re-execution — no UI, no visual, no real-time, no external-service
surface.

## Gaps Summary

None. All 12 must-haves truths, all 5 required artifacts, and all 4 key links verified directly
against the codebase (not solely via SUMMARY/BASELINE narrative). The two most narratively
elaborate claims — the `minFiles` floor's correctness and the 638 count's provenance — were both
independently re-derived from source and re-run against the actual files rather than accepted from
the transcript, and both held up exactly as claimed.

---
_Verified: 2026-09-09_
_Verifier: Claude (gsd-verifier)_
