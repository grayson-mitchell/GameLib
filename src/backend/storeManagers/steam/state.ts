import { GameInfo } from 'common/types'

/**
 * Shared in-memory library Map — populated by SteamLibraryManager.refresh()
 * and read by SteamGame.getGameInfo(). Lives here (not in library.ts) so that
 * games.ts (plan 03) can import it without creating a circular dependency.
 */
export const library = new Map<string, GameInfo>()

/**
 * Tracks in-flight metadata fetches so SteamGame.fetchMetadataIfNeeded()
 * does not fire concurrent requests for the same AppID.
 * Mitigates T-2-03 (Tampering — repeated CM calls).
 */
export const pendingFetches = new Set<string>()
