# Deferred Items — Phase 16

## `pnpm lint` crashes on `spike/crossover-compat-lookup.mjs` (pre-existing, out of scope)

`pnpm lint` (the package.json script) always runs `eslint --cache .` against the
whole repo regardless of any path args passed to it, and crashes with:

```
Error while loading rule '@typescript-eslint/await-thenable': You have used a
rule which requires type information, but don't have parserOptions set to
generate type information for this file.
Occurred while linting spike/crossover-compat-lookup.mjs
```

This is pre-existing repo debt in the eslint flat config (`.mjs` files under
`spike/` are not excluded from typed-linting, unlike `**/*.cjs` which was
already excluded per quick task 260630-uod). It is unrelated to and not caused
by plan 16-01's changes. Verified clean instead via
`npx eslint --cache src/backend/wiki_game_info/codeweavers
src/backend/wiki_game_info/wiki_game_info.ts src/common/types.ts` (0 errors).

Not fixed here (out-of-scope per executor scope-boundary rules). Two possible
follow-ups for a future quick task: (a) add `spike/**/*.mjs` to the eslint
flat-config ignores (mirroring the existing `.cjs` exclusion), or (b) delete
`spike/` entirely once this phase ships (the spike's own FINDINGS.md already
flags it as throwaway/deletable).
