/**
 * Phase 70 (D-09): complete per-runner GameInfo fixtures for the strict IPC schemas. Each builder
 * returns a valid member of the GameInfo union; pass overrides to vary a field.
 */
// Member shapes are named through GameInfoByRunner so the shared-code narrowing ratchet
// (meta/gameInfoNarrowingCeiling.cjs) does not count this test helper.
import type { GameInfoByRunner, GameInfoCore } from 'common/types'

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
  overrides: Partial<GameInfoByRunner['steam']> = {}
): GameInfoByRunner['steam'] {
  return { ...core('220', 'Half-Life 2'), runner: 'steam', ...overrides }
}

export function gogGameInfoFixture(
  overrides: Partial<GameInfoByRunner['gog']> = {}
): GameInfoByRunner['gog'] {
  return { ...core('1207658930', 'The Witcher'), runner: 'gog', ...overrides }
}

export function legendaryGameInfoFixture(
  overrides: Partial<GameInfoByRunner['legendary']> = {}
): GameInfoByRunner['legendary'] {
  return { ...core('Fortnite', 'Fortnite'), runner: 'legendary', ...overrides }
}

export function nileGameInfoFixture(
  overrides: Partial<GameInfoByRunner['nile']> = {}
): GameInfoByRunner['nile'] {
  return {
    ...core('amzn1.adg.product.x', 'Amazon Game'),
    runner: 'nile',
    ...overrides
  }
}

/** Exactly what SideloadDialog's handleInstall sends to addNewApp. */
export function sideloadGameInfoFixture(
  overrides: Partial<GameInfoByRunner['sideload']> = {}
): GameInfoByRunner['sideload'] {
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
