/**
 * Phase 80 plan 02 (D-14): the TS half of the poll parity harness. Runs every scripted timeline
 * through the real TS loops and compares the normalised stream with the frozen copy in
 * `expected-ts/`. The frozen streams keep the Rust replay comparable after the TS loops are deleted.
 *
 * Regenerate (deliberately, then review the diff): UPDATE_STEAMPOLL_GOLDENS=1 pnpm exec jest <this file>
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { runTsTimeline } from 'backend/testUtils/steamPollReplay/tsDriver'
import {
  parseTimeline,
  type StreamRecord
} from 'backend/testUtils/steamPollReplay/timeline'

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
const EXPECTED = join(FIXTURES, 'expected-ts')
const UPDATE = process.env.UPDATE_STEAMPOLL_GOLDENS === '1'

const files = readdirSync(TIMELINES)
  .filter((f) => f.endsWith('.json'))
  .sort()

describe('steam poll TS driver (D-14)', () => {
  it('has a timeline corpus', () => {
    expect(files.length).toBeGreaterThanOrEqual(34)
  })

  describe.each(files)('%s', (file) => {
    const load = () =>
      parseTimeline(JSON.parse(readFileSync(join(TIMELINES, file), 'utf8')))

    it('runs through the real TS loops to a non-empty, deterministic stream', async () => {
      const timeline = load()
      expect(timeline.name).toBe(file.replace(/\.json$/, ''))
      const a = await runTsTimeline(timeline)
      const b = await runTsTimeline(load())
      if (timeline.expectEmptyStream) expect(a).toEqual([])
      else expect(a.length).toBeGreaterThan(0)
      expect(b).toEqual(a)
    })

    it('matches its frozen TS stream', async () => {
      const stream = await runTsTimeline(load())
      const expectedPath = join(EXPECTED, file)
      if (UPDATE) {
        mkdirSync(EXPECTED, { recursive: true })
        writeFileSync(expectedPath, `${JSON.stringify(stream, null, 2)}\n`)
        return
      }
      expect(existsSync(expectedPath)).toBe(true)
      const frozen = JSON.parse(
        readFileSync(expectedPath, 'utf8')
      ) as StreamRecord[]
      expect(stream).toEqual(frozen)
    })
  })

  it('has one frozen stream per timeline and no orphans', () => {
    if (UPDATE) return
    expect(readdirSync(EXPECTED).sort()).toEqual(files)
  })
})

// Plan 80-26: the polls flag now defaults to rust; this file exercises the ts arm, so pin it.
const prevPollsImpl = process.env.GAMELIB_STEAM_POLLS
beforeAll(() => {
  process.env.GAMELIB_STEAM_POLLS = 'ts'
})
afterAll(() => {
  if (prevPollsImpl === undefined) delete process.env.GAMELIB_STEAM_POLLS
  else process.env.GAMELIB_STEAM_POLLS = prevPollsImpl
})
