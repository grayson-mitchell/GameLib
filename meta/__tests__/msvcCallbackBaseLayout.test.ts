/**
 * P55-2: the MSVC C++ ABI layout of the Steamworks CCallbackBase hierarchy is
 * MEASURED, never assumed.
 *
 * Arm A parses the COMMITTED dump (runs everywhere, including CI where the
 * pinned zig is unavailable). Arm B re-runs the pinned zig clang MS-ABI
 * dumper against the committed fixture (darwin only, else skipped with an
 * explicit reason) and asserts the fresh output yields the same constants.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'
import { downloadZig } from '../downloadZig'
import {
  MSVC_CCALLBACKBASE_OFFSETS,
  MSVC_CCALLBACKBASE_VSLOT_GET_SIZE,
  MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG,
  MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG,
  STEAM_CALLBACK_FLAG_GAMESERVER,
  STEAM_CALLBACK_FLAG_REGISTERED,
  USER_STATS_RECEIVED_LAYOUT,
  parseMsvcCallbackLayoutDump,
  parseUserStatsReceivedLayoutDump,
  type UserStatsTriple
} from '../msvcCallbackLayout'

const FIXTURE_DIR = join(__dirname, 'fixtures')
const FIXTURE_CPP = join(FIXTURE_DIR, 'msvc_ccallbackbase.cpp')
const FIXTURE_DUMP = join(FIXTURE_DIR, 'msvc_ccallbackbase.layout.txt')

const TRIPLES = [
  { triple: 'x86_64-pc-windows-msvc', arch: 'x64' },
  { triple: 'i686-pc-windows-msvc', arch: 'x86' }
] as const

function expected(arch: 'x64' | 'x86') {
  return {
    vslotRun1Arg: MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG,
    vslotRun3Arg: MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG,
    vslotGetSize: MSVC_CCALLBACKBASE_VSLOT_GET_SIZE,
    flagsOffset: MSVC_CCALLBACKBASE_OFFSETS[arch].flags,
    iCallbackOffset: MSVC_CCALLBACKBASE_OFFSETS[arch].iCallback
  }
}

// Argv-form spawn (never a shell string); reviewed copy of shimAbiGate's.
function spawnArgv(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('MSVC CCallbackBase layout (P55-2)', () => {
  let skipReason: string | null = null
  let zigBinPath = ''
  const createdProfiles: FakeHomeProfile[] = []

  beforeAll(async () => {
    if (process.platform !== 'darwin') {
      skipReason = `requires darwin (pinned zig host), got "${process.platform}"`
      return
    }
    try {
      zigBinPath = await downloadZig()
    } catch (error) {
      skipReason = `zig unresolvable via downloadZig: ${(error as Error).message}`
    }
  }, 180000)

  afterAll(() => {
    for (const profile of createdProfiles) {
      profile.dispose()
    }
  })

  describe('Arm A: committed dump', () => {
    it('constants have the pinned values', () => {
      expect(MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG).toBe(1)
      expect(MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG).toBe(0)
      expect(MSVC_CCALLBACKBASE_VSLOT_GET_SIZE).toBe(2)
      expect(MSVC_CCALLBACKBASE_OFFSETS.x64).toEqual({
        flags: 8,
        iCallback: 12
      })
      expect(MSVC_CCALLBACKBASE_OFFSETS.x86).toEqual({ flags: 4, iCallback: 8 })
      expect(STEAM_CALLBACK_FLAG_REGISTERED).toBe(0x01)
      expect(STEAM_CALLBACK_FLAG_GAMESERVER).toBe(0x02)
    })

    it('committed dump parses to the constants for both triples', () => {
      const parsed = parseMsvcCallbackLayoutDump(
        readFileSync(FIXTURE_DUMP, 'utf8')
      )
      for (const { triple, arch } of TRIPLES) {
        expect(parsed[triple]).toEqual(expected(arch))
      }
    })

    it('throws on a dump missing the CCallbackBase VFTable block', () => {
      expect(() =>
        parseMsvcCallbackLayoutDump(
          '=== triple: x86_64-pc-windows-msvc zig 0.16.0 ===\nnothing here\n'
        )
      ).toThrow(/VFTable/)
    })
  })

  describe('Arm B: live re-measurement', () => {
    for (const { triple, arch } of TRIPLES) {
      it(`fresh ${triple} dump parses to the constants`, async () => {
        if (skipReason) {
          console.warn(`msvcCallbackBaseLayout Arm B SKIPPED: ${skipReason}`)
          return
        }
        const profile = createFakeHomeProfile({
          prefix: 'gamelib-msvccblayout-'
        })
        createdProfiles.push(profile)
        const result = await spawnArgv(
          zigBinPath,
          [
            'clang',
            '-cc1',
            '-triple',
            triple,
            '-fdump-vtable-layouts',
            '-fdump-record-layouts-simple',
            '-fms-extensions',
            '-fms-compatibility',
            '-std=c++14',
            FIXTURE_CPP,
            '-emit-llvm-only'
          ],
          profile.childEnv()
        )
        expect(result.code).toBe(0)
        const text = `=== triple: ${triple} zig 0.16.0 ===\n${result.stdout}`
        const parsed = parseMsvcCallbackLayoutDump(
          // the parser requires both triples; supply the other from the
          // committed dump so only this triple is freshly measured
          `${text}\n${readFileSync(FIXTURE_DUMP, 'utf8')
            .split(/^(?==== triple: )/m)
            .filter((s) => !s.startsWith(`=== triple: ${triple} `))
            .join('')}`
        )
        expect(parsed[triple]).toEqual(expected(arch))
      }, 120000)
    }
  })
})

const STATS_CPP = join(FIXTURE_DIR, 'steam_callback_structs.cpp')
const STATS_DUMP = join(FIXTURE_DIR, 'steam_callback_structs.layout.txt')
const CBQUEUE_H = join(
  __dirname,
  '..',
  '..',
  'native',
  'steam-bridge',
  'helper',
  'gamelib_cbqueue.h'
)

const STATS_TRIPLES: readonly {
  triple: UserStatsTriple
  key: keyof typeof USER_STATS_RECEIVED_LAYOUT
  args: string[]
}[] = [
  {
    triple: 'x86_64-pc-windows-msvc',
    key: 'x64',
    args: ['-fms-extensions', '-fms-compatibility']
  },
  {
    triple: 'i686-pc-windows-msvc',
    key: 'x86',
    args: ['-fms-extensions', '-fms-compatibility']
  },
  { triple: 'arm64-apple-macosx', key: 'mac', args: ['-DGL_SMALLPACK'] }
]

describe('UserStatsReceived_t layout (quick k51)', () => {
  let skipReason: string | null = null
  let zigBinPath = ''
  const createdProfiles: FakeHomeProfile[] = []

  beforeAll(async () => {
    if (process.platform !== 'darwin') {
      skipReason = `requires darwin (pinned zig host), got "${process.platform}"`
      return
    }
    try {
      zigBinPath = await downloadZig()
    } catch (error) {
      skipReason = `zig unresolvable via downloadZig: ${(error as Error).message}`
    }
  }, 180000)

  afterAll(() => {
    for (const profile of createdProfiles) {
      profile.dispose()
    }
  })

  describe('Arm A: committed dump', () => {
    it('constants have the pinned values', () => {
      expect(USER_STATS_RECEIVED_LAYOUT.x64).toEqual({
        gameID: 0,
        eResult: 8,
        steamID: 16,
        size: 24
      })
      expect(USER_STATS_RECEIVED_LAYOUT.x86).toEqual(
        USER_STATS_RECEIVED_LAYOUT.x64
      )
      expect(USER_STATS_RECEIVED_LAYOUT.mac).toEqual({
        gameID: 0,
        eResult: 8,
        steamID: 12,
        size: 20
      })
    })

    it('committed dump parses to the constants for all three triples', () => {
      const parsed = parseUserStatsReceivedLayoutDump(
        readFileSync(STATS_DUMP, 'utf8')
      )
      for (const { triple, key } of STATS_TRIPLES) {
        expect(parsed[triple]).toEqual(USER_STATS_RECEIVED_LAYOUT[key])
      }
    })

    it('throws on a dump missing a triple', () => {
      const text = readFileSync(STATS_DUMP, 'utf8')
      const noMac = text.slice(0, text.indexOf('=== triple: arm64-apple'))
      expect(() => parseUserStatsReceivedLayoutDump(noMac)).toThrow(
        /arm64-apple-macosx/
      )
    })

    it('throws on a section missing the record', () => {
      expect(() =>
        parseUserStatsReceivedLayoutDump(
          '=== triple: x86_64-pc-windows-msvc zig 0.16.0 ===\nnothing here\n'
        )
      ).toThrow(/UserStatsReceived_t/)
    })

    it('gamelib_cbqueue.h defines equal the measured constants', () => {
      const h = readFileSync(CBQUEUE_H, 'utf8')
      const def = (name: string) => {
        const m = new RegExp(`#define ${name} (\\d+)\\b`).exec(h)
        if (!m) throw new Error(`missing #define ${name}`)
        return Number(m[1])
      }
      const w = USER_STATS_RECEIVED_LAYOUT.x64
      expect(def('GL_CBQ_USR_MAC_SIZE')).toBe(
        USER_STATS_RECEIVED_LAYOUT.mac.size
      )
      expect(def('GL_CBQ_USR_WIN_SIZE')).toBe(w.size)
      expect(def('GL_CBQ_USR_WIN_OFF_GAMEID')).toBe(w.gameID)
      expect(def('GL_CBQ_USR_WIN_OFF_ERESULT')).toBe(w.eResult)
      expect(def('GL_CBQ_USR_WIN_OFF_STEAMID')).toBe(w.steamID)
    })
  })

  describe('Arm B: live re-measurement', () => {
    for (const { triple, key, args } of STATS_TRIPLES) {
      it(`fresh ${triple} dump parses to the constants`, async () => {
        if (skipReason) {
          console.warn(`msvcCallbackBaseLayout Arm B SKIPPED: ${skipReason}`)
          return
        }
        const profile = createFakeHomeProfile({
          prefix: 'gamelib-userstatslayout-'
        })
        createdProfiles.push(profile)
        const result = await spawnArgv(
          zigBinPath,
          [
            'clang',
            '-cc1',
            '-triple',
            triple,
            ...args,
            '-fdump-record-layouts-simple',
            '-std=c++14',
            STATS_CPP,
            '-emit-llvm-only'
          ],
          profile.childEnv()
        )
        expect(result.code).toBe(0)
        const fresh = `=== triple: ${triple} zig 0.16.0 ===\n${result.stdout}`
        const others = readFileSync(STATS_DUMP, 'utf8')
          .split(/^(?==== triple: )/m)
          .filter((s) => !s.startsWith(`=== triple: ${triple} `))
          .join('')
        const parsed = parseUserStatsReceivedLayoutDump(`${fresh}\n${others}`)
        expect(parsed[triple]).toEqual(USER_STATS_RECEIVED_LAYOUT[key])
      }, 120000)
    }
  })
})
