/**
 * DEV-ONLY channel that sweeps ONE Epic-owned cookie host, for D-35-19-15's live gate.
 *
 * WHY THIS EXISTS. D-35-19-15 requires a sibling-apex cookie (`fortnite.com`,
 * `unrealengine.com`, `twinmotion.com`, `metahuman.com`) proven PRESENT in GameLib's own jar
 * and then ABSENT after the `EPIC_COOKIE_HOSTS` sweep, both by an independent jar read. The
 * seeding half is credential-free and needs nothing from this file -- a plain
 * `oauthCaptureLogin` navigation to one of those public, Epic-run sites seeds it (measured
 * 2026-09-30: 5 cookies on `.fortnite.com`). The SWEEP half had no route: `clearEpicCookies`
 * exists only as a step inside `LegendaryUser.logout()` (`legendary/user.ts:275`), which runs
 * `legendary auth --delete` FIRST and unconditionally, so exercising the sweep used to mean
 * destroying the operator's real Epic session. It also sweeps all five hosts at once, so it
 * cannot isolate one apex. This channel closes that gap without either cost.
 *
 * DELIBERATELY NOT ON THE PRELOAD SURFACE. There is no `window.api` entry and no
 * `AsyncIPCFunctions` type: `sidecar_invoke` already reaches any registered channel by name, so
 * a preload export would widen the renderer's documented surface (and the
 * `IPC-PORT-INVENTORY.md` reconciliation that `preload-surface-gate.py` enforces) for a
 * debugging instrument. Drive it from DevTools instead:
 *
 *   await window.__TAURI_INTERNALS__.invoke('sidecar_invoke', {
 *     channel: 'devSweepEpicCookieDomain',
 *     args: ['fortnite.com']
 *   })
 *
 * THREE INDEPENDENT BOUNDS, none of which this file is trusted to enforce alone:
 *   1. Registration is skipped entirely in a packaged sidecar (`isPackagedSidecar()`), so the
 *      channel does not exist in a shipped build -- an unknown channel, not a guarded one.
 *   2. The Rust arm gates its default-data-store path on `epic_cookie_domain_matches(domain)`
 *      (`main.rs:7236`), so a non-Epic domain cannot be cleared through it no matter what is
 *      passed here. This file deliberately does NOT re-implement that host list: a second copy
 *      is exactly the PAIRED-LIST drift `EPIC_COOKIE_DOMAINS`' own doc comment warns about.
 *   3. It clears cookies only -- never credentials. It does not call `logout()`, does not run
 *      `auth --delete`, and does not touch `legendaryConfig/legendary/user.json`, so a live Epic
 *      session survives it.
 *
 * The sentinel label mirrors `legendary/user.ts:57`'s `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`
 * verbatim. It can never name a real window (`next_login_window_label()` mints
 * `loginwin-{n}-{...}`), and that `None` window lookup is the exact precondition the macOS
 * cookie arms REQUIRE -- not a degradation. See that constant's own comment for the full
 * reasoning; this is a copy of a value, not a second mechanism.
 */

import { ipcMain } from '../platform'
import { getLoginWindowSeamOrThrow } from '../humble/loginWindowSeam'
import { isPackagedSidecar } from './isPackagedSidecar'
import { logInfo, LogPrefix } from '../logger'

/** Verbatim copy of `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL` (`legendary/user.ts:57`). */
const EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL = 'epic-cookie-clear-no-window'

// Deliberately NOT exported: nothing else references this channel name. The renderer reaches it
// as a string literal through `sidecar_invoke` (see the docstring above), and the only in-repo
// consumer is the `ipcMain.handle` call below -- so exporting it would be a dead export, which
// `pnpm find-deadcode` correctly rejects.
const DEV_SWEEP_EPIC_COOKIE_DOMAIN = 'devSweepEpicCookieDomain' as const

/**
 * Registers the dev-only single-host Epic cookie sweep. No-ops in a packaged sidecar.
 *
 * Guarded by the same `let registered = false` latch convention as
 * `registerRunnerAuthFlows()`/`storeRegistration.ts`, so calling it twice neither throws nor
 * stacks a duplicate handler.
 *
 * NO SIDE EFFECTS AT REGISTRATION TIME, deliberately. `handlers.ts` calls this at module
 * scope, so registration time IS import time, and anything logged here runs before
 * `heroicLogWriter` is initialised under Jest -- which is not hypothetical: an earlier draft
 * logged a one-line "dev channel registered" banner here and took 26 sidecar suites down with
 * `TypeError: Cannot read properties of undefined (reading 'logWarning')`. The per-invocation
 * `logInfo` inside the handler is safe because it runs at call time. Same hazard class as the
 * import-time guard `appShellFlowRegistration.ts` documents.
 */
let registered = false
export function registerDevEpicCookieSweepFlow(): void {
  if (registered) {
    return
  }
  if (isPackagedSidecar()) {
    return
  }
  registered = true

  ipcMain.handle(
    DEV_SWEEP_EPIC_COOKIE_DOMAIN,
    async (_event: unknown, ...args: unknown[]) => {
      const domain = args[0]
      if (typeof domain !== 'string' || domain.length === 0) {
        throw new Error(
          `${DEV_SWEEP_EPIC_COOKIE_DOMAIN}: domain must be a non-empty string`
        )
      }

      const seam = getLoginWindowSeamOrThrow()
      const cleared = await seam.clearCookies(
        EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL,
        domain
      )
      // Logged at info because this channel's whole purpose is to produce a citable
      // measurement: the Rust arm emits its own in-memory before(matched=N)/after(matched=N)
      // census on the shell side, and this line is the sidecar-side counterpart.
      logInfo(
        `[devEpicCookieSweep] cleared ${cleared} cookie(s) for domain '${domain}'`,
        LogPrefix.Legendary
      )
      return cleared
    }
  )
}
