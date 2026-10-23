---
created: 2026-10-23
title: "Confirm before installing a title whose CrossOver rating is below 4 of 5"
source: operator request during phase 51 gap closure (ELEX/Hoard 'does not run' discussion)
area: install-flow
files:
  - src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx
  - src/frontend/screens/Library/components/InstallModal/SteamDialog
  - src/backend/crossover_index/crossoverRatingMap.ts
  - public/locales/en/gamelib.json
severity: medium
platform: any
ready: human
---

Operator, 2026-10-23: "when you install a game that is not a 4-5 crossover emulation then you
should get a warning noting the rating and confirming you still want to install".

Motivation: titles like Hoard (63000) and ELEX (411300) install fine and then fail to run under
CrossOver/Wine. The rating is the earliest signal that a multi-GB download is likely wasted, and it
is available before the download starts. Same principle as the D-51-08 amendment (quick
261023-og0): tell the user up front rather than quietly working around it later.

What already exists:

- `crossoverRatings` (frontend global state, `Record<app_name, number | null>`, built once by
  `buildCrossoverRatingMap`) holds a 1-5 CodeWeavers rating per library title on macOS. A number
  means matched, `null` means looked up with no record, and an absent key means not eligible.
- `WineSelector/index.tsx:181-186` already shows a passive `isKnownNotToWork` hint for Steam on
  darwin when the rating is <= 2. The comment above it says it "must NEVER be wired into the
  Install button's `disabled` prop or otherwise gate/delay the install". This request deliberately
  reverses that for ratings below 4 (a confirm step, not a disabled button), so record the reversal
  where that comment lives.

Decisions needed before coding (hence `ready: human`):

1. Threshold: confirm for ratings 1-3 (the request reads as "not 4-5"). Should the existing <= 2
   wording stay stronger than the 3 wording?
2. Unknown rating (`null`, no CodeWeavers record): warn, or stay silent? The old comment treats
   unknown as "NOT evidence of a problem".
3. Scope: Steam only (where the existing hint lives), or every store with a Windows-only title on
   macOS (Epic/GOG/Amazon through CrossOver)?
4. Should a later "don't ask again for this game" persist, and should the census/known-bad list
   feed the same dialog (e.g. a `does-not-run` known-bad title shows its reason too)?

## Closed 2026-10-24: confirm before installing a title rated below 4 of 5

Done in quick task 261024-ho4.

- Ratings 1-3 open a confirm dialog that states the rating ("rated N of 5"). Ratings <= 2 use the
  stronger "known not to work" wording; a 3 uses the milder "may have problems" wording.
  Ratings 4-5 install with no prompt.
- A `null` rating (looked up, no CodeWeavers record) shows a passive "no CrossOver rating found"
  notice in WineSelector and no confirm. An absent key shows nothing.
- Covers all four stores through the Steam, Download (Epic/GOG/Amazon) and ThirdParty install
  dialogs, for Windows titles installed via CrossOver on macOS. The Install button is never
  disabled; Cancel leaves the install modal open and starts nothing.
- No "don't ask again" persistence, and known-bad list reasons are not fed into the dialog.
- Shared logic lives in `src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts`.
  The WineSelector comment that forbade gating or delaying the install was rewritten to record this
  deliberate reversal (the `disabled` prohibition still holds).
- Live verification on the Mac is still owed: ELEX 411300 and Hoard 63000 should show the confirm,
  Cancel should leave the modal open, and Install anyway should proceed as before.
