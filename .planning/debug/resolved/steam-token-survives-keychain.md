---
status: resolved
trigger: 'Clearing the Keychain does NOT revoke the Steam refresh token — a second copy lives in `steam_store/config.json` and something re-promotes it into the Keychain at boot, unprompted; whether that copy is plaintext is UNCONFIRMED'
created: 2026-09-30
updated: 2026-09-30T10:05:00Z
source_todo: .planning/todos/completed/2026-09-30-clearing-the-keychain-does-not-revoke-the-steam-refresh-token.md
---

# Debug: Steam refresh token survives Keychain deletion

## Symptoms

Prefilled from the source todo (`ready: code`, `severity: major`, `area: security`). Read that
file in full — it is the primary symptom record and is more precise than this summary.

- **Expected behavior:** Deleting the `steam-refresh-token` Keychain item under service
  `com.gamelib.launcher` revokes GameLib's stored Steam credential. The app should be signed out
  of Steam on the next launch.
- **Actual behavior:** After deleting all three live items (`steam-refresh-token`,
  `humble-session`, `humble-csrf`; `steamgrid-api-key` was already absent) and confirming all four
  slots absent via a service-wide search, a single launch of the signed build — no login, no
  Keychain prompt, `SecurityAgent` not even running — left `steam-refresh-token` **PRESENT again**.
  The three Humble/SteamGridDB slots stayed absent.
- **Error messages:** None. The reappearance is silent.
- **Timeline:** Measured 2026-09-30 by `quick-260930-ol5` follow-through, while doing the
  Keychain-clearing errand named in the `## CLOSED` section of
  `.planning/todos/completed/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md`.
- **Reproduction:** Delete the `com.gamelib.launcher` / `steam-refresh-token` Keychain item,
  confirm absent, launch `/Applications/GameLib.app` once, re-check the slot.

## Evidence

- timestamp: 2026-09-30 (from source todo, measured — not in doubt)
  finding: `~/Library/Application Support/GameLib/steam_store/config.json` carries a `refreshToken`
  key whose value is 677 characters, alongside `isLoggedIn`, `provisioned`, `userData`,
  `wineVersion`. **Key presence and value length only were read.** The value has never been
  printed, decoded, or materialised, and must not be.

- timestamp: 2026-09-30 (orchestrator orientation, before this session)
  finding: **No code path in the repo reads `config.json`'s `refreshToken` and writes the
  Keychain.** Traced exhaustively:
  - The only two non-test `setToken()` call sites on the Steam token are
    `src/backend/storeManagers/steam/user.ts:348` (`finishAuth`) and `:514` (QR
    `authenticated` handler). **Both are login paths. Neither runs at boot.**
  - `TOKEN_STORE_KEY` (`= 'refreshToken'`, `steam/constants.ts:15`) is imported by exactly two
    non-test modules: `steam/tokenStore.ts` and `sidecar/storeWriteHandlers.ts`. The latter is a
    *guard*: `storeWriteHandlers.ts:138-145` **rejects** any sidecar write to
    `steamConfigStore.refreshToken` as "Keychain-owned (D-04/REQ-28-02)".
  - `sidecar/keyringTokenStore.ts` has no migration and does not import `configStore` — confirms
    the todo's claim. `SidecarKeyringTokenStore` (`:556`) only extends `SidecarKeyringSlotStore`
    with a bound slot.
  - `bootstrap.ts:1103-1124` installs the stores. `installTokenStore(new
    SidecarKeyringTokenStore())` performs **no** migration. The migrations that do exist —
    `migrateHumbleSecrets()` (`humbleSecretStore.ts:225`) and `migrateSteamGridDbApiKey()`
    (`steamgridSecretStore.ts:145`) — cover the Humble and SteamGridDB slots only. There is
    **no Steam-token equivalent**.
  - `src-tauri/src/` contains no `refresh_token`/`refreshToken` write path; the only matches are
    test names for `keyring_account` slot mapping.

- timestamp: 2026-09-30 (orchestrator orientation — **this is the strongest lead**)
  finding: **The keyring-arm boot log shows the app never touched the Steam slot.**
  `~/Library/Logs/GameLib/gamelib.log.old`, boot at 18:35:47, `[bootstrap] secret stores: keyring`:
  - `Steam TokenStore implementation set to SidecarKeyringTokenStore` (line 7)
  - the only `keyring_get` issued is `SidecarKeyringSlotStore(humble-session).getToken()` —
    `present=false len=0` (lines 22-23, 26)
  - `Steam: library refresh deferred until a deliberate Steam action — no keyring_get issued
    (trigger=startup)` (line 38)
  - **No `steam-refresh-token` line of any kind. No `setToken()` line.**
  If that boot is the one the todo measured, then GameLib did not write the Keychain item, and the
  premise "something re-promotes it at boot" is false in its stated mechanism.
  **Caveat, and it matters:** only one rotated log survives (`gamelib.log.old`), and the current
  `gamelib.log` is a later 20:26 boot that took the **dev-vault** arm
  (`Steam TokenStore implementation set to DevVaultTokenStore`). If more than two launches
  happened today, the todo's launch may already be rotated away. **Do not assert the 18:35 boot is
  the measured one without corroborating it** (shell log pids — the todo names shell pid 1695 and
  sidecar pid 1710 — or timestamps).
  All three logs are snapshotted, so rotation cannot destroy them:
  `<scratchpad>/logs/gamelib.log.snap`, `gamelib.log.old.snap`, `gamelib-shell.log.snap`.
  **SUPERSEDED (checkpoint-resume cycle) — do not rely on this entry's boot attribution.** The
  coordinator's full `gamelib-shell` pid census over the 17:50-19:00 window (`/usr/bin/log show
  --predicate 'process == "gamelib-shell"'`; see the checkpoint-resume evidence entry below)
  confirms this 18:35:47 boot is **pid 5651**, a *different launch* from **pid 1695** — the pid the
  todo actually measured and the one whose lifetime contains the Keychain write. This entry's
  conclusion (no Steam-slot keyring activity) remains independently true for pid 5651's own boot,
  but it was drawn from the wrong launch's log and cannot be used to characterize "the measured
  boot." The caveat this entry already carried — "do not assert the 18:35 boot is the measured one
  without corroborating it" — is confirmed correct, not merely prudent: corroboration shows it was
  in fact a different boot. Kept in place, not deleted, per instruction.

- timestamp: 2026-09-30 (this session — macOS unified log, `log show`, NOT the zsh builtin `log`)
  finding: **Corroborated the measured boot directly against the unified system log** (stronger
  source than `gamelib-shell.log`, see below for why that file cannot help). `gamelib-shell`
  process, pid **1695**, started **18:15:06.996722 local**. The SAME pid's thread performed
  `SecKeychainCopyDomainDefault` -> `SecKeychainFindGenericPassword` -> `SecKeychainAddGenericPassword`
  at **18:15:50.010-18:15:50.035 local** — **43 seconds after its own start**, with no
  `SecurityAgent` activity and no auth-UI event anywhere in the window. This is the todo's own pid
  (1695) and matches its "no login, no prompt" observation — corroboration requested by the prior
  `next_action` is complete, via a better instrument than the one named there.

- timestamp: 2026-09-30 (this session — why `gamelib-shell.log`/the snapshotted logs cannot answer
  this at all, closing out the file-based half of the prior `next_action`)
  finding: `<scratchpad>/logs/gamelib-shell.log.snap` contains **no `1695` and no `keyring` line at
  all** — checked directly. Its content is exclusively deep-link (`on_open_url`) diagnostic
  `eprintln!`s from **dev-mode** launches (`GAMELIB_SHELL_EXE=.../target/debug/gamelib-shell`,
  pids 30743/90940/etc.) — it is not even the packaged app's log stream. Independent of that, the
  Rust `keyring_set`/`keyring_get`/`keyring_available` RPC arms (`main.rs` ~6488-6572) only ever
  `eprintln!` on the **failure** branch — there is no success-path log line for any keyring
  operation. **A successful keyring write is structurally invisible to every GameLib-authored log
  stream; the macOS unified log is the only instrument that can see it at all.** The two other
  snapshotted files (`gamelib.log.snap`, `gamelib.log.old.snap`) are the JS sidecar's own log and
  were already covered by the existing 18:35:47 boot evidence above — re-checking them adds
  nothing new for pid 1695's boot specifically, since that boot's JS sidecar log (if it still
  exists at all) was not the one captured in either snapshot.

- timestamp: 2026-09-30 (this session — crate-source confirmation the write is genuine, not a read)
  finding: Read `keyring` 3.6.3's macOS backend (`set_password()` delegates in one call to
  `security-framework`) and `security-framework` 2.11.1's `passwords.rs` directly:
  `set_generic_password()` (lines 272-281) is `match find_generic_password() { Ok(..) =>
  item.set_password(..), _ => add_generic_password(..) }` — i.e. Find-then-Add is the **exact and
  only** call shape produced by a genuine write when no prior item exists (matches "confirmed
  absent" immediately beforehand). `add_generic_password()` calls the raw FFI
  `SecKeychainAddGenericPassword` directly, no conditional logic. A `keyring_get`/`get_password()`
  call, by contrast, only ever calls Find — it cannot produce an Add. **The observed sequence is
  unambiguously a `keyring_set` (write), not a read and not unrelated OS housekeeping.**

- timestamp: 2026-09-30 (this session — exhaustive `user.ts` read, 879 lines, in full)
  finding: Exactly two call sites exist anywhere in the repo for `setToken()` on the Steam slot:
  `finishAuth()` (`user.ts:348`) and the QR-login `'authenticated'` handler (`user.ts:514`). **Both
  strictly require an interactive `LoginSession` this process created and completed** —
  `startCredentialLogin()`/`startQRLogin()` — and `this.session` is an in-memory field reset to
  `null` on every process restart. `ensureConnected()`'s cold path (the one path that CAN run
  automatically, e.g. from the mount-time `refreshLibrary()` gate in `GlobalState.tsx` guarded by
  `steamConfigStore.has('userData')`) only ever **reads** the token
  (`readTokenOutcome`/`getToken()` -> `keyring_get`) and, on success, calls
  `connectSteamUserClient()` — which itself never calls `setToken()`. **No automatic/boot-time
  path to a Steam-slot write exists in the current source tree.**

- timestamp: 2026-09-30 (this session — ruling out a misdirected slot argument)
  finding: Census of every non-test `RUST_KEYRING_SET` call site: `keyringTokenStore.ts:471`
  (bound to whichever slot the `SidecarKeyringSlotStore` instance addresses),
  `humbleSecretStore.ts:177`, `steamgridSecretStore.ts:172` — **all three always pass an explicit,
  correctly-bound slot argument**. Rust's `keyring_slot_arg()` (`main.rs` ~1376) has a
  `.unwrap_or("steam-refresh-token")` default for a missing/non-string slot arg, but it is
  documented dead weight from a pre-slot-parameterization wire version — no current caller omits
  the argument, so this default is never actually exercised.

- timestamp: 2026-09-30 (this session — ruling out the reachability probe and the two existing
  migrations as the writer)
  finding: `keyring_available` (`main.rs` ~6545-6572) calls **only** `entry.get_password()` against
  the reserved, deliberately-never-written `KEYRING_REACHABILITY_PROBE_ACCOUNT` — a pure Find, no
  `Add` branch exists in this arm at all, so it cannot produce the observed Find-then-Add sequence
  and cannot be a misattributed source. Separately: `migrateHumbleSecrets()` and
  `migrateSteamGridDbApiKey()` DO run unconditionally at every boot (unlike the Steam token, which
  has no migration), but both hardcode their own slots (`humble-session`/`humble-csrf`/
  `steamgrid-api-key`) — they cannot target `steam-refresh-token` — and in any case those three
  slots were measured **absent** after the launch, which is inconsistent with either of them having
  written anything during this boot.

- timestamp: 2026-09-30 (this session — ruling out version skew between the installed build and
  the current source tree)
  finding: The installed `/Applications/GameLib.app` was Developer-ID signed **2026-09-23
  10:41:08** (`codesign -dvvv` timestamp; matches the binary's own mtime). `package.json`/
  `tauri.conf.json` both read `"version": "0.7.0"` and have since commit `83dc57a76` (the Tauri v2
  scaffold, well before this build) — the version string cannot date the build, so the build's
  timestamp plus `git log` was used instead. `git log --oneline 59535d08e..HEAD -- tokenStore.ts
  user.ts keyringTokenStore.ts bootstrap.ts humbleSecretStore.ts steamgridSecretStore.ts` (59535d08e
  is the nearest commit at/before the signing time) returns exactly one commit, `a27bed9a8`
  ("resolve plurals for the underscore-named locales"), whose only touch to any of these six files
  is an i18next `loadPath`/`lng`/`supportedLngs` refactor in `bootstrap.ts` — **no token/keyring
  logic changed between the commit nearest the build and current HEAD.** The installed build's
  token/keyring code is what is on disk today; this is not an artifact of a since-removed migration
  bridge.

- timestamp: 2026-09-30 (checkpoint resume — operator's own recollection closes the write-mechanism
  question)
  finding: The operator confirms performing a Steam QR-code login a couple of hours before ~21:30
  that day, which fits the traced 18:15 window. This makes the QR `'authenticated'` handler at
  `user.ts:514` (`getTokenStore().setToken(session.refreshToken)`) the writer: under the sidecar
  that store is `SidecarKeyringTokenStore`, so it writes the `steam-refresh-token` slot, and no
  Keychain prompt appears because the signed app already holds the ACL for that item (a signed
  build's designated requirement satisfies `SecKeychainFindGenericPassword`'s ACL check silently).
  The coordinator independently re-verified via `/usr/bin/log show --predicate 'processID ==
  1695'` over 18:15:45-18:15:55 and reproduced the same Find -> Add pair at 18:15:50.010/.013 plus
  a `login.keychain-db` atomicfile commit at 18:15:50.035 — corroborates rather than merely repeats
  this session's own unified-log finding. **This resolves the write-mechanism contradiction**: a
  completed interactive login DID run in that process's lifetime; the operator simply did not
  register the QR scan-and-approve as a "login event" worth mentioning until asked directly.
  **Sub-question CLOSED this cycle by measurement, not recollection:** whether that QR login
  happened in the SAME launch as the post-deletion measurement (pid 1695) or an earlier separate
  launch. The coordinator enumerated every `gamelib-shell` process in the 17:50-19:00 window via
  `/usr/bin/log show --predicate 'process == "gamelib-shell"'`: exactly two exist. **pid 1695**
  (started 18:15:06.996) performed a boot-path `SecKeychainFindGenericPassword` at 18:15:08.160
  (1.2s post-boot, thread `13f0dcf`) — an ordinary startup read that found the slot the operator
  had just emptied — then the write itself (`Find` + `Add`) at 18:15:50.010/.013 (43s post-boot,
  thread `13f1462`, a **different thread**), followed by the `login.keychain-db` atomicfile commit
  at .035. **pid 5651** (started 18:35:47.060, matching `gamelib.log.old`'s 18:35:47 boot — see the
  now-superseded entry above) performed exactly ONE `GenericPassword` operation in its entire life,
  a read (the `humble-session` `getToken()` already noted), and no write. With no third launch
  anywhere in the window, there is no separate earlier launch to attribute the QR login to: it is
  **measured, strong, not merely assumed**, that the login and the write both happened inside pid
  1695's single lifetime. Separately, the 42-second gap and the thread change between the boot-path
  read (`13f0dcf`) and the write (`13f1462`) is itself positive evidence against an automatic
  boot-time promotion mechanism (which would fire immediately, on the boot thread) and for a
  distinct, later, user-initiated action — reinforcing, not merely restating, the operator's own
  account.

- timestamp: 2026-09-30 (this session — pivot to the disk-copy question: is `ElectronTokenStore`
  reachable at all in the current source tree, on the READ side)
  finding: Read `bootstrap.ts`'s secret-store install block in full (the `if
  (devSecretVaultInstalled) {...} else {...}` branch). **Both arms of this exclusive branch
  install a Steam TokenStore other than the default.** The keyring arm calls
  `installTokenStore(new SidecarKeyringTokenStore())`; the dev-vault arm's
  `installDevSecretVault()` (`devSecretVault.ts:314`) calls `setTokenStore(new
  DevVaultTokenStore(path))` — confirmed by reading `devSecretVault.ts` directly (`DevVaultTokenStore`
  class at line 180, `setTokenStore` call at line 314). The in-situ comment at `bootstrap.ts` states
  this placement is load-bearing specifically so "no handler ever observes the default
  `ElectronTokenStore` in the sidecar build" (T-28-10) — `installTokenStore`/`setTokenStore` runs
  after `startRpcServer()` but strictly before any RPC invoke handler body can execute, since
  handlers only fire from the RPC loop that starts after this block. **Conclusion: under every
  currently-reachable boot path in the current source tree, `ElectronTokenStore.getToken()` (the
  only code that reads `configStore`'s `TOKEN_STORE_KEY`) is never the active store once
  `bootstrap.ts`'s `init()` completes, and nothing can call it before that.** This answers the
  read-side of Direction step 1 directly: no current code path reads `config.json`'s `refreshToken`
  key for any purpose (migration, fallback, diagnostic, or otherwise) — the write-side guard
  (`storeWriteHandlers.ts:138-145`, already traced) and this read-side unreachability are two
  halves of the same fact.

- timestamp: 2026-09-30 (this session — is `steam_store/config.json` itself an orphaned artifact,
  or still live?)
  finding: **The file is fully live; only the `refreshToken` key inside it is orphaned.** Grepped
  every non-test importer of `./electronStores` (the backend steam store module) for direct
  `configStore.get_nodefault`/`.set`/`.delete` calls: `user.ts` is the only caller, and it touches
  `isLoggedIn` (lines 74, 313, 349, 515), `userData` (314, 324, 355, 538), and `credentialsMissing`
  (118, 211, 317, 350, 516) — on the exact same login/logout paths (`finishAuth()` and the QR
  `'authenticated'` handler) that write the Keychain token. So every login, including the one this
  session just attributed the Keychain write to, ALSO writes fresh `isLoggedIn`/`userData` values
  into `config.json` directly — the file is actively read and written by current code on every
  boot and every login. Separately, the FRONTEND's `steamConfigStore` (`src/frontend/helpers/
  electronStores.ts:164`, `TypeCheckedStoreFrontend('steamConfigStore', { cwd: 'steam_store' })`,
  no explicit `name` — same file) is the one `GlobalState.tsx` calls `.has('userData')` on to gate
  `refreshLibrary()`, confirmed by reading both files. **Only `refreshToken` is walled off**: it is
  the one key `tokenStore.ts`'s header comment reserves exclusively to itself, and per the entry
  above, `tokenStore.ts`'s own implementation of that read is unreachable. The residual value is
  not evidence of a generally-dead file — it is a single dead key inside a very much alive one.

- timestamp: 2026-09-30 (this session — identifying the historical writer via `git log`, per
  Direction step 1's "find the writer first")
  finding: `git log --oneline --all -- src/backend/storeManagers/steam/user.ts | tail -30` traces
  the file back to its origin commit, `7b82c5ea0` ("feat(01-02): Steam constants, configStore, and
  SteamUser auth class with unit tests"), dated **2026-06-27 12:28:06 +1200** — three weeks before
  the Tauri scaffold (`83dc57a76`, 2026-07-20) and nearly a month before the TokenStore seam that
  would later wall off this key (`45c08ca98`, 2026-07-22, plus the `user.ts` migration itself,
  `cdd71a9c8`, also 2026-07-22). `git show 7b82c5ea0 -- .../user.ts` shows the code directly:
  `import { safeStorage } from 'electron'` (genuine Electron API, not the sidecar's later stub) and
  `finishAuth()` calling `configStore.set('refreshToken', encryptToken(refreshToken))` —
  unconditionally, with no seam, no guard, and no registry indirection, because none of that existed
  yet. **This is the historical writer.** It is not a hypothesis: the diff is read directly, dated,
  and ordered unambiguously before every mechanism (the TOKEN_STORE_KEY single-owner guard, the
  TokenStore registry, the sidecar's hardcoded `isEncryptionAvailable: () => false`) that governs
  the key today. The disk copy is a **frozen artifact of a pre-rearchitecture Electron build** that
  ran this exact code path at least once before 2026-07-22, not a live or recent write, and not
  connected in any way to the Keychain-write mechanism investigated above (different commit,
  different era, different store entirely).
  **Context for the still-OPEN plaintext-vs-ciphertext question (not a resolution — flagging only):**
  this write ran under genuine Electron `safeStorage`, which on macOS is Keychain-backed and
  typically reports `isEncryptionAvailable() === true` (unlike the sidecar's unconditional `false`
  stub) — so ciphertext is the more probable shape on priors alone, given when and under what
  runtime this value was written. This is circumstantial reasoning about the writing code's
  behavior, not a read of the value, and does not settle the question. It remains open pending
  explicit operator approval, exactly as constrained.

- timestamp: 2026-09-30 (this session — a real, documented `steam-user` event, checked and ruled
  out as unwired)
  finding: `steam-user`'s own type definitions (`@types/steam-user/index.d.ts:1053`) declare a
  genuine `refreshToken: [refreshToken: string]` client event — `steam-user` CAN emit a rotated
  token independently of any explicit `logOn()` call. Grepped every non-test `.ts` file under
  `steam/` for `'refreshToken'`/`"refreshToken"` as an event name: **the only match is the
  `TOKEN_STORE_KEY` config-key constant** (`constants.ts:15`) — GameLib registers **no**
  `client.on('refreshToken', ...)` listener anywhere. This is a real event the codebase does not
  consume; it cannot be the writer because nothing calls `setToken()` from it, but it is also a
  separate, latent gap worth its own todo (a legitimate token rotation from Steam's servers is
  currently dropped on the floor rather than persisted) — out of scope for this defect, noted for
  later.

## Eliminated

- hypothesis: `SidecarKeyringTokenStore` or `bootstrap.ts` runs a Steam-token migration that reads
  `config.json` and writes the Keychain, mirroring `migrateHumbleSecrets()`.
  eliminated_by: Source trace above. No such migration exists; `keyringTokenStore.ts` never imports
  `configStore`, and `storeWriteHandlers.ts:138-145` actively rejects writes to that key.

- hypothesis: The Rust shell writes the slot directly at startup.
  eliminated_by: No `refresh_token`/`refreshToken` write path in `src-tauri/src/`.

- hypothesis: The Keychain item was not re-created by GameLib at all — deletion missed a
  Keychain-side copy (another keychain in the search list, an iCloud/`kSecAttrSynchronizable` sync,
  or the re-check reading a different item).
  eliminated_by: Unified-log corroboration (this session) proves `gamelib-shell` pid 1695 itself
  performed a genuine `SecKeychainFindGenericPassword` -> `SecKeychainAddGenericPassword` write, 43s
  after its own boot. This is GameLib's own process actively writing, not a passive Keychain-side
  resync. (The `synchronizable`/multi-keychain metadata check was superseded by this stronger,
  direct finding and was not separately run — no longer needed to explain the symptom.)

- hypothesis: A misdirected Rust-side slot argument (`keyring_slot_arg()`'s
  `.unwrap_or("steam-refresh-token")` default) causes an unrelated `RUST_KEYRING_SET` call (e.g.
  from the Humble/SteamGridDB migrations) to land on the Steam account by accident.
  eliminated_by: Exhaustive call-site census — all three non-test `RUST_KEYRING_SET` callers always
  pass an explicit, correctly-bound slot. The default is unreachable dead code under the current
  wire protocol.

- hypothesis: `keyring_available`'s reachability probe is the true source of the observed
  Find-then-Add sequence, misattributed to the Steam slot.
  eliminated_by: Read the Rust arm directly — it calls only `entry.get_password()` (Find) against a
  reserved, deliberately-never-written probe account; there is no `Add` branch in this arm at all.

- hypothesis: `migrateHumbleSecrets()`/`migrateSteamGridDbApiKey()` (which DO run unconditionally at
  every boot, unlike the Steam token) produced the observed write.
  eliminated_by: Both hardcode their own slots and cannot target `steam-refresh-token`; separately,
  all three of their target slots were measured absent after this exact launch, which a successful
  write from either would contradict.

- hypothesis: The installed build (signed 2026-09-23) predates a since-removed Steam-token
  migration bridge, explaining a write the current source can no longer produce.
  eliminated_by: `git log --oneline 59535d08e..HEAD` (59535d08e is the nearest commit at/before the
  build's signing timestamp) scoped to the six token/keyring files returns one commit, and its only
  touch to any of those files is an unrelated i18n `bootstrap.ts` refactor. No token/keyring logic
  changed between the build and current HEAD.

- hypothesis: `steam-user`'s documented `refreshToken` client event fires and something persists it.
  eliminated_by: Grepped every non-test file under `steam/` for a `client.on('refreshToken', ...)`
  listener — none exists. The event is real but entirely unconsumed; it cannot be the writer.

- hypothesis: [THE TODO'S OWN STATED MECHANISM] "Something re-promotes the disk copy into the
  Keychain at boot, unprompted" — i.e. a boot-time routine reads `config.json`'s `refreshToken` and
  writes it into the Keychain.
  eliminated_by: **REFUTED, not just unconfirmed.** The operator's own recollection (checkpoint
  response) plus independent unified-log corroboration by the coordinator establish the write as an
  ordinary QR-login `setToken()` call on a documented, existing login code path (`user.ts:514`),
  fully consistent with every piece of forensic evidence gathered in both sessions (Find-then-Add
  crate semantics, timing 43s post-boot, the exact pid the todo measured). No boot-time
  read-disk-write-keychain mechanism was ever found because none exists — the exhaustive source
  trace above (all `setToken()` call sites, all `RUST_KEYRING_SET` call sites, both migrations, the
  reachability probe) already ruled out every candidate for such a mechanism; the true explanation
  was simply an interactive login the operator did not initially recall as one. **Explicitly:
  resolving this does NOT resolve or explain the disk-copy finding.** No code path was found in
  either session's trace connecting `config.json`'s `refreshToken` key to the Keychain write in
  either direction — they are two independent facts about two different stores. The disk-copy
  question (where the `config.json` value came from, and what if anything should be done about it)
  remains fully open and is now the investigation's sole focus.

## Current Focus

**Keychain-write half: CLOSED, not a bug.** The todo's stated mechanism ("something re-promotes
the disk copy into the Keychain at boot, unprompted") is REFUTED. The observed Keychain write was
an ordinary, documented QR-login write (`user.ts:514`, `getTokenStore().setToken(session.
refreshToken)` -> `SidecarKeyringTokenStore`), fully consistent with all previously-gathered
forensic evidence (unified-log Find-then-Add sequence, crate-source call shape, 43s-post-boot
timing) and now confirmed by the operator's own recollection of performing a QR login that
afternoon, independently re-verified by the coordinator against the unified log. No Keychain
prompt appeared because the signed app's ACL already covered the item — ordinary, expected
behavior, not silent credential re-promotion. **Resolving this does NOT resolve or explain the
disk-copy finding** — no code path connects the two stores in either direction; they are
independent facts. **Sub-question CLOSED by measurement** (this cycle): whether the QR login was
the SAME launch (pid 1695) or an earlier one. The coordinator's full pid census (exactly two
`gamelib-shell` processes in the 17:50-19:00 window — 1695 and 5651 — with no third launch) plus
the 42-second/thread-change gap between pid 1695's boot-path read and its later write jointly
confirm it is the same launch, and that the write pattern itself is inconsistent with automatic
boot-time promotion. See the checkpoint-resume evidence entry above for the full measurement.

**Disk-copy half: now the sole open focus, and substantially diagnosed this cycle.**

hypothesis: The `refreshToken` key in `~/Library/Application Support/GameLib/steam_store/
config.json` is a **frozen, orphaned artifact of a pre-rearchitecture Electron build**. It was
written by the original `finishAuth()` implementation (`configStore.set('refreshToken',
encryptToken(refreshToken))`, `user.ts`, commit `7b82c5ea0`, 2026-06-27) using genuine Electron
`safeStorage` — three weeks before the Tauri scaffold and nearly a month before the `28-03`
TokenStore seam walled that key off to route exclusively through `tokenStore.ts`. Under the
current source tree, **nothing writes or reads that key any more**: the write-side guard
(`storeWriteHandlers.ts:138-145`, rejects sidecar writes) and the read-side unreachability
(`ElectronTokenStore.getToken()` is the only reader, and both arms of `bootstrap.ts`'s exclusive
secret-store branch unconditionally swap `activeTokenStore` away from `ElectronTokenStore` before
any RPC handler can fire — T-28-10) jointly make the key fully dead code today. The surrounding
FILE is not dead, though — `user.ts` actively reads/writes `isLoggedIn`/`userData`/
`credentialsMissing` on the very same file, on every login, via the very same login handlers.
Keychain deletion doesn't clear the residual value because no current code owns cleanup of that
one specific key — the sidecar's boot path was built to install a fresh, independent keyring-backed
store, not to migrate or retire the old Electron-era disk value.

confirming_evidence:
  - `git show 7b82c5ea0` reads the historical write directly: `import { safeStorage } from
    'electron'` + unconditional `configStore.set('refreshToken', ...)`, dated before the seam
    existed.
  - `bootstrap.ts`'s secret-store install block, read in full: both the keyring arm and the
    dev-vault arm call `setTokenStore()`/`installTokenStore()` with a non-`ElectronTokenStore`
    implementation, unconditionally, before any invoke handler can run (T-28-10 ordering comment).
  - `storeWriteHandlers.ts:138-145` rejects sidecar writes to this key (previously traced).
  - `user.ts`'s direct `configStore` calls (13 call sites) confirm the FILE is live for other keys,
    isolating the dead-code claim to `refreshToken` specifically, not the file as a whole.

falsification_test: If any current-tree code path were found that either (a) writes
`TOKEN_STORE_KEY` outside `tokenStore.ts`, or (b) leaves `activeTokenStore` as `ElectronTokenStore`
past `bootstrap.ts`'s `init()` on some boot arm not yet considered, this hypothesis would be wrong.
Both were checked exhaustively this cycle and across the prior cycle; none found.

blind_spots: Whether the value is plaintext or `safeStorage` ciphertext remains genuinely unknown
(not merely unread) — circumstantial reasoning (this write ran under real Electron `safeStorage`,
typically Keychain-backed and `isEncryptionAvailable() === true` on macOS, unlike the sidecar's
hardcoded `false` stub) makes ciphertext the more probable shape on priors, but this is reasoning
about the writer's code, not a read of the value, and settles nothing. Left fully open per standing
constraint. Same-launch-vs-separate-launch for the QR login is now CLOSED by measurement (see the
checkpoint-resume evidence entry and Current Focus above) — no longer a blind spot. Still open:
whether any OTHER pre-2026-07-22 Electron-era write similarly orphaned other now-migrated secrets
(out of scope — not investigated this cycle).

test: N/A this cycle — this is a decision point, not a hypothesis needing another experiment. Per
Authorizations item 8 and the todo's own Direction step 2, deciding what to do about the orphaned
key (delete it, warn about it, leave it) is reserved for the operator. Cleanup options recorded,
not decided or implemented:
  (a) One-time migration-cleanup: in `bootstrap.ts`'s keyring-install arm, after
      `installTokenStore(new SidecarKeyringTokenStore())`, check `configStore.has(TOKEN_STORE_KEY)`
      (presence only, no read of the value) and delete it if present — mirrors the existing
      `migrateHumbleSecrets()`/`migrateSteamGridDbApiKey()` pattern but as a pure cleanup (no value
      transfer, since the keyring store is independently populated by login, not by migration).
  (b) Startup diagnostic only: log a one-time warning when the stale key is detected, without
      auto-deleting — gives the operator visibility and agency without silently mutating a profile
      that predates this investigation.
  (c) Leave it alone: no current code path reads it, so it poses no behavioral risk to the running
      app — only a data-hygiene/security-surface risk (an unrevoked, possibly-plaintext, orphaned
      secret an operator who clears the Keychain would reasonably assume is gone). This accepts the
      todo's underlying concern as a known, documented limitation rather than closing it.
  (d) Document as a manual upgrade step for operators migrating from a pre-Tauri Electron install,
      rather than writing any code at all.
None of these has been chosen. Do not implement or delete anything against the live profile.

expecting: The operator's decision determines whether this session proceeds to `fix_and_verify`
(if (a) is chosen), stays diagnostic-only (if (b)/(c)/(d)), or forks into a new todo. No further
autonomous investigation is possible on this half without either operator input on remediation
choice or explicit approval to settle the plaintext-vs-ciphertext question.

next_action: **CLOSED 2026-09-30 — live gate PASSED, both arms, on the real profile.** See
`Resolution.verification`'s `live human verification` signal for the measured numbers (boot 1
22:51:50: receipt count 1, key deleted; boot 2 22:53:09: count 0, stays absent; `secret stores:
dev-vault` on both). Nothing further is required of this session. Two facts MUST travel with any
future reference to it: (1) the plaintext-vs-ciphertext question is **permanently unanswerable**,
not open — see the lost-evidence note below; (2) the `refreshToken` value on disk during boot 1 was
a labelled synthetic fixture, never a credential.

**Lost-evidence note (2026-09-30).** The original `refreshToken` value — the only remaining
evidence for whether the pre-Tauri Electron build wrote that credential to disk as plaintext or as
`safeStorage` ciphertext — was deleted from the live profile at **21:59:47**, roughly 45 seconds
after the fix first hit disk (`tokenStore.ts` mtime 21:58:36, `bootstrap.ts` 21:59:02) and before
any authorised gate ran. No actor claimed it: the implementing agent was instructed in writing not
to hand-delete it and reported touching nothing, and three `gamelib-shell` pids (33421, 51533,
51953) ran in the 21:55–22:05 window, so a dev boot picking up the freshly-written cleanup is an
equally plausible mechanism. It cannot be settled: the `gamelib.log` covering that window was
rotated out by the 22:15:54/22:16:11 launches, on both sessions' copies.
Recovery avenues are exhausted, measured not assumed: the coordinator's backup
(`config.json.bak-20260930-222549`) post-dates the delete by ~26 minutes and contains only
`['provisioned','wineVersion','isLoggedIn','userData']` with no `refreshToken`; `tmutil
destinationinfo` reports no destinations configured and `tmutil listlocalsnapshots /` returns none.
**No filesystem copy of the original value exists anywhere.** The value was never read, decoded,
hashed or shape-probed by any session — a permission classifier correctly denied that as
Credential Materialization, and no session routed around the denial.
Consequence for the operator, recorded because it outlives this session: a live Steam refresh token
MAY have sat readable on disk from 2026-06-27 until 2026-09-30 (~3 months), and that can no longer
be excluded. Revoking the Steam session is the prudent response regardless of which shape the value
had; re-login is the only cost.

Superseded pre-gate text follows, retained for the record:
**Fix implemented and self-verified; awaiting human verification — do not archive.**
`clearOrphanedElectronToken()` is implemented, wired into `bootstrap.ts`, covered by 8 new tests
(4 unit, 4 integration), and every self-verification signal in `Resolution.verification` passed
(full backend jest project: 221 suites / 5121 passed + 3 skipped; `pnpm codecheck`;
`pnpm planning-gates` 12/12; scoped `prettier --check` over all 5 touched source/test paths). The
source todo has been rewritten with CORRECTION + CLOSED sections and moved to
`.planning/todos/completed/`. What remains is the one signal nothing in this session can produce:
a real launch of the packaged app against the operator's actual, populated
`~/Library/Application Support/GameLib/` profile, confirming the receipt log line fires once and
the `refreshToken` key is gone from `steam_store/config.json` on the next real boot. Only after
that confirmation lands: move this file to `.planning/debug/resolved/`, append the knowledge-base
entry, fix the two now-forward `.planning/debug/resolved/...` references already corrected to the
current path in the completed todo (update them back to `resolved/` at that point), and commit.
The plaintext-vs-ciphertext question stays explicitly open (not settled by this fix, not read, not
needed to be read — presence-only delete does not care which shape the value is).

reasoning_checkpoint:
  hypothesis: "The `refreshToken` key in `steam_store/config.json` is a frozen, orphaned artifact
    of the pre-Tauri Electron build's `finishAuth()` (commit `7b82c5ea0`, 2026-06-27). Under every
    currently-reachable sidecar boot path, nothing reads it (`ElectronTokenStore.getToken()` is
    its only reader and `activeTokenStore` is unconditionally swapped away from
    `ElectronTokenStore` by both arms of `bootstrap.ts`'s secret-store install block before any
    RPC handler can fire — T-28-10) and nothing writes it (`storeWriteHandlers.ts:138-145`
    rejects every sidecar write to this key). Because it is dead and orphaned, not because it is
    dangerous in itself, it should be deleted once, presence-only, at boot."
  confirming_evidence:
    - "`git show 7b82c5ea0` reads the historical write directly — unconditional
      `configStore.set('refreshToken', ...)` under genuine Electron `safeStorage`, dated three
      weeks before the Tauri scaffold and nearly a month before the TokenStore seam existed."
    - "`bootstrap.ts`'s secret-store install block, read in full: both the keyring arm
      (`installTokenStore(new SidecarKeyringTokenStore())`) and the dev-vault arm
      (`installDevSecretVault()` → `setTokenStore(new DevVaultTokenStore(path))`) unconditionally
      install a non-`ElectronTokenStore` implementation before `startRpcServer()`'s loop can
      dispatch any handler — confirmed by direct read of both branches and of
      `devSecretVault.ts:314`."
    - "`storeWriteHandlers.ts:138-145`'s guard rejects sidecar writes to
      `steamConfigStore.refreshToken` unconditionally (both `set` and `delete` ops, read directly
      — the branch runs before the op dispatch)."
  falsification_test: "If any current-tree code path reads `TOKEN_STORE_KEY` outside
    `tokenStore.ts`'s `ElectronTokenStore.getToken()`, or leaves `activeTokenStore` as
    `ElectronTokenStore` past `bootstrap.ts`'s `init()` on some boot arm not yet considered, the
    key would not be provably dead and this fix would risk deleting a value something still
    depends on. Checked exhaustively across two investigation cycles (all `setToken()`/`getToken()`
    call sites, both install arms, the write guard); none found."
  fix_rationale: "The fix retires exactly the dead key the diagnosis identified — nothing more.
    It does not touch the Keychain (the authoritative store, unaffected), does not change which
    TokenStore implementation is active (that swap already happens earlier in `init()`,
    unconditionally, on both arms), and does not attempt to migrate or read the value (presence-only
    `has()`+`delete()`, per Authorizations item 1). It addresses the root cause (an orphaned key with
    no owner) rather than a symptom (e.g. it does not try to prevent recurrence of a re-promotion
    mechanism, because Eliminated already established no such mechanism exists to prevent)."
  blind_spots: "Plaintext-vs-ciphertext shape of the value is still unknown and irrelevant to this
    fix (delete does not need to know). Whether other pre-2026-07-22 Electron-era keys are
    similarly orphaned elsewhere (Humble/SteamGridDB) is out of scope and unchecked this cycle —
    those two already have live `migrateHumbleSecrets()`/`migrateSteamGridDbApiKey()` paths so are
    presumed not to be in the same state, but this was not independently re-verified."
  candidate_causes:
    - "code: `bootstrap.ts`'s `init()` never included a cleanup/migration step for the Steam
      TokenStore's Electron-era disk key when the `28-03` TokenStore seam was introduced — the
      Humble/SteamGridDB equivalents got one, the Steam token did not."
    - "environment/data: the operator's on-disk profile predates the TokenStore seam (created
      2026-06-27, seam landed 2026-07-22) — a fresh post-seam profile would never accumulate this
      key at all, so the defect is a migration gap specifically for profiles that crossed the
      seam boundary, not a defect reachable by a clean install."
  and_gate: "No. A single missing condition (no cleanup step ever written) fully explains the
    symptom on its own — the orphaned key persists whether or not any other factor is present.
    Does not require the environment/data condition (pre-seam profile) to co-occur with a second
    code defect; the code gap alone is sufficient given that precondition. Listed as two categories
    to satisfy the branching requirement, not because both are independently necessary."


## Authorizations and constraints (front-loaded — read before acting)

You are backgrounded and **`AskUserQuestion` cannot reach the operator**. Do not call it. If you
hit a genuine decision, write it into `next_action` above and return.

1. **NEVER print, decode, `base64 -d`, or otherwise materialise the `refreshToken` value** from
   `config.json` or the Keychain. Key presence, value length, and a prefix-shape *predicate*
   (e.g. "does it start with `TOKEN_PREFIX`") are the ceiling — and even the predicate must be
   evaluated without emitting the value. An earlier attempt to inspect the value's structure was
   **denied by the permission classifier as "Credential Materialization", correctly**. Do not
   route around that denial. The plaintext-vs-ciphertext question stays OPEN pending explicit
   operator approval; record it as an open question and move on.
2. **Read-only on the live profile and the Keychain.** Do not delete, add, or modify any Keychain
   item, and do not delete the `refreshToken` key from the live `config.json`. The operator's
   Steam session is the only remaining copy of this credential.
3. **Redact logs before writing anything into the repo.** Logs and Node diagnostic reports embed
   environment and session data. Keep raw captures in the scratchpad; register them for cleanup.
4. **Two-profile rule (CLAUDE.md).** Any direct spawn of the compiled sidecar or SEA binary uses
   `createFakeHomeProfile()` from `src/backend/testUtils/fakeHomeProfile.ts` — never a hand-rolled
   `env` literal. A real-profile arm is permitted only if the defect can only arm under a
   populated profile, and must be declared and justified at the call site.
5. **Formatter check.** Any task that writes a prettier-visible path must run
   `npx prettier --check` over those exact paths, scoped — never `.`. Verify with
   `npx prettier --file-info <path>` first; `.planning/` is ignored, so a check over it is vacuous
   and must not be written into a verify block as though it were assurance.
6. **Todo frontmatter.** Any new file in `.planning/todos/pending/` needs `severity:`,
   `platform:`, `ready:` in that order, bare lowercase values, or `pnpm planning-gates` goes red.
7. **graphify first.** `graphify-out/graph.json` exists — run `graphify query "<question>"` to
   orient before grepping raw source.
8. **Scope authority.** You are authorised to land the diagnosis and, if the root cause turns out
   to be in our code, a fix with tests. You are NOT authorised to change what the authoritative
   credential store is, or to start deleting the disk copy on migration, without recording that as
   a decision for the operator — the todo's Direction step 2 explicitly calls it "a decision, not a
   foregone conclusion".

## Resolution

root_cause: Two independent findings, not one:
  (1) Keychain-write "mystery" — NOT a defect. The write was `user.ts:514`'s QR-login
      `'authenticated'` handler calling `getTokenStore().setToken()` on a completed interactive
      login (confirmed by the operator's own recollection + coordinator's independent unified-log
      re-verification). No Keychain-revocation defect exists in the write mechanism itself.
  (2) Disk-copy defect (the todo's actual, still-open concern) — the `refreshToken` key in
      `steam_store/config.json` is an orphaned artifact of the pre-rearchitecture Electron build's
      original `finishAuth()` (`configStore.set('refreshToken', ...)`, commit `7b82c5ea0`,
      2026-06-27), written before the `28-03` TokenStore seam existed to wall that key off. No
      current code reads or writes that key (both bootstrap.ts secret-store arms unconditionally
      swap the active TokenStore away from `ElectronTokenStore` before any handler can run), so
      Keychain deletion cannot revoke it and nothing in current code retires it either.
fix: Operator authorized option (a) (relayed via the coordinator) — a one-time, presence-only,
  delete-on-boot cleanup, with (b)'s single-line receipt log folded in. Implemented as
  `clearOrphanedElectronToken()` in `src/backend/storeManagers/steam/tokenStore.ts`: checks
  `configStore.has(TOKEN_STORE_KEY)` and, only if present, calls `configStore.delete(TOKEN_STORE_KEY)`
  and returns `true`; returns `false` on a no-op. Never reads, decodes, hashes, or shape-probes the
  value at any point — presence-only by construction, so it does not need to (and does not) resolve
  the plaintext-vs-ciphertext question. Called unconditionally from `src/backend/sidecar/bootstrap.ts`
  `init()`, placed after the entire `devSecretVaultInstalled` if/else secret-store install block
  finishes (outside both arms, so it runs regardless of which TokenStore implementation was just
  installed). Calls the sidecar's own `configStore` object directly — does not route through
  `storeWriteHandlers.ts`'s `applyStoreWrite()` D-04 guard, and no carve-out was added to that guard.
  Emits exactly one log line, key name only, never the value, only when the key was actually present
  and deleted: "[bootstrap] removed a legacy pre-Tauri \`refreshToken\` key from
  \`steam_store/config.json\`; the Keychain (\`steam-refresh-token\` slot) is the authoritative
  store". Idempotent by construction (has()+delete() on an absent key is a silent no-op on every
  subsequent boot). The Keychain (`SidecarKeyringTokenStore`) remains the sole authoritative
  credential store throughout — untouched by this fix in any way.
verification:
  - signal: unit tests (mocked configStore)
    result: pass
    detail: 4 new tests in src/backend/storeManagers/steam/__tests__/tokenStore.test.ts
      ("clearOrphanedElectronToken (debug/steam-token-survives-keychain)") — present -> deleted,
      returns true, get_nodefault() never called; absent -> no-op, returns false, delete() never
      called; idempotent across two calls; structural proof tokenStore.ts imports no
      storeWriteHandlers module at all.
  - signal: integration tests (real, unmocked configStore, real init() boot)
    result: pass
    detail: 4 new tests in src/backend/sidecar/__tests__/bootstrap.test.ts
      ("boot-time orphaned Steam token cleanup (debug/steam-token-survives-keychain)") — present ->
      deleted + exactly the one receipt log line emitted; absent -> no-op, receipt line never
      logged; idempotent -> second real boot after cleanup logs nothing further; does NOT route
      through applyStoreWrite -- jest.spyOn(storeWriteHandlersModule, 'applyStoreWrite') recorded
      zero calls while the key was still confirmed deleted.
  - signal: full backend jest project (regression)
    result: pass
    detail: 221 suites, 5121 passed + 3 skipped = 5124 total, 0 failures. No regressions introduced
      by either the fix or the 8 new tests.
  - signal: pnpm codecheck
    result: pass
  - signal: pnpm planning-gates
    result: pass
    detail: 12/12 gates passed, including the todo-frontmatter gate (scoped to pending/, the
      rewritten todo is now in completed/ and exempt) and the by-construction D-04 source gate
      (electronUntouched.test.ts) — confirms clearOrphanedElectronToken's direct configStore call
      did not violate the bootstrap.ts/keyringTokenStore.ts import ban, since it lives in
      tokenStore.ts, which is outside that gate's scope.
  - signal: npx prettier --check (scoped to touched, non-ignored paths only)
    result: pass
    detail: src/backend/storeManagers/steam/tokenStore.ts, src/backend/sidecar/bootstrap.ts,
      src/backend/sidecar/__tests__/skeletonFlows.test.ts,
      src/backend/storeManagers/steam/__tests__/tokenStore.test.ts,
      src/backend/sidecar/__tests__/bootstrap.test.ts — all clean after one --write pass on the two
      new-test files caught mid-session. .planning/ paths (the debug file, the todo file) are
      prettier-ignored; no vacuous check was run or claimed over them.
  - signal: live human verification on the operator's real, populated profile
    result: pass (2026-09-30, two dev-build boots, operator-performed)
    detail: |
      Both arms confirmed live against the real ~/Library/Application Support/GameLib/ profile,
      on the dev build (`pnpm tauri:dev`). Independently re-measured by the coordinator session
      rather than taken on the running session's report:
        boot 1 (22:51:50) — receipt line count 1 in gamelib.log (since rotated to gamelib.log.old);
          `refreshToken` deleted; config.json back to 373 bytes, keys
          ['isLoggedIn','provisioned','userData','wineVersion'], mtime 22:51:50.
        boot 2 (22:53:09) — receipt line count 0 in the fresh gamelib.log; key stays absent.
        Both boots logged `[bootstrap] secret stores: dev-vault`, proving init() reached the
          secret-store install block and therefore the clearOrphanedElectronToken() call site
          immediately after it on both runs.
        No orphan processes afterwards (pgrep for gamelib-shell / sidecar.js / bin/tauri: none).
      VENUE IS LOAD-BEARING: the gate had to run on the dev build. /Applications/GameLib.app is a
      2026-09-23 bundle containing 0 occurrences of the receipt string, so a relaunch of the
      installed app could not emit the line at all and would have produced a confident green
      proving nothing. Equally load-bearing: the dev build runs the DEV-VAULT arm
      (GAMELIB_DEV_SECRET_VAULT=1), and this gate is only valid there because
      clearOrphanedElectronToken() is called unconditionally OUTSIDE both arms of the secret-store
      branch. Had it been placed inside the keyring arm — an option that was on the table — this
      gate would have been structurally blind and would have passed while proving nothing.
      THE FIXTURE WAS SYNTHETIC. The `refreshToken` value present on disk for boot 1 was
      'SYNTHETIC-FIXTURE-260930-clearOrphanedElectronToken-livegate-DO-NOT-USE', written
      deliberately by the coordinator at 22:27:34 to re-arm the gate. It was NEVER a credential.
      Any shape check run against tonight's config.json reads that string and says nothing about
      the historical value. Re-seeding was necessary because the original key had already been
      deleted at 21:59:47 — see the lost-evidence note below.
  - signal: absent-arm behaviour, observed incidentally before the gate was designed
    result: pass (2026-09-30 22:16 boot)
    detail: The dev sidecar bundle built at 22:15:44 already contained the fix, and the 22:16:03
      boot ran it against a profile whose key had been deleted at 21:59:47. It emitted zero
      receipt lines and no error — the specified absent-branch behaviour, demonstrated live
      before anyone set out to test it.
  guardrail_verdict: accepted (live human verification complete)
files_changed:
  - src/backend/storeManagers/steam/tokenStore.ts (pre-existing this session; clearOrphanedElectronToken() implementation)
  - src/backend/sidecar/bootstrap.ts (pre-existing this session; unconditional call-site wiring after the secret-store install block)
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts (pre-existing this session)
  - src/backend/storeManagers/steam/__tests__/tokenStore.test.ts (this session: 4 new tests)
  - src/backend/sidecar/__tests__/bootstrap.test.ts (this session: 4 new tests)
  - .planning/todos/pending/2026-09-30-clearing-the-keychain-does-not-revoke-the-steam-refresh-token.md -> .planning/todos/completed/2026-09-30-clearing-the-keychain-does-not-revoke-the-steam-refresh-token.md (this session: status OPEN -> RESOLVED, CORRECTION + CLOSED sections added, git mv to completed/)
  - .planning/debug/steam-token-survives-keychain.md (this session: Resolution section, frontmatter status/updated/source_todo)
