/**
 * One owner per renderer channel: the TypeScript half of the one-owner test (Phase 83 plan 05,
 * FND-03 criterion 1). The Rust half is the router-keys-equal-generated-sets test in
 * src-tauri/src/native_router.rs (plan 83-03).
 *
 * A channel is served by the Rust native router (listed in `nativeChannels.json`) or by the
 * sidecar (a zod entry plus a registration), never both and never neither:
 *
 *   1. no manifest channel is registered in non-test `src/backend` (the static scan the schema
 *      coverage gate uses, one copy in `testUtils/ipcRegistrationScan.ts`);
 *   2. no manifest channel is a `channelSchemas` or `collidingPushSchemas` key;
 *   3. every `RENDERER_CHANNELS` name (parsed from `src-tauri/src/ipc_contract.rs`, the list the
 *      Rust relay actually enforces) is a manifest channel or statically registered, except an
 *      exact ledger of channels served by routes the scan cannot see (ZERO_LITERAL_OWNER);
 *   4. a channel registered in more than one non-test file equals an exact ledger
 *      (MULTI_REGISTRATION).
 *
 * Both ledgers are EXACT, not ceilings: a new entry needs a reason here, and a stale entry fails.
 * No jest.mock: reads files only.
 */
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { nativeChannelNames } from 'backend/testUtils/ipcDomainParse'
import { scanRegistrations } from 'backend/testUtils/ipcRegistrationScan'
import {
  channelSchemas,
  collidingPushSchemas
} from 'common/types/ipc/channelSchemas'

const BACKEND_DIR = join(__dirname, '..', '..')
const REPO_ROOT = join(BACKEND_DIR, '..', '..')
const IPC_CONTRACT_RS = join(REPO_ROOT, 'src-tauri', 'src', 'ipc_contract.rs')
const GEN_IPC_CONTRACT_TS = join(REPO_ROOT, 'meta', 'genIpcContract.ts')

/**
 * Lowest renderer-channel count accepted (D-05). Equal to SNAPSHOT_CHANNELS_FLOOR in
 * meta/genIpcContract.ts (a test below pins the equality): measured 237 on 2026-11-20, minus 6.
 */
const RENDERER_CHANNELS_FLOOR = 231

/**
 * Lowest number of non-test src/backend source files the registration walk may read. Measured
 * 617 on 2026-11-20 (83-05), minus a margin of 50 for ordinary deletions.
 */
const BACKEND_FILES_FLOOR = 567

/**
 * RENDERER_CHANNELS names that no static registration matches, each with the route that serves it.
 * Measured on 2026-11-20 (83-05) as exactly this set (research counted 13 on the same day before
 * Phase 82 deleted the e2e stubs); the test fails on any addition or removal.
 */
const ZERO_LITERAL_OWNER: Record<string, string> = {
  getSignInProbeOutcomes:
    "registered in signInProbe/outcomes.ts as handleTyped(deps.ipc, 'getSignInProbeOutcomes', ...), a helper call the literal scan does not match"
}

/**
 * Channels the scan finds in more than one file, with the exact file set and why that is one live
 * owner and not two. The scan does not strip comments, so a file whose header or docstring quotes
 * an old addListener or addHandler call is counted; each entry below was read on 2026-11-20
 * (83-05) and has exactly one live registration. The file set is exact, so a real second
 * registration (or a third file) fails.
 */
const MULTI_REGISTRATION: Record<string, { files: string[]; reason: string }> =
  {
    changeLanguage: {
      files: ['appshell/language.ts', 'sidecar/appShellFlowRegistration.ts'],
      reason:
        'language.ts only quotes the old main.ts addListener in its header; the live ipc.on is in appShellFlowRegistration.ts'
    },
    getCrossoverIndex: {
      files: [
        'crossover_index/crossoverRatingMap.ts',
        'sidecar/enrichmentFlowRegistration.ts'
      ],
      reason:
        'crossoverRatingMap.ts only quotes the old addHandler in its header; the live ipc.handle is in enrichmentFlowRegistration.ts'
    },
    logoutSteam: {
      files: [
        'sidecar/steamAuthFlowRegistration.ts',
        'storeManagers/steam/user.ts'
      ],
      reason:
        'steam/user.ts only quotes addListener(logoutSteam) in a comment; the live ipc.on is in steamAuthFlowRegistration.ts'
    },
    openDialog: {
      files: ['sidecar/dialogFlowRegistration.ts', 'utils/openDialog.ts'],
      reason:
        'utils/openDialog.ts only quotes the old main.ts addHandler in its header; the live registration is dialogFlowRegistration.ts'
    },
    quit: {
      files: [
        'i18nFallback.ts',
        'sidecar/appShellFlowRegistration.ts',
        'storeManagers/steam/user.ts'
      ],
      reason:
        'i18nFallback.ts and steam/user.ts only quote ipcMain.on/addListener(quit) in comments; the live ipc.on is in appShellFlowRegistration.ts'
    },
    setGameMetadataOverride: {
      files: [
        'gamedetails/overrides.ts',
        'sidecar/gameDetailsFlowRegistration.ts'
      ],
      reason:
        'overrides.ts only quotes the old main.ts addListener in its header; the live registration is gameDetailsFlowRegistration.ts'
    }
  }

/** The `RENDERER_CHANNELS` array of ipc_contract.rs: one `    "name",` line per channel. */
function parseRendererChannels(rustSource: string): string[] {
  const block = /RENDERER_CHANNELS: &\[&str\] = &\[\n([\s\S]*?)\n\];/.exec(
    rustSource
  )
  if (!block?.[1]) {
    throw new Error('RENDERER_CHANNELS block not found in ipc_contract.rs')
  }
  return [...block[1].matchAll(/^\s*"([^"]+)",\s*$/gm)].map((m) => m[1] ?? '')
}

function rendererChannels(): string[] {
  return parseRendererChannels(readFileSync(IPC_CONTRACT_RS, 'utf-8'))
}

/** RENDERER_CHANNELS names with no manifest owner and no static registration. */
function zeroOwnerNames(
  renderer: readonly string[],
  native: ReadonlySet<string>,
  registered: ReadonlySet<string>
): string[] {
  return renderer.filter((n) => !native.has(n) && !registered.has(n)).sort()
}

/** Channels the scan found in more than one file, with their sorted file sets. */
function multiRegistered(
  byFile: ReadonlyMap<string, string[]>
): Record<string, string[]> {
  return Object.fromEntries(
    [...byFile.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([channel, files]) => [channel, [...files].sort()] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1))
  )
}

describe('native channel ownership (83-05, FND-03 criterion 1)', () => {
  const scan = scanRegistrations(BACKEND_DIR)
  const registered = new Set([...scan.invoke, ...scan.send])
  const native = nativeChannelNames()
  const renderer = rendererChannels()

  it('floors: the renderer-channel list and the backend file walk are not vacuous', () => {
    assertAtOrAboveFloor(
      'RENDERER_CHANNELS',
      renderer.length,
      RENDERER_CHANNELS_FLOOR
    )
    assertAtOrAboveFloor(
      'src/backend registration walk',
      scan.scanned,
      BACKEND_FILES_FLOOR
    )
  })

  it('the renderer floor equals the snapshot generator floor', () => {
    const m = /SNAPSHOT_CHANNELS_FLOOR = (\d+)/.exec(
      readFileSync(GEN_IPC_CONTRACT_TS, 'utf-8')
    )
    expect(Number(m?.[1])).toBe(RENDERER_CHANNELS_FLOOR)
  })

  it('empty input: an empty directory driven through the scan is caught by the file floor', () => {
    const empty = mkdtempSync(join(tmpdir(), 'native-ownership-empty-'))
    try {
      const out = scanRegistrations(empty)
      expect(out.scanned).toBe(0)
      expect(() =>
        assertAtOrAboveFloor(
          'src/backend registration walk',
          out.scanned,
          BACKEND_FILES_FLOOR
        )
      ).toThrow(/below the floor/)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('truncated input: a RENDERER_CHANNELS list cut to 10 names is caught by the floor', () => {
    expect(() =>
      assertAtOrAboveFloor(
        'RENDERER_CHANNELS',
        renderer.slice(0, 10).length,
        RENDERER_CHANNELS_FLOOR
      )
    ).toThrow(/scanned 10, below the floor/)
  })

  it('the parser reads the Rust block and refuses a file without one', () => {
    expect(renderer).toContain('getHeroicVersion')
    expect(renderer).toEqual([...renderer].sort())
    expect(() => parseRendererChannels('// nothing here')).toThrow(
      /RENDERER_CHANNELS block not found/
    )
  })

  it('every manifest channel is a renderer channel the Rust relay allows', () => {
    expect([...native].filter((n) => !renderer.includes(n))).toEqual([])
  })

  it('(1) no manifest channel is registered in non-test src/backend', () => {
    const doubled = [...native].filter((n) => registered.has(n))
    expect(
      doubled.map((n) => `${n}: ${(scan.byFile.get(n) ?? []).join(', ')}`)
    ).toEqual([])
  })

  it('(2) no manifest channel has a channelSchemas or collidingPushSchemas entry', () => {
    const doubled = [...native].filter(
      (n) =>
        Object.prototype.hasOwnProperty.call(channelSchemas, n) ||
        Object.prototype.hasOwnProperty.call(collidingPushSchemas, n)
    )
    expect(doubled).toEqual([])
  })

  it('(3) zero-owner: the renderer channels with no owner equal the ZERO_LITERAL_OWNER ledger', () => {
    expect(zeroOwnerNames(renderer, native, registered)).toEqual(
      Object.keys(ZERO_LITERAL_OWNER).sort()
    )
    for (const [name, reason] of Object.entries(ZERO_LITERAL_OWNER)) {
      expect({ name, reasonLength: reason.length > 20 }).toEqual({
        name,
        reasonLength: true
      })
    }
  })

  it('zero-owner near-miss: a channel in no owner set is reported; a native or registered one is not', () => {
    const lonely = 'channelWithNoOwnerAnywhere'
    expect(
      zeroOwnerNames([lonely, 'a', 'b'], new Set(['a']), new Set(['b']))
    ).toEqual([lonely])
  })

  it('(4) multi-registration: channels registered in more than one file equal the MULTI_REGISTRATION ledger', () => {
    expect(multiRegistered(scan.byFile)).toEqual(
      Object.fromEntries(
        Object.entries(MULTI_REGISTRATION).map(([name, e]) => [
          name,
          [...e.files].sort()
        ])
      )
    )
    for (const [name, { reason }] of Object.entries(MULTI_REGISTRATION)) {
      expect({ name, reasonLength: reason.length > 20 }).toEqual({
        name,
        reasonLength: true
      })
    }
  })

  it('multi-registration near-miss: a channel in two files is reported; one file is not', () => {
    const byFile = new Map([
      ['twice', ['a.ts', 'b.ts']],
      ['once', ['a.ts']]
    ])
    expect(multiRegistered(byFile)).toEqual({ twice: ['a.ts', 'b.ts'] })
  })
})
