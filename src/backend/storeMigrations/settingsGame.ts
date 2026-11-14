/**
 * `settings/game` (GamesConfig/<app>.json) migration chain (Phase 68, D-10;
 * Phase 70 gap G3, per-game half, WR-05).
 *
 * v0 -> v1 is an identity step. v1 -> v2 removes what the strict IPC schema
 * cannot hold, derived from `gameSettingsSchema.partial()` with the D-12
 * pattern: (1) keys no GameSettings member declares (e.g. `useSteamRuntime`,
 * removed in 56b1edc46 without a migration), nulls on members that reject
 * null, and any value the schema rejects (a stale `lastUsedLaunchOption`, a
 * wrong type, an over-long string). An invalid array element is removed on
 * its own and its valid siblings stay; an older-build `gamescope` missing
 * `additionalOptions` is repaired, not dropped (see settingsStrip.ts, WR-02).
 * (2) The default applies for each removed value. (3) Valid values are never
 * touched. (4) Trade-off: an invalid user value is dropped from the live
 * file; the engine's 0600 pre-migration backup keeps the original, and each
 * removed or cleaned key is logged by name.
 *
 * The persisted object is round-tripped by the install dialogs through
 * writeConfig and runWineCommand, both strict.
 */
import type { Migration } from '../storeVersioning/types'
import { gameSettingsSchema } from 'common/types/ipc/settingsSchema'
import { stripSettings } from './settingsStrip'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export const settingsGameChain: readonly Migration[] = [
  { id: 'settings-game-v0-v1', to: 1, identity: true, run: (d) => d },
  {
    id: 'settings-game-v1-v2',
    to: 2,
    run: (file) =>
      Object.fromEntries(
        Object.entries(file).map(([key, value]) => [
          key,
          key !== 'version' && key !== 'explicit' && isPlainObject(value)
            ? stripSettings(
                value,
                gameSettingsSchema.partial(),
                `settings-game-v1-v2 ${key}`
              )
            : value
        ])
      )
  }
]
