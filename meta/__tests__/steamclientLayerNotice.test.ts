/**
 * Phase 56 plan 10: the steamclient-layer component catalogue, the component
 * NOTICE and the operator-run archive builder. No network and no child
 * process: synthetic PE and Mach-O buffers are built in-test.
 */

import { createHash } from 'crypto'
import { homedir } from 'os'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import {
  STEAMCLIENT_LAYER_CATALOGUE,
  STEAMWORKS_LICENSE_SHA256,
  lookupSteamclientLayer,
  steamclientLayerArchiveUrl,
  steamclientLayerFileNames,
  steamclientLayerLicenceFor,
  steamclientLayerReleasePageUrl
} from '../../src/common/steamclientLayerCatalogue'
import {
  NOTICE_SOURCE_PATH,
  buildComponentArchive,
  checkComponentSources,
  comparePins,
  componentArchivePath,
  componentPinLines,
  componentStagingDir,
  machOX8664SignatureState,
  peMachine
} from '../buildSteamClientLayerArchive'
import { readOverlayTarGz } from '../../src/backend/knownFixOverlayArchive'
import { steamclientLayerComponentId } from '../../src/backend/storeManagers/steam/bridge/drm/drmPaths'
import {
  DETOUR_BUILD_ROWS,
  drmNativeOutputDir,
  payloadFileName
} from '../buildDrmNativeParts'
import { LSTEAMCLIENT_PINS, lsteamclientOutputDir } from '../buildLsteamclient'

const BUILD = '26.3.0.39832'
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const noticeBytes = readFileSync(NOTICE_SOURCE_PATH)

function pe(machine: number, size = 100): Buffer {
  const b = Buffer.alloc(size)
  b.write('MZ', 0, 'latin1')
  b.writeUInt32LE(0x40, 0x3c)
  b.write('PE\0\0', 0x40, 'latin1')
  b.writeUInt16LE(machine, 0x44)
  return b
}

function macho(opts: { cmds?: number[]; magic?: number; cpu?: number } = {}) {
  const cmds = opts.cmds ?? [0x19]
  const sizeofcmds = cmds.length * 8
  const b = Buffer.alloc(32 + sizeofcmds + 16)
  b.writeUInt32LE(opts.magic ?? 0xfeedfacf, 0)
  b.writeUInt32LE(opts.cpu ?? 0x01000007, 4)
  b.writeUInt32LE(cmds.length, 16)
  b.writeUInt32LE(sizeofcmds, 20)
  cmds.forEach((c, i) => {
    b.writeUInt32LE(c, 32 + i * 8)
    b.writeUInt32LE(8, 32 + i * 8 + 4)
  })
  return b
}

function bigPe(): Buffer {
  return pe(0x8664, 1_000_001)
}
function bigMacho(): Buffer {
  const m = macho()
  return Buffer.concat([m, Buffer.alloc(1_000_001)])
}

function validFiles(): { path: string; data: Buffer }[] {
  return [
    { path: 'LICENSE.lsteamclient', data: readLicenceStub() },
    { path: 'NOTICE', data: noticeBytes },
    { path: `detour-cx${BUILD}.bin`, data: Buffer.alloc(100, 1) },
    { path: 'lsteamclient.dll', data: bigPe() },
    { path: 'lsteamclient.so', data: bigMacho() },
    { path: 'steam.exe', data: pe(0x8664) }
  ]
}

// The real licence text is only in the staging dir; synthetic tests need a
// buffer whose sha equals the pin, so they use the real file when present.
function readLicenceStub(): Buffer {
  const p = join(componentStagingDir(BUILD), 'LICENSE.lsteamclient')
  return existsSync(p) ? readFileSync(p) : Buffer.from('stub')
}

const hasLicence = existsSync(
  join(componentStagingDir(BUILD), 'LICENSE.lsteamclient')
)

const gateInput = (files = validFiles(), over = {}) => ({
  build: BUILD,
  files,
  committedNotice: noticeBytes,
  caveSize: 0x1000,
  homeDir: '/Users/nobody-here',
  ...over
})

describe('steamclientLayerCatalogue', () => {
  it('lists the six names sorted', () => {
    expect(steamclientLayerFileNames(BUILD)).toEqual([
      'LICENSE.lsteamclient',
      'NOTICE',
      `detour-cx${BUILD}.bin`,
      'lsteamclient.dll',
      'lsteamclient.so',
      'steam.exe'
    ])
  })

  it('maps licences', () => {
    const l = (p: string) => steamclientLayerLicenceFor(p, BUILD)
    expect(l('lsteamclient.dll')).toBe('Steamworks-SDK-License')
    expect(l('lsteamclient.so')).toBe('Steamworks-SDK-License')
    expect(l(`detour-cx${BUILD}.bin`)).toBe('GPL-3.0')
    expect(l('steam.exe')).toBe('BSD-3-Clause')
    expect(l('LICENSE.lsteamclient')).toBe('licence-text')
    expect(l('NOTICE')).toBe('licence-text')
    expect(l('other.dll')).toBeUndefined()
  })

  it('looks up own properties only', () => {
    const e = lookupSteamclientLayer(BUILD)
    expect(e?.id).toBe(`steamclient-layer-cx${BUILD}`)
    expect(e?.release).toEqual({
      repo: 'grayson-mitchell/GameLib',
      tag: `steamclient-layer-cx${BUILD}`,
      asset: `steamclient-layer-cx${BUILD}.tar.gz`
    })
    for (const k of ['__proto__', 'constructor', '26.3', 42]) {
      expect(lookupSteamclientLayer(k)).toBeUndefined()
    }
  })

  it('builds the release and download URLs', () => {
    const e = lookupSteamclientLayer(BUILD)!
    expect(steamclientLayerReleasePageUrl(e)).toBe(
      `https://github.com/grayson-mitchell/GameLib/releases/tag/steamclient-layer-cx${BUILD}`
    )
    expect(steamclientLayerArchiveUrl(e)).toBe(
      `https://github.com/grayson-mitchell/GameLib/releases/download/steamclient-layer-cx${BUILD}/steamclient-layer-cx${BUILD}.tar.gz`
    )
  })

  it('has exactly the allowlisted build', () => {
    expect(Object.keys(STEAMCLIENT_LAYER_CATALOGUE)).toEqual([BUILD])
    for (const k of Object.keys(STEAMCLIENT_LAYER_CATALOGUE)) {
      expect(DETOUR_BUILD_ROWS[k]).toBeDefined()
    }
  })

  it('is internally consistent', () => {
    for (const [build, e] of Object.entries(STEAMCLIENT_LAYER_CATALOGUE)) {
      expect(e.id).toBe(steamclientLayerComponentId(build))
      expect(e.files.map((f) => f.path).sort()).toEqual(
        steamclientLayerFileNames(build)
      )
      for (const f of e.files) {
        expect(f.licence).toBe(steamclientLayerLicenceFor(f.path, build))
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(Number.isInteger(f.size) && f.size > 0).toBe(true)
      }
      expect(e.archiveSha256).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('cross-checks the detour, licence and NOTICE pins', () => {
    const e = lookupSteamclientLayer(BUILD)!
    const pin = (p: string) => e.files.find((f) => f.path === p)!
    const detour = pin(payloadFileName(BUILD))
    expect(detour.sha256).toBe(DETOUR_BUILD_ROWS[BUILD].payloadSha256)
    expect(detour.size).toBeGreaterThan(0)
    expect(detour.size).toBeLessThanOrEqual(DETOUR_BUILD_ROWS[BUILD].caveSize)
    expect(pin('LICENSE.lsteamclient').sha256).toBe(STEAMWORKS_LICENSE_SHA256)
    expect(STEAMWORKS_LICENSE_SHA256).toBe(LSTEAMCLIENT_PINS.licenseSha256)
    expect(pin('NOTICE').sha256).toBe(sha(noticeBytes))
    expect(pin('NOTICE').size).toBe(noticeBytes.length)
  })

  it('agrees with the wave-1 staging helpers', () => {
    expect(componentStagingDir(BUILD)).toBe(drmNativeOutputDir(BUILD))
    expect(componentStagingDir(BUILD)).toBe(lsteamclientOutputDir(BUILD))
    expect(payloadFileName(BUILD)).toBe(`detour-cx${BUILD}.bin`)
    expect(componentArchivePath(BUILD)).toBe(
      `build/steamclient-layer/steamclient-layer-cx${BUILD}.tar.gz`
    )
  })
})

describe('component NOTICE', () => {
  const text = noticeBytes.toString('utf8')
  it('names every file, licence, pin and the separation', () => {
    for (const s of [
      'lsteamclient.dll',
      'lsteamclient.so',
      'detour-cx<build>.bin',
      'steam.exe',
      'LICENSE.lsteamclient',
      'NOTICE',
      'Steamworks SDK License',
      'GPL-3.0',
      'BSD-3-Clause',
      '164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca',
      '8db22adb237e6ea640a5af148b69b93709daf50c',
      'https://github.com/grayson-mitchell/GameLib/releases/tag/steamclient-layer-cx<build>',
      "GameLib's GPL-3.0-only code never links against lsteamclient.dll or lsteamclient.so."
    ]) {
      expect(text).toContain(s)
    }
  })
  it('reproduces the BSD-3 text verbatim', () => {
    const lic = readFileSync(
      'native/steam-bridge/steamclient-layer/helper/LICENSE',
      'utf8'
    ).trim()
    expect(text).toContain(lic)
  })
  it('starts right and leaks nothing', () => {
    expect(text.split('\n')[0]).toBe(
      'GameLib steamclient-layer component - NOTICE'
    )
    expect(text).not.toContain('/Users/')
    expect(text).not.toContain('\r')
  })
})

describe('peMachine', () => {
  it('reads machine types and never throws', () => {
    expect(peMachine(pe(0x8664))).toBe(0x8664)
    expect(peMachine(pe(0x14c))).toBe(0x14c)
    expect(peMachine(Buffer.alloc(10))).toBeNull()
    const noMz = pe(0x8664)
    noMz.write('XX', 0, 'latin1')
    expect(peMachine(noMz)).toBeNull()
    const far = pe(0x8664)
    far.writeUInt32LE(0xffffff, 0x3c)
    expect(peMachine(far)).toBeNull()
    const noSig = pe(0x8664)
    noSig.write('XX', 0x40, 'latin1')
    expect(peMachine(noSig)).toBeNull()
  })
})

describe('machOX8664SignatureState', () => {
  it('classifies thin x86_64 Mach-O files', () => {
    expect(machOX8664SignatureState(macho())).toBe('unsigned')
    expect(machOX8664SignatureState(macho({ cmds: [0x19, 0x1d] }))).toBe(
      'signed'
    )
  })
  it('rejects everything else without throwing', () => {
    expect(machOX8664SignatureState(macho({ magic: 0xcafebabe }))).toBeNull()
    expect(machOX8664SignatureState(macho({ cpu: 0x0100000c }))).toBeNull()
    expect(machOX8664SignatureState(Buffer.alloc(10))).toBeNull()
    const zero = macho()
    zero.writeUInt32LE(0, 36)
    expect(machOX8664SignatureState(zero)).toBeNull()
    const over = macho()
    over.writeUInt32LE(4096, 36)
    expect(machOX8664SignatureState(over)).toBeNull()
    const sz = macho()
    sz.writeUInt32LE(4096, 20)
    expect(machOX8664SignatureState(sz)).toBeNull()
  })
})

describe('checkComponentSources', () => {
  const run = hasLicence ? it : it.skip
  const failing = (files: { path: string; data: Buffer }[], over = {}) => {
    const r = checkComponentSources(gateInput(files, over))
    return r.ok ? [] : r.failures
  }
  const swap = (path: string, data: Buffer) =>
    validFiles().map((f) => (f.path === path ? { path, data } : f))

  run('accepts valid synthetic files', () => {
    expect(checkComponentSources(gateInput())).toEqual({ ok: true })
  })
  run('rejects a missing and an extra name', () => {
    expect(failing(validFiles().slice(1))[0]).toMatch(/^name set/)
    expect(
      failing([...validFiles(), { path: 'x.dll', data: Buffer.alloc(1) }])[0]
    ).toMatch(/^name set/)
  })
  run('gates lsteamclient.dll and steam.exe', () => {
    expect(failing(swap('lsteamclient.dll', pe(0x14c, 1_000_001)))[0]).toMatch(
      /^lsteamclient\.dll/
    )
    expect(failing(swap('lsteamclient.dll', pe(0x8664, 1000)))[0]).toMatch(
      /^lsteamclient\.dll/
    )
    expect(failing(swap('steam.exe', pe(0x14c)))[0]).toMatch(/^steam\.exe/)
  })
  run('gates lsteamclient.so', () => {
    const signed = Buffer.concat([
      macho({ cmds: [0x19, 0x1d] }),
      Buffer.alloc(1_000_001)
    ])
    expect(failing(swap('lsteamclient.so', signed))[0]).toMatch(
      /^lsteamclient\.so/
    )
    expect(failing(swap('lsteamclient.so', macho()))[0]).toMatch(
      /^lsteamclient\.so/
    )
    expect(
      failing(swap('lsteamclient.so', Buffer.alloc(2_000_000)))[0]
    ).toMatch(/^lsteamclient\.so/)
  })
  run('gates the payload, licence, NOTICE and home path', () => {
    const d = `detour-cx${BUILD}.bin`
    expect(failing(swap(d, Buffer.alloc(0)))[0]).toMatch(/^detour/)
    expect(failing(swap(d, Buffer.alloc(0x1001)))[0]).toMatch(/^detour/)
    expect(failing(swap('LICENSE.lsteamclient', Buffer.from('x')))[0]).toMatch(
      /^LICENSE\.lsteamclient/
    )
    expect(failing(swap('NOTICE', Buffer.from('other')))[0]).toMatch(/^NOTICE/)
    const leak = Buffer.concat([Buffer.from('/Users/leaky'), Buffer.alloc(200)])
    expect(
      failing(swap(d, leak), { homeDir: '/Users/leaky' }).join(';')
    ).toMatch(/home/)
  })
})

describe('archive build and pins', () => {
  const files = validFiles()
  it('round-trips and is deterministic', async () => {
    const a = buildComponentArchive(files)
    expect(a.equals(buildComponentArchive([...files].reverse()))).toBe(true)
    const out = await readOverlayTarGz(
      a,
      new Map(files.map((f) => [f.path, f.data.length])),
      files.reduce((n, f) => n + f.data.length, 0) + 1024 * 1024
    )
    expect([...out.keys()].sort()).toEqual(steamclientLayerFileNames(BUILD))
    for (const f of files) expect(out.get(f.path)!.equals(f.data)).toBe(true)
  })
  it('refuses a wrong name set', () => {
    expect(() => buildComponentArchive(files.slice(1))).toThrow()
  })
  it('prints one pin line per file', () => {
    const lines = componentPinLines(files)
    expect(lines).toHaveLength(6)
    for (const l of lines) {
      expect(l).toMatch(
        /^file=\S+ sha256=[0-9a-f]{64} size=[0-9]+ licence=\S+$/
      )
    }
  })
  it('compares pins', () => {
    const arch = buildComponentArchive(files)
    expect(comparePins('26.3.0.1', files, arch)).toEqual({ status: 'none' })
    expect(comparePins(BUILD, files, arch).status).toBe('file-mismatch')
  })
})

describe('real staging dir', () => {
  const staging = componentStagingDir(BUILD)
  ;(existsSync(staging) ? describe : describe.skip)('pins', () => {
    const real = () =>
      steamclientLayerFileNames(BUILD).map((p) => ({
        path: p,
        data: p === 'NOTICE' ? noticeBytes : readFileSync(join(staging, p))
      }))
    it('passes the source gates', () => {
      expect(
        checkComponentSources({
          build: BUILD,
          files: real(),
          committedNotice: noticeBytes,
          caveSize: DETOUR_BUILD_ROWS[BUILD].caveSize,
          homeDir: homedir()
        })
      ).toEqual({ ok: true })
    })
    it('matches every catalogue pin and the archive', () => {
      const e = lookupSteamclientLayer(BUILD)!
      for (const f of real()) {
        const pin = e.files.find((x) => x.path === f.path)!
        expect(pin.sha256).toBe(sha(f.data))
        expect(pin.size).toBe(f.data.length)
      }
      const arch = buildComponentArchive(real())
      expect(comparePins(BUILD, real(), arch)).toEqual({ status: 'match' })
    })
    it('holds only the five staged files', () => {
      expect(readdirSync(staging).sort()).toEqual(
        steamclientLayerFileNames(BUILD).filter((n) => n !== 'NOTICE')
      )
    })
  })
})

describe('THIRD-PARTY-NOTICES.md', () => {
  const doc = readFileSync('THIRD-PARTY-NOTICES.md', 'utf8')
  it('keeps the gst-libav section', () => {
    expect(doc).toContain(
      '## On-demand overlay: `gst-libav-1.24.13` (macOS, x86_64)'
    )
    expect(doc).toContain(
      'cd114a81e5b9f0813d745b289e7e341157df3bdedea6af338c1b977b39edc31b'
    )
  })
  it('has the Steamworks component section and release page', () => {
    expect(doc).toContain(
      `## On-demand component: \`steamclient-layer-cx${BUILD}\` (macOS, x86_64)`
    )
    expect(doc).toMatch(/^### lsteamclient - Steamworks SDK License/m)
    for (const e of Object.values(STEAMCLIENT_LAYER_CATALOGUE)) {
      expect(doc).toContain(steamclientLayerReleasePageUrl(e))
    }
    expect(doc.replace(/\s+/g, ' ')).toContain(
      'never links against lsteamclient.dll or lsteamclient.so'
    )
    expect(doc).toContain('steamclient64.dll')
  })
  it('lists every pin on a row with its path', () => {
    const rows = doc.split('\n').filter((l) => l.startsWith('|'))
    for (const e of Object.values(STEAMCLIENT_LAYER_CATALOGUE)) {
      for (const f of e.files) {
        expect(
          rows.some((r) => r.includes(f.path) && r.includes(f.sha256))
        ).toBe(true)
      }
      expect(
        rows.some(
          (r) => r.includes(e.release.asset) && r.includes(e.archiveSha256)
        )
      ).toBe(true)
    }
  })
})

describe('package scripts', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts
  it('has the two operator scripts', () => {
    expect(scripts['build:drm-native']).toBe(
      'node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildDrmNativeParts.ts'
    )
    expect(scripts['build:steamclient-layer-archive']).toBe(
      'node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildSteamClientLayerArchive.ts'
    )
    expect(scripts['build:lsteamclient']).toBe(
      'node meta/runTs.cjs --bundle --platform=node --target=node22 meta/buildLsteamclient.ts'
    )
  })
})

describe('packaging separation', () => {
  const FORBIDDEN =
    /lsteamclient|steamclient-layer|buildDrmNativeParts|buildLsteamclient|buildSteamClientLayerArchive/
  // Comment lines are stripped so that a later plan's removal note (56-13 in
  // buildSteamBridgeShims.ts) can never turn this gate red.
  const code = (path: string, yaml = false) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => {
        const t = l.trim()
        return yaml
          ? !t.startsWith('#')
          : !(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))
      })
  it.each([
    'src-tauri/tauri.conf.json',
    'meta/signMachOResources.ts',
    'meta/buildSteamBridgeShims.ts'
  ])('%s never references the component', (path) => {
    expect(code(path).filter((l) => FORBIDDEN.test(l))).toEqual([])
  })
  it('no workflow references the component', () => {
    for (const f of readdirSync('.github/workflows')) {
      if (!f.endsWith('.yml')) continue
      const hits = code(join('.github/workflows', f), true).filter((l) =>
        FORBIDDEN.test(l)
      )
      expect(hits).toEqual([])
    }
  })
  it('commits no binary beside the sources', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]
      )
    const bad = walk('native/steam-bridge/steamclient-layer').filter((p) =>
      /\.(dll|so|bin|exe|tar\.gz)$/.test(p)
    )
    expect(bad).toEqual([])
  })
})
