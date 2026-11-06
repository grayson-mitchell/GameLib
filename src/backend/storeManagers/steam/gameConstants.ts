export const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'

/** The single project-wide steam appId shape guard, imported by every steam
 * module (clientSetup, installFormIpc, bottle, bridge/*, removeAllCopies,
 * cancelDelete, library, installLocation, gameUninstall, buildSteamProtocolUrl)
 * that validates a renderer-supplied appId before it reaches a filesystem path,
 * steam:// URL or bridge allowlist lookup — 34.13 review A-12. Must stay
 * flag-free (no `g`/`y`): the one RegExp object is shared, so `.test()` has to
 * stay stateless (no lastIndex carry-over). */
export const NUMERIC_APP_ID = /^\d+$/
