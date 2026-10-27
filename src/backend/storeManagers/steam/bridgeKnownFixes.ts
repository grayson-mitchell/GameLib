/**
 * Steam bridge launch known-fixes applier (quick 261024-tny).
 *
 * The Steam-side counterpart of launcher.ts `installFixes` plus
 * `getKnownFixesEnvVariables`: it reads the tier-1 file `<appId>-steam.json`
 * (local/bundled/remote, allow-listed; quick 261025-vnf) and applies its
 * winetricks verbs, runInPrefix entries and envVariables to the per-app
 * bridge bottle `GameLibSteamBridge-<appId>`.
 *
 * Why `installFixes` cannot be reused for Steam: `Winetricks.install` resolves
 * the SteamGame's own settings rather than the bridge bottle,
 * `runWineCommandOnGame` refuses steam, and `prepareWineLaunch` does prefix and
 * DXVK work the bridge deliberately skips.
 *
 * `registry` (quick 261025-mfz): `reg add /f` values for the bottle, in both
 * registry views unless the entry narrows `views`. Comes from the tier-2 file
 * `<appId>-steam.profile.json`, honoured only from the bundled
 * (`public/fixes/`) and local (`fixes/local/`) sources, never the remote layer
 * (decision 6 of per-game-compat-fixes-architecture.md); the layering lives in
 * `readKnownFixProfile`. Validation and application now live in
 * `knownFixesRegistry.ts`, shared with the non-Steam Wine path. The applied-fix ledger and
 * reversal (decision 5) are deferred, like D2: turning a profile off does not
 * remove a value already written.
 *
 * D2: winetricks verbs re-run on every launch, as for other stores. There is
 * no applied-fix ledger.
 *
 * `overlays` (quick 261027-n77): tier-2 entries naming a catalogue overlay (a
 * GStreamer plugin dir) are installed on demand and appended to
 * `GST_PLUGIN_PATH` after the tier-1 entries, on darwin + CrossOver only; see
 * `knownFixOverlays.ts`. Every known-fix env var applied is logged.
 *
 * This function never rejects: a fix failure logs a warning and the launch
 * continues, so it can never mark the bridge failed for the session.
 */

import { isAbsolute, relative, resolve } from 'node:path'
import type { GameSettings } from 'common/types'
import { readKnownFixes, readKnownFixProfile } from 'backend/knownFixes'
import { sendGameStatusUpdate } from 'backend/utils'
import { logWarning, LogPrefix } from 'backend/logger'
import {
  lastEnvOption,
  logKnownFixEnv,
  resolveKnownFixOverlayEnv
} from 'backend/knownFixOverlays'
import {
  applyRegistryFixes,
  buildRegistryFixCommandParts,
  validateRegistryFixes as sharedValidateRegistryFixes,
  type ValidRegistryFix
} from 'backend/knownFixesRegistry'
import { getBottleDir } from './bottle'

export type { ValidRegistryFix }
export { buildRegistryFixCommandParts }

/** Steam-labelled wrapper over the shared validator. */
export function validateRegistryFixes(
  appId: string,
  raw: unknown
): ValidRegistryFix[] {
  return sharedValidateRegistryFixes(raw, {
    label: `Steam ${appId}`,
    logPrefix: LogPrefix.Steam
  })
}

// The shim's feature catalogue (spike 034). Every entry is generic: a feature
// name the shim implements and a validator for its parameters. The shim reads
// at most 16 patterns of under 64 bytes each.
const WGL_EXTENSION_PATTERN = /^[A-Za-z0-9_]{1,62}\*?$/
const MAX_WGL_PATTERNS = 16

/**
 * `fix.<feature>=<value>` lines for `gamelib_bridge.cfg` from the tier-2
 * profile's `shimFeatures`. An unknown feature or invalid parameter is dropped
 * with a warning, never passed to the shim.
 */
export function steamShimFeatureCfgLines(appId: string): string[] {
  const features: unknown = readKnownFixProfile(appId, 'steam')?.shimFeatures
  if (features === undefined) return []
  if (typeof features !== 'object' || features === null) {
    logWarning(
      `Steam ${appId}: shimFeatures is not an object, ignoring it`,
      LogPrefix.Steam
    )
    return []
  }
  const lines: string[] = []
  for (const [name, value] of Object.entries(features)) {
    if (name !== 'wgl.hideExtensions') {
      logWarning(
        `Steam ${appId}: unknown shim feature '${name}', ignoring it`,
        LogPrefix.Steam
      )
      continue
    }
    const patterns = Array.isArray(value)
      ? value.filter(
          (p): p is string =>
            typeof p === 'string' && WGL_EXTENSION_PATTERN.test(p)
        )
      : []
    if (
      !Array.isArray(value) ||
      patterns.length !== value.length ||
      patterns.length === 0 ||
      patterns.length > MAX_WGL_PATTERNS
    ) {
      logWarning(
        `Steam ${appId}: invalid ${name} patterns ${JSON.stringify(value)}, ignoring the feature`,
        LogPrefix.Steam
      )
      continue
    }
    lines.push(`fix.${name}=${patterns.join(',')}`)
  }
  return lines
}

export async function applySteamBridgeKnownFixes(
  appId: string,
  bridgeBottleSettings: GameSettings,
  installRoot: string | undefined
): Promise<GameSettings> {
  const fixes = readKnownFixes(appId, 'steam')
  const profile = readKnownFixProfile(appId, 'steam')
  if (!fixes && !profile) return bridgeBottleSettings

  try {
    // Lazy, mirroring games.ts's lazy launcher import: avoids the cycle.
    const { Winetricks } = await import('backend/tools')
    const { runWineCommand } = await import('backend/launcher')

    if (profile?.registry !== undefined) {
      // First, so later fix steps see the marker. wait: false follows
      // steamClientSetup.ts: reg.exe's exit code proves the write and
      // `wineserver --wait` can block forever. Values already present in the
      // bottle's system.reg/user.reg are skipped, and a timed-out reg add is
      // killed (quick 261027-m1m).
      await applyRegistryFixes(
        profile.registry,
        { label: `Steam ${appId}`, logPrefix: LogPrefix.Steam },
        (commandParts, onSpawn) =>
          runWineCommand({
            commandParts,
            gameSettings: bridgeBottleSettings,
            wait: false,
            protonVerb: 'run',
            skipPrefixCheckIKnowWhatImDoing: true,
            onSpawn
          }),
        bridgeBottleSettings.wineCrossoverBottle
          ? getBottleDir(bridgeBottleSettings.wineCrossoverBottle)
          : undefined
      )
    }

    if (fixes?.winetricks) {
      sendGameStatusUpdate({
        appName: appId,
        runner: 'steam',
        status: 'winetricks'
      })

      // Winetricks needs the bottle's own prefix; the bridge settings carry
      // the GLOBAL winePrefix.
      const winetricksSettings: GameSettings = {
        ...bridgeBottleSettings,
        winePrefix: getBottleDir(bridgeBottleSettings.wineCrossoverBottle)
      }
      for (const verb of fixes.winetricks) {
        if (typeof verb !== 'string' || verb === '' || verb.startsWith('-')) {
          logWarning(
            `Steam ${appId}: skipping invalid winetricks verb ${JSON.stringify(verb)}`,
            LogPrefix.Steam
          )
          continue
        }
        try {
          const outcome = await Winetricks.install(
            'steam',
            appId,
            verb,
            undefined,
            winetricksSettings
          )
          if (outcome !== 'installed') {
            logWarning(
              `Steam ${appId}: winetricks ${verb} did not install (${outcome})`,
              LogPrefix.Steam
            )
          }
        } catch (error) {
          logWarning(
            `Steam ${appId}: winetricks ${verb} threw: ${String(error)}`,
            LogPrefix.Steam
          )
        }
      }
    }

    if (fixes?.runInPrefix) {
      if (installRoot === undefined) {
        logWarning(
          `Steam ${appId}: skipping runInPrefix fixes, install root unknown`,
          LogPrefix.Steam
        )
      } else {
        sendGameStatusUpdate({
          appName: appId,
          runner: 'steam',
          status: 'redist',
          context: 'FIXES'
        })
        for (const entry of fixes.runInPrefix) {
          const fullPath = resolve(installRoot, entry)
          const rel = relative(resolve(installRoot), fullPath)
          if (rel.startsWith('..') || isAbsolute(rel) || rel === '') {
            logWarning(
              `Steam ${appId}: skipping runInPrefix entry ${entry}, outside the install root`,
              LogPrefix.Steam
            )
            continue
          }
          try {
            // skipPrefixCheck matches the bridge launch, so a non-CrossOver
            // fallback can never trigger verifyWinePrefix on the global prefix.
            const result = await runWineCommand({
              commandParts: [fullPath],
              gameSettings: bridgeBottleSettings,
              wait: true,
              protonVerb: 'run',
              skipPrefixCheckIKnowWhatImDoing: true
            })
            if (result?.code) {
              logWarning(
                `Steam ${appId}: runInPrefix ${entry} exited with code ${result.code}`,
                LogPrefix.Steam
              )
            }
          } catch (error) {
            logWarning(
              `Steam ${appId}: runInPrefix ${entry} threw: ${String(error)}`,
              LogPrefix.Steam
            )
          }
        }
      }
    }

    // enviromentOptions is the channel runWineCommand already applies via
    // setupEnvVars. Appending puts fix vars after the user's own, matching
    // GOG's fixes-win precedence. setupWineEnvVars (CX_BOTTLE) still wins, so
    // a fix can never redirect the bottle. options.env would be overridden
    // by setupEnvVars.
    const tier1Entries = Object.entries(fixes?.envVariables ?? {}).map(
      ([key, value]) => ({ key, value: String(value) })
    )
    const merged = [
      ...(bridgeBottleSettings.enviromentOptions ?? []),
      ...tier1Entries
    ]
    const overlayEnv = await resolveKnownFixOverlayEnv(profile?.overlays, {
      label: `Steam ${appId}`,
      logPrefix: LogPrefix.Steam,
      wineType: bridgeBottleSettings.wineVersion?.type,
      baseValue: (k) => lastEnvOption(merged, k) ?? process.env[k]
    })
    const overlayEntries = Object.entries(overlayEnv).map(([key, value]) => ({
      key,
      value
    }))
    if (tier1Entries.length === 0 && overlayEntries.length === 0) {
      return bridgeBottleSettings
    }
    logKnownFixEnv(
      `Steam ${appId}`,
      [
        ...tier1Entries.map((e) => ({ ...e, source: 'tier-1' })),
        ...overlayEntries.map((e) => ({ ...e, source: 'overlay' }))
      ],
      LogPrefix.Steam
    )
    return {
      ...bridgeBottleSettings,
      enviromentOptions: [...merged, ...overlayEntries]
    }
  } catch (error) {
    logWarning(
      `Steam ${appId}: known-fixes application failed: ${String(error)}`,
      LogPrefix.Steam
    )
    return bridgeBottleSettings
  }
}
