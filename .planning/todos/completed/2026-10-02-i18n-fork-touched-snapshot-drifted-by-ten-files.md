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

## Resolution (2026-10-05)

Followed this todo's own fix shape; both artifacts and the ratchet moved together.

**Precondition.** The worktree was a shallow clone, so `package.json`'s `upstream.baseCommit`
(`b5b5cad3f`) was not in the object store and the live A-17 block `describe.skip`ped. A depth-1
fetch of that one commit from `origin` made the live derivation runnable (it adds one shallow
boundary to the shared object store, nothing else).

**Measured, then changed.**

- `pnpm gen-i18n-gate-scope`: 214 → **225**, 11 additions, 0 removals — exactly the ten files
  listed above plus `src/frontend/screens/Humble/Keys/syncAge.ts`, created earlier the same
  session by the humble-last-synced fix. `generatedAt` and the `purpose` line were restored to
  the original bytes so only `files` moved (this run did re-escape `purpose`'s `—`, contrary
  to the ledger's 260921-saw measurement — recorded in the ledger).
- Audit-mode `scanScope({ extraFiles: [all 11] })` **before** any promotion: 1 violation total,
  `translationIssue.ts:20` `'translation_problem.yaml'`.
- Triage (reasons in the test's ledger and in the note above `DECLARED_UNSCANNED_DEBT`):
  - **Scope (9, all 0 violations):** `AlternativeExe.tsx`, `WineManagerSettingsModal.tsx` (the two
    named here as likely scope), `diskSpaceLabels.ts`, `cardVisibility.ts`,
    `steamLibraryVisibility.ts`, `ConsoleMode/hooks.ts`, `syncAge.ts`, `muiTheme.ts`,
    `gamepadHoverSeed.ts`. `i18nGateScope.json` 173 → **182**, hand-inserted in sorted order,
    `generatedBy`/`generatedAt` untouched.
  - **Debt (2):** `translationIssue.ts` (its one hit is a GitHub issue-template filename used as a
    query value, not copy — promoting it would mean editing product code to silence a false
    positive); `blankRenderProbe.ts` (scans 0, but it carries a whole-file `i18n-gate-exempt:`
    marker, and a first attempt that promoted it turned `hardcodedStringGate`'s T-34.8-30
    "exactly one file is comment-exempted" pin red — that is that pin's decision, not a snapshot
    refresh's). `DECLARED_UNSCANNED_DEBT` 41 → **43**.
- Pins: A0 `173/214/215` → `182/225/225`; A2's title `174 -> 215` → `182 -> 225`; A3/A4 `215` →
  `225`. Dated entries appended to the maintenance ledger and the debt-array header.

**RED.** Before: `--selectProjects Meta` had A0/A3/A4 failing (`Expected: 215, Received: 214`),
with A-17 skipped. With the base commit reachable and the OLD snapshot restored, `A-17 ANTI-ROT:
the committed ... equals the LIVE git derivation` fails.

**GREEN.** `genI18nGateScope.test.ts` and `hardcodedStringGate.test.ts` together: 183 passed,
1 skipped (the pre-existing `it.skip` WR-17 test), 0 failed — with the live A-17 block running,
not skipped. Prettier clean on the three touched `meta/` files.

**Not fixed here / still true.** Other `--selectProjects Meta` failures seen on this tree are not
this todo's: `lintTranslations` / presence baseline (336 entries for the new
`box.protocol.launch.*` keys from `91d4756`), `machineFillGamelib` `pluralCategoriesFor`
(ICU-dependent) and `downloadHelperBinaries` (environmental). In CI the live A-17 block still
skips (shallow checkout), so the next drift will again surface only on a local full-history run.
