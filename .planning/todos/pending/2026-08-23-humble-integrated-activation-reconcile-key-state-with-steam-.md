---
created: 2026-08-23T07:00:48.128Z
title: "Humble integrated activation — reconcile key state with Steam ownership"
area: humble
status: OPEN
severity: minor
files:
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.tsx
  - src/frontend/screens/Humble/Keys/Waiting/index.tsx
  - src/backend/humble/library.ts
  - src/backend/humble/classify.ts
---

## Problem

**Humble key state never reconciles with Steam.** A key the user already
activated on Steam stays `REVEALED` in Humble's data forever — Humble has no
idea it was redeemed — so GameLib keeps presenting it in Keys-waiting with an
actionable **Activate** button. Operator, 2026-08-23: *"humble list does not
sync with steam, most of those have been activated!"*

### Measured on the operator's live library (2026-08-23)

`~/Library/Application Support/gamelib/store_cache/humble_library.json`,
33 orders / 32 keys:

| platform | count |
|---|---|
| steam | 31 |
| generic | 1 |
| gog | 0 |

Of the 31 Steam keys, **20 are `REVEALED`** (revealed at some point, never
marked redeemed in GameLib). Their ownership flags:

| `ownedElsewhere` | `matchConfidence` | count |
|---|---|---|
| true | exact | 13 |
| true | fuzzy | 5 |
| false | none | 2 |

**So the signal already exists.** Phase 12's ownership matching (D-38/D-41)
has already resolved 18 of the 20 as owned on Steam. Nothing consumes that to
settle the key's state — the row offers Activate regardless, and only the
wizard shows a passive note (D-72 `finishOwnedNote`, "activation will likely
fail there") *after* the user has already committed to the flow.

### Current behaviour is SAFE, just noisy — do not treat this as a data-loss bug

Since quick task `260823-op3`, clicking Activate on an already-redeemed key
returns `EPurchaseResult.AlreadyOwned` → the `'already-owned'` bucket, which
`runActivate` treats as a success and marks the Humble row redeemed. So the
list self-heals one key at a time, correctly. Two costs:

1. Every reconciliation spends a **real Steam activation attempt**. Steam
   rate-limits these (roughly 10 failures/hour, ~50/day, and sustained abuse
   can restrict the account from activating at all) — `EPurchaseResult.OnCooldown`
   → the `'rate-limited'` bucket. Working through 18 keys in one sitting is a
   plausible way to trip that. Any batch/"activate all" affordance MUST
   serialize and stop on the first `rate-limited`.
2. The user is asked to confirm an irreversible-sounding action for a key
   where nothing will actually happen.

## Solution

TBD — but the shape is "use the ownership signal we already have":

- At minimum, the ROW should distinguish "owned on Steam, nothing to do" from
  "genuinely waiting". Note the interaction with the existing tabs: an
  UNREVEALED + owned key goes to Giftable Spares (C2, D-69 hard-blocks
  revealing it), but a REVEALED + owned key has nothing to gift and no reason
  to sit in Keys-waiting either. That third state has no home today.
- Consider reconciling without spending an activation attempt at all —
  `ownedElsewhere` is derived from the Steam library, so an exact AppID match
  on a REVEALED key is strong evidence it was redeemed. Fuzzy matches (5 of
  the 18) are NOT, and must not be auto-settled; D-42's "Not the same game"
  override exists precisely because fuzzy matches are wrong sometimes.
- Whatever settles the row should be undoable, like D-77's local-redeemed
  Undo — a wrong auto-settle must not strand a genuinely unredeemed key.

### Also in scope: per-platform redeem deep links

Today every non-Steam key routes to a single static Humble support URL
(`NON_STEAM_REDEEM_HELP_URL`, D-68/T-14-09 — chosen because no authoritative
`key_type` → URL table was known and guessing risked sending a real secret to
a wrong page).

**GOG's deep link is now confirmed to work**: `https://www.gog.com/redeem/<code>`
prefills the code, verified by the operator 2026-08-23. That is the direct
analogue of the Steam `store.steampowered.com/account/registerkey?key=` link
the fallback already uses.

**Deliberately NOT built yet** — the operator has **zero** GOG keys (table
above), and that is conclusive rather than a stale cache: redeemed keys do
persist in this data (two Steam keys are `REDEEMED`). Building it now would
mean untestable code with no user. Operator: *"another day (after i buy some
gog games)."* Revisit when a GOG key appears in a sync.

Note there is no GOG redemption API to automate against, only the web form —
no official API exists, the Galaxy OAuth token GameLib holds is scoped to
`api.gog.com`/`embed.gog.com` data endpoints rather than the storefront, and
the redeem form is captcha-gated. Assisted deep-link is the ceiling for GOG,
not one-click activation.

### Watch out for

One key is `platform: 'generic'` — unknown platform, so no deep link is
derivable for it and the static help URL stays correct. Don't let a
per-platform map regress that case into a fabricated URL.
