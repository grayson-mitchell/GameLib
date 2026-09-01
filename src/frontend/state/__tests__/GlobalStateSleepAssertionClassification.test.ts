/**
 * Behavioural proof for `classifySleepAssertionKind` / `reconcileSleepAssertionCalls`
 * (Phase 35 gap-closure 35-27, REQ-35-20 / D-35-08-02 / gate criterion 16, option-a).
 *
 * `GlobalState.tsx` cannot be `import`-ed directly under this project's frontend jest project:
 * it reads `window.localStorage` at MODULE SCOPE (`const storage: Storage =
 * window.localStorage`), and `src/frontend/jest.config.js` deliberately runs with NO jsdom (see
 * that file's own docstring) — a bare `import` throws `window is not defined` before a single
 * test runs. `GlobalStateSteamLogout.test.ts` hit the identical wall and solved it with a
 * source-text structural gate; this file goes one step further and gets BEHAVIOURAL proof
 * without ever loading `GlobalState.tsx` as a module: it reads the real source file's text at
 * test time, extracts the two functions' actual bodies (by scanning for the declaration's start
 * marker and walking to its balanced closing brace — not a hand-copied duplicate that could
 * silently drift from the real implementation), strips them down to plain TypeScript function
 * declarations, transpiles them with the project's own `typescript` package (type annotations
 * are erased; no cross-file type resolution is needed for two standalone functions), and
 * evaluates the result to get REAL, callable functions extracted from the REAL file on disk.
 *
 * This is what proves acceptance-criterion bullet (c) ("unknown status -> rejected"): the
 * `default` case's `const unrecognised: never = status; throw new Error(...)` is TypeScript's
 * compile-time exhaustiveness check (a build break if a `Status` member is ever added without a
 * case) PLUS a runtime throw as the backstop for a value that reaches the function despite that
 * (e.g. an `as Status` cast on untrusted data) — REQ-35-06's existing "reject unknown kind"
 * rule, mirrored one layer up from the Rust side (`src-tauri/src/main.rs`'s `wake_lock_kind`).
 *
 * Anti-vacuity self-test (this project's own house rule — a source-text gate without a
 * self-test is a vacuous gate, the exact lesson Phase 34.2's four gap cycles paid for): the
 * final describe block below feeds the extractor a REGRESSED synthetic source where the throw
 * has been replaced with a silent default-to-'system', and asserts the extracted function then
 * (wrongly) returns 'system' instead of throwing — proving this test would actually go RED
 * against a real regression, not just against the string 'default'.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'

const GLOBAL_STATE_PATH = join(__dirname, '..', 'GlobalState.tsx')

/**
 * All 20 members of `Status` (`src/common/types.ts`), copied here as a literal list so this
 * test independently enumerates them rather than importing the type (which would pull in the
 * same module-scope `window` problem transitively through re-exports in some configurations).
 * If `Status` gains a member without this list being updated, the "every status classifies
 * without throwing" test below will simply not cover the new member -- it will NOT false-pass,
 * because TypeScript's own build-time exhaustiveness check on the real `classifySleepAssertionKind`
 * (a `never`-typed `default` binding) is the actual backstop for that case, not this list.
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

/** Walks from `startMarker` to the declaration's balanced closing brace and returns that exact
 * source slice -- not a hand-copied duplicate, so any future edit to the real function is what
 * this test exercises. */
function extractFunctionSource(source: string, startMarker: string): string {
  const startIdx = source.indexOf(startMarker)
  if (startIdx === -1) {
    throw new Error(
      `extractFunctionSource: start marker not found in GlobalState.tsx: ${startMarker}`
    )
  }
  const braceStart = source.indexOf('{', startIdx)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) {
    throw new Error(
      `extractFunctionSource: never found a balanced closing brace for marker: ${startMarker}`
    )
  }
  return source.slice(startIdx, i + 1)
}

/** Strips the leading `export` (so `ts.transpileModule` treats it as a plain script, not a
 * module needing an `exports` object it won't have in a `new Function` scope), transpiles away
 * all TypeScript-only syntax, and evaluates the result to return a real, callable function. */
function compileExtractedFunction<T>(
  rawSource: string,
  functionName: string
): T {
  const bare = rawSource.replace(/^export\s+/, '')
  const { outputText } = ts.transpileModule(bare, {
    compilerOptions: { target: ts.ScriptTarget.ES2019 }
  })
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: see file docstring.
  const factory = new Function(`${outputText}\nreturn ${functionName};`)
  return factory() as T
}

function loadClassifySleepAssertionKind(): (status: string) => string | null {
  const source = readFileSync(GLOBAL_STATE_PATH, 'utf8')
  const raw = extractFunctionSource(
    source,
    'export function classifySleepAssertionKind(status: Status): SleepAssertionKind {'
  )
  return compileExtractedFunction(raw, 'classifySleepAssertionKind')
}

type SleepAssertionState = { display: boolean; system: boolean }
type SleepAssertionCall = { channel: 'lock' | 'unlock'; playing?: boolean }

function loadReconcileSleepAssertionCalls(): (
  previous: SleepAssertionState,
  next: SleepAssertionState
) => SleepAssertionCall[] {
  const source = readFileSync(GLOBAL_STATE_PATH, 'utf8')
  const raw = extractFunctionSource(
    source,
    'export function reconcileSleepAssertionCalls('
  )
  return compileExtractedFunction(raw, 'reconcileSleepAssertionCalls')
}

describe('classifySleepAssertionKind (REQ-35-20/D-35-08-02, extracted from the real GlobalState.tsx)', () => {
  it('classifies every "display" kind status (launching/playing)', () => {
    const classify = loadClassifySleepAssertionKind()
    for (const status of DISPLAY_KIND_STATUSES) {
      expect(classify(status)).toBe('display')
    }
  })

  it('classifies every download-shaped status as "system", never "display"', () => {
    const classify = loadClassifySleepAssertionKind()
    for (const status of SYSTEM_KIND_STATUSES) {
      expect(classify(status)).toBe('system')
    }
  })

  it('classifies every non-operation status as null (no assertion)', () => {
    const classify = loadClassifySleepAssertionKind()
    for (const status of NULL_KIND_STATUSES) {
      expect(classify(status)).toBeNull()
    }
  })

  it('covers all 20 Status members with no gaps (list-completeness cross-check)', () => {
    const covered = [
      ...DISPLAY_KIND_STATUSES,
      ...SYSTEM_KIND_STATUSES,
      ...NULL_KIND_STATUSES
    ].sort()
    expect(covered).toEqual([...ALL_STATUS_MEMBERS].sort())
  })

  // Acceptance criterion bullet (c): "unknown status -> rejected".
  it('case (c): an unrecognised status throws rather than silently defaulting to a sleep kind', () => {
    const classify = loadClassifySleepAssertionKind()
    expect(() => classify('totally-bogus-status')).toThrow(
      /unrecognised operation status/
    )
    expect(() => classify('')).toThrow(/unrecognised operation status/)
    expect(() => classify(undefined as unknown as string)).toThrow(
      /unrecognised operation status/
    )
  })
})

describe('reconcileSleepAssertionCalls (REQ-35-20/D-35-08-02, extracted from the real GlobalState.tsx)', () => {
  // Acceptance criterion bullet (a), pure-function level: a solo game launching (display only,
  // nothing was ever active before) must never emit a system-kind lock call.
  it('case (a): idle -> display-only active emits ONLY a display lock, never a system lock', () => {
    const reconcile = loadReconcileSleepAssertionCalls()
    const calls = reconcile(
      { display: false, system: false },
      { display: true, system: false }
    )
    expect(calls).toEqual([{ channel: 'lock', playing: true }])
  })

  // Acceptance criterion bullet (b), pure-function level: the download's kind ending while the
  // game's kind is still active must unlock-then-relock the surviving kind, in the SAME pass --
  // not defer the release to some later, unrelated transition.
  it('case (b): system kind ending while display kind stays active releases system IMMEDIATELY and re-asserts display in the same call list', () => {
    const reconcile = loadReconcileSleepAssertionCalls()
    const calls = reconcile(
      { display: true, system: true },
      { display: true, system: false }
    )
    expect(calls).toEqual([
      { channel: 'unlock' },
      { channel: 'lock', playing: true }
    ])
  })

  // Acceptance criterion bullet (d): the inverse over-correction. A game quitting while a
  // download is still running must not leave the download unprotected -- system must be
  // re-acquired in the SAME call list, not merely "not released" (both must be verified).
  it('case (d): display kind ending while system kind stays active releases display and re-asserts system, never leaving the download unprotected', () => {
    const reconcile = loadReconcileSleepAssertionCalls()
    const calls = reconcile(
      { display: true, system: true },
      { display: false, system: true }
    )
    expect(calls).toEqual([
      { channel: 'unlock' },
      { channel: 'lock', playing: false }
    ])
  })

  it('both kinds ending simultaneously emits a single unlock with no re-lock', () => {
    const reconcile = loadReconcileSleepAssertionCalls()
    const calls = reconcile(
      { display: true, system: true },
      { display: false, system: false }
    )
    expect(calls).toEqual([{ channel: 'unlock' }])
  })

  it('both kinds already active and staying active re-asserts both (idempotent on the backend side)', () => {
    const reconcile = loadReconcileSleepAssertionCalls()
    const calls = reconcile(
      { display: true, system: true },
      { display: true, system: true }
    )
    expect(calls).toEqual([
      { channel: 'lock', playing: false },
      { channel: 'lock', playing: true }
    ])
  })
})

describe('anti-vacuity self-test: this gate is not blind to a real regression', () => {
  it('RED-proves the extractor+harness against a synthetic regressed source that silently defaults instead of throwing', () => {
    const regressedSource = `
export function classifySleepAssertionKind(status: Status): SleepAssertionKind {
  switch (status) {
    case 'launching':
    case 'playing':
      return 'display'
    default:
      // regression: silently defaults every other status to 'system' instead of throwing.
      return 'system'
  }
}
`
    const raw = extractFunctionSource(
      regressedSource,
      'export function classifySleepAssertionKind(status: Status): SleepAssertionKind {'
    )
    const classify = compileExtractedFunction<
      (status: string) => string | null
    >(raw, 'classifySleepAssertionKind')

    // Proves this harness actually detects the regression (would fail this expectation's
    // opposite if the harness were blind to source content, e.g. if it always returned a
    // hard-coded 'throws' result regardless of what was extracted).
    expect(() => classify('totally-bogus-status')).not.toThrow()
    expect(classify('totally-bogus-status')).toBe('system')
  })

  it('the real extracted function does NOT exhibit the regressed (silent-default) behaviour', () => {
    const classify = loadClassifySleepAssertionKind()
    expect(() => classify('totally-bogus-status')).toThrow()
  })
})
