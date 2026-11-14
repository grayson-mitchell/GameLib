/**
 * Phase 70 (D-09): complete per-runner GameInfo fixtures for the strict IPC schemas. Each builder
 * returns a valid member of the GameInfo union; pass overrides to vary a field.
 */
import type { GameInfoCore } from 'common/types'
import type { GogGameInfo } from 'common/types/gog'
import type { LegendaryGameInfo } from 'common/types/legendary'
import type { NileGameInfo } from 'common/types/nile'
import type { SideloadGameInfo } from 'common/types/sideload'
import type { SteamGameInfo } from 'common/types/steam'

function core(appName: string, title: string) {
  return {
    app_name: appName,
    title,
    art_cover: 'https://cdn.example/cover.jpg',
    art_square: 'https://cdn.example/square.jpg',
    install: {},
    is_installed: false,
    canRunOffline: true
  } satisfies Omit<GameInfoCore, 'runner'>
}

export function steamGameInfoFixture(
  overrides: Partial<SteamGameInfo> = {}
): SteamGameInfo {
  return { ...core('220', 'Half-Life 2'), runner: 'steam', ...overrides }
}

/** @public consumed by the parity and strict-reject tests in this plan's Task 2; tag removed there */
export function gogGameInfoFixture(
  overrides: Partial<GogGameInfo> = {}
): GogGameInfo {
  return { ...core('1207658930', 'The Witcher'), runner: 'gog', ...overrides }
}

/** @public consumed by the parity and strict-reject tests in this plan's Task 2; tag removed there */
export function legendaryGameInfoFixture(
  overrides: Partial<LegendaryGameInfo> = {}
): LegendaryGameInfo {
  return { ...core('Fortnite', 'Fortnite'), runner: 'legendary', ...overrides }
}

/** @public consumed by the parity and strict-reject tests in this plan's Task 2; tag removed there */
export function nileGameInfoFixture(
  overrides: Partial<NileGameInfo> = {}
): NileGameInfo {
  return {
    ...core('amzn1.adg.product.x', 'Amazon Game'),
    runner: 'nile',
    ...overrides
  }
}

/** Exactly what SideloadDialog's handleInstall sends to addNewApp. */
export function sideloadGameInfoFixture(
  overrides: Partial<SideloadGameInfo> = {}
): SideloadGameInfo {
  return {
    ...core('sideapp', 'Side Game'),
    runner: 'sideload',
    is_installed: true,
    install: { executable: '/games/side/run.sh', platform: 'linux' },
    browserUrl: '',
    customUserAgent: '',
    launchFullScreen: false,
    ...overrides
  }
}
