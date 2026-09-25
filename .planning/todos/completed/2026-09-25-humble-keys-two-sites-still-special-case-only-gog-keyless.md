---
created: 2026-09-25T00:00:00.000Z
title: 'Two Humble Keys sites still special-case only `gog_keyless`, leaving `epic_keyless` and `origin_keyless` with affordances they cannot complete'
area: humble/keys-screen
severity: medium
platform: any
ready: code
status: RESOLVED
found_by: 'Scope boundary of quick `260925-j58`, which added `isKeylessKeyType` and applied it to one branch only. Both sites below were read during that task and deliberately left alone.'
files:
  - src/frontend/screens/Humble/Keys/index.tsx
  - src/common/humble/viewFilters.ts
  - src/common/humble/keyTypePresentation.ts
---

## The two sites

**1. The CLAIM handler routes only `gog_keyless` away from the reveal wizard.**
`src/frontend/screens/Humble/Keys/index.tsx:467-468` picks the Humble-keys embed for
`gog_keyless` and `claimAction.onClaim` — reveal-and-redeem — for everything else. So an
UNREVEALED `epic_keyless` or `origin_keyless` row with a resolved keyindex still opens a wizard
for a code that does not exist.

**2. `isGiftable` / `isGiftableSpare` exclude only `gog_keyless`.**
`src/common/humble/viewFilters.ts:116,157-160`. The stated reason for that exclusion — offering a
gift "would promise a hand-off the user cannot complete" — applies verbatim to the other two
direct-redeem key types, which are still offered a gift affordance.

## Why `260925-j58` did not widen into them, stated plainly

Not an oversight, and not laziness — they are different questions:

- Site 1 carries a **destination** question that has only been measured for one key type. The
  D-43-11 probe measured Humble's reveal endpoint definitively rejecting a real `gog_keyless`
  entitlement, and the chosen replacement (open Humble's own keys page in the Phase 40 embedded
  store browser) was selected against that measurement. Nothing equivalent has been measured for
  `epic_keyless` or `origin_keyless`, so routing them into the same embed would be an unmeasured
  guess dressed as a fix.
- Site 2 changes the **gift** affordance on rows that `260925-j58` never touched — a wider blast
  radius than the KEY-column branch that task was scoped to, and one that would want its own
  regression pins in `viewFilters`' suite.

## What already exists for whoever picks this up

`isKeylessKeyType(keyType)` in `src/common/humble/keyTypePresentation.ts` — a closed literal set
over all three direct-redeem key types, backed by `KNOWN_GAME_KEY_TYPES`
(`src/backend/humble/classify.ts:183`) and pinned by a `foo_keyless -> false` assertion that
distinguishes it from a suffix match. Both sites above can call it directly; no new predicate is
needed.

**Do not convert it to `endsWith`.** A suffix match would admit an unrecognised — possibly
hostile — `key_type` into a branch that suppresses an affordance. The closed set is the point.

## Related

- `[[2026-09-25-humble-keys-revealed-gog-keyless-row-renders-a-finish-activation-dead-end]]` —
  RESOLVED; the third site, and where `isKeylessKeyType` came from.
- `[[2026-09-25-humble-keys-gog-keyless-claim-button-opens-an-embed-with-no-host-lifecycle]]` —
  RESOLVED; the embed lifecycle behind site 1's `gog_keyless` path.

## ✅ FIXED IN CODE 2026-09-25 (quick `260925-kt4`)

## What shipped

| Piece | Where |
|-------|-------|
| Site 1 — claim-destination fork widened from `key.platform === 'gog_keyless'` to `isKeylessKeyType(key.platform)`: every keyless claim now opens Humble's embedded keys page, never the reveal wizard | `src/frontend/screens/Humble/Keys/index.tsx` |
| Site 2 — `isGiftable` widened from excluding `gog_keyless` alone to `!isKeylessKeyType(key.platform)`; `isGiftableSpare` left byte-identical (D2, see correction #2 below) | `src/common/humble/viewFilters.ts` |
| Site 3 (not in this todo's original two — see correction #1) — the `login-and-claim` exclusion widened from `humbleKey.platform !== 'gog_keyless'` to `!isKeylessKeyType(humbleKey.platform)` | `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` |
| Site 4 (not in this todo's original two — see correction #1) — the claim-button label swapped from the local `isGogKeyless` (deleted) to the already-existing `isKeyless` local, so the label reads `isKeylessKeyType` too | `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` |
| Regression pins across three suites: closed-set (`foo_keyless`) controls in every touched branch, keyed-sibling controls (`gog`/`steam`/`epic`), and a transitive render pin for the gift-button loss through `resolveKeyScenario`/`hasGiftAction` | `src/backend/humble/__tests__/viewFilters.test.ts`, `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`, `.../HumbleKeyRow/__tests__/index.test.tsx` |

No string was added: `humbleKeys.claimOnHumble` already existed in all 49 locales (filled by
`260925-j58`), and the owned-keyless-spare empty-KEY-cell state this widening extends already
shipped for `gog_keyless` before this change (D4).

## Three things this todo got wrong or did not know — read these before re-deriving them

**1. There were FOUR sites, not two.** This todo named only the claim-destination fork (site 1)
and the gift-affordance exclusion (site 2). Widening site 1 alone would have shipped two new
lies the moment it landed, because `HumbleKeyRow`'s `login-and-claim` exclusion (site 3) and its
claim-button label (site 4) both silently assume `gog_keyless` is the only keyless type still
routed to the reveal wizard's sibling paths. `GAMELIB_LOGIN_STORES` maps `epic_keyless -> 'epic'`
(it does *not* map `origin_keyless`, which resolves to `null` and never reached site 3's branch
either way) — that mapping is the reason site 3 is specifically an `epic_keyless` exposure: an
`epic_keyless` row with `storeLoginConnected === false` would have resolved to `'login-and-claim'`
and rendered "Log into Epic and claim" for a click that (after site 1) opens Humble's embed, not
Epic's login flow. Site 4 would similarly have shipped "Claim on Epic Games" / "Claim on Origin"
labels that named a store the click no longer reaches. Both cost no new string and no new
predicate — they reuse `isKeylessKeyType` and the pre-existing `isKeyless` local and
`humbleKeys.claimOnHumble` string.

**2. This todo's characterisation of `isGiftableSpare` (site 2's line 116 reference) was
imprecise.** `isGiftableSpare` reads only `ownedElsewhere` and `state` — it has no platform
parameter and excludes no key type at all; only `isGiftable` (the affordance gate) ever excluded
`gog_keyless`. `260925-kt4` widened `isGiftable` only and left `isGiftableSpare` byte-identical
(D2) — the spare *classification* answers "is this copy surplus to me" and stays platform-blind
by design; only the affordance *gate* narrows on platform. A test now pins this divergence as
deliberate rather than an oversight.

**3. This todo's hesitation on site 1 ("nothing equivalent has been measured for `epic_keyless`
or `origin_keyless`... an unmeasured guess dressed as a fix") was overridden, and the limit it was
hesitating about is real — say so plainly rather than letting a later reader assume otherwise.**
The embed destination remains measured live for `gog_keyless` only (D-43-11's probe). The
generalisation to `epic_keyless`/`origin_keyless` rests on the *structural* fact that
`classify.ts:174-181` gives all three key types the identical no-key-code shape, and on
`humbleKeysEmbedPath()` targeting Humble's own platform-agnostic keys page rather than a
store-specific redemption endpoint — not on a second live probe. This is the one claim in the
change that is inference, not measurement, and the code comment at the site-1 fork says so in
writing (D1).
