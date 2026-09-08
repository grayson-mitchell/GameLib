---
created: 2026-08-23T07:00:48.128Z
title: "Humble integrated activation — reconcile key state with Steam ownership"
area: humble
status: completed
severity: minor
platform: any
ready: code
resolves_phase: "42"
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
idea it was redeemed. Operator, 2026-08-23: *"humble list does not
sync with steam, most of those have been activated!"*

### CORRECTION 2026-09-07: the original Activate-button premise was FALSE

The original wording of this section claimed GameLib "keeps presenting it in
Keys-waiting with an actionable **Activate** button", and derived a
batch-activation / rate-limit hazard from that. All four claims were measured
and disproved on 2026-09-07 against `fix/steam-native-install-stability`
@ `7bf39e3b5`:

| Todo claim | Verdict | Evidence |
|---|---|---|
| Owned keys appear in Keys-waiting | FALSE | `selectKeysWaiting` returns `false` for any `k.ownedElsewhere` — `src/common/humble/viewFilters.ts:62`, landed `5bfc2cb3d` on 2026-07-08, six weeks BEFORE the todo was written |
| Owned keys offer an Activate button | FALSE | The button rides entirely on the optional `claimAction` prop (`HumbleKeyRow/index.tsx:29`, rendered at `:114`). Exactly one caller supplies it: `Keys/Waiting/index.tsx:222`. `Spares/index.tsx:79` passes `giftAction` only; `HumbleKeyGroup/index.tsx:81` (the All tab) passes `urgencyTier` only |
| Reconciling spends a Steam activation attempt | UNREACHABLE for owned keys | No Activate button ⇒ no attempt |
| Rate-limit hazard across 18 keys | NO PATH TO OCCUR | Same as above |

The claim was **already false on the day this todo was written** — `5bfc2cb3d`
predates it by six weeks. No batch-activation, "activate all", or
rate-limit-serialization requirement follows from this todo; a future reader
should not re-derive one.

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

**This census is the ONLY measurement that exists, and it cannot be re-taken.**
The live cache at
`~/Library/Application Support/gamelib/store_cache/humble_library.json` was
clobbered to `{}` on 2026-09-07 12:29 by the known tests-clobber-real-stores
defect. Treat the numbers above as a historical record, not as something a
later reader can reproduce on demand.

**So the signal already exists.** Phase 12's ownership matching (D-38/D-41)
has already resolved 18 of the 20 as owned on Steam. Nothing consumes that to
settle the key's state — the row offers Activate regardless, and only the
wizard shows a passive note (D-72 `finishOwnedNote`, "activation will likely
fail there") *after* the user has already committed to the flow.

### Current behaviour is SAFE, just noisy — do not treat this as a data-loss bug

Since quick task `260823-op3`, clicking Activate on an already-redeemed key
returns `EPurchaseResult.AlreadyOwned` → the `'already-owned'` bucket, which
`runActivate` treats as a success and marks the Humble row redeemed. So the
list self-heals one key at a time, correctly.

The original cost (1) recorded here — that reconciling spends real Steam
activation attempts and could trip Steam's rate limit across 18 keys — has
been **removed as false**; see the CORRECTION above. Owned keys are excluded
from Keys-waiting and are never given an Activate button, so there is no path
by which that cost can be incurred.

The one real cost that remains, and only for keys that genuinely ARE in
Keys-waiting (the 2 `ownedElsewhere: false` keys in the census above, not the
18 owned ones): the user is asked to confirm an irreversible-sounding action
for a key where nothing will actually happen.

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

### The real defect, and what Phase 42 shipped

Stripped of the false Activate-button premise, the defect this todo was
circling is: **owned + REVEALED keys had no tab at all.**
`src/common/humble/viewFilters.ts:62` excludes `ownedElsewhere` keys from
Keys-waiting, and `:76` takes `state === 'UNREVEALED'` only for Giftable
Spares. So a key that was both owned and revealed appeared ONLY under the All
tab's `Revealed` heading, permanently, with no way to settle it.

Phase 42 closed that:

- **42-01** — the pure `key_type` → presentation table (display name, logo,
  redeem-URL-or-help-fallback) in `src/common/humble/keyTypePresentation.ts`.
- **42-02** — the provenance schema: `HumbleLocalRedeemedRecord.source`
  (`'user' | 'ownership-exact'`), surfaced as `ClaimAnnotation.redeemedSource`.
- **42-03** — exact-match ownership auto-settle with a durable undo
  (`humbleSettleDeclinedStore`), so an undone settle does not re-fire on the
  next sync. Fuzzy matches are deliberately NOT auto-settled.
- **42-04** — the store indicator on the key row, driven by the 42-01 table.
- **42-05** — the GOG redeem deep link, replacing the static help-URL fork.
- **42-06** — the reachable Undo in the All tab.

**The Undo affordance did NOT already render in the All tab.** That was found
during Phase 42 planning, not assumed, and closed by 42-06 — without it,
42-03's auto-settle would have been a one-way door. A future reader should not
assume D-42-01 shipped for free.

### Also in scope: per-platform redeem deep links

Today every non-Steam key routes to a single static Humble support URL
(`NON_STEAM_REDEEM_HELP_URL`, D-68/T-14-09 — chosen because no authoritative
`key_type` → URL table was known and guessing risked sending a real secret to
a wrong page).

**GOG's deep link is now confirmed to work**: `https://www.gog.com/redeem/<code>`
prefills the code, verified by the operator 2026-08-23. That is the direct
analogue of the Steam `store.steampowered.com/account/registerkey?key=` link
the fallback already uses.

~~**Deliberately NOT built yet** — the operator has **zero** GOG keys (table
above)… Revisit when a GOG key appears in a sync.~~

**SUPERSEDED 2026-09-09 — built by 42-05, and the prediction came true anyway.**
The deep link shipped in plan 42-05 (`getRedeemTarget`, replacing the static
`NON_STEAM_REDEEM_HELP_URL` fork). A GOG entitlement then DID appear in a sync —
but it arrives as **`key_type: gog_keyless`**, a direct-redeem entitlement that
carries **no key code**, so `gog.com/redeem/<code>` cannot be built for it.
`gog_keyless` is therefore deliberately absent from `REDEEM_URL_BUILDERS`
(T-UIC-01) and falls through to the help URL, exactly as `epic_keyless` does.

**So this section's original warning still holds, for a now-evidenced reason:
the GOG deep link has no reachable user.** It would take a genuinely *keyed*
GOG key to exercise it, and this account has none. See `42-07-SUMMARY.md`
"Residue". Separately, `gog_keyless` was being dropped by the classifier
entirely until quick task `260908-uic` added it to `KNOWN_GAME_KEY_TYPES` —
before that fix the game did not appear in GameLib at all.

Note there is no GOG redemption API to automate against, only the web form —
no official API exists, the Galaxy OAuth token GameLib holds is scoped to
`api.gog.com`/`embed.gog.com` data endpoints rather than the storefront, and
the redeem form is captcha-gated. Assisted deep-link is the ceiling for GOG,
not one-click activation.

### Watch out for

One key is `platform: 'generic'` — unknown platform, so no deep link is
derivable for it and the static help URL stays correct. Don't let a
per-platform map regress that case into a fabricated URL.
