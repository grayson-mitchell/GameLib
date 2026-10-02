---
created: 2026-10-02T00:00:00.000Z
title: "genI18nGateScope is RED on 10 pre-existing drifted files — committed i18nForkTouchedFiles.json is 214, the LIVE derivation is 224, and three pins still say 215"
area: i18n
severity: medium
platform: any
ready: code
found_by: "Quick task 261002-hx0 orchestrator verification (the Meta project was not in that plan's verify set and was only run afterwards)"
source: ".planning/quick/261002-hx0-move-the-library-top-line-into-the-tier-/261002-hx0-SUMMARY.md"
files:
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
---

## What is red

`npx jest --selectProjects Meta` → **1 suite / 4 tests failed, 45 suites / 1341 tests passed**
(`meta/__tests__/genI18nGateScope.test.ts`). All four failures are the same single fact seen
from four angles: the committed `meta/i18nForkTouchedFiles.json` has **214** entries, the LIVE
git derivation produces **224**, and three assertions still pin **215**.

- `A0 fixture sanity` — `expect(freshSnapshot().files.length).toBe(215)`
- `A3 NON-VACUITY / POSITIVE CONTROL` — `expect(rewritten.files.length).toBe(215)`
- `A4 BOOTSTRAP` — `expect(...files.length).toBe(215)`
- `A-17 ANTI-ROT` — committed snapshot equals the live git derivation

## The 10 files, measured

`pnpm gen-i18n-gate-scope` rewrites the snapshot from live git. Diffing its output against the
committed file and then asking `git log 83497724a..HEAD -- <path>` for each one separates the
causes cleanly — **exactly 1 of the 11 added paths was touched by the 2026-10-02 session, and 10
were not**:

```
src/frontend/blankRenderProbe.ts
src/frontend/components/UI/LanguageSelector/translationIssue.ts
src/frontend/helpers/gamepadHoverSeed.ts
src/frontend/muiTheme.ts
src/frontend/screens/ConsoleMode/hooks.ts
src/frontend/screens/Library/components/GameCard/cardVisibility.ts
src/frontend/screens/Library/components/InstallModal/diskSpaceLabels.ts
src/frontend/screens/Library/steamLibraryVisibility.ts
src/frontend/screens/Settings/components/AlternativeExe.tsx
src/frontend/screens/WineManager/components/WineManagerSettingsModal.tsx
```

The eleventh, `screens/Library/components/AddGameButton/index.tsx`, **was** made fork-touched by
that session and is already handled: added to the committed snapshot and to
`DECLARED_UNSCANNED_DEBT` in the same commit that files this todo.

## Why it is NOT simply "run the generator"

`pnpm gen-i18n-scope:rewrite` is refused by design on a hand-curated file, and the plain
`pnpm gen-i18n-gate-scope` rewrites `i18nForkTouchedFiles.json` **wholesale** — which is what
makes this a real task rather than a one-liner. Regenerating pulls all 10 files in at once, and
each one then becomes fork-touched-but-unscanned, so the `A-03 RATCHET`
(`expect(unscanned.sort()).toEqual([...DECLARED_UNSCANNED_DEBT].sort())`) fails by name until
`DECLARED_UNSCANNED_DEBT` grows by the same 10 entries. This was tried during 261002-hx0 and
**backed out** precisely because it traded 2 pre-existing failures for 5 and dragged unrelated
debt into a UI commit.

The real decision is per-file and is NOT mechanical: each of the 10 either belongs in the
hand-curated `i18nGateScope.json` (so the hardcoded-string gate actually scans it) or in
`DECLARED_UNSCANNED_DEBT` (declared, accepted debt). Only a human reading each file can say
which. `WineManagerSettingsModal.tsx` and `AlternativeExe.tsx` are user-facing settings surfaces
and are the two most likely to deserve real scope rather than declared debt.

## Fix shape

1. Run `pnpm gen-i18n-gate-scope` to refresh `meta/i18nForkTouchedFiles.json` (224).
2. Triage each of the 10 — real scope in `i18nGateScope.json`, or an entry in
   `DECLARED_UNSCANNED_DEBT`. Record the reason per file.
3. Move the three `215` pins to `224`, and the scope pin if step 2 adds to `i18nGateScope.json`.
4. Append to that test's in-file maintenance ledger (the dated comment block around :773-835),
   which is the established convention for every previous count change.
5. Re-run `npx jest --selectProjects Meta` and expect 46/46 suites green.

## Trap worth keeping

A-17's own test name claims the committed snapshot "equals the LIVE git derivation", so it reads
like a staleness detector that regenerating must satisfy. It is — but the ratchet beside it
means satisfying A-17 alone turns `A-03` red instead. Both have to move together or the suite
just fails somewhere else; that is the exact mistake made and reverted during 261002-hx0.
