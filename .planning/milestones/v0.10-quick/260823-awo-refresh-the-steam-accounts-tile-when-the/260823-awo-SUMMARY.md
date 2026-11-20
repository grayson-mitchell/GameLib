---
quick_id: 260823-awo
status: complete
date: 2026-08-23
---

# Quick Task 260823-awo — Summary

## What changed

Commit `e391095da`. Nine lines in `src/frontend/screens/Login/index.tsx` — `openOverlay` added
to the store-tile effect's dependency array — plus a source-level gate.

After signing back in from the "Sign-in expired — Reconnect" tile, the tile kept saying
"Sign-in expired" until the user navigated away and back. Found by the user during
`260823-ai6`'s UAT.

### Cause

`GlobalState.steamLogin` writes `username: result.username` — **the same persona name the tile
already had**. `steam?.username` therefore goes `"Grayson"` → `"Grayson"`, no dependency in the
array moves, the effect never re-runs, and the stale `steamCredentialsMissing: true` survives in
local state. Only an unmount/remount re-runs the `useState` initialiser.

Worth separating from the previously recorded "mount-time read" caveat: that framing assumed
some dep would eventually move. **Nothing moves on a re-login by the same account** — which is
precisely the case this feature creates, since the whole point is that the username is still
known and correct while the credential is gone.

`openOverlay` flips `'steam'` → `null` on dismiss: the one signal that moves at exactly the
moment `credentialsMissing` can go true → false while the screen stays mounted.

**Rejected alternative:** subscribing to store changes. `TypeCheckedStoreFrontend` exposes only
`has`/`get`/`set`/`delete` — there is no subscription API, and building one is far beyond a
9-line fix.

## The gate was broken first, and its own non-vacuity case caught it

The first draft asserted `openOverlay` against **raw** source. The comment explaining the fix
names `openOverlay`, so **the assertion passed on prose and would have stayed green with the
dependency deleted** — a gate matching a landmark rather than the property.

The non-vacuity case (delete the dep line from a specimen, require the gate to go red) is what
exposed it. A second, same-species bug went with it: `G2`'s extraction window started *after*
the `get_nodefault` call it claimed to check, so it could never have seen it.

Both fixed: comments are stripped before matching, the window now spans the whole effect body,
and the non-vacuity case is kept as the thing that earns the gate its keep.

## Verification

- `pnpm exec jest src/frontend src/common` — 122 suites, 2016 tests, all pass.
- `pnpm exec tsc --noEmit` — clean.
- eslint on both changed files — 0 errors (severity 2); `prettier --check` clean.
- Gate red-proved: deleting the `openOverlay` dependency line fails G1.

## Not done

- **Not UAT'd in the app.** Reproducing needs another delete/restart/sign-in cycle, and the user
  had just completed three. The gate pins the property and the failure mode is understood
  precisely, but nobody has watched the label clear in place.
- **Only the login-overlay route is covered.** If `credentialsMissing` were cleared by something
  other than a sign-in through this screen — e.g. a background `ensureConnected` fast path
  succeeding while the accounts screen sits open — the tile would still be stale until
  navigation. That is the residual of having no store subscription, and it is not chased here.
- The sync banner (`260823-ai6`) is **not** affected by this class of bug: it is recomputed from
  the store on every Library render rather than held in component state.
