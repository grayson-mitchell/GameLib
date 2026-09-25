---
created: 2026-09-25T00:00:00.000Z
title: 'A REVEALED `gog_keyless` row renders "Finish activation" into the claim wizard — a keyless entitlement has no code to finish'
area: humble/keys-screen
severity: medium
platform: any
ready: live-gate # MOOT — the gate was CANCELLED, not performed; see the section below
status: RESOLVED
found_by: 'Inferred from code in `43-PROBE-D-43-11.md` (2026-09-22), never observed on screen — the operator had navigated away. Branch ordering independently re-confirmed by quick-260925-e4d.'
files:
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx
---

## The inference, and what part of it is measured

**Measured (static, re-confirmed 2026-09-25):** `HumbleKeyRow`'s KEY-column scenario chain tests
`claimAction.revealedAt !== null || humbleKey.state === 'REVEALED'` at `index.tsx:496`, **before**
the `claimAction.keyindexResolved` branch at `:533` that plan 43-09 wired `gog_keyless` into
(`:537`, `onClick={isGogKeyless ? openHumbleKeysEmbed : claimAction.onClaim}`). The ordering is
not in doubt.

**Measured (live, 2026-09-22 sync):** Racine (`gog_keyless`, `machineName: racine_gog`) is now
`state: REVEALED` — Humble's auto-claim propagated when the operator linked their GOG account, and
the order now lists `redeemed_key_val` in its `candidateFields`.

**Inferred, NOT observed:** Racine therefore takes the `:496` branch and renders **"Finish
activation"** (`:528`, `humbleKeys.finishActivation`), whose `onFinish` is
`openWizard(key, 'finish')` (`Keys/index.tsx:435`) — the claim wizard, for an entitlement that
has no code to reveal and nothing for a user to finish. Humble already granted it to the linked
GOG account server-side.

## Why the branch is not obviously wrong — the comment at `:497-504` is load-bearing

Do not "fix" this by reordering the chain without reading that comment first. The
`state === 'REVEALED'` test exists deliberately (CR-01, 14-REVIEW re-review): a key revealed on
Humble's **website** carries `redeemed_key_val` and so classifies `REVEALED`, but has no local
`humbleRevealedStore` record, so `revealedAt` is null. Rendering "Claim" for *that* key is itself a
dead end, because the backend refuses to reveal any non-`UNREVEALED` key (D-66, never-re-reveal).

So the branch is right for keyed platforms and wrong for the keyless one. The fix is a
`gog_keyless` exemption inside or ahead of that branch — not a reordering that would regress the
website-revealed case CR-01 was written for.

## ✅ FIXED IN CODE 2026-09-25 (quick `260925-j58`) — and the live gate was CANCELLED, not deferred

**The three-step live check this todo originally prescribed has been deleted rather than ticked,
because it will never be performed and a dead prescription left standing reads as outstanding
work.** It said: open Humble Keys on a synced build, find Racine, record its KEY column, click the
button, and record whether the wizard errors, hangs, or shows a usable "already claimed" state —
with step 3 deciding severity.

**Why it was cancelled (operator decision, 2026-09-25).** Its only output was "fix or don't". The
corrective shipped here is correct under **every** branch of that unknown:

- wizard errors → dead end, fix required;
- wizard hangs → dead end, fix required;
- wizard shows a usable already-claimed state → the button is still a code-assuming affordance
  offered against an entitlement with no code, and the row's KEY cell still says nothing true
  about where the game actually landed.

Since no outcome changes the action, the unknown was not worth buying a live run for. No UAT item
was minted. The `ready: live-gate` value in the frontmatter above is retained for provenance only
(the CI gate that reads it is `pending/`-only) — **nothing in this file argues for a live run any
more.**

## What shipped

| Piece | Where |
|-------|-------|
| `isKeylessKeyType(keyType)` — closed literal set of `gog_keyless` / `epic_keyless` / `origin_keyless`, never a suffix match | `src/common/humble/keyTypePresentation.ts` |
| The exemption: a REVEALED keyless row renders a non-interactive `humbleKeyClaimAnnotation` instead of the Finish-activation button | `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` |
| New string `humbleKeys.keylessClaimed` = `Claimed on {{store}} — no key needed`, filled in all 49 locales | `public/locales/*/gamelib.json` |
| Four component tests: `gog_keyless` and `epic_keyless` exemptions, plus CR-01 (`gog` still "Finish activation") and 260823-op3 (`steam` still "Activate") regression guards | `.../HumbleKeyRow/__tests__/index.test.tsx` |
| Closed-set proof `isKeylessKeyType('foo_keyless') === false` — the one assertion that tells a literal set apart from a suffix match | `src/backend/humble/__tests__/keyTypePresentation.test.ts` |

**The annotation is not decoration.** For a keyless entitlement `claimAction.revealedAt` is always
null (no local reveal record can exist for something that was never revealed), so the sibling
arm's "Revealed {date}" text renders nothing. Hiding only the button would have left an EMPTY KEY
cell and deleted the row's only information — which is why this branch carries its own copy.

The CR-01 comment and the `state === 'REVEALED'` test were **reindented, never reordered**; the
keyed path comes out byte-identical under `git diff -w`.

## Deliberately NOT fixed here — tracked separately

Two sibling sites still treat only `gog_keyless` as special, so `epic_keyless` and
`origin_keyless` remain exposed there. Filed as
`[[2026-09-25-humble-keys-two-sites-still-special-case-only-gog-keyless]]` rather than widened
into this change.

## Scope note — this is the other half of a pair

Racine has **left** the set that the sibling defect needs (`gog_keyless` AND not-`REVEALED` AND
`keyindexResolved`), which is precisely why it landed here instead. See
`[[2026-09-25-humble-keys-gog-keyless-claim-button-opens-an-embed-with-no-host-lifecycle]]`.
One entitlement, two branches, two different defects — do not merge them.

## Incidental trap recorded by the same probe, worth not re-deriving

**The dev build cannot sync Humble, and it is a credential-store split, not a dead button.** Under
`pnpm tauri:dev` (`GAMELIB_DEV_SECRET_VAULT=1`), eight sync clicks produced eight
`[dev-secret-vault] read key=sessionCookie` lines and **no** `Humble sync finished` line at all.
The release build reads `SidecarKeyringSlotStore(humble-session)` (real Keychain) and synced first
try. The click lands, the backend runs, and the sync dies without logging a failure — so
"the sync button is broken" is a reasonable first reading and it is wrong.
