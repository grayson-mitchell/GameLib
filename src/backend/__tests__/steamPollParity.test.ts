/**
 * Phase 80 plan 19 (D-14, 63 D-07): TS loops vs Rust loops over the whole timeline corpus.
 *
 * Every timeline runs through the real TS loops (tsDriver) and through `gamelib-steampoll-cli
 * replay`; the two streams are diffed record by record. A diff that is not in
 * `divergences.json` fails, and so does a ledger entry that no longer diffs (stale ledger).
 * Handler parity then applies the Rust stream's `state` records through the plan-11
 * `steamPollStateEvent` handler and compares the resulting library and store with the TS run's.
 *
 * Needs the CLI built: cargo build -p gamelib-steampoll-cli --manifest-path src-tauri/Cargo.toml
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  runTsTimelineWithSnapshot,
  type TsSnapshot
} from 'backend/testUtils/steamPollReplay/tsDriver'
import {
  parseTimeline,
  type StreamRecord
} from 'backend/testUtils/steamPollReplay/timeline'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import type { ManagerDeps } from 'backend/services/types'
import { runSteampollReplaySync } from '../../../meta/gamelibSteampollCli'
import { registerSteamPollEventFlows } from '../sidecar/steamPollEventRegistration'

// A function declaration, not a const: the jest.mock factories below run while the imports above
// are still being evaluated, so the helper must already exist.
function mocks(): typeof import('backend/testUtils/steamPollReplay/mocks') {
  return jest.requireActual('backend/testUtils/steamPollReplay/mocks')
}

// The repo's __mocks__/i18next stub would hide the real catalogue; the harness needs the real one.
jest.unmock('i18next')
jest.mock('backend/logger', () => mocks().loggerMock())
jest.mock('backend/constants/environment', () => mocks().environmentMock())
jest.mock('backend/utils', () => mocks().utilsMock())
jest.mock('graceful-fs', () => mocks().gracefulFsMock())
jest.mock('../dialog/dialog', () => mocks().dialogMock())
jest.mock('../storeManagers/steam/stores', () => mocks().storesMock())
jest.mock('../storeManagers/steam/bottle', () => mocks().bottleMock())
jest.mock('../storeManagers/steam/bridgeBottle', () =>
  mocks().bridgeBottleMock()
)
jest.mock('../storeManagers/steam/bridge/allowlist', () =>
  mocks().allowlistMock()
)
jest.mock('../storeManagers/steam/steamClientProcess', () =>
  mocks().steamClientProcessMock()
)
jest.mock('../storeManagers/steam/library/macArch', () => mocks().macArchMock())
jest.mock('../storeManagers/steam/library/resumeBreadcrumbs', () =>
  mocks().resumeBreadcrumbsMock()
)
jest.mock('../storeManagers/steam/updateDetection', () => ({
  ...jest.requireActual('../storeManagers/steam/updateDetection'),
  ...mocks().updateDetectionMock()
}))
jest.mock('../storeManagers/steam/gameSessionState', () => ({
  ...jest.requireActual('../storeManagers/steam/gameSessionState'),
  ...mocks().gameSessionStateMock()
}))
jest.mock('../storeManagers/steam/depot', () => ({
  downloadSteamDepots: () => undefined
}))
jest.mock('backend/launcher', () => ({ runWineCommand: () => undefined }))
jest.mock('backend/knownFixReport', () => ({
  reportDetectedFix: () => undefined
}))
jest.mock('../storeManagers/steam/bridge/launchTarget', () => ({
  backfillBridgeLaunchTargets: () => undefined
}))
jest.mock('../storeManagers/steam/platformCapture', () => ({
  createPlatformCaptureQueue: () => ({})
}))
jest.mock('../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: () => undefined,
  removeShortcuts: () => undefined,
  shortcutFiles: () => undefined
}))

const FIXTURES = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-steampoll',
  'tests',
  'fixtures'
)
const TIMELINES = join(FIXTURES, 'timelines')
const LEDGER = join(FIXTURES, 'divergences.json')

interface LedgerEntry {
  scenario: string
  recordIndex: number
  dv: string
  tsRecord: unknown
  rustRecord: unknown
}

/** Key order is not part of the record shape: both sides are rebuilt with sorted keys. */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)])
    )
  }
  return v
}

const norm = (v: unknown): unknown =>
  v === undefined ? null : sortKeys(JSON.parse(JSON.stringify(v)))

/** Index-wise diff; a missing side is null. Returns the differing indices with both records. */
function diffStreams(
  ts: unknown[],
  rust: unknown[]
): Array<{ recordIndex: number; tsRecord: unknown; rustRecord: unknown }> {
  const out = []
  const n = Math.max(ts.length, rust.length)
  for (let i = 0; i < n; i++) {
    const a = norm(ts[i])
    const b = norm(rust[i])
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ recordIndex: i, tsRecord: a, rustRecord: b })
    }
  }
  return out
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as LedgerEntry[]
const files = readdirSync(TIMELINES)
  .filter((f) => f.endsWith('.json'))
  .sort()

function rustReplay(file: string): StreamRecord[] {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-steampoll-' })
  try {
    return runSteampollReplaySync(
      join(TIMELINES, file),
      profile.childEnv(process.env)
    ) as StreamRecord[]
  } finally {
    profile.dispose()
  }
}

async function applyThroughHandler(
  snapshot: TsSnapshot,
  rust: StreamRecord[]
): Promise<{ library: unknown[]; games: unknown }> {
  let games: unknown
  const steam = {
    steamLibraryStore: {
      get: () => undefined,
      set: (_k: string, v: unknown) => {
        games = v
      }
    },
    steamMetadataStore: {
      get: () => undefined,
      set: () => undefined,
      entries: () => []
    },
    steamSyncStore: { get: () => undefined, set: () => undefined },
    configStore: {
      get: () => undefined,
      get_nodefault: () => undefined,
      set: () => undefined,
      clear: () => undefined
    },
    steamRestartHoldStore: {
      get: () => undefined,
      set: () => undefined,
      delete: () => undefined,
      entries: () => []
    }
  }
  const deps: ManagerDeps = createTestManagerDeps({
    sendFrontendMessage: (() => undefined) as never,
    stores: createTestStores({ steam: steam as never })
  })
  const initial = snapshot.initial as { app_name: string }
  deps.steamSession.libraryState.library.set(initial.app_name, initial as never)
  let handler: ((e: unknown, ...a: unknown[]) => Promise<unknown>) | undefined
  registerSteamPollEventFlows({
    ipc: {
      handle: (ch: string, h: typeof handler) => {
        if (ch === 'steamPollStateEvent') handler = h
      }
    } as never,
    manager: () => deps,
    refreshInstallState: async () => undefined
  })
  for (const rec of rust) {
    if ('state' in rec) await handler!({}, rec.state)
  }
  return {
    library: norm([
      ...deps.steamSession.libraryState.library.values()
    ]) as unknown[],
    games: norm(games)
  }
}

describe('steam poll parity: TS loops vs Rust loops (D-14)', () => {
  it('has a timeline corpus', () => {
    expect(files.length).toBeGreaterThanOrEqual(34)
  })

  it('every ledger entry names a DV id and a known scenario', () => {
    for (const e of ledger) {
      expect(e.dv).toMatch(/^DV-80-\d{2}$/)
      expect(files).toContain(`${e.scenario}.json`)
    }
  })

  describe.each(files)('%s', (file) => {
    const scenario = file.replace(/\.json$/, '')
    const entries = ledger.filter((e) => e.scenario === scenario)

    it('streams equal except ledgered records (no stale ledger)', async () => {
      const timeline = parseTimeline(
        JSON.parse(readFileSync(join(TIMELINES, file), 'utf8'))
      )
      const { stream } = await runTsTimelineWithSnapshot(timeline)
      const diffs = diffStreams(stream, rustReplay(file))
      expect(diffs).toEqual(
        entries.map(({ recordIndex, tsRecord, rustRecord }) => ({
          recordIndex,
          tsRecord: norm(tsRecord),
          rustRecord: norm(rustRecord)
        }))
      )
    })

    it('handler parity: Rust state records leave the TS final library and store', async () => {
      const timeline = parseTimeline(
        JSON.parse(readFileSync(join(TIMELINES, file), 'utf8'))
      )
      const { snapshot } = await runTsTimelineWithSnapshot(timeline)
      const applied = await applyThroughHandler(snapshot, rustReplay(file))
      expect(applied.library).toEqual(norm(snapshot.library))
      // Only compared when the TS loop persisted a games list at all.
      if (snapshot.games !== undefined) {
        expect(applied.games).toEqual(norm(snapshot.games))
      }
    })
  })
})
