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
 * This function never rejects: a fix failure logs a warning and the launch
 * continues, so it can never mark the bridge failed for the session.
 */

import { isAbsolute, relative, resolve } from 'node:path'
import type { GameSettings } from 'common/types'
import { readKnownFixes, readKnownFixProfile } from 'backend/knownFixes'
import { sendGameStatusUpdate } from 'backend/utils'
import { logWarning, LogPrefix } from 'backend/logger'
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
      // `wineserver --wait` can block forever.
      await applyRegistryFixes(
        profile.registry,
        { label: `Steam ${appId}`, logPrefix: LogPrefix.Steam },
        (commandParts) =>
          runWineCommand({
            commandParts,
            gameSettings: bridgeBottleSettings,
            wait: false,
            protonVerb: 'run',
            skipPrefixCheckIKnowWhatImDoing: true
          })
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

    const entries = Object.entries(fixes?.envVariables ?? {})
    if (entries.length > 0) {
      // enviromentOptions is the channel runWineCommand already applies via
      // setupEnvVars. Appending puts fix vars after the user's own, matching
      // GOG's fixes-win precedence. setupWineEnvVars (CX_BOTTLE) still wins, so
      // a fix can never redirect the bottle. options.env would be overridden
      // by setupEnvVars.
      return {
        ...bridgeBottleSettings,
        enviromentOptions: [
          ...(bridgeBottleSettings.enviromentOptions ?? []),
          ...entries.map(([key, value]) => ({ key, value: String(value) }))
        ]
      }
    }
    return bridgeBottleSettings
  } catch (error) {
    logWarning(
      `Steam ${appId}: known-fixes application failed: ${String(error)}`,
      LogPrefix.Steam
    )
    return bridgeBottleSettings
  }
}
