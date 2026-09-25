---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
verified: 2026-09-25T00:00:00Z
status: gaps_found
score: 23/24 requirements verified
overrides_applied: 0
human_verification:
  - '43-UAT.md (2026-09-18/19), 11 items, 10 pass / 1 issue'
  - '43-LIVE-GATE.md runs 1-3 (2026-09-11), packaged release builds, hash-verified from DMG'
gaps:
  - id: REQ-43-24
    severity: medium
    summary: 'Second-opener defect FIXED in code 2026-09-25 (`260925-gnp`, `c99fdee43`); awaiting one live confirmation that the embed paints'
    was: 'major — the button was unresponsive in the shipped build: unit-green, live-broken'
    owned_by: '.planning/todos/pending/2026-09-25-humble-keys-gog-keyless-claim-button-opens-an-embed-with-no-host-lifecycle.md'
    live_check: '/store-page?store-url=https%3A%2F%2Fwww.humblebundle.com%2Fhome%2Fkeys — needs no gog_keyless entitlement'
---

# Phase 43 Verification Report

**Phase goal:** replace the three Humble Keys tabs (`Keys waiting` / `Giftable spares` /
`All keys`) with ONE unified list — search, sort, a `Redeemable keys only` filter, a column-header
row, and a three-column row whose `KEY` column is driven by per-row state rather than by which tab
the key sits in.

**Verified:** 2026-09-25 · **Status:** `gaps_found` — 23 of 24 requirements verified, one failed.

## Why this report exists now, two weeks after the last plan

Plan 43-10 ran the REQ-43-19 live gate on 2026-09-11 and returned **FAIL**, and `ROADMAP.md`
recorded "**Phase 43 does NOT close on this verdict.**" That was correct on the day. It has since
gone stale and nobody re-read it: every FAIL that verdict named has been disposed, and no
verification was ever written. This report closes that hole and replaces the stale blocker with a
measured one.

## The goal is achieved

The three tabs are gone (`43-08` deleted the four tab-scoped files; `App.tsx:324-333` redirects
`/humble-keys/{waiting,spares,all}` to `/humble-keys`), and the tab predicates are per-row state
in the `KEY` column. `HumbleKeyGroup`, `groupAndSortKeys`, `GROUP_ORDER`, `byExpiringSoonest` and
`partitionWaitingByUrgency` return **zero code hits** across `src/` and `meta/` — the only three
surviving `HumbleKeyGroup` strings are historical comments in
`meta/hardcodedStringGate.ts:1243,1253` and `Keys/index.css:169`, not references.

## Evidence by requirement

Measured 2026-09-25 on `bbb493c50`, not transcribed from plan summaries.

| Requirements                                                                       | How verified                                                          | Result                                                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| REQ-43-01..04, -06, -08..17, -20, -21                                              | Frontend + Common jest, 8 suites                                       | **205/205 pass**. Each ID appears by name in a test or its comment       |
| REQ-43-05, -07                                                                     | `src/backend/humble/__tests__/viewFilters.test.ts`                     | **61/61 pass**. `compareWaiting` exported at `viewFilters.ts:51`         |
| REQ-43-18                                                                          | source census (above) + `pnpm codecheck`                               | symbols gone; `GENERIC_KEY_PLATFORM`/`STATE_LABEL_KEYS` resolve; exit 0  |
| REQ-43-19                                                                          | live gate only — no jsdom substitute exists                            | see below                                                               |
| REQ-43-22                                                                          | source census over both gate artifacts                                 | neither `i18nGateScope.json` nor `i18nForkTouchedFiles.json` lists them  |
| REQ-43-23                                                                          | `meta/hardcodedStringGate.ts` CI gate                                  | **155/155 pass**                                                        |
| REQ-43-24                                                                          | unit tests + live UAT                                                  | **FAILED live — see Gap 1**                                             |

### REQ-43-19 — VERIFIED, with three sub-checks never attemptable

The live gate's four `**FAIL**` rows are all discharged, each by a later measurement rather than
by argument:

| original FAIL                             | discharged by                                                   |
| ----------------------------------------- | --------------------------------------------------------------- |
| GOG logo ignores `fill: currentColor`     | run 2, then run 3 — GOG ink `[57,59,64]` == `--text-secondary`   |
| separator invisible in light themes       | runs 2+3 — four theme backgrounds, deltas 29/30/31/38 vs `>=3`   |
| item 3 title spread 216.5 then 84.0       | run 3 — 15 rows, two themes, three TYPE shapes, total spread 1.0 |
| `GAME` header label 5.5px left of titles  | `43-UAT.md` item 9 — header 340.0 vs titles 340.0-341.0          |

**Not verified, and named rather than absorbed:** three sub-checks were NOT ATTEMPTABLE because
this library contains no row of the required shape — the Pitfall-C disabled caption
(`keyindexResolved === false`), the UNPICKED row, and the 2-line wrapped-title row (the longest
title occupies 475.5 of a 768.0 track, so no wrap ever triggered). These are gaps in the
**sample**, not in the implementation, and no amount of re-running on this machine closes them.

## Gap 1 — REQ-43-24, `major`

**`REQ-43-24` is ticked `[x]` in `REQUIREMENTS.md` and the feature does not work.**

Its own requirement text says "live embed-compositing/close-UX verification deferred to plan
`43-10`". **Plan 43-10 never covered it** — that gate scored column geometry and the row
separator, nothing about the embed. So the tick rests on 83/83 unit tests that pin the button's
*label*, and nothing ever exercised the click. `43-UAT.md` item 8 then did, on a packaged release
build, and the operator's verdict was: "oh that is broken, button is unresponsive".

Diagnosis and the correction to the UAT's own lead are in the owning todo
(`2026-09-25-humble-keys-gog-keyless-claim-button-opens-an-embed-with-no-host-lifecycle.md`),
filed by quick task `260925-e4d`. The short form: `openHumbleKeysEmbed()` opens the singleton
embed from a row with **no host route mounted and no slot**, so nothing afterwards sizes, shows or
scroll-syncs the native subview it created.

**This gap cannot be closed on this machine.** `gog_keyless` is the unlinked-GOG-account shape;
the operator linked GOG on 2026-09-22, so the branch is now unreachable here. It still ships for
every unlinked user. Do not read "cannot reproduce" as "fixed".

### ✅ Update 2026-09-25 — fixed in code, and the "cannot be closed here" claim above was WRONG

Quick task `260925-gnp` (`c99fdee43`) repaired it: `openHumbleKeysEmbed()` deleted, the claim
routed through `/store-page?store-url=` so `useStoreEmbedHost` owns the embed lifetime, Humble
added to `STORE_EMBED_ORIGINS` (without which the deep-link gate punts to the system browser).
Four tests now invoke the handler — the original hole was eight tests pinning the button's *label*
and none invoking it — plus a `storeEmbedSingleOpener` structural gate proven non-vacuous by
revert-to-red. 1306 tests / 44 suites green, `codecheck` and `lint` exit 0, both ceilings PASS.

**Correcting the paragraph immediately above, which this fix disproved:** it said the gap "cannot
be closed on this machine" because the *button* is unreachable without an unlinked GOG account.
True of the button, **false of the destination.** Navigating a running app to
`/store-page?store-url=https%3A%2F%2Fwww.humblebundle.com%2Fhome%2Fkeys` exercises the origin
entry, the deep-link gate and the host lifecycle — every part the defect broke — with no
entitlement of any kind. The unreachable-repro framing had quietly widened from "the button" to
"the whole defect", and it was wrong for six days.

Severity `major` → `medium`, `ready: code` → `live-gate`. Phase 43 still reads `gaps_found` until
that one observation is taken: the fix is proven by tests, not by anyone seeing it paint.

## Second open item, not a requirement gap

A REVEALED `gog_keyless` row should render "Finish activation" into the claim wizard for an
entitlement with no code to finish — inferred from the branch ordering at
`HumbleKeyRow/index.tsx:496` preceding `:533`, confirmed statically, **never observed on screen**.
Owned by `2026-09-25-humble-keys-revealed-gog-keyless-row-renders-a-finish-activation-dead-end.md`
(`ready: live-gate`). It post-dates every plan in this phase and is not scored against any
REQ-43 ID.

## What "passed" would have required, and why this says `gaps_found`

23/24 with a working screen is a good phase. Recording it as `passed` would require either
un-ticking REQ-43-24 (losing the fact that it shipped) or calling a button the operator watched do
nothing "verified". Neither is true, so the status carries the gap and the gap carries an owner.
