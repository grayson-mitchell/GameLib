# Deferred Items

## `pnpm lint` (full repo run) crashes on `spike/crossover-compat-lookup.mjs`

**Status:** Pre-existing, out of scope for this task (SCOPE BOUNDARY rule).

Running `pnpm lint` (eslint --cache .) across the whole repo throws:

```
Error: Error while loading rule '@typescript-eslint/await-thenable': You have used
a rule which requires type information, but don't have parserOptions set to generate
type information for this file.
Parser: typescript-eslint/parser
Occurred while linting spike/crossover-compat-lookup.mjs
```

**Cause:** `spike/crossover-compat-lookup.mjs` was added in commit `c0fa3576`
(quick task 260710-nwb, a throwaway CrossOver-compatibility-lookup spike script,
explicitly marked "not app code; lives in `spike/`, delete once acted on" in
STATE.md). The eslint flat config does not exclude `spike/**` or `.mjs` files from
typed-linting the way it already excludes `**/*.cjs` (fixed for a similar issue in
quick task 260630-uod). This is unrelated to the current plan (260710-qyc), which
only touches `src/frontend/screens/Game/GamePage/index.tsx`,
`src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx`, and
`public/locales/en/gamepage.json`.

**Verification that this task's files are clean:** ran `pnpm exec eslint` directly
against the two touched `.tsx` files — 0 errors on both (index.tsx carries 12
pre-existing warnings unrelated to the lines this plan touched; AppleWikiInfo.tsx
is fully clean with 0 errors/warnings).

**Recommended follow-up:** either delete `spike/` (per its own "delete once acted
on" note) or add a `spike/**` / `**/*.mjs` ignore entry to the eslint flat config,
mirroring the `**/*.cjs` fix from 260630-uod.
