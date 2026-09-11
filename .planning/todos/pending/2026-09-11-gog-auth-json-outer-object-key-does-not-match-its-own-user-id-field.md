---
created: 2026-09-11
title: "GOG `gog_store/auth.json`'s outer object key does not match its own nested `user_id` field"
area: store/gog
status: CLOSED
closed: 2026-09-11
closed_by: "quick-260911-h49; not-a-defect, premise falsified"
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

## Resolution (2026-09-11, quick-260911-h49)

**NOT A DEFECT.** The premise is falsified: the outer object key is gogdl's OAuth
`client_id` namespace, not a user id, and it was never meant to equal the nested `user_id`
field. Traced in `.build-tools/runners-onedir/src/gogdl/gogdl/auth.py`: `CLIENT_ID =
"46899977096215655"` (`:11`) -- exactly the value this todo flagged -- and the file is a
dict keyed by client_id by design (`:39-63` `get_credentials(self, client_id=None, ...)`,
`:114` `refresh_credentials`, `:130` the `--code` exchange path). The docstring at `:1-2`
even names the reason: "with ability to have multiple tokens (will come in handy in the
future)".

Both observed values were correct and have been re-confirmed live: outer key
`46899977096215655`, nested `user_id` `54283569140944678`. The filer made no measurement
error -- the observation stands; only the interpretation ("mismatch", "oddity") was wrong.

Corroboration: this repo already ships `46899977096215655` as a `client_id` at
`src/frontend/screens/WebView/loginRoutes.ts:48`. And gogdl itself emits `user_id` and
`client_id` as two separate segments of one cloud-save URL --
`.build-tools/runners-onedir/src/gogdl/gogdl/saves.py:202`
(`get_credentials(self.client_id, self.client_secret)`) and `:212`
(`f"{GOG_CLOUDSTORAGE}/v1/{self.credentials['user_id']}/{self.client_id}"`) -- proving the
two are distinct identifier spaces that legitimately coexist, exactly the "multiple tokens"
case the docstring anticipates.

This also answers the Fix-sketch's own question directly: nothing in this repo writes
`auth.json`. `constants.ts:7` defines the path, `library.ts:1521-1532` only passes it to
the gogdl binary via `--auth-config-path`, and `user.ts:360-361`'s only other touch is
`unlinkSync` on logout. Nothing reads the outer key either -- `user.ts:245` reads
`resolved.user_id`. gogdl owns the shape entirely; there is no fix to make here.

**The forward-looking risk above is inverted, corrected here.** Multiple outer keys mean
multiple client *scopes* for the *same* account, never multiple accounts -- the opposite of
what was warned. The real hazard: every GOG account collides on the single key
`46899977096215655`, so signing into a second account overwrites the first account's token
in place, since `refresh_credentials` (`auth.py:97`) hardcodes `CLIENT_ID` as the one
refresh slot it reads from. Multi-account support would need a different keying scheme
entirely, not a reconciliation of key vs field. Recorded here as a design note, not filed
as a todo -- it describes a feature that does not exist.
