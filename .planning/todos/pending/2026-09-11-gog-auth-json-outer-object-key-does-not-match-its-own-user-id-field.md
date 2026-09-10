---
created: 2026-09-11
title: "GOG `gog_store/auth.json`'s outer object key does not match its own nested `user_id` field"
area: store/gog
status: OPEN
severity: minor
platform: any
ready: code
source: "debug/gog-login-not-registered.md -- surfaced while building the live curl discriminator for the api.gog.com/users.gog.com host bug; confirmed by the operator, not speculative"
files:
  - "~/Library/Application Support/GameLib/gog_store/auth.json (live operator file, not in-repo)"
  - src/backend/storeManagers/gog/user.ts (reads resolved.user_id, never the outer key)
resolves_phase: null
---

# GOG `auth.json`'s outer object key does not match its own nested `user_id` field

## Observed, confirmed live

On the operator's real `~/Library/Application Support/GameLib/gog_store/auth.json`, the
top-level object's key and its own nested `user_id` field genuinely differ:

- outer object key: `46899977096215655`
- nested `user_id` field (same record): `54283569140944678`

Confirmed, not inferred: a curl replay against `users.gog.com/users/{user_id}` using the nested
field's value returned HTTP 200 with `username: "soreluel"`, matching the operator's real GOG
account. The outer key was not exercised against any endpoint.

## Why it isn't a live defect today

`GOGUser` reads `resolved.user_id` (the nested field) throughout
`src/backend/storeManagers/gog/user.ts` and never keys off the outer object property. The
`debug/gog-login-not-registered` fix (host correction, `api.gog.com` -> `users.gog.com`) is
unaffected by this mismatch -- confirmed by reading the code, not assumed.

## Why it's worth a look anyway

The shape (an object keyed by what looks like a user id, whose own record disagrees with that
id) suggests either a multi-account remnant, a stale key from a prior account/reinstall, or a
key derived from a different identifier space (e.g. a SteamID-shaped or client-id-shaped value)
than the field it wraps. If any future code path starts reading the outer key instead of
`resolved.user_id` -- or if multi-account support is ever added -- this mismatch would silently
resolve to the wrong account. Worth tracing where `auth.json` is written (`gogdl auth` output
capture) to understand whether the outer key is ever meant to equal `user_id`, or is
deliberately a different identifier.

## Fix sketch

Not proposed here -- this is a "worth a follow-up look" filing per the debug session's
checkpoint response, not a scoped fix. Start by tracing the write path that produces
`gog_store/auth.json` (likely in `GOGUser.login()`/`getCredentials()` or wherever `gogdl auth`'s
stdout is persisted) and determine what the outer key is supposed to represent.

## Related

- .planning/debug/resolved/gog-login-not-registered.md -- where this was first noticed (host
  bug, unrelated to and unaffected by this mismatch)
