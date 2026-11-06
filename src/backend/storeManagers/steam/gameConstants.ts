export const STEAM_STORE_API = 'https://store.steampowered.com/api/appdetails'

/** The project-wide appId shape guard (clientSetup.ts, installFormIpc.ts,
 * bottle.ts, bridge/allowlist.ts all carry the identical regex). Used by
 * uninstallBottleGameDirectly to validate a renderer-supplied appId before it
 * is interpolated into a filesystem delete target — 34.13 review A-12. */
export const NUMERIC_APP_ID = /^\d+$/
