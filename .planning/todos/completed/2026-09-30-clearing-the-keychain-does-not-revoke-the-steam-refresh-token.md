---
created: 2026-09-30T00:00:00.000Z
title: 'Clearing the Keychain does NOT revoke the Steam refresh token — a second copy lives in `steam_store/config.json` and something re-promotes it into the Keychain at boot, unprompted; whether that copy is plaintext is UNCONFIRMED'
area: security
severity: major
platform: any
ready: code
status: RESOLVED
found_by: 'quick-260930-ol5 follow-through, 2026-09-30 — deleted the three `com.gamelib.launcher` Keychain items expecting a Steam logout, then measured the slot PRESENT again after one launch of the signed build with no login and no prompt'
source: '.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md (its `## CLOSED` section named clearing the items as the outstanding operator errand; doing it surfaced this)'
files:
  - src/backend/storeManagers/steam/tokenStore.ts
  - src/backend/platform/index.ts
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/sidecar/bootstrap.ts
---

## What was MEASURED, and it is not in doubt

On 2026-09-30 all three live Keychain items under service `com.gamelib.launcher` were deleted:
`steam-refresh-token`, `humble-session`, `humble-csrf` (`steamgrid-api-key` was already absent).
Deletion returned `rc=0` for each and raised no authorization dialog. Immediately after, all four
slots were confirmed **absent**, and a service-wide search reported
`SecKeychainSearchCopyNext: The specified item could not be found in the keychain.`

`/Applications/GameLib.app` was then replaced with a Developer-ID-signed build and launched once
(shell pid 1695, sidecar pid 1710, both under `/Applications/GameLib.app/Contents/MacOS/`, exactly
one shell process, frontmost pid asserted == 1695). **No login was performed and no Keychain prompt
appeared** — `SecurityAgent` was not even running.

After that single launch:

| slot | state after launch |
| --- | --- |
| `steam-refresh-token` | **PRESENT again** |
| `humble-session` | absent |
| `humble-csrf` | absent |
| `steamgrid-api-key` | absent |

So the Steam credential survived deletion of its Keychain item, and the Humble ones did not. **The
Keychain is not the sole store of the Steam refresh token, and Keychain-based revocation of it is
therefore ineffective.** That is the defect, and it is measured rather than inferred.

## Where the second copy is

`~/Library/Application Support/GameLib/steam_store/config.json` carries a **`refreshToken` key
whose value is 677 characters**, alongside `isLoggedIn`, `provisioned`, `userData` and
`wineVersion`. Key presence and value length only were read; the value itself was never printed,
decoded, or materialised.

## Why plaintext is the SUSPICION and NOT a finding

Read from source, not from the credential:

- `ElectronTokenStore.setToken()` persists via
  `configStore.set(TOKEN_STORE_KEY, this.encryptToken(token))`
  (`src/backend/storeManagers/steam/tokenStore.ts:188`), where `TOKEN_STORE_KEY` is `'refreshToken'`
  (`src/backend/storeManagers/steam/constants.ts:15`).
- `encryptToken()` (`tokenStore.ts:145-154`) logs
  `'safeStorage unavailable — storing Steam refresh token in plaintext'` and stores the value
  **unencrypted** whenever `safeStorage.isEncryptionAvailable()` is false.
- In the sidecar, that predicate is hardcoded: `isEncryptionAvailable: (): boolean => false`
  (`src/backend/platform/index.ts:619`), with `encryptString`/`decryptString` both throwing. The
  in-situ comment says `safeStorage` is "intentionally left dead in the sidecar".

So **any** write through `ElectronTokenStore` under the sidecar is plaintext by construction, and
`tokenStore.ts:25-32` documents this as a deliberate "D-11 divergence" from D-06's
*"sidecar must never persist a plaintext token"*.

**What that does NOT establish** is the state of the value currently on disk. It could equally be
pre-Phase-28 `safeStorage` ciphertext written by the Electron-era build and never rewritten. The two
cases have very different severity and the difference has NOT been measured.

An attempt to settle it by inspecting the value's structure was **denied by the permission
classifier as "Credential Materialization"**, correctly, and was not worked around. Settling it
needs either an explicit operator approval to read that key, or the operator checking it themselves.

## The second unknown, and it is the better lead

**Nothing has been identified that re-promotes the disk copy into the Keychain, yet something did.**
`src/backend/sidecar/keyringTokenStore.ts` does **not** import `configStore` or `TOKEN_STORE_KEY` —
verified — so the keyring store is not reading disk. `bootstrap.ts` shows a `migrateHumbleSecrets()`
dispatch and an `installTokenStore` import, but no equivalent Steam-token migration was found. Yet
the slot came back after one launch with no login.

Until that writer is named, it is not known whether the promotion is a deliberate migration, an
accidental `setToken()` on a boot path that read `configStore` directly, or a token rotation by
`steam-user` off the disk copy.

## Direction

1. **Find the writer first** — it is desk-findable and it probably answers everything else. Trace
   every caller of `setToken()` and every reader of `configStore`'s `refreshToken` key on the boot
   path. `tokenStore.ts:10-19` asserts that callers "must go through `getTokenStore()` — never
   import `configStore`"; check whether that invariant actually holds, since something evidently
   reached the disk value.
2. **Then decide whether the disk copy should exist at all** under Tauri. If the keyring slot is the
   authoritative store post-Phase-28, a residual `refreshToken` in `config.json` is at best
   redundant and at worst an unencrypted credential that defeats Keychain revocation. Deleting it on
   successful migration is the obvious candidate, but that is a decision, not a foregone conclusion.
3. **Settle the encryption question** only with operator involvement, per the classifier denial
   above. Do not route around it.

## What this does NOT change

The closed todo `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` is unaffected and
should stay closed. Its subject was Keychain prompt COUNT across builds, and that mechanism was
measured and holds: `steam-refresh-token` has now been recreated **by a Developer-ID-signed build**,
so its ACL carries the identity-based designated requirement. This todo is a different defect —
credential *location* and *revocability*, not prompt count.

## CORRECTION 2026-09-30 (debug/steam-token-survives-keychain) — the stated MECHANISM was refuted; the actual defect was something else

A full debug session (`.planning/debug/resolved/steam-token-survives-keychain.md` — `resolved`;
the operator's live gate passed on their real profile 2026-09-30, both arms, on the dev build)
investigated
this todo's title claim directly: "a second copy lives in `steam_store/config.json` and **something
re-promotes it into the Keychain at boot, unprompted**." That specific mechanism is **REFUTED, not
merely unconfirmed**.

**What was refuted.** No boot-time code path reads `config.json`'s `refreshToken` and writes it into
the Keychain — none exists anywhere in the current source tree (exhaustively traced: every
`setToken()` call site, every `RUST_KEYRING_SET` call site, both existing migrations, the
reachability probe — all ruled out). The Keychain write the original measurement observed was an
**ordinary, already-documented QR-login write** (`user.ts:514`, the `'authenticated'` handler calling
`getTokenStore().setToken(session.refreshToken)`), confirmed two independent ways: (1) macOS unified
log (`log show`, not the zsh builtin) shows `gamelib-shell` pid 1695 — the todo's own measured pid —
performing a genuine `SecKeychainFindGenericPassword` -> `SecKeychainAddGenericPassword` sequence 43
seconds after its own boot, on a different thread than the boot-path read, consistent with a later
user action rather than an automatic boot-time promotion; (2) the operator independently recalled
performing a Steam QR-code login that same afternoon, and the coordinator corroborated the exact
timing against the unified log a second way. No Keychain prompt appeared because the signed build's
ACL already covered the item — expected behavior, not silent credential re-promotion.

**What was actually found instead.** The `refreshToken` key in
`~/Library/Application Support/GameLib/steam_store/config.json` is a **frozen, orphaned artifact of
the pre-Tauri Electron build**. It was written by the original `finishAuth()` implementation
(`configStore.set('refreshToken', encryptToken(refreshToken))`, commit `7b82c5ea0`, 2026-06-27) —
three weeks before the Tauri scaffold and nearly a month before the `28-03` TokenStore seam existed
to wall that key off. Under the current source tree the key is fully dead: nothing writes it
(`storeWriteHandlers.ts`'s D-04 guard rejects every sidecar write to it) and nothing reads it
(`ElectronTokenStore.getToken()` is its only reader, and both arms of `bootstrap.ts`'s secret-store
install block unconditionally swap the active `TokenStore` away from `ElectronTokenStore` before any
RPC handler can fire). So Keychain deletion genuinely could not revoke it — not because of a
re-promotion mechanism, but because the disk copy was never connected to the Keychain write path in
either direction. They are, and always were, two independent facts about two different stores. The
surrounding FILE is not dead — `user.ts` actively reads/writes `isLoggedIn`/`userData`/
`credentialsMissing` in the same file on every login — only this one key was ever orphaned.

**Fix shipped, this cycle.** `clearOrphanedElectronToken()`
(`src/backend/storeManagers/steam/tokenStore.ts`) is called unconditionally from the sidecar's
`bootstrap.ts` `init()`, immediately after the secret-store install block, on every boot. It is
presence-only (`configStore.has()` + `configStore.delete()` — never reads, decodes, or measures the
value in any form) and idempotent (a key already gone is a silent no-op). It logs exactly one receipt
line, key name only, and only when the key was actually present and deleted:
`[bootstrap] removed a legacy pre-Tauri \`refreshToken\` key from \`steam_store/config.json\`; the
Keychain (\`steam-refresh-token\` slot) is the authoritative store`. It deliberately does **not**
route through `applyStoreWrite` (`storeWriteHandlers.ts`) — that guard exists to reject
renderer-initiated writes to this exact key, not this sidecar-initiated boot-time cleanup of a key
nothing renderer-side can reach. Covered by 8 new tests (4 unit-level in `tokenStore.test.ts`, 4
integration-level in `bootstrap.test.ts`, against the real, unmocked `steamConfigStore`): present →
deleted + logged; absent → silent no-op; idempotent across two real boots; and a direct proof
(`jest.spyOn` on `applyStoreWrite`, zero calls) that the delete never routes through the D-04 write
guard. The Keychain remains the sole authoritative credential store throughout — this fix never
reads, writes, or inspects it in any way.

**The plaintext-vs-ciphertext question stays explicitly OPEN — not settled by this closure, and now
permanently unsettleable for this specific historical value.** This was never determined (an attempt
to inspect the value's structure was correctly denied by the permission classifier as "Credential
Materialization," and that denial was not routed around). The fix above is presence-only by design —
it does not need to know the value's shape to delete it, and it does not read it. That is precisely
why this closure can ship without ever resolving the question: but it also means that once the fix
runs on the operator's real profile (next real launch), the on-disk value is gone, and the shape of
*this* historical instance can never be determined after the fact. That trade-off — cleanup over
forensic preservation — was explicit and operator-authorized (relayed via the coordinator), not an
oversight. Circumstantial reasoning only (not a resolution): the original 2026-06-27 write ran under
genuine Electron `safeStorage`, which is typically Keychain-backed with encryption available on
macOS — unlike the sidecar's own hardcoded `isEncryptionAvailable: () => false` — making ciphertext
the more probable shape on priors. This is reasoning about the writer's code, not a read of the
value, and settles nothing.

**A separate, unrelated latent gap, noted but out of scope.** `steam-user`'s own type definitions
declare a real `refreshToken` client event (independent token rotation pushed from Steam's servers).
GameLib registers no listener for it anywhere in the codebase, so a legitimate mid-session token
rotation is currently dropped on the floor rather than persisted. This is unconnected to the defect
this todo tracked (it is a rotation-capture gap, not a stale-copy-survives-deletion gap) and was not
investigated further. No new todo was filed for it, deliberately — if it should be tracked, that is a
separate decision.

## CLOSED 2026-09-30 (debug/steam-token-survives-keychain)

Closed on the strength of the debug session above. `status:` moved `OPEN` -> `RESOLVED`. `severity`,
`platform`, and `ready` are deliberately left STALE, following this repo's established closure
convention (see `2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`'s own `## CLOSED`
section) — `.planning/todos/todo-frontmatter-gate.py` scopes to `pending/` only, so `completed/` is
exempt.

**What becomes untracked, named because that is the real cost of closing:**

1. **Live verification on the operator's real, populated profile has NOT happened.** Every signal
   gathered this cycle is a self-verification signal (8 new tests, `pnpm codecheck`, the full Backend
   jest project, `pnpm planning-gates`, scoped `prettier --check`) — none of it is a real launch of
   the packaged app against the operator's actual `~/Library/Application Support/GameLib/` profile.
   The debug session this closure rests on is `awaiting_human_verify`, not `resolved`, for exactly
   this reason — it has not been archived. The concrete check, when the operator next launches the
   app: the log should show the one receipt line on the FIRST boot after the fix ships, and no such
   line (and no `refreshToken` key) on any boot after that.
2. **The plaintext-vs-ciphertext question, permanently, per the CORRECTION section above.** Recorded
   as accepted, not resolved.
3. **The unconsumed `steam-user` `refreshToken` rotation event**, per the CORRECTION section above.

None of these three has a follow-up todo filed for it, deliberately. If any should be tracked, that
is a separate, explicit decision — not something this closure quietly assumes.

## Related

- `.planning/debug/resolved/steam-token-survives-keychain.md` — the full investigation and fix this
  closure rests on: exhaustive source tracing, unified-log forensics, the fix implementation, and
  its test coverage. Status `resolved`; the operator's live gate passed on their real, populated
  profile 2026-09-30 (boot 1 receipt count 1 + key deleted, boot 2 count 0, dev build, both
  secret-store arms irrelevant because the cleanup sits outside them). Its `next_action` carries the
  lost-evidence note: the original on-disk token value was destroyed at 21:59:47 before any
  authorised gate ran, no backup or filesystem snapshot of it exists, and the
  plaintext-vs-ciphertext question is therefore **permanently unanswerable** rather than open.
- `.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — its
  `## STATUS 2026-09-30 (quick-260930-nt4)` section holds the ACL measurements, and its `## CLOSED`
  section named the Keychain-clearing errand that surfaced this.
- `.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` — adjacent
  but distinct: that one is about boot-read prompt TIMING for the Humble slots, not about a
  credential having two homes.
