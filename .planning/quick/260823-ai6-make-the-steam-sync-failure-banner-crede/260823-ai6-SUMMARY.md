---
quick_id: 260823-ai6
status: complete
uat: passed (2026-08-23)
date: 2026-08-23
---

# Quick Task 260823-ai6 — Summary

## What changed

A Steam library sync that fails because the credential is provably gone now offers
**"Sign in to Steam"** instead of a retry that cannot succeed.

| | Before | After (when `credentialsMissing`) |
|---|---|---|
| Title | Couldn't sync your Steam library | **Your Steam sign-in expired** |
| Body | …Try again, or check that Steam is reachable | **Sign in again to sync your Steam library. Your other libraries are still available.** |
| Action | Retry Steam sync | **Sign in to Steam** → `/login` |

Single commit `4ee05111d` — the five files are one indivisible change, because the new
resolver input is required (see below) and splitting them would leave HEAD non-compiling.

Found during the `260822-vov` UAT: with the credential gone, the banner told the user to
check that Steam was reachable (it was) and offered a Retry that re-entered the same path,
hit the same empty keyring read, and failed identically. Phase 37 had already settled that
reasoning for the **install** path (`steam/depotErrors.ts:170` — *"Deliberately offers no
'Retry' wording: retrying without first signing in can only fail again in the identical
way"*), which is why the install dialog gets a Sign in button. The sync banner never got it.

## Design decision: the resolver input is REQUIRED, not optional

Making `steamCredentialsMissing` optional would have left the 16 existing typed literals in
`librarySyncIndicator.test.ts` untouched. It was made required anyway: there is exactly **one**
production call site (`Library/index.tsx`), and the Frontend jest project has no jsdom, so no
test can observe whether that call site passes the field. A compile error is the only mechanism
that can prove it — optional would let a forgotten argument ship a banner that silently never
appears.

That paid off immediately and visibly: `tsc` produced **16 errors, all in the test file and
none in `Library/index.tsx`**, which is itself the proof the call site was wired. The 16
literals each gained an explicit `steamCredentialsMissing: false`, which also documents their
pre-flag meaning instead of leaving it implicit.

## Branch order is load-bearing, and red-proved

```
branch 1   !steamLoggedIn                        -> hidden      (must stay FIRST)
branch 1b  failed && credentialsMissing          -> signedOut   (NEW)
branch 2   failed                                -> failed
```

- **Before branch 2**, or the generic banner wins and the useless Retry ships.
- **After branch 1**, whose own comment says it is evaluated first so no later branch can leak
  a Steam surface to a user with no Steam account. A test pins that promise for the new branch.
- **Gated on `'failed'` as well as the flag**, deliberately. The Manage Accounts tile already
  reports the signed-out state; firing on the flag alone would be a second permanent surface
  competing with it. Tests pin that `idle` and `syncing` are unaffected.

**Red-proof:** moving the new branch after the `'failed'` branch fails 2 of the 5 new tests
(`takes precedence over the generic failed banner`, `still wins when a cached library
rendered`). Sabotage reverted and the branch order re-verified (`signedOut` at :93, `failed`
at :103) before committing.

## Committing around a concurrent session

`src/frontend/screens/Library/index.tsx` **already contained another session's uncommitted
work** (`migrateFilterMode` delegating to `filterEngine`, and the `favouriteGamesList`
"08.1 review IN-02" rewrite). `git commit --only <path>` does **not** help here — it guards
against other *files*, not other changes inside the same file, and would have absorbed their
work into this commit.

Skipping the file was not an option either: the required field means committing the resolver
without its call site leaves HEAD unable to compile.

Resolution: reconstructed `HEAD:index.tsx` + only this task's two hunks, wrote that to the
working tree, verified `git diff` showed exactly 10 insertions / 2 deletions and none of their
code, committed, then restored their working copy. Post-restore `git diff` shows only their two
hunks (14 insertions / 16 deletions) — their work is back, uncommitted, as found.

**Note:** `prettier --check` flagged this file after a scripted edit; `prettier --write` fixed
only the import line this task had inserted. No formatting was swept into the commit — the
isolated reconstruction makes that structurally verifiable.

## Verification

- `pnpm exec jest src/frontend src/common` — 121 suites, **2013** tests, all pass
  (`librarySyncIndicator.test.ts` 22/22, up from 17).
- `pnpm exec tsc --noEmit` — clean on the working tree; the committed call site passes the
  required field.
- eslint on the 4 changed source files — 0 errors (severity 2).
- `prettier --check` — clean on all 5 changed files.
- Locale keys added to `gamelib.json` only; `translation.json` untouched (upstream-owned).
- **Verified rather than assumed:** `credentialsMissing` was already in
  `STORE_ALLOWLIST.steamConfigStore` (`storePolicy.ts:119`, from `260822-vov`), so no policy
  change was needed for either the read or the `STORE_CHANGED_CHANNEL` push.

## UAT — run 2026-08-23, PASSED as a true A/B

Run against a real build with a real empty Keychain slot. The *same* fixture had been exercised
an hour earlier on the pre-fix build during `260822-vov`'s UAT, so this is a genuine before/after
rather than a "does it render" check.

| | Same fixture, pre-fix build | Post-fix build |
|---|---|---|
| Banner | "Couldn't sync your Steam library" + **Retry Steam sync** | **"Your Steam sign-in expired" + Sign in to Steam** |

Backend precondition verified independently in the log before the user reported the banner:

```
07:46:54  keyring_get ok present=false len=0 trigger=user-refresh elapsed=7ms
07:46:54  Steam: logged in but no stored refresh token — cannot reconnect
07:46:54  Steam client not ready, skipping library refresh
          -> credentialsMissing: True written to config.json
```

Checking the backend half separately was deliberate: it makes a rendering failure
distinguishable from a latching failure instead of collapsing both into "banner looks wrong".

**Render-ordering gap did not materialise.** The resolver reads the flag during Library's render
while the backend writes it during the failing refresh, so a first-refresh render could in
principle have beaten the write and shown the stale generic banner. It did not — the correct
banner appeared on the **first** refresh. Noted rather than assumed away: the ordering is not
enforced by anything in the code, so this is an observation about timing on one machine, not a
guarantee.

**Click-through confirmed (user, after the fact):** the banner's Sign in to Steam button is the
route actually taken to the accounts screen. Cross-surface agreement is confirmed with it — the
`260822-vov` tile read "Sign-in expired — Reconnect" on arrival, while the flag was still true,
which is evidenced by the follow-up bug report quoting that exact text. Both surfaces read the
same flag and agreed, which is the point of the pair.

**A real defect surfaced immediately after, in the OTHER task's surface:** the tile kept saying
"Sign-in expired" after the sign-in completed, until an unmount. Fixed under `260823-awo`; the
sync banner is not affected (it is recomputed on Library's render, not held in local state).

**Clear path re-verified end to end:** signing in produced
`setToken(): keyring_set ok len=494` (07:48:27), `credentialsMissing` cleared from config, and
the Keychain slot restored — so the fixture this UAT destroyed was repaired by the flow under
test, leaving no residue.

## Not done
- **Inherited staleness caveat:** the flag is the last *proven* verdict, so a credential that
  vanishes while a connection is live produces no banner — the sync simply succeeds. Correct,
  not chased.

## Pre-existing red gates — untouched

`genI18nGateScope.test.ts` (stale `meta/i18nForkTouchedFiles.json`) and
`gameDetailsImportGate.test.ts` (sha256 pin on `settingsFlowRegistration.ts`, modified in the
working tree by the concurrent session). Both verified red before this task and belong to
other owners. This task adds `librarySyncIndicator.ts`-adjacent files to the first gate's
stale set; still deliberately not regenerated.
