/**
 * Steam-library `GameInfo[]` fixtures for the ownership-dedup matcher
 * (dedup.ts, HDEDUP-01). Titles are drawn verbatim from this project's own
 * documented fuzzy-match fixtures (12-RESEARCH.md Pattern 3 / prior
 * PITFALLS.md research), including the DLC/edition false-positive pairs the
 * 85% threshold + DLC-keyword guard exist to prevent. `app_name` is the
 * stringified Steam AppID, mirroring steam/library.ts (`app_name: appIdStr`).
 */

import { GameInfo } from 'common/types'

function makeSteamGame(appId: string, title: string): GameInfo {
  return {
    runner: 'steam',
    app_name: appId,
    title,
    art_cover: `https://cdn.example/${appId}/header.jpg`,
    art_square: `https://cdn.example/${appId}/capsule.jpg`,
    install: {},
    is_installed: false,
    canRunOffline: false
  }
}

/** AppID-tier fixture: Portal 2's real AppID, used for exact-match tests. */
export const steamOwnedPortal2 = makeSteamGame('620', 'Portal 2')

/** Should fuzzy-match Humble "Assault Android Cactus+" (trailing `+`). */
export const steamOwnedCactus = makeSteamGame(
  '250110',
  'Assault Android Cactus'
)

/** Should fuzzy-match Humble "FRAMED Collection" (case + edition suffix). */
export const steamOwnedFramed = makeSteamGame('388390', 'Framed Collection')

/** Should fuzzy-match Humble "Into the Breach" (parenthetical qualifier). */
export const steamOwnedIntoTheBreach = makeSteamGame(
  '590380',
  'Into The Breach (Steam)'
)

/** Base game — Humble "Game X: Season Pass" must NOT match this (DLC guard). */
export const steamOwnedGameX = makeSteamGame('900001', 'Game X')

/** Longer title — Humble "Batman" must NOT match this (substring != match). */
export const steamOwnedBatmanArkhamKnight = makeSteamGame(
  '208650',
  'Batman: Arkham Knight'
)

/** Cross-platform (D-45) target: a GOG-platform Humble key for this title
 * still counts as owned-elsewhere. */
export const steamOwnedStardew = makeSteamGame('413150', 'Stardew Valley')

/** Full owned-library fixture used by the recomputeOwnership tests. */
export const ownedSteamLibrary: GameInfo[] = [
  steamOwnedPortal2,
  steamOwnedCactus,
  steamOwnedFramed,
  steamOwnedIntoTheBreach,
  steamOwnedGameX,
  steamOwnedBatmanArkhamKnight,
  steamOwnedStardew
]
