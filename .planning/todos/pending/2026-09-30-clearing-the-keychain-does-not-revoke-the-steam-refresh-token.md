---
created: 2026-09-30T00:00:00.000Z
title: 'Clearing the Keychain does NOT revoke the Steam refresh token — a second copy lives in `steam_store/config.json` and something re-promotes it into the Keychain at boot, unprompted; whether that copy is plaintext is UNCONFIRMED'
area: security
severity: major
platform: any
ready: code
status: OPEN
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

## Related

- `.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md` — its
  `## STATUS 2026-09-30 (quick-260930-nt4)` section holds the ACL measurements, and its `## CLOSED`
  section named the Keychain-clearing errand that surfaced this.
- `.planning/todos/pending/2026-08-17-humble-slots-still-prompt-unattended-at-startup.md` — adjacent
  but distinct: that one is about boot-read prompt TIMING for the Humble slots, not about a
  credential having two homes.
