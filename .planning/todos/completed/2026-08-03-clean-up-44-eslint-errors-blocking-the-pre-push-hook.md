---
created: 2026-08-03T05:51:50.702Z
revised: 2026-09-01
title: "Unblock the pre-push hook — eslint half DONE, prettier partly fixed, i18n still red"
area: tooling
status: RESOLVED
severity: minor
files:
  - .prettierignore
  - src/preload/.prettierrc
  - .editorconfig
---

## Original problem (2026-08-03)

The pre-push hook failed on 44 pre-existing eslint errors, so every push needed
`--no-verify`. The hook is:

```bash
pnpm codecheck && pnpm lint && pnpm prettier && pnpm i18n --fail-on-update
```

## Measured state 2026-08-21 (all four gates run in place, on b4725bb99)

| gate | command | result |
|---|---|---|
| codecheck | `tsc --noEmit` | **PASS** |
| lint | `eslint --cache .` | **PASS** — 0 errors, 3939 warnings |
| prettier | `prettier --check .` | **FAIL** — 280 files |
| i18n | `i18next --silent --fail-on-update` | **FAIL** — 60 added / 63 unreferenced keys |

### 1. eslint — RESOLVED, close this part

0 errors repo-wide, confirmed with `eslint -f json` filtered on `severity === 2`
(the only unambiguous probe — plain output interleaves warnings with errors).
The last 9 went in `acab0e0b4`. The 44 in the original breakdown are gone; the
feared `no-require-imports` conversions never had to happen.

### 2. prettier — HALF FIXED in `bf308698b`

The gate was traversing generated output: 2791 files under
`src-tauri/target/.fingerprint/`, plus `.planning/` (1969) and `.claude/` (66).
4826 of 5110 flagged files were not source. It took **11m23s**.
`.prettierignore` now excludes `src-tauri/target`, `src-tauri/gen`, `.planning`,
`.claude`, `graphify-out` → **9.6s, 280 files, all genuine**.

**Still open:** those 280 files are really unformatted. 253 are under `src/`
(134 backend, 101 frontend, 14 preload, 4 common); the rest are `meta/` (20),
`spike/` (2), `scripts/`, `public/`, `README.md`, `CLAUDE.md`, `.github/`.
Measured in place: **+4287 / −3041 across 253 files**, concentrated in test
files (`releaseWorkflow.test.ts` +415/−358, `tauriConf.test.ts` +353/−303).

Do this as **one pure-formatting commit with no behavioural change** (see
`260821-ooq/deferred-items.md`). Two known landmines, neither blocking:
- `src/preload/.prettierrc` sets `printWidth: 120`; root `.prettierrc.json` sets
  none, so root defaults to 80. `--write` honours both, so the gate goes green
  either way — but preload stays formatted differently from everything else.
  Decide whether that override is wanted before or after, not during.
- `.editorconfig`'s `[{*.ts, *.tsx, *.js}]` has a space after each comma.
  EditorConfig treats brace alternatives literally, so ` *.tsx` and ` *.js`
  match nothing — that section only ever applies to `*.ts`.

**Do NOT measure prettier drift on a temp copy.** Tried 2026-08-21: config
resolution differs outside the repo and `--write` on a copy reported *zero*
changes against a tree with 253 dirty files. Measure in place and
`git restore` after (that fires the failing post-checkout hook — noisy, ~30s,
harmless).

Unrelated pre-existing oddity found while measuring:
`src/backend/crossover_index/__tests__/normalize.test.ts` contains a literal NUL
byte at line 82 — a deliberate adversarial-input fixture for `normalize()`. Git
therefore renders the whole file as binary in every diff. Legitimate; noted only
so nobody "fixes" it.

### 3. i18n — STILL RED, and this is the real remaining blocker

`translation` +55/57 unreferenced, `gamepage` +4/4, `gamelib` 0/2, `login` +1/0.
Exits 1 without writing anything (working tree verified clean afterwards).

**Do not just run `pnpm i18n` and commit the result.** The parser logged
**23 × "Key is not a string literal"**, so it cannot see dynamically-built keys —
some of those 63 "unreferenced" keys are live, and letting the extractor drop
them would break rendering silently while every gate stays green. This is the
same drift that blocks [[pull-upstream-i18n-catalog-refreshes]]; triage belongs
there, once, not in two places.

## Remaining steps

1. One pure-formatting commit for the 280 prettier files (decision: sweep now, or
   after the fork PR merges — it churns `git blame` across 253 source files).
2. Triage the i18n drift under [[pull-upstream-i18n-catalog-refreshes]].
3. Then confirm `git push` passes the hook without `--no-verify`.


## RESOLVED 2026-09-01 — quick task `260901-ud5`

All four `.husky/pre-push` legs are green; `git push` no longer needs `--no-verify`.

Re-measured at `f04dcbb66` before starting — **both numbers in this todo were stale**:
lint had regressed to **12 errors** (this todo and the
`prettier-gate-is-red-repo-wide` record both said 0/GREEN), and prettier was
**46 files**, not the 280 recorded above.

| leg | before | after |
|---|---|---|
| codecheck | PASS | PASS |
| lint | 12 errors | **0 errors** (4195 warnings, not a gate) |
| prettier | 46 files | **clean** |
| i18n | 78 added keys | **0 added** |

Commits: `c84546d7b` (eslint), `267375a7c` (prettier sweep), `c2f567064` (i18n),
`9091fb092` (D-05 fixpoint correction).

**The step-1 warning above about `git blame` churn was moot** — the sweep was 46 files,
not 253, because `.prettierignore` fixes landed in the interim.

**Step 2 (i18n triage) was completed under its own todo**, which is also now closed.

**A finding this todo's section 3 got backwards:** it warned that letting the extractor
drop dynamically-built keys would break rendering silently. Correct in principle, but the
actual hazard turned out to be the opposite direction — `pnpm i18n --fail-on-update`
*writes* when it passes (the "writes nothing" note was measured while it was failing and
exiting early), which silently violated D-05 on every run until `9091fb092` normalised the
key order to the parser's fixpoint.

Both config landmines recorded above were deliberately left alone and remain open as
standalone decisions: `src/preload/.prettierrc`'s `printWidth: 120` (no preload non-test
file was in the 46, so the sweep did not widen its blast radius) and `.editorconfig`'s
`[{*.ts, *.tsx, *.js}]` space-after-comma bug.

The NUL byte in `crossover_index/__tests__/normalize.test.ts` is still there and still
legitimate — nobody "fixed" it.
