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

## What this does NOT do

Phase 43 does not close on this. Still outstanding, as named in the session that spawned this task:

1. The `ROADMAP.md:5289` entry still asserts "Phase 43 does NOT close on this verdict" from
   43-10's live-gate FAIL, but every FAIL that verdict named has since been disposed — all four
   43-filed defect todos are in `todos/completed/`, and the last surviving `**FAIL**` (the `GAME`
   header 5.5px offset) was re-measured PASS in `43-UAT.md` item 9. That entry is stale.
2. There is no `43-VERIFICATION.md`. The phase has never been formally verified or closed.
