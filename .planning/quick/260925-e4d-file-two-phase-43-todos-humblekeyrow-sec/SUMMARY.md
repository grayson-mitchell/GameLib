---
task: 260925-e4d
title: File the two Phase 43 defects that UAT item 8 and the 2026-09-22 probe left unowned
date: 2026-09-25
status: complete
commits:
  - 8da1eb60a
---

## What was done

Two todos written to `.planning/todos/pending/`, both carrying the three CLAUDE.md triage keys:

| file                                                                              | severity | ready       |
| --------------------------------------------------------------------------------- | -------- | ----------- |
| `2026-09-25-humble-keys-gog-keyless-claim-button-opens-an-embed-with-no-host-lifecycle.md` | major    | `code`      |
| `2026-09-25-humble-keys-revealed-gog-keyless-row-renders-a-finish-activation-dead-end.md`  | medium   | `live-gate` |

Docs only. No source file was touched.

## What this task corrected rather than copied forward

**1. The UAT's root-cause lead was overstated, and the overstatement was load-bearing.**
`43-UAT.md` item 8 says `openHumbleKeysEmbed` "does the exact two things that hook's own header
comment forbids in writing". `useStoreEmbedHost.ts:17-22` forbids fabricating a rect for
`storeEmbedSetBounds`, and names itself the one call site of **that** function. This call site
calls `storeEmbedOpen`, and the row's own in-situ comment (`index.tsx:295-302`) argues that exact
distinction in advance — "a one-shot snapshot, not a continuously-synced rect". Left uncorrected,
someone fixes the arguable half and declares victory. The todo now leads with the non-arguable
half: the embed is opened with **no host route mounted and no slot**, so nothing owns its
geometry, visibility or lifecycle afterward.

**2. The `:496` branch is not simply mis-ordered.** The obvious reading of the probe's inference
is "move the `keyindexResolved` test earlier". That would regress CR-01 (14-REVIEW re-review): the
`state === 'REVEALED'` test exists because a key revealed on Humble's *website* carries
`redeemed_key_val` and classifies `REVEALED` while having no local `revealedAt`, and rendering
"Claim" for it is its own dead end under D-66 never-re-reveal. The fix is a `gog_keyless`
exemption, not a reorder.

**3. The branch ordering was re-confirmed against source**, not taken on the probe's word —
`index.tsx:496` does precede `:533`, and `onFinish` is `openWizard(key, 'finish')`
(`Keys/index.tsx:435`).

## The thing most likely to be re-derived

**The live repro for defect 1 is gone, and it is an account property, not a code property.**
`gog_keyless` is the **unlinked-GOG-account** shape. The operator linked GOG on 2026-09-22; Racine
went `UNREVEALED` → `REVEALED` and a newly purchased GOG title arrived as keyed `gog`. The dead
button's branch needs `gog_keyless` AND not-`REVEALED` AND `keyindexResolved` — no entitlement in
this library satisfies it any more, and none should again. **The defect still ships for every user
whose GOG account is unlinked.** Do not read "cannot reproduce" as "fixed".

## Verification

- `python3 .planning/todos/todo-frontmatter-gate.py` → PASS, 21 pending todos all in vocabulary
- `npx prettier --check` over the three written paths → clean
- `pnpm planning-gates` → 13/13
- Commit `8da1eb60a`, on `main`, **not pushed**

## Phase 43 closure (task extended, same session)

Both follow-ups named above were then done in this task rather than deferred.

**`ROADMAP.md` — superseding note, original verdict preserved verbatim.** The
"Phase 43 does NOT close on this verdict" sentence was correct on 2026-09-11 and went stale unread
for two weeks. All four of that verdict's `**FAIL**` rows are discharged by later **measurement**,
not argument — GOG `currentColor` and the light-theme separator by live-gate runs 2-3 (four theme
backgrounds, seam deltas 29/30/31/38 against `>=3`), item 3's title spread by run 3 (15 rows, two
themes, three TYPE-cell shapes, total spread **1.0** against ±2), and the `GAME` header label by
`43-UAT.md` item 9 (header **340.0** vs titles **340.0-341.0**). All four owning todos sit in
`todos/completed/`.

**`43-VERIFICATION.md` — `status: gaps_found`, 23/24 requirements.** Re-measured on `bbb493c50`,
not transcribed from plan summaries:

| check                                    | result                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| Humble frontend + common jest, 8 suites  | 205/205 pass                                             |
| `viewFilters` unit suite                 | 61/61 pass                                               |
| `meta/hardcodedStringGate.ts` (REQ-43-23)| 155/155 pass                                             |
| `pnpm codecheck`                         | exit 0                                                   |
| deleted-symbol census (REQ-43-18)        | zero code hits; 3 surviving strings are comments         |
| `i18nGateScope`/`i18nForkTouchedFiles`   | neither lists the four deleted files (REQ-43-22)         |

REQ-43-01..23 ticked in `REQUIREMENTS.md`.

**The one gap is REQ-43-24, and it is a ticked box over a broken feature.** Its own requirement
text deferred live verification to plan `43-10` — and **43-10 never covered it**. That gate scored
column geometry and the row separator, nothing about the embed. The tick therefore rested on 83
unit tests pinning the button's *label*, with nothing ever exercising the click, until UAT item 8
exercised it and it did nothing. Left **ticked** with a `⚠️` correction block rather than
un-ticked, so the "it shipped" fact survives alongside the "it does not work" fact.

A second correction went in with it: REQ-43-24's text claims candidate A "was measured dead by a
definitive server-side denial". That is not what was measured — the probe ran with the GOG account
link **absent**, i.e. with no grantee. Candidate A is **moot**, not dead.

**Named rather than absorbed:** three live-gate sub-checks are NOT ATTEMPTABLE because no row of
the required shape exists in this library — the Pitfall-C disabled caption, the UNPICKED row, and
a 2-line wrapped title (the longest title occupies 475.5 of a 768.0 track, so no wrap triggers).
Gaps in the **sample**, not the implementation, and no re-run on this machine closes them.

## Why `gaps_found` and not `passed`

23/24 with a working screen is a good phase. Recording `passed` would need either un-ticking
REQ-43-24 — losing the record that it shipped — or calling a button the operator watched do
nothing "verified". Neither is true, so the status carries the gap and the gap carries an owner.
