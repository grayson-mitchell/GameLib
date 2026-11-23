/**
 * The D-07 fixture bottles for the Phase 87 engine oracle (87-11).
 *
 * On-disk state is one-way (D-07): a bottle and its `.gamelib-engine.json` marker were written by
 * builds already in users' hands, and the Rust port has to read every shape they left and write the
 * same bytes. This module is the one place those shapes are defined. Everything here is synthetic:
 * no bottle, marker or `cxbottle.conf` is ever copied from a machine (T-87-14), and every BottleID
 * comes from the redaction scan's allow-list (`SYNTHETIC_BOTTLE_IDS` in
 * `engineWineFixtureRedaction.test.ts`).
 *
 * A fixture is data: a name, and files whose paths are relative to the bottle directory. Text may
 * carry the profile placeholders (`<TOOLS>`, `<HOME>`), which `buildBottle` expands into the fake
 * profile it builds on, so the committed bytes under `state/bottles/<name>/` are the same on every
 * machine and the Rust replay expands them into its own FakeHome. A marker names a wineserver by
 * absolute path, which is why the committed marker holds a placeholder and not a path.
 *
 * `bottles.oracle.test.ts` builds each case's before-tree from these builders, rewrites
 * `state/bottles` and `state/engines` from them in write mode, and in compare mode fails when the
 * committed bytes differ from what the builders produce.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

/** The Bottles root, relative to the HOME a profile is built on. */
export const BOTTLES_REL = 'Library/Application Support/CrossOver/Bottles'

/** The BottleIDs a fixture may carry (the redaction scan's allow-list). */
export const BOTTLE_IDS = [
  'AAAAAAAA-0000-4000-8000-000000000001',
  'AAAAAAAA-0000-4000-8000-000000000002',
  'AAAAAAAA-0000-4000-8000-000000000003',
  'AAAAAAAA-0000-4000-8000-000000000004'
] as const

export interface FixtureFile {
  /** Relative to the bottle directory (or, for an engine variant, to the tools directory). */
  path: string
  text: string
  /** Default `0644`. */
  mode?: '0644' | '0755'
}

export interface BottleFixture {
  name: string
  note: string
  files: readonly FixtureFile[]
}

/** The CrossOver install a crossover marker names. A fixed path of the app bundle, no account. */
export const CX_BIN_DIR =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'

/** The pin the build under oracle ships (a test asserts this against `ENGINE_PINS`). */
export const CURRENT_PIN = {
  id: 'wine-staging-11.20',
  wineVersion: '11.20',
  wineSha256:
    '4df858c5e72920deaf123cbc29fa2b9e64c23bcf2dea59e0a7047b879b9cd952',
  dxvkVersion: 'v1.10.3-20230507-repack',
  dxvkSha256: 'acd1520ad105d8ef124a09c8e11a259a5dc8bdc565ad18e0e52693f9807b2477'
} as const

/** A pin id no current build ships (a build that did, once). */
export const RETIRED_PIN_ID = 'wine-staging-11.1'

const ENGINE_ROOT = '<TOOLS>/steam-engines'
export const WINESERVER_BIN = `${ENGINE_ROOT}/${CURRENT_PIN.id}/Contents/Resources/wine/bin/wineserver`
export const WINE_BIN = `${ENGINE_ROOT}/${CURRENT_PIN.id}/Contents/Resources/wine/bin/wine`
export const DXVK_DIR = `${ENGINE_ROOT}/dxvk-macOS-${CURRENT_PIN.dxvkVersion}`

type Marker = {
  kind: string
  id: string
  wineserverBin: string
  dxvk?: { dir: string; version: string } | 'failed'
  version?: number
}

/** The marker bytes `writeMarker` produces: `JSON.stringify` of the fields, `version` last, no newline. */
const markerText = (marker: Marker): string => JSON.stringify(marker)

const SYSTEM_REG = 'WINE REGISTRY Version 2\n;; synthetic oracle fixture\n'

/** `cxbottle.conf` as GameLib's own `writeCxbottleConf` writes it (no Timestamp, no Version). */
const gamelibConf = (id: string): string =>
  [
    '[Bottle]',
    `"BottleID" = "${id}"`,
    '"Encoding" = "UTF-8"',
    '"Template" = "win10_64"',
    '"MenuMode" = "ignore"',
    '"AssocMode" = "ignore"',
    '"WineArch" = "win64"',
    ''
  ].join('\n')

/** `cxbottle.conf` as CrossOver's template `create()` leaves it: the Timestamp is what marks it. */
const crossoverConf = (id: string): string =>
  [
    '[Bottle]',
    `"BottleID" = "${id}"`,
    '"Encoding" = "UTF-8"',
    '"Template" = "win10_64"',
    '"MenuMode" = "ignore"',
    '"AssocMode" = "ignore"',
    '"WineArch" = "win64"',
    '"Timestamp" = "1731000000"',
    '"Version" = "26.0.0"',
    ''
  ].join('\n')

const wineFiles = (): FixtureFile[] => [
  { path: 'system.reg', text: SYSTEM_REG },
  { path: 'user.reg', text: 'WINE REGISTRY Version 2\n;; user\n' },
  { path: 'userdef.reg', text: 'WINE REGISTRY Version 2\n;; userdef\n' },
  {
    path: 'drive_c/windows/system32/kernel32.dll',
    text: 'synthetic kernel32\n'
  }
]

interface BottleSpec {
  name: string
  note: string
  conf?: 'gamelib' | 'crossover' | 'none'
  confId?: number
  dxvk?: boolean
  marker?: string
  systemReg?: boolean
}

function fixture(spec: BottleSpec): BottleFixture {
  const files: FixtureFile[] =
    spec.systemReg === false
      ? [
          {
            path: 'drive_c/windows/system32/kernel32.dll',
            text: 'synthetic kernel32\n'
          }
        ]
      : wineFiles()
  const id = BOTTLE_IDS[spec.confId ?? 0] ?? BOTTLE_IDS[0]
  if (spec.conf === 'gamelib') {
    files.push({ path: 'cxbottle.conf', text: gamelibConf(id) })
  } else if (spec.conf === 'crossover') {
    files.push({ path: 'cxbottle.conf', text: crossoverConf(id) })
  }
  if (spec.dxvk) {
    files.push({
      path: 'current_dxvk-macOS',
      text: `${CURRENT_PIN.dxvkVersion}\n`
    })
  }
  if (spec.marker !== undefined) {
    files.push({ path: '.gamelib-engine.json', text: spec.marker })
  }
  return { name: spec.name, note: spec.note, files }
}

const pinnedMarker = (extra: Partial<Marker> = {}): Marker => ({
  kind: 'pinned',
  id: CURRENT_PIN.id,
  wineserverBin: WINESERVER_BIN,
  ...extra
})

const currentDxvk = {
  dir: DXVK_DIR,
  version: CURRENT_PIN.dxvkVersion
}

/**
 * Every bottle shape the released builds left on disk, plus the contradictions and corruptions the
 * marker readers have to survive. The names are the case ids' vocabulary.
 */
export const BOTTLE_FIXTURES: readonly BottleFixture[] = [
  fixture({
    name: 'fx-crossover-marker',
    note: 'a CrossOver bottle: crossover marker, conf with a Timestamp',
    conf: 'crossover',
    confId: 0,
    marker: markerText({
      kind: 'crossover',
      id: 'crossover',
      wineserverBin: `${CX_BIN_DIR}/wineserver`,
      version: 1
    })
  }),
  fixture({
    name: 'fx-pinned-current',
    note: 'pinned:<current> with its DXVK copy recorded and current_dxvk-macOS present',
    conf: 'gamelib',
    confId: 1,
    dxvk: true,
    marker: markerText(pinnedMarker({ dxvk: currentDxvk, version: 1 }))
  }),
  fixture({
    name: 'fx-pinned-retired',
    note: 'pinned:<retired id>: a pin no current build ships, DXVK copy of an older build',
    conf: 'gamelib',
    confId: 1,
    dxvk: true,
    marker: markerText({
      kind: 'pinned',
      id: RETIRED_PIN_ID,
      wineserverBin: `${ENGINE_ROOT}/${RETIRED_PIN_ID}/Contents/Resources/wine/bin/wineserver`,
      dxvk: {
        dir: `${ENGINE_ROOT}/dxvk-macOS-v1.10.2`,
        version: 'v1.10.2'
      },
      version: 1
    })
  }),
  fixture({
    name: 'fx-wine-manager',
    note: 'wine-manager:<version>: a Wine Manager override, no DXVK recorded',
    conf: 'gamelib',
    confId: 2,
    marker: markerText({
      kind: 'wine-manager',
      id: 'Wine-Staging-10.5',
      wineserverBin: '<TOOLS>/wine/Wine-Staging-10.5/bin/wineserver',
      version: 1
    })
  }),
  fixture({
    name: 'fx-pinned-no-dxvk-field',
    note: 'pinned:<current> with the dxvk field absent and no current_dxvk-macOS (created before DXVK was recorded)',
    conf: 'gamelib',
    confId: 1,
    marker: markerText(pinnedMarker({ version: 1 }))
  }),
  fixture({
    name: 'fx-dxvk-failed',
    note: 'pinned:<current> with dxvk: "failed" (a switch handed the bottle over but DXVK did not install)',
    conf: 'gamelib',
    confId: 1,
    marker: markerText(pinnedMarker({ dxvk: 'failed', version: 1 }))
  }),
  fixture({
    name: 'fx-marker-newer',
    note: 'a version: 2 marker written by a newer build',
    conf: 'gamelib',
    confId: 1,
    dxvk: true,
    marker: markerText(pinnedMarker({ dxvk: currentDxvk, version: 2 }))
  }),
  fixture({
    name: 'fx-marker-unreadable',
    note: 'a marker cut off mid-write: not JSON',
    conf: 'gamelib',
    confId: 1,
    marker: '{"kind":"pinned","id":"wine-staging-11'
  }),
  fixture({
    name: 'fx-crossover-contradicted',
    note: 'a crossover marker contradicted by current_dxvk-macOS (76 CR-01)',
    conf: 'crossover',
    confId: 0,
    dxvk: true,
    marker: markerText({
      kind: 'crossover',
      id: 'crossover',
      wineserverBin: `${CX_BIN_DIR}/wineserver`,
      version: 1
    })
  }),
  fixture({
    name: 'fx-nomarker-dxvk-ts',
    note: 'no marker, current_dxvk-macOS, conf with a Timestamp: DXVK-macOS wins, the pin',
    conf: 'crossover',
    confId: 0,
    dxvk: true
  }),
  fixture({
    name: 'fx-nomarker-dxvk-nots',
    note: 'no marker, current_dxvk-macOS, conf without a Timestamp: the pin',
    conf: 'gamelib',
    confId: 1,
    dxvk: true
  }),
  fixture({
    name: 'fx-nomarker-nodxvk-ts',
    note: 'no marker, no DXVK, conf with a Timestamp: CrossOver',
    conf: 'crossover',
    confId: 0
  }),
  fixture({
    name: 'fx-nomarker-nodxvk-nots',
    note: 'no marker, no DXVK, conf without a Timestamp: written by GameLib, the pin',
    conf: 'gamelib',
    confId: 1
  }),
  fixture({
    name: 'fx-nomarker-noconf',
    note: 'a wine prefix with system.reg and no cxbottle.conf yet (a half-created fallback bottle)',
    conf: 'none'
  }),
  fixture({
    name: 'fx-no-system-reg',
    note: 'a bottle directory that is not a wine prefix: no system.reg, no conf',
    conf: 'none',
    systemReg: false
  }),
  fixture({
    name: 'fx-pinned-wineserver-outside',
    note: 'a pinned marker whose wineserver is outside the pinned-engine root (hand-edited)',
    conf: 'gamelib',
    confId: 1,
    marker: markerText({
      kind: 'pinned',
      id: CURRENT_PIN.id,
      wineserverBin: '/opt/elsewhere/bin/wineserver',
      version: 1
    })
  }),
  fixture({
    name: 'fx-pinned-wineserver-misnamed',
    note: 'a pinned marker whose recorded binary inside the root is not named wineserver',
    conf: 'gamelib',
    confId: 1,
    marker: markerText({
      kind: 'pinned',
      id: CURRENT_PIN.id,
      wineserverBin: WINE_BIN,
      version: 1
    })
  }),
  fixture({
    name: 'fx-marker-bad-id',
    note: 'a marker whose id fails the id grammar (contains a slash)',
    conf: 'gamelib',
    confId: 1,
    marker: markerText({
      kind: 'pinned',
      id: '../wine-staging',
      wineserverBin: WINESERVER_BIN,
      version: 1
    })
  }),
  fixture({
    name: 'fx-pinned-dxvk-outside-root',
    note: 'a pinned marker whose dxvk dir is outside the pinned-engine root (T-59-60): the dxvk field is dropped on read',
    conf: 'gamelib',
    confId: 1,
    dxvk: true,
    marker: markerText(
      pinnedMarker({
        dxvk: { dir: '/opt/elsewhere/dxvk', version: CURRENT_PIN.dxvkVersion },
        version: 1
      })
    )
  }),
  fixture({
    name: 'fx-marker-wrong-kind',
    note: 'a marker of a kind no build wrote',
    conf: 'gamelib',
    confId: 1,
    marker: markerText({
      kind: 'native',
      id: 'native',
      wineserverBin: WINESERVER_BIN,
      version: 1
    })
  }),
  fixture({
    name: 'fx-marker-legacy-noversion',
    note: 'a pinned marker from before the marker was versioned: no version key (reads as version 0)',
    conf: 'gamelib',
    confId: 1,
    dxvk: true,
    marker: markerText(pinnedMarker({ dxvk: currentDxvk }))
  })
]

export type EngineVariant =
  | 'installed'
  | 'wine-only'
  | 'dxvk-only'
  | 'wine-wrong-sha'
  | 'dxvk-wrong-sha'
  | 'wineserver-missing'
  | 'pin-marker-malformed'
  | 'pin-marker-no-sha'

/** The variants a pinned-engine directory takes; `none` is no directory and has no files. */
export const ENGINE_VARIANT_NAMES: readonly EngineVariant[] = [
  'installed',
  'wine-only',
  'dxvk-only',
  'wine-wrong-sha',
  'dxvk-wrong-sha',
  'wineserver-missing',
  'pin-marker-malformed',
  'pin-marker-no-sha'
]

const STUB_BIN = (what: string): string => `#!/bin/sh\n# synthetic ${what}\n`

function wineDir(
  pin: { sha256: string } | 'malformed' | 'no-sha',
  withWineserver = true
): FixtureFile[] {
  const base = `steam-engines/${CURRENT_PIN.id}`
  const bin = `${base}/Contents/Resources/wine/bin`
  const pinMarker =
    pin === 'malformed'
      ? '{not json'
      : pin === 'no-sha'
        ? JSON.stringify({ version: CURRENT_PIN.wineVersion })
        : JSON.stringify({
            sha256: pin.sha256,
            version: CURRENT_PIN.wineVersion
          })
  return [
    { path: `${bin}/wine`, text: STUB_BIN('wine'), mode: '0755' },
    ...(withWineserver
      ? [
          {
            path: `${bin}/wineserver`,
            text: STUB_BIN('wineserver'),
            mode: '0755' as const
          }
        ]
      : []),
    { path: `${base}/.gamelib-pin.json`, text: pinMarker }
  ]
}

function dxvkDir(sha: string): FixtureFile[] {
  const base = `steam-engines/dxvk-macOS-${CURRENT_PIN.dxvkVersion}`
  return [
    { path: `${base}/x32/d3d9.dll`, text: 'synthetic dxvk x32 d3d9\n' },
    { path: `${base}/x64/d3d9.dll`, text: 'synthetic dxvk x64 d3d9\n' },
    {
      path: `${base}/.gamelib-pin.json`,
      text: JSON.stringify({ sha256: sha, version: CURRENT_PIN.dxvkVersion })
    }
  ]
}

const WRONG_SHA =
  '0000000000000000000000000000000000000000000000000000000000000000'

/** The files of a pinned-engine directory variant, relative to the tools directory. */
export function engineFiles(variant: EngineVariant): FixtureFile[] {
  switch (variant) {
    case 'installed':
      return [
        ...wineDir({ sha256: CURRENT_PIN.wineSha256 }),
        ...dxvkDir(CURRENT_PIN.dxvkSha256)
      ]
    case 'wine-only':
      return wineDir({ sha256: CURRENT_PIN.wineSha256 })
    case 'dxvk-only':
      return dxvkDir(CURRENT_PIN.dxvkSha256)
    case 'wine-wrong-sha':
      return [
        ...wineDir({ sha256: WRONG_SHA }),
        ...dxvkDir(CURRENT_PIN.dxvkSha256)
      ]
    case 'dxvk-wrong-sha':
      return [
        ...wineDir({ sha256: CURRENT_PIN.wineSha256 }),
        ...dxvkDir(WRONG_SHA)
      ]
    case 'wineserver-missing':
      return [
        ...wineDir({ sha256: CURRENT_PIN.wineSha256 }, false),
        ...dxvkDir(CURRENT_PIN.dxvkSha256)
      ]
    case 'pin-marker-malformed':
      return [...wineDir('malformed'), ...dxvkDir(CURRENT_PIN.dxvkSha256)]
    case 'pin-marker-no-sha':
      return [...wineDir('no-sha'), ...dxvkDir(CURRENT_PIN.dxvkSha256)]
  }
}

export function fixtureByName(name: string): BottleFixture {
  const found = BOTTLE_FIXTURES.find((f) => f.name === name)
  if (!found) throw new Error(`unknown fixture bottle: ${name}`)
  return found
}

/** Writes files under `root`, text expanded through `expand`, modes set exactly. */
export function writeFixtureFiles(
  root: string,
  files: readonly FixtureFile[],
  expand: (text: string) => string = (text) => text
): void {
  for (const file of files) {
    const target = join(root, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, expand(file.text))
    chmodSync(target, parseInt(file.mode ?? '0644', 8))
  }
}

/** Builds one fixture bottle under `<home>/Library/Application Support/CrossOver/Bottles/<name>`. */
export function buildBottle(
  home: string,
  bottle: BottleFixture,
  expand: (text: string) => string
): void {
  writeFixtureFiles(join(home, BOTTLES_REL, bottle.name), bottle.files, expand)
}

/** Builds a pinned-engine variant under the tools directory. */
export function buildEngines(
  toolsPath: string,
  variant: EngineVariant,
  expand: (text: string) => string
): void {
  writeFixtureFiles(toolsPath, engineFiles(variant), expand)
}
