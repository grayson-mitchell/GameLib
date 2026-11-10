/**
 * Behavioural proof for `classifySleepAssertionKind` / `reconcileSleepAssertionCalls` and the
 * libraryStatus-driven subscriber (Phase 35 gap-closure 35-27, REQ-35-20 / D-35-08-02 / gate
 * criterion 16, option-a; Phase 69-19 D-08).
 *
 * These used to live in `GlobalState.tsx`, which could not be imported under the jsdom-less
 * frontend jest project, so this file extracted their source text and transpiled it. They now
 * live in `sleepAssertion.ts` and are imported directly; the anti-vacuity self-tests below run
 * REGRESSED local variants through the same assertions to prove the cases would convict them.
 *
 * "unknown status -> rejected" (acceptance bullet (c)): the `default` case's
 * `const unrecognised: never = status; throw new Error(...)` is TypeScript's compile-time
 * exhaustiveness check PLUS a runtime throw as the backstop for an `as Status` cast on
 * untrusted data -- REQ-35-06's "reject unknown kind" rule, mirrored one layer up from the
 * Rust side (`src-tauri/src/main.rs`'s `wake_lock_kind`).
 */
import '../../testUtils/tauriWindow'
import type { GameStatus, Status } from 'common/types'
import useLibraryState from '../libraryState'
import { resetAllStores } from '../storeKit'
import {
  __resetSleepAssertionStateForTests,
  classifySleepAssertionKind,
  reconcileSleepAssertionCalls,
  registerSleepAssertionSubscriber
} from '../sleepAssertion'
import type { SleepAssertionState } from '../sleepAssertion'

/**
 * All 20 members of `Status` (`src/common/types.ts`), listed here so this test independently
 * enumerates them. TypeScript's own exhaustiveness check on the real function is the backstop
 * for a new member; this list only cross-checks the three buckets below for gaps.
 */
const ALL_STATUS_MEMBERS = [
  'installing',
  'importing',
  'updating',
  'launching',
  'playing',
  'uninstalling',
  'repairing',
  'done',
  'canceled',
  'moving',
  'queued',
  'error',
  'syncing-saves',
  'notAvailable',
  'notSupportedGame',
  'notInstalled',
  'installed',
  'redist',
  'extracting',
  'winetricks'
] as const

const DISPLAY_KIND_STATUSES = ['launching', 'playing']
const SYSTEM_KIND_STATUSES = [
  'installing',
  'updating',
  'redist',
  'winetricks',
  'extracting',
  'repairing',
  'moving',
  'syncing-saves',
  'uninstalling'
]
const NULL_KIND_STATUSES = [
  'importing',
  'done',
  'canceled',
  'queued',
  'error',
  'notAvailable',
  'notSupportedGame',
  'notInstalled',
  'installed'
]

const classify = (status: string) =>
  classifySleepAssertionKind(status as Status)

describe('classifySleepAssertionKind (REQ-35-20/D-35-08-02)', () => {
  it('classifies every "display" kind status (launching/playing)', () => {
    for (const status of DISPLAY_KIND_STATUSES) {
      expect(classify(status)).toBe('display')
    }
  })

  it('classifies every download-shaped status as "system", never "display"', () => {
    for (const status of SYSTEM_KIND_STATUSES) {
      expect(classify(status)).toBe('system')
    }
  })

  it('classifies every non-operation status as null (no assertion)', () => {
    for (const status of NULL_KIND_STATUSES) {
      expect(classify(status)).toBeNull()
    }
  })

  it('covers every Status member with no gaps (list-completeness cross-check)', () => {
    const covered = [
      ...DISPLAY_KIND_STATUSES,
      ...SYSTEM_KIND_STATUSES,
      ...NULL_KIND_STATUSES
    ].sort()
    expect(covered).toEqual([...ALL_STATUS_MEMBERS].sort())
  })

  it('case (c): an unrecognised status throws rather than silently defaulting to a sleep kind', () => {
    expect(() => classify('totally-bogus-status')).toThrow(
      /unrecognised operation status/
    )
    expect(() => classify('')).toThrow(/unrecognised operation status/)
    expect(() => classify(undefined as unknown as string)).toThrow(
      /unrecognised operation status/
    )
  })
})

describe('reconcileSleepAssertionCalls (REQ-35-20/D-35-08-02)', () => {
  it('case (a): idle -> display-only active emits ONLY a display lock, never a system lock', () => {
    const calls = reconcileSleepAssertionCalls(
      { display: false, system: false },
      { display: true, system: false }
    )
    expect(calls).toEqual([{ channel: 'lock', playing: true }])
  })

  it('case (b): system kind ending while display kind stays active releases system IMMEDIATELY and re-asserts display in the same call list', () => {
    const calls = reconcileSleepAssertionCalls(
      { display: true, system: true },
      { display: true, system: false }
    )
    expect(calls).toEqual([
      { channel: 'unlock' },
      { channel: 'lock', playing: true }
    ])
  })

  it('case (d): display kind ending while system kind stays active releases display and re-asserts system, never leaving the download unprotected', () => {
    const calls = reconcileSleepAssertionCalls(
      { display: true, system: true },
      { display: false, system: true }
    )
    expect(calls).toEqual([
      { channel: 'unlock' },
      { channel: 'lock', playing: false }
    ])
  })

  it('both kinds ending simultaneously emits a single unlock with no re-lock', () => {
    const calls = reconcileSleepAssertionCalls(
      { display: true, system: true },
      { display: false, system: false }
    )
    expect(calls).toEqual([{ channel: 'unlock' }])
  })

  it('both kinds already active and staying active re-asserts both (idempotent on the backend side)', () => {
    const calls = reconcileSleepAssertionCalls(
      { display: true, system: true },
      { display: true, system: true }
    )
    expect(calls).toEqual([
      { channel: 'lock', playing: false },
      { channel: 'lock', playing: true }
    ])
  })
})

describe('registerSleepAssertionSubscriber (D-08: libraryStatus-keyed)', () => {
  let calls: string[] = []
  let unsubscribe: (() => void) | undefined
  const status = (appName: string, s: Status): GameStatus =>
    ({ appName, status: s, runner: 'legendary' }) as GameStatus

  beforeEach(() => {
    calls = []
    ;(window as unknown as { api: unknown }).api = {
      lock: (playing: boolean) => calls.push(`lock:${playing}`),
      unlock: () => calls.push('unlock')
    }
    __resetSleepAssertionStateForTests()
  })

  afterEach(() => {
    unsubscribe?.()
    resetAllStores()
  })

  const register = () => {
    unsubscribe = registerSleepAssertionSubscriber()
  }

  it('fires once at registration while idle: a single unlock', () => {
    register()
    expect(calls).toEqual(['unlock'])
  })

  it('playing -> lock(true)', () => {
    register()
    calls = []
    useLibraryState.setState({ libraryStatus: [status('a', 'playing')] })
    expect(calls).toEqual(['lock:true'])
  })

  it('installing -> lock(false)', () => {
    register()
    calls = []
    useLibraryState.setState({ libraryStatus: [status('a', 'installing')] })
    expect(calls).toEqual(['lock:false'])
  })

  it('playing + installing -> both locks', () => {
    register()
    calls = []
    useLibraryState.setState({
      libraryStatus: [status('a', 'playing'), status('b', 'installing')]
    })
    expect(calls).toEqual(['lock:false', 'lock:true'])
  })

  it('playing ends while installing continues -> unlock then lock(false)', () => {
    register()
    useLibraryState.setState({
      libraryStatus: [status('a', 'playing'), status('b', 'installing')]
    })
    calls = []
    useLibraryState.setState({ libraryStatus: [status('b', 'installing')] })
    expect(calls).toEqual(['unlock', 'lock:false'])
  })

  it('an unrelated store change makes no lock/unlock call', () => {
    register()
    useLibraryState.setState({ libraryStatus: [status('a', 'playing')] })
    calls = []
    useLibraryState.setState({ gameUpdates: ['x'] })
    expect(calls).toEqual([])
  })
})

describe('anti-vacuity self-test: the cases above are not blind to a real regression', () => {
  const regressedClassify = (status: string): string | null =>
    status === 'launching' || status === 'playing' ? 'display' : 'system'

  const neverUnlocks = (
    previous: SleepAssertionState,
    next: SleepAssertionState
  ): { channel: 'lock' | 'unlock'; playing?: boolean }[] => {
    const out: { channel: 'lock' | 'unlock'; playing?: boolean }[] = []
    if (next.system) out.push({ channel: 'lock', playing: false })
    if (next.display) out.push({ channel: 'lock', playing: true })
    void previous
    return out
  }

  it('a classifier that silently defaults an unknown status is convicted by case (c)', () => {
    expect(() => regressedClassify('totally-bogus-status')).not.toThrow()
    expect(regressedClassify('totally-bogus-status')).toBe('system')
    expect(() => classify('totally-bogus-status')).toThrow()
  })

  it('a reconcile that never unlocks is convicted by case (b) and the both-ended case', () => {
    expect(
      neverUnlocks(
        { display: true, system: true },
        { display: true, system: false }
      )
    ).not.toEqual(
      reconcileSleepAssertionCalls(
        { display: true, system: true },
        { display: true, system: false }
      )
    )
    expect(
      neverUnlocks(
        { display: true, system: true },
        { display: false, system: false }
      )
    ).not.toEqual([{ channel: 'unlock' }])
  })
})
