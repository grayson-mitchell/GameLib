import { addHandler } from 'backend/ipc'
import { logError, logWarning, LogPrefix } from 'backend/logger'
import * as SteamGridDB from './utils'
import { getSteamGridDbSecretStore } from './secretStore'

/**
 * Amendment A-03 (Phase 34.6 Plan 09, REQ-34.6-06/34.6-08): every read/write of the SteamGridDB
 * API key routes through `getSteamGridDbSecretStore()` — never `GlobalConfig`/`secureKey.ts`
 * directly. The seam's `ElectronSteamGridDbSecretStore` (installed by default) already owns the
 * ONE surviving legacy-plaintext migration codepath (see `secretStore.ts`'s `getApiKey()`); the
 * inline `readStoredApiKey()`/`getDecryptedApiKey()` migration branch that used to live in this
 * file is deleted, not duplicated.
 */

addHandler('steamgriddb.hasApiKey', async () => {
  const apiKey = await getSteamGridDbSecretStore().getApiKey()
  return !!apiKey
})

addHandler('steamgriddb.setApiKey', async (event, key) => {
  // WR-01 (34.6-REVIEW.md): same guard as the sidecar handler in
  // `sidecar/enrichmentFlowRegistration.ts`. Kept on BOTH paths deliberately -- the review found
  // this defect on the sidecar path, but the Electron handler forwards its parameter with no
  // runtime check either, and a one-sided fix would leave the two builds divergent again, which
  // is exactly what WR-02 was about.
  if (typeof key !== 'string') {
    logWarning(
      'steamgriddb.setApiKey: ignored a non-string key',
      LogPrefix.Backend
    )
    return
  }
  await getSteamGridDbSecretStore().setApiKey(key)
})

addHandler('steamgriddb.searchGame', async (event, query) => {
  const apiKey = await getSteamGridDbSecretStore().getApiKey()
  if (!apiKey) {
    return []
  }

  try {
    const results = await SteamGridDB.searchGame(apiKey, query)
    return results.map((game) => ({
      id: game.id,
      name: game.name
    }))
  } catch (error) {
    logError(['SteamGridDB search failed:', error], LogPrefix.Backend)
    throw error
  }
})

addHandler('steamgriddb.getGrids', async (event, args) => {
  const apiKey = await getSteamGridDbSecretStore().getApiKey()
  if (!apiKey) {
    return []
  }

  try {
    const results = await SteamGridDB.getGrids(apiKey, {
      gameId: args.gameId,
      dimensions: args.dimensions,
      styles: args.styles
    })
    return results.map((grid) => ({
      id: grid.id,
      url: grid.url,
      thumb: grid.thumb
    }))
  } catch (error) {
    logError([`SteamGridDB getGrids failed:`, error], LogPrefix.Backend)
    throw error
  }
})

addHandler('steamgriddb.getHeroes', async (event, args) => {
  const apiKey = await getSteamGridDbSecretStore().getApiKey()
  if (!apiKey) {
    return []
  }

  try {
    const results = await SteamGridDB.getHeroes(apiKey, {
      gameId: args.gameId,
      dimensions: args.dimensions,
      styles: args.styles
    })
    return results.map((grid) => ({
      id: grid.id,
      url: grid.url,
      thumb: grid.thumb
    }))
  } catch (error) {
    logError([`SteamGridDB getHeroes failed:`, error], LogPrefix.Backend)
    throw error
  }
})
