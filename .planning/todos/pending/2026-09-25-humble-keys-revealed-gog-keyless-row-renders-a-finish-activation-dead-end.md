---
created: 2026-09-25T00:00:00.000Z
title: 'A REVEALED `gog_keyless` row renders "Finish activation" into the claim wizard — a keyless entitlement has no code to finish'
area: humble/keys-screen
severity: medium
platform: any
ready: live-gate
status: OPEN
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

## What to check (one look, no build required beyond a running app)

1. Open Humble Keys on a build with a synced library. Find **Racine**.
2. Record what its KEY column actually renders. Prediction: a single "Finish activation" button.
3. Click it. Record what the wizard shows for an entitlement with no code — an error, an empty
   code field, a spinner, or a usable "already claimed" state.

Outcome 3 decides severity. If the wizard states plainly that the game is already in the GOG
library, this is cosmetic copy at worst. If it errors or hangs, it is a real dead end.

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
