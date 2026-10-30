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
  CALLBACK_LAYOUTS,
  USER_STATS_RECEIVED_LAYOUT,
  parseCallbackLayoutsDump,
  parseMsvcCallbackLayoutDump,
  parseUserStatsReceivedLayoutDump,
  type CallbackLayoutArch,
  type CallbackLayoutEntry,
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

// Phase 58-02: CALLBACK_LAYOUTS, the measured table every multiplayer plan
// reads sizes and offsets from.
//
// Structs whose Mac (pack 4) layout differs from the MSVC x64 (pack 8) layout
// are the repack set for 58-07 (the helper must rewrite them into wire form).
// Of the relayed callbacks that is exactly: LobbyEnter_t 20/24,
// LobbyDataUpdate_t 20/24, LobbyChatUpdate_t 28/32, LobbyKicked_t 20/24,
// LobbyCreated_t 12/16 and SteamNetConnectionStatusChangedCallback_t 704/712
// (mac/x64). CallbackMsg_t also differs but is a host-pointer struct that is
// never relayed. SteamNetworkingMessage_t is 216 on mac and x64 but 208 on x86.
const REPACK_SET = [
  'CallbackMsg_t',
  'LobbyChatUpdate_t',
  'LobbyCreated_t',
  'LobbyDataUpdate_t',
  'LobbyEnter_t',
  'LobbyKicked_t',
  'SteamNetConnectionStatusChangedCallback_t'
]

describe('CALLBACK_LAYOUTS (58-02)', () => {
  let skipReason: string | null = null
  let zigBinPath = ''
  const createdProfiles: FakeHomeProfile[] = []
  const entries = CALLBACK_LAYOUTS as Record<string, CallbackLayoutEntry>
  const ARCHES: readonly CallbackLayoutArch[] = ['x64', 'x86', 'mac']

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

  function expectTableEqualsParse(
    parsed: Record<string, Record<CallbackLayoutArch, unknown>>
  ) {
    for (const name of Object.keys(entries)) {
      for (const arch of ARCHES) {
        expect({ name, arch, layout: parsed[name][arch] }).toEqual({
          name,
          arch,
          layout: entries[name][arch]
        })
      }
    }
  }

  describe('Arm A: committed dump', () => {
    it('holds the 30 structs of the phase', () => {
      expect(Object.keys(entries)).toHaveLength(30)
    })

    it('committed dump parses to the table literal for every struct and arch', () => {
      expectTableEqualsParse(
        parseCallbackLayoutsDump(readFileSync(STATS_DUMP, 'utf8'))
      )
    })

    it('every callback id is asserted numerically by the fixture', () => {
      const cpp = readFileSync(STATS_CPP, 'utf8')
      for (const [name, e] of Object.entries(entries)) {
        if (e.id !== null) {
          expect(cpp).toContain(
            `static_assert(${name}::k_iCallback == ${e.id},`
          )
        }
      }
    })

    it('settles A3 by measurement', () => {
      expect(entries.LobbyEnter_t.mac.size).toBe(20)
      expect(entries.LobbyEnter_t.x64.size).toBe(24)
      expect(entries.LobbyCreated_t.mac.size).toBe(12)
      expect(entries.LobbyCreated_t.x64.size).toBe(16)
      expect(entries.SteamNetConnectionStatusChangedCallback_t.mac.size).toBe(
        704
      )
      expect(entries.SteamNetConnectionStatusChangedCallback_t.x64.size).toBe(
        712
      )
      // CSteamID is pack(1) in the SDK, so these hold it at offset 0, size 9.
      expect(entries.P2PSessionConnectFail_t.mac.size).toBe(9)
      expect(entries.P2PSessionConnectFail_t.x64.size).toBe(9)
      expect(entries.SteamNetworkingMessage_t.mac.size).toBe(216)
      expect(entries.SteamNetworkingMessage_t.x64.size).toBe(216)
      expect(entries.SteamNetworkingMessage_t.x86.size).toBe(208)
    })

    it('the repack set (mac differs from x64) is exactly the documented one', () => {
      const differing = Object.keys(entries)
        .filter(
          (n) =>
            JSON.stringify(entries[n].mac) !== JSON.stringify(entries[n].x64)
        )
        .sort()
      expect(differing).toEqual(REPACK_SET)
    })

    it('throws naming the struct when a dump lacks one', () => {
      const text = readFileSync(STATS_DUMP, 'utf8')
      const broken = text.replace(
        /Type: struct LobbyKicked_t\n/g,
        'Type: struct LobbyKickedGone_t\n'
      )
      expect(() => parseCallbackLayoutsDump(broken)).toThrow(
        /x86_64-pc-windows-msvc: missing record layout .* for LobbyKicked_t/
      )
    })

    it('throws naming the triple when a section is missing', () => {
      const text = readFileSync(STATS_DUMP, 'utf8')
      const noMac = text.slice(0, text.indexOf('=== triple: arm64-apple'))
      expect(() => parseCallbackLayoutsDump(noMac)).toThrow(
        /arm64-apple-macosx/
      )
    })
  })

  describe('Arm B: live re-measurement', () => {
    for (const { triple, args } of STATS_TRIPLES) {
      it(`fresh ${triple} dump parses to the table`, async () => {
        if (skipReason) {
          console.warn(`msvcCallbackBaseLayout Arm B SKIPPED: ${skipReason}`)
          return
        }
        const profile = createFakeHomeProfile({
          prefix: 'gamelib-callbacklayouts-'
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
          .filter((sec) => !sec.startsWith(`=== triple: ${triple} `))
          .join('')
        const parsed = parseCallbackLayoutsDump(`${fresh}\n${others}`)
        expectTableEqualsParse(parsed)
      }, 120000)
    }
  })
})
