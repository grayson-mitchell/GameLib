/**
 * Phase 70 (D-10): schema output and the hand-written GameInfo interfaces must be identical,
 * both ways, per member and for the union. The type-level checks fail `tsc`; the runtime
 * key-coverage checks stop a key vanishing from both sides at once.
 */
import type { z } from 'zod'

import type { GameInfo } from 'common/types'
import type { GogGameInfo } from 'common/types/gog'
import {
  gameInfoSchema,
  gogGameInfoSchema,
  legendaryGameInfoSchema,
  nileGameInfoSchema,
  sideloadGameInfoSchema,
  steamGameInfoSchema
} from 'common/types/ipc/gameInfoSchema'
import type { LegendaryGameInfo } from 'common/types/legendary'
import type { NileGameInfo } from 'common/types/nile'
import type { SideloadGameInfo } from 'common/types/sideload'
import type { SteamGameInfo } from 'common/types/steam'

// Identity equality, not mutual assignability.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
type Simplify<T> = { [K in keyof T]: T[K] } & {}
type Expect<T extends true> = T

type SteamParity = Expect<
  Equal<Simplify<z.output<typeof steamGameInfoSchema>>, Simplify<SteamGameInfo>>
>
type GogParity = Expect<
  Equal<Simplify<z.output<typeof gogGameInfoSchema>>, Simplify<GogGameInfo>>
>
type LegendaryParity = Expect<
  Equal<
    Simplify<z.output<typeof legendaryGameInfoSchema>>,
    Simplify<LegendaryGameInfo>
  >
>
type NileParity = Expect<
  Equal<Simplify<z.output<typeof nileGameInfoSchema>>, Simplify<NileGameInfo>>
>
type SideloadParity = Expect<
  Equal<
    Simplify<z.output<typeof sideloadGameInfoSchema>>,
    Simplify<SideloadGameInfo>
  >
>
type UnionParity = Expect<Equal<z.output<typeof gameInfoSchema>, GameInfo>>

// Negative control: an extra optional key on one side must break Equal.
type ControlBroken = Equal<
  Simplify<z.output<typeof nileGameInfoSchema>>,
  Simplify<NileGameInfo & { extraneous?: string }>
>
// @ts-expect-error the control must report false; if Equal were loose this line would compile
const controlMustBeFalse: ControlBroken = true
void controlMustBeFalse

export type ParityChecks = [
  SteamParity,
  GogParity,
  LegendaryParity,
  NileParity,
  SideloadParity,
  UnionParity
]

const CORE_KEYS = [
  'store_url',
  'app_name',
  'art_cover',
  'art_logo',
  'art_background',
  'art_icon',
  'art_square',
  'cloud_save_enabled',
  'developer',
  'extra',
  'folder_name',
  'install',
  'is_installed',
  'save_folder',
  'title',
  'canRunOffline',
  'thirdPartyManagedApp',
  'is_mac_native',
  'mac_arch',
  'is_linux_native',
  'is_windows_native',
  'metacritic_score',
  'description',
  'version',
  'overrides',
  'runner'
]

function keysOf(schema: { shape: Record<string, unknown> }): string[] {
  return Object.keys(schema.shape).sort()
}

describe('GameInfo schema key coverage', () => {
  it.each([
    [
      'steam',
      steamGameInfoSchema,
      ['installable', 'is_delisted', 'steamPlatformsCaptured']
    ],
    ['gog', gogGameInfoSchema, ['gog_save_location']],
    [
      'legendary',
      legendaryGameInfoSchema,
      ['namespace', 'save_path', 'isEAManaged', 'isUbisoftManaged', 'dlcList']
    ],
    ['nile', nileGameInfoSchema, []],
    [
      'sideload',
      sideloadGameInfoSchema,
      ['browserUrl', 'customUserAgent', 'launchFullScreen']
    ]
  ])('%s member declares exactly the core keys plus its own', (_r, s, own) => {
    expect(keysOf(s)).toEqual([...CORE_KEYS, ...own].sort())
  })

  it('declares the nested install keys', () => {
    const install = (s: { shape: { install: unknown } }) =>
      Object.keys(
        (s.shape.install as { shape: Record<string, unknown> }).shape
      ).sort()
    const base = [
      'manifest',
      'executable',
      'install_path',
      'install_size',
      'is_dlc',
      'version',
      'platform',
      'appName',
      'language',
      'branch'
    ]
    expect(install(nileGameInfoSchema)).toEqual([...base].sort())
    expect(install(steamGameInfoSchema)).toEqual(
      [
        ...base,
        'steamResumePending',
        'steamResumeTargetSteamappsDir',
        'steamResumeInstalldir',
        'steamResumeInstalledAtStart'
      ].sort()
    )
    expect(install(gogGameInfoSchema)).toEqual(
      [
        ...base,
        'isDosbox',
        'dosboxConf',
        'installedWithDLCs',
        'installedDLCs',
        'versionEtag',
        'buildId',
        'pinnedVersion',
        'cyberpunk'
      ].sort()
    )
  })
})
