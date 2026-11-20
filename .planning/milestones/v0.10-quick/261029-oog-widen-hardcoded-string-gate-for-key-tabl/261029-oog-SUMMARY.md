---
status: complete
quick: 261029-oog
commits: [055761961, 60f7e1935]
---

# Quick 261029-oog: widen hardcoded-string gate, promote six files

Three narrow gate exemptions (bare 3+-segment lowerCamel key path with `key:` slot exclusion; `*ClassName` function class-list return; resolution-based injected `typeof window.api.log*`/`console.*` logger) with 19 positive/negative fixtures. Source refactors: `TGamelibLike` -> `TFunc` in crossoverInstallRisk.ts, `logFallback: typeof window.api.logError` in resolveBootLanguage.ts. Six files promoted into `meta/i18nGateScope.json` (235 -> 241), debt register -6, A0/A2 re-pinned, todo moved to `completed/` with Resolution.

## Deviations

- `isClassNameFunctionReturn` also accepts a concise arrow body (`const rowClassName = () => 'row row--active'`), because the plan's P4 arrow fixture is not a ReturnStatement. Same position, same three-way conjunction.

## Pre-existing failure (not caused by this task)

`genI18nGateScope` "A-17 ANTI-ROT: committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation" fails: the live derivation includes `src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts` (added by concurrent quick 261029-ocq) which is absent from the committed artifact. Out of scope; needs a fork-touched artifact refresh plus scope handling for that file.

## Verification

tsc and tsconfig.meta typecheck clean; hardcodedStringGate (176+2 new), resolveBootLanguage, buttonClassName tests pass; `pnpm planning-gates` 12/12; prettier clean; allowlist/glossary/forkTouched JSON untouched.
