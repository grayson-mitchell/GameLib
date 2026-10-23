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
