---
created: 2026-09-25T00:00:00.000Z
title: 'Two Humble Keys sites still special-case only `gog_keyless`, leaving `epic_keyless` and `origin_keyless` with affordances they cannot complete'
area: humble/keys-screen
severity: medium
platform: any
ready: code
status: OPEN
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
