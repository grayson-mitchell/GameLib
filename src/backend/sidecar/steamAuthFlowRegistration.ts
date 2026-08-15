/**
 * Curated Steam QR-login + credential-login + session/identity + bottle +
 * client-setup + redeem/install-size channel registration (Phase 30 Plan 01
 * D-01/D-02/D-08; extended Phase 34.4 Plan 01, REQ-34.4-01/REQ-34.4-02;
 * extended Phase 34.4 Plan 02, REQ-34.4-03/REQ-34.4-04/REQ-34.4-05).
 *
 * Registers the invoke handlers the Tauri build's Steam login gate needs to
 * reach a populated, signed-in library, importing the REAL backend code
 * paths unchanged (mirrors `steamFlowRegistration.ts`'s own objective — prove the
 * real logic runs behind the new transport, not a reimplementation):
 *
 * QR login trio (Phase 30, `ipcMain.handle`):
 *   - `checkSteamInstalled` -> `SteamUser.isSteamClientInstalled()` (AUTH-05).
 *   - `steamStartQR` -> `SteamUser.startQRLogin()` (AUTH-01), which on a
 *     successful phone-approved poll writes the refresh token through
 *     `getTokenStore().setToken(...)` (the `SidecarKeyringTokenStore` seam,
 *     Phase 28) and writes only `isLoggedIn`/`userData` onto the shared
 *     `steamConfigStore` — never the token itself (D-03/T-30-01/T-30-02).
 *   - `steamPollQR` -> `SteamUser.pollQRLogin()` (AUTH-01), the frontend's
 *     polling read of the same in-memory `qrSessionState`.
 *
 * Credential/SteamGuard/TOTP login trio (Phase 34.4, REQ-34.4-01,
 * `ipcMain.handle`, `main.ts:899-905`):
 *   - `steamPollCredential` -> `SteamUser.pollCredentialLogin()` (`main.ts:899`).
 *   - `steamStartCredentials` -> `SteamUser.startCredentialLogin(username, password)`
 *     (`main.ts:900-902`).
 *   - `steamSubmitGuard` -> `SteamUser.submitSteamGuardCode(code)` (`main.ts:903-905`).
 *
 * Session/identity trio (Phase 34.4, REQ-34.4-02, `main.ts:918,922,939`):
 *   - `getSteamUserInfo` -> `SteamUser.getUserDetails()` (`ipcMain.handle`,
 *     `main.ts:918`).
 *   - `getSteamSyncedAt` -> `steamSyncStore.get('syncedAt') ?? null`
 *     (`ipcMain.handle`, `main.ts:922`).
 *   - `logoutSteam` -> `SteamUser.logout()` — a **send** (`ipcMain.on`,
 *     `main.ts:939`, `addListener`, NEVER `addHandler`). This is the G-30-01
 *     channel: a `send` registered as a `handle` (or the reverse) fails 100%
 *     silently at runtime (`sidecar-send-channels-fail-silently`, Phase 31
 *     Pitfall 2) — no reject, no timeout, no console line. The listener below
 *     never lets the fire-and-forget `SteamUser.logout()` rejection escape
 *     unguarded.
 *
 * macOS CrossOver bottle trio (Phase 34.4 Plan 02, REQ-34.4-03,
 * `ipcMain.handle`, `main.ts:946-953`):
 *   - `steamBottleProvision` -> `provisionBottle(args)` (`main.ts:946`).
 *   - `isSteamBottleProvisioned` -> `isBottleProvisioned()` (`main.ts:947`).
 *   - `steamBottleStatus` -> the ONE genuinely inline body among the 15
 *     Steam-labeled channels (`main.ts:948-953`): reads
 *     `steamBottleConfigStore.get_nodefault('provisioned') ?? false` and
 *     `steamBottleConfigStore.get_nodefault('bottleName') ??
 *     DEFAULT_STEAM_BOTTLE_NAME`, reproduced here rather than re-derived from
 *     `isBottleProvisioned()` — diverging from the store read would be a
 *     behavior change, not a port. Deliberately has NO `loggedIn` field
 *     (removed by 17-17/WR-02; D-04: bottled-Steam auth stays opaque).
 *   - `isSteamBottleEligible` -> `getSteamBottleEligibilityVerdict(appName)`
 *     (`main.ts:945-947`), Phase 34.13 Plan 07, D-09/D-15 exposure half —
 *     both delegate to the shared install-form seam this file imports below.
 *   - `persistBottleWineVersion` -> `persistInstallFormWineVersion(wineVersion)`
 *     (`main.ts:948-950`), Phase 34.13 Plan 07, D-14 — same shared seam.
 *     The trio above is now a trio plus these two install-form channels.
 *
 * Guided Steam-client install pair (Phase 34.4 Plan 02, REQ-34.4-04,
 * `ipcMain.handle`, `main.ts:958-961`):
 *   - `steamClientSetupStart` -> `startGuidedClientInstall()` (`main.ts:958`).
 *   - `steamClientSetupRecheck` -> `ensureSteamClientReady(appId)`
 *     (`main.ts:959-961`).
 *
 * Misc pair (Phase 34.4 Plan 02, REQ-34.4-05, `ipcMain.handle`,
 * `main.ts:906-917,923-925`):
 *   - `redeemSteamKey` -> the WR-03 main-process trust boundary, ported
 *     VERBATIM from `main.ts:906-917`: a payload whose `store !== 'steam'`,
 *     or whose `key` is not a string, or whose `key` is empty, returns
 *     `{ store: 'steam', outcome: 'error', message: 'invalid-request' }`
 *     WITHOUT reaching `SteamUser.redeemKey` — the renderer payload is
 *     untrusted at runtime despite its type contract. Only a valid payload
 *     calls `SteamUser.redeemKey(store, key)`. Never logs the key value on
 *     either path.
 *   - `getSteamInstallSize` -> `getSteamInstallSize(appId)` (`main.ts:923-925`,
 *     imported from `steam/games.ts`, not `steam/library.ts`).
 *
 * Never live-run (D-08): `steamBottleProvision` downloads a real CrossOver
 * bottle, and `redeemSteamKey` burns a key irreversibly — both stay
 * unit-proven and declared in `34.4-PORTED-CHANNELS.md` (plan 34.4-09).
 * Phase 26's 5 deferred live-key UAT items stay deferred and are NOT folded
 * in. The bottle/client-setup group is Node `child_process` work — zero new
 * Rust arms (34.2's standing rider).
 *
 * Deliberately does NOT register `isLoggedIn` (`LegendaryUser.isLoggedIn()`,
 * `main.ts:875` — Epic auth, reassigned to Phase 34.5 by 34.4 D-03, not a
 * Steam channel despite the inventory grouping it here), nor
 * `getPrivateBranchPassword`/`setPrivateBranchPassword` (`main.ts:1510-1515`
 * — a GOG channel despite the inventory filing it under Steam; registered by
 * `settingsFlowRegistration.ts` instead). Those channels stay unregistered
 * here — `isLoggedIn` keeps rejecting non-fatally with
 * `UNPORTED_CHANNEL_MARKER` per SEAM.md Load-Bearing Invariant B until Phase
 * 34.5 lands.
 */

import { ipcMain } from './electronStub'
// Load-bearing FIRST import (mirrors steamFlowRegistration.ts's Phase 27 Plan
// 05 circular-dep fix): force `storeManagers/index.ts` to be the
// INITIALIZATION ENTRY before the direct `steam/user` import below resolves.
// `storeManagers/index.ts` imports `steam/library` at its OWN top (which in
// turn imports `steam/user`) and only THEN constructs its eager
// `libraryManagerMap` (`new SteamLibraryManager()` ...), so entering through
// it lets every steam/* module finish defining its class export first.
// Entering through `steam/user` DIRECTLY (as this file's own import below
// does) risks the same re-entrant `index.ts` mid-evaluation crash
// `steamFlowRegistration.ts`'s docstring documents (`SteamLibraryManager is
// not a constructor`, esbuild-bundle-only, ts-jest's init order differs) —
// this fix is per-file, not "once is enough", because each curated
// registration module is its own independent entry point into the bundle's
// module graph.
import '../storeManagers'
import { SteamUser } from '../storeManagers/steam/user'
import {
  steamSyncStore,
  steamBottleConfigStore
} from '../storeManagers/steam/electronStores'
import {
  provisionBottle,
  isBottleProvisioned
} from '../storeManagers/steam/bottle'
import {
  startGuidedClientInstall,
  ensureSteamClientReady
} from '../storeManagers/steam/clientSetup'
import { getSteamInstallSize } from '../storeManagers/steam/games'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../storeManagers/steam/constants'
import {
  getSteamBottleEligibilityVerdict,
  persistInstallFormWineVersion
} from '../storeManagers/steam/installFormIpc'

/**
 * Registers the QR-login trio, the credential/SteamGuard/TOTP login trio,
 * and the session/identity trio. Called once from `handlers.ts` — this
 * module owns no side effects at import time beyond the imports above; the
 * caller decides when registration onto the handler registry happens.
 */
export function registerSteamAuthFlows(): void {
  ipcMain.handle('checkSteamInstalled', async () => {
    return SteamUser.isSteamClientInstalled()
  })

  ipcMain.handle('steamStartQR', async () => {
    return SteamUser.startQRLogin()
  })

  ipcMain.handle('steamPollQR', async () => {
    return SteamUser.pollQRLogin()
  })

  // Source: main.ts:899 — credential/SteamGuard/TOTP login trio (REQ-34.4-01).
  ipcMain.handle('steamPollCredential', async () => {
    return SteamUser.pollCredentialLogin()
  })

  ipcMain.handle(
    'steamStartCredentials',
    async (_event: unknown, ...args: unknown[]) => {
      const { username, password } = args[0] as {
        username: string
        password: string
      }
      return SteamUser.startCredentialLogin(username, password)
    }
  )

  ipcMain.handle(
    'steamSubmitGuard',
    async (_event: unknown, ...args: unknown[]) => {
      return SteamUser.submitSteamGuardCode(args[0] as string)
    }
  )

  // Source: main.ts:918,922 — session/identity trio (REQ-34.4-02).
  ipcMain.handle('getSteamUserInfo', async () => {
    return SteamUser.getUserDetails()
  })

  ipcMain.handle('getSteamSyncedAt', async () => {
    return steamSyncStore.get('syncedAt') ?? null
  })

  // Source: main.ts:939 — `addListener('logoutSteam', ...)`, the G-30-01 SEND
  // channel. `ipcMain.on`, NEVER `ipcMain.handle`. `SteamUser.logout()` is
  // async (D-09 gap fix — clears the refresh token through the TokenStore
  // seam, which may RPC to Rust in the sidecar build); this listener is
  // fire-and-forget, so its promise must not be discarded silently
  // (`sidecar-dialog-reject-crashes`: an unguarded fire-and-forget rejection
  // can crash the sidecar). Mirrors `humble/ipc_handler.ts:121-125`'s
  // `humbleDisconnect` guard shape.
  ipcMain.on('logoutSteam', () => {
    SteamUser.logout().catch((error) =>
      console.warn('[steamAuthFlowRegistration] logoutSteam failed:', error)
    )
  })

  // Source: main.ts:906-917 — WR-03's trust-boundary validation for a
  // security-sensitive secret, ported VERBATIM (REQ-34.4-05). The renderer
  // payload is untrusted at runtime despite its type contract: reject a
  // malformed shape (non-'steam' store, non-string / empty key) BEFORE
  // delegating to steam-user, rather than forwarding garbage across. Never
  // logs the key value on either path.
  ipcMain.handle(
    'redeemSteamKey',
    async (_event: unknown, ...args: unknown[]) => {
      const payload = args[0] as { store?: unknown; key?: unknown }
      const store = payload?.store
      const key = payload?.key
      if (store !== 'steam' || typeof key !== 'string' || key.length === 0) {
        return { store: 'steam', outcome: 'error', message: 'invalid-request' }
      }
      return SteamUser.redeemKey(store, key)
    }
  )

  // Source: main.ts:923-925 (REQ-34.4-05). Imported from steam/games.ts, NOT
  // steam/library.ts.
  ipcMain.handle(
    'getSteamInstallSize',
    async (_event: unknown, ...args: unknown[]) => {
      return getSteamInstallSize(args[0] as string)
    }
  )

  // ── macOS CrossOver bottle trio (REQ-34.4-03, main.ts:946-953) ────────────
  ipcMain.handle(
    'steamBottleProvision',
    async (_event: unknown, ...args: unknown[]) => {
      return provisionBottle(args[0] as Parameters<typeof provisionBottle>[0])
    }
  )

  ipcMain.handle('isSteamBottleProvisioned', async () => {
    return isBottleProvisioned()
  })

  // Source: main.ts:948-953 — the ONE genuinely inline body among the 15
  // Steam-labeled channels. Reproduces the store read exactly; does NOT call
  // isBottleProvisioned() as a "better" source, and does NOT re-add a
  // `loggedIn` field (removed by 17-17/WR-02 — bottled-Steam auth stays
  // opaque, D-04).
  ipcMain.handle('steamBottleStatus', async () => {
    return {
      provisioned: steamBottleConfigStore.get_nodefault('provisioned') ?? false,
      bottleName:
        steamBottleConfigStore.get_nodefault('bottleName') ??
        DEFAULT_STEAM_BOTTLE_NAME
    }
  })

  // ── Phase 34.13 Plan 07 install-form channels (D-09/D-14/D-15,
  // main.ts's own mirrored addHandler pair) — both delegate to the shared
  // install-form seam imported below, the SAME import main.ts uses, so the
  // two runtimes cannot drift. THESE TWO channels' payloads are passed
  // through UNCAST — both seams take `unknown` by design, and casting here
  // would defeat that guard at the type level. (34.13 review WR-10: the read
  // channel used to cast `args[0] as string` while this very comment
  // claimed otherwise; the seam now carries the typeof guard so no cast is
  // needed in either runtime.)
  //
  // SCOPE OF THAT CLAIM — narrowed by 34.13 review A-05, which found this
  // comment reading as though the whole FILE had adopted an uncast posture
  // when only 2 of its 7 payload-carrying handlers have. The other five
  // still cast, and each one's callee owns the guard that is missing:
  //
  //   getSteamInstallSize      -> `args[0] as string`; the callee's guard is
  //                               `if (!/^\d+$/.test(appId))` in
  //                               `steam/games.ts` — the IDENTICAL regex-only
  //                               shape WR-10's own RED test writes out as
  //                               the hole (`RegExp.prototype.test` COERCES,
  //                               so `123` and `['570']` both pass). It also
  //                               interpolates the rejected value into its
  //                               log line.
  //   steamClientSetupRecheck  -> `args[0] as string`
  //   steamSubmitGuard         -> `args[0] as string`
  //   steamStartCredentials    -> destructures `{username, password}` with no
  //                               runtime shape check at all (a non-object
  //                               payload throws at the destructure)
  //   steamBottleProvision     -> casts to `provisionBottle`'s parameter,
  //                               which carries a `bottleName` and a
  //                               `wineVersion` and is therefore the same
  //                               category of untrusted payload as the
  //                               install-form seam, with no validation
  //
  // The FIX for each is to push the guard down into its own seam (the shape
  // WR-10 established), so the cast disappears from BOTH runtimes at once —
  // `main.ts` carries the identical casts, and hardening only this file
  // would create a real Electron/Tauri behaviour divergence, which is worse
  // than the uniform gap. Those seams (`steam/games.ts`, `steam/bottle.ts`)
  // could not be edited in the pass that wrote this note; the pushdown is
  // recorded here rather than half-applied.
  // ─────────────────────────────────────────────────────────────────────────
  ipcMain.handle(
    'isSteamBottleEligible',
    async (_event: unknown, ...args: unknown[]) => {
      return getSteamBottleEligibilityVerdict(args[0])
    }
  )

  ipcMain.handle(
    'persistBottleWineVersion',
    async (_event: unknown, ...args: unknown[]) => {
      return persistInstallFormWineVersion(args[0])
    }
  )

  // ── Guided Steam-client install pair (REQ-34.4-04, main.ts:958-961) ───────
  ipcMain.handle('steamClientSetupStart', async () => {
    return startGuidedClientInstall()
  })

  ipcMain.handle(
    'steamClientSetupRecheck',
    async (_event: unknown, ...args: unknown[]) => {
      return ensureSteamClientReady(args[0] as string)
    }
  )
}
