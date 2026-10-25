/**
 * Steam bridge launch known-fixes applier (quick 261024-tny).
 *
 * The Steam-side counterpart of launcher.ts `installFixes` plus
 * `getKnownFixesEnvVariables`: it reads `fixes/<appId>-steam.json` and applies
 * its winetricks verbs, runInPrefix entries and envVariables to the per-app
 * bridge bottle `GameLibSteamBridge-<appId>`.
 *
 * Why `installFixes` cannot be reused for Steam: `Winetricks.install` resolves
 * the SteamGame's own settings rather than the bridge bottle,
 * `runWineCommandOnGame` refuses steam, and `prepareWineLaunch` does prefix and
 * DXVK work the bridge deliberately skips.
 *
 * `registry` (quick 261025-mfz): `reg add /f` values for the bottle, in both
 * registry views unless the entry narrows `views`. Honoured only from the
 * bundled (`public/fixes/`) and local (`fixes/local/`) sources, never the
 * remote layer (decision 6 of per-game-compat-fixes-architecture.md); the
 * layering lives in `readKnownFixesLayered`. The applied-fix ledger and
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
import type { GameSettings, KnownFixRegistryView } from 'common/types'
import { readKnownFixesLayered } from 'backend/knownFixes'
import { sendGameStatusUpdate } from 'backend/utils'
import { logWarning, LogPrefix } from 'backend/logger'
import { getBottleDir } from './bottle'

const REGISTRY_FIX_TIMEOUT_MS = 15_000
const REGISTRY_ROOTS = [
  'HKLM\\',
  'HKEY_LOCAL_MACHINE\\',
  'HKCU\\',
  'HKEY_CURRENT_USER\\'
]
const FORBIDDEN_CHARS = /["\r\n\0]/

export interface ValidRegistryFix {
  key: string
  name: string
  type: 'REG_DWORD' | 'REG_SZ'
  data: string
  views: KnownFixRegistryView[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length > 512) return false
  if (FORBIDDEN_CHARS.test(key)) return false
  const root = REGISTRY_ROOTS.find((r) => key.startsWith(r))
  if (!root) return false
  const rest = key.slice(root.length)
  if (rest === '' || rest.endsWith('\\')) return false
  return rest.split('\\').every((seg) => seg !== '')
}

function parseViews(raw: unknown): KnownFixRegistryView[] | null {
  if (raw === undefined) return [32, 64]
  if (!Array.isArray(raw) || raw.length === 0) return null
  if (!raw.every((v) => v === 32 || v === 64)) return null
  const out: KnownFixRegistryView[] = []
  if (raw.includes(32)) out.push(32)
  if (raw.includes(64)) out.push(64)
  return out
}

/** Validates raw `registry` entries; never throws, warns once per reject. */
export function validateRegistryFixes(
  appId: string,
  raw: unknown
): ValidRegistryFix[] {
  if (!Array.isArray(raw)) {
    logWarning(
      `Steam ${appId}: ignoring registry fixes, not an array`,
      LogPrefix.Steam
    )
    return []
  }
  const out: ValidRegistryFix[] = []
  for (const entry of raw) {
    const reject = (why: string) => {
      let shown: string
      try {
        shown = String(JSON.stringify(entry)).slice(0, 200)
      } catch {
        shown = '[unserialisable]'
      }
      logWarning(
        `Steam ${appId}: skipping invalid registry fix (${why}): ${shown}`,
        LogPrefix.Steam
      )
    }
    if (!isRecord(entry)) {
      reject('not an object')
      continue
    }
    const { key, name, type, value } = entry
    if (!validKey(key)) {
      reject('bad key')
      continue
    }
    if (
      typeof name !== 'string' ||
      name === '' ||
      name.length > 256 ||
      name.startsWith('/') ||
      FORBIDDEN_CHARS.test(name)
    ) {
      reject('bad name')
      continue
    }
    let data: string
    if (type === 'REG_DWORD') {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 0xffffffff
      ) {
        reject('bad REG_DWORD value')
        continue
      }
      data = String(value)
    } else if (type === 'REG_SZ') {
      if (
        typeof value !== 'string' ||
        value.length > 1024 ||
        FORBIDDEN_CHARS.test(value)
      ) {
        reject('bad REG_SZ value')
        continue
      }
      data = value
    } else {
      reject('unknown type')
      continue
    }
    const views = parseViews(entry.views)
    if (!views) {
      reject('bad views')
      continue
    }
    out.push({ key, name, type, data, views })
  }
  return out
}

/** Argv for `reg add`; an array, never a shell string. */
export function buildRegistryFixCommandParts(
  fix: ValidRegistryFix,
  view: KnownFixRegistryView
): string[] {
  return [
    'reg',
    'add',
    fix.key,
    '/v',
    fix.name,
    '/t',
    fix.type,
    '/d',
    fix.data,
    `/reg:${view}`,
    '/f'
  ]
}

export async function applySteamBridgeKnownFixes(
  appId: string,
  bridgeBottleSettings: GameSettings,
  installRoot: string | undefined
): Promise<GameSettings> {
  const fixes = readKnownFixesLayered(appId, 'steam')
  if (!fixes) return bridgeBottleSettings

  try {
    // Lazy, mirroring games.ts's lazy launcher import: avoids the cycle.
    const { Winetricks } = await import('backend/tools')
    const { runWineCommand } = await import('backend/launcher')

    if (fixes.registry !== undefined) {
      // First, so later fix steps see the marker. wait: false follows
      // steamClientSetup.ts: reg.exe's exit code proves the write and
      // `wineserver --wait` can block forever.
      for (const fix of validateRegistryFixes(appId, fixes.registry)) {
        for (const view of fix.views) {
          const where = `${fix.key} ${fix.name} (/reg:${view})`
          let timer: NodeJS.Timeout | undefined
          try {
            const timeout = new Promise<'timeout'>((res) => {
              timer = setTimeout(() => res('timeout'), REGISTRY_FIX_TIMEOUT_MS)
              timer.unref()
            })
            const outcome = await Promise.race([
              runWineCommand({
                commandParts: buildRegistryFixCommandParts(fix, view),
                gameSettings: bridgeBottleSettings,
                wait: false,
                protonVerb: 'run',
                skipPrefixCheckIKnowWhatImDoing: true
              }),
              timeout
            ])
            if (outcome === 'timeout') {
              logWarning(
                `Steam ${appId}: registry fix ${where} timed out`,
                LogPrefix.Steam
              )
            } else if (outcome?.code !== 0) {
              logWarning(
                `Steam ${appId}: registry fix ${where} did not succeed (code ${String(outcome?.code)})`,
                LogPrefix.Steam
              )
            }
          } catch (error) {
            logWarning(
              `Steam ${appId}: registry fix ${where} threw: ${String(error)}`,
              LogPrefix.Steam
            )
          } finally {
            clearTimeout(timer)
          }
        }
      }
    }

    if (fixes.winetricks) {
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

    if (fixes.runInPrefix) {
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

    const entries = Object.entries(fixes.envVariables ?? {})
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
