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
import type { Status } from 'common/types'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { releasesPlayClicked } from '../playClickedLatch'

const replay = (seq: Array<Status | undefined>) =>
  seq.reduce((clicked, s) => (releasesPlayClicked(s) ? false : clicked), true)

describe('releasesPlayClicked', () => {
  it('releases on launching and playing', () => {
    expect(releasesPlayClicked('launching')).toBe(true)
    expect(releasesPlayClicked('playing')).toBe(true)
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

describe('GamePage call sites', () => {
  const src = stripSourceComments(
    readFileSync(resolve(__dirname, '..', 'index.tsx'), 'utf8')
  )

  it('imports and uses the helper in the status effect', () => {
    expect(src).toMatch(
      /import\s*\{\s*releasesPlayClicked\s*\}\s*from\s*'\.\/playClickedLatch'/
    )
    expect(src).toContain('releasesPlayClicked(status)')
    expect(src).not.toContain(
      "if (status === 'launching') setPlayClicked(false)"
    )
  })

  it('resets the latch in a finally around launch()', () => {
    expect(src).toMatch(
      /try\s*\{[\s\S]*?await launch\([\s\S]*?\}\s*finally\s*\{\s*setPlayClicked\(false\)/
    )
  })
})
