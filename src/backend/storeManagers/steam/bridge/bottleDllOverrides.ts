/**
 * Per-appId DLL overrides for a Steam bridge bottle (53-19).
 *
 * Overlooting 3410180 (Godot 4.4) loads `nvapi64.dll` and calls through
 * `nvapi_QueryInterface` results without a NULL check. CrossOver's builtin
 * nvapi64 cannot load its backend, so the game faults at rip=0 before the shim
 * is ever entered (53-15-DIAGNOSIS.md). Overriding nvapi64 to disabled makes
 * `LoadLibraryA` fail, so Godot skips the whole NvAPI block (measured, Arm B in
 * 53-19-NVAPI.md).
 *
 * D-53-06 (fix when measured): one title, one measured entry, scoped to the
 * game's exe. There is deliberately no bottle-wide default, because CrossOver's
 * D3DMetal can use nvapi64 for other games. Nothing is installed into the
 * bottle; this is not the runtime-components work.
 *
 * The write is idempotent (`/f`), so it runs on every launch with no ledger.
 * The applier never rejects: a failure logs a warning and the launch continues.
 */

import type { GameSettings } from 'common/types'
import { logWarning, LogPrefix } from 'backend/logger'

interface BridgeBottleDllOverride {
  readonly dlls: readonly string[]
  readonly exe?: string
}

export const BRIDGE_BOTTLE_DLL_OVERRIDES: Readonly<
  Record<string, BridgeBottleDllOverride>
> = Object.freeze({
  '3410180': Object.freeze({
    dlls: Object.freeze(['nvapi64']),
    exe: 'Overlooting.exe'
  })
})

const NUMERIC_APP_ID = /^\d+$/

export function buildOverrideCommandParts(
  dll: string,
  exe: string | undefined
): string[] {
  const key = exe
    ? `HKEY_CURRENT_USER\\Software\\Wine\\AppDefaults\\${exe}\\DllOverrides`
    : 'HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides'
  return ['reg', 'add', key, '/v', dll, '/t', 'REG_SZ', '/d', '', '/f']
}

export async function applyBridgeBottleDllOverrides(
  appId: string,
  bridgeBottleSettings: GameSettings
): Promise<GameSettings> {
  if (!NUMERIC_APP_ID.test(appId)) return bridgeBottleSettings
  const entry = BRIDGE_BOTTLE_DLL_OVERRIDES[appId]
  if (!entry) return bridgeBottleSettings

  try {
    // Lazy, as bridgeKnownFixes does: avoids the launcher import cycle.
    const { runWineCommand } = await import('backend/launcher')
    for (const dll of entry.dlls) {
      try {
        const result = await runWineCommand({
          commandParts: buildOverrideCommandParts(dll, entry.exe),
          gameSettings: bridgeBottleSettings,
          wait: true,
          protonVerb: 'run',
          skipPrefixCheckIKnowWhatImDoing: true
        })
        if (result?.code) {
          logWarning(
            `Steam ${appId}: DLL override ${dll} exited with code ${result.code}`,
            LogPrefix.Steam
          )
        }
      } catch (error) {
        logWarning(
          `Steam ${appId}: DLL override ${dll} threw: ${String(error)}`,
          LogPrefix.Steam
        )
      }
    }
  } catch (error) {
    logWarning(
      `Steam ${appId}: DLL overrides failed: ${String(error)}`,
      LogPrefix.Steam
    )
  }
  return bridgeBottleSettings
}
