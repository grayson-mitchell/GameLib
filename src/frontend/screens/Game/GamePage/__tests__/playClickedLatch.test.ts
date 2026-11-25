// quick/261024-i23. Root cause of "Launching" stuck after a bottled-Steam game
// exits: GamePage's local `playClicked` latch outranks every backend status in
// MainButton (is.launching is checked before is.playing). The backend DID send
// `done`. The latch was released only by a `launching` status or by
// `await launch()` resolving, and on a cold bottled Steam the launch IPC stays
// pending because runWineCommand resolves on the child's close. The rule lives
// in a pure helper and the call sites are pinned by source text because the
// frontend jest project has no jsdom/renderHook.
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Runner, Status } from 'common/types'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  releasesPlayClicked,
  releasesPlayClickedForFrame
} from '../playClickedLatch'

const replay = (seq: Array<Status | undefined>) =>
  seq.reduce((clicked, s) => (releasesPlayClicked(s) ? false : clicked), true)

describe('releasesPlayClicked', () => {
  it('releases on launching, playing, done and error', () => {
    expect(releasesPlayClicked('launching')).toBe(true)
    expect(releasesPlayClicked('playing')).toBe(true)
    expect(releasesPlayClicked('done')).toBe(true)
    expect(releasesPlayClicked('error')).toBe(true)
  })

  it.each([
    undefined,
    'installed',
    'notInstalled',
    'syncing-saves',
    'installing',
    'queued'
  ] as Array<Status | undefined>)('keeps the latch for %s', (s) => {
    expect(releasesPlayClicked(s)).toBe(false)
  })

  it('ends the latch for the pre-gvu sequence', () => {
    expect(replay(['installed', 'playing', 'installed'])).toBe(false)
  })
  it('ends the latch for the gvu sequence', () => {
    expect(replay(['installed', 'launching', 'playing', 'installed'])).toBe(
      false
    )
  })
  it('ends the latch for the stop-waiting sequence', () => {
    expect(replay(['installed', 'launching', 'installed'])).toBe(false)
  })
})

/**
 * 87-73 (RF2): the rendered status is derived through store state and effects, so a `launching` followed at once by
 * `done` (a refused launch) can pass between two renders and never show. The page therefore also reads the backend's
 * frames. The rule is the same one, applied to a frame of this game.
 */
describe('releasesPlayClickedForFrame', () => {
  const frame = (
    status: Status,
    appName = 'Quail',
    runner: Runner = 'legendary'
  ) => ({
    appName,
    runner,
    status
  })
  const framesRelease = (frames: ReturnType<typeof frame>[]) =>
    frames.reduce(
      (clicked, f) =>
        releasesPlayClickedForFrame(f, 'Quail', 'legendary') ? false : clicked,
      true
    )

  it('replays a refused launch (launching then done, no render between) as released', () => {
    expect(framesRelease([frame('launching'), frame('done')])).toBe(false)
  })

  it('the rendered status alone cannot see it: both frames fall between two renders, so only the frames release the latch', () => {
    // Renders show 'installed' before the click and 'installed' after the refusal: no `launching` ever renders.
    expect(replay(['installed', 'installed'])).toBe(true)
    expect(framesRelease([frame('launching'), frame('done')])).toBe(false)
  })

  it('releases on a lone done or error for this game (the launching frame was never seen)', () => {
    expect(framesRelease([frame('done')])).toBe(false)
    expect(framesRelease([frame('error')])).toBe(false)
  })

  it('does not release on a pre-launch status', () => {
    expect(framesRelease([frame('syncing-saves')])).toBe(true)
    expect(framesRelease([frame('syncing-saves'), frame('queued')])).toBe(true)
  })

  it('does not release on another game or another runner', () => {
    expect(framesRelease([frame('done', 'Other')])).toBe(true)
    expect(framesRelease([frame('launching', 'Quail', 'gog')])).toBe(true)
  })
})

describe('GamePage call sites', () => {
  const src = stripSourceComments(
    readFileSync(resolve(__dirname, '..', 'index.tsx'), 'utf8')
  )

  it('imports and uses the helper in the status effect', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\breleasesPlayClicked\b[^}]*\}\s*from\s*'\.\/playClickedLatch'/
    )
    expect(src).toContain('releasesPlayClicked(status)')
    expect(src).not.toContain(
      "if (status === 'launching') setPlayClicked(false)"
    )
  })

  it('also releases the latch from the backend frames of this game', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*releasesPlayClickedForFrame[^}]*\}\s*from\s*'\.\/playClickedLatch'/
    )
    expect(src).toMatch(
      /window\.api\.handleGameStatus\([\s\S]*?releasesPlayClickedForFrame\([\s\S]*?setPlayClicked\(false\)/
    )
  })

  it('resets the latch in a finally around launch()', () => {
    expect(src).toMatch(
      /try\s*\{[\s\S]*?await launch\([\s\S]*?\}\s*finally\s*\{\s*setPlayClicked\(false\)/
    )
  })
})
