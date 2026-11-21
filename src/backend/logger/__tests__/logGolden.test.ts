// Phase 84 plan 01: the TS oracle for the native logger golden (criterion 1).
//
// Drives the REAL `LogWriter`, `formatLogMessage` and `sanitizeRendererLogMessage` over the cases in
// `src-tauri/crates/gamelib-log/tests/fixtures/golden/cases.json`, into a fresh temp tree per case, and
// compares every produced file byte for byte against `expected/<id>/...`. The Rust writer (84-02) and the
// TS forwarder (84-03/84-04) are held to the same fixtures. Until plan 84-07 deletes the oracle this test
// keeps proving the fixtures; after that the fixtures stay and are owned by the Rust side.
//
// Compare mode is the default. Write mode (`GAMELIB_WRITE_LOG_GOLDEN=1`) regenerates `expected/`,
// and `entries.json` from the unmodified TS writer. See the golden directory's NOTES.md.
//
// The oracle is independent of `src/backend/logger/index.ts`: that module is mocked below so `logDebug`
// writes through the oracle's own general `LogWriter` and `getLogFilePath({})` returns the oracle's own
// general path. Changing index.ts internals cannot change the golden.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative, resolve } from 'path'

import { LogPrefix } from '../constants'
import { formatLogMessage } from '../formatter'
import LogWriter from '../log_writer'
import { sanitizeRendererLogMessage } from '../sanitizeRendererLogMessage'

import type { LogLevel } from '../constants'

// The oracle's own general writer and path for the running case (never `os.homedir`).
// Names start with `mock` so the hoisted factory below may close over them.
const mockOracle: {
  generalPath: string
  logDebug: (message: unknown, prefix?: string) => void
} = { generalPath: '', logDebug: () => undefined }

jest.mock('../index', () => ({
  getLogFilePath: () => mockOracle.generalPath,
  logDebug: (message: unknown, prefix?: string) =>
    mockOracle.logDebug(message, prefix)
}))

const FIXTURE_ROOT = resolve(
  __dirname,
  '../../../../src-tauri/crates/gamelib-log/tests/fixtures/golden'
)
const CASES_PATH = join(FIXTURE_ROOT, 'cases.json')
const ENTRIES_PATH = join(FIXTURE_ROOT, 'entries.json')
const EXPECTED_ROOT = join(FIXTURE_ROOT, 'expected')
const WRITE_MODE = process.env.GAMELIB_WRITE_LOG_GOLDEN === '1'
const LOGDIR_TOKEN = '${LOGDIR}'

/** The fixed wall-clock instant every case runs at: 2026-11-20 13:05:09 local time. */
const FAKE_NOW = new Date(2026, 10, 20, 13, 5, 9)

// ---------------------------------------------------------------------------------------------------
// Case schema (cases.json is a JSON array of GoldenCase)
// ---------------------------------------------------------------------------------------------------

type GoldenTarget =
  | { kind: 'general' }
  | { kind: 'runner'; runner: string }
  | { kind: 'game'; appName: string; runner: string; type: string }
  | { kind: 'gogRedist' }

type GoldenMessageKind =
  | 'string'
  | 'array'
  | 'error'
  | 'object'
  | 'number'
  | 'boolean'
  | 'promise'
  | 'empty'

/**
 * A value that cases.json cannot carry literally. `{"$gen": {"repeat": "a", "count": 65537}}` expands to
 * a string of `count` copies of `repeat`. Anywhere inside a case's `message` or renderer `value`.
 */
interface GoldenGen {
  $gen: { repeat: string; count: number }
}

/** One `LogWriter` method call: `kind: 'line'`, driven through the writer's `logDebug`..`logError`. */
interface GoldenLineCase {
  id: string
  kind: 'line'
  oracle?: boolean
  /** Required when `oracle` is false: names the decision the hand-written expectation comes from. */
  divergenceNote?: string
  target: GoldenTarget
  method: 'debug' | 'info' | 'warning' | 'error'
  /** JSON message. For `error` it is `{name, message, stack}` and the test builds a real Error. */
  message?: unknown
  messageKind: GoldenMessageKind
  /** A LogPrefix KEY (`Backend`, `Steam`, ...). Absent means `General`. */
  prefix?: string
  forceLog?: boolean
  disabled?: boolean
}

/** Raw `writeString` chunks against one writer. A chunk is a string or `{text, forceLog}`. */
interface GoldenChunksCase {
  id: string
  kind: 'chunks'
  oracle?: boolean
  /** Required when `oracle` is false: names the decision the hand-written expectation comes from. */
  divergenceNote?: string
  target: GoldenTarget
  /** Content of a log file that exists before the writer's first write. */
  existing?: string
  chunks: (string | { text: string; forceLog: boolean })[]
  disabled?: boolean
}

/** Ordered writer instances on one target, each driven by one message. */
interface GoldenRotateCase {
  id: string
  kind: 'rotate'
  oracle?: boolean
  /** Required when `oracle` is false: names the decision the hand-written expectation comes from. */
  divergenceNote?: string
  target: GoldenTarget
  existing?: string
  existingOld?: string
  writers: {
    disabled?: boolean
    forceLog?: boolean
    message: string
    /** True: `writeString(message)`. Absent: `logInfo(message, Backend)`. */
    raw?: boolean
  }[]
}

/** Chunks, then `close()`, then one more write that must throw. */
interface GoldenCloseCase {
  id: string
  kind: 'close'
  oracle?: boolean
  /** Required when `oracle` is false: names the decision the hand-written expectation comes from. */
  divergenceNote?: string
  target: GoldenTarget
  chunks: string[]
}

/** A renderer send (`logError`/`logInfo`): sanitised, then written with the Frontend prefix. */
interface GoldenRendererCase {
  id: string
  kind: 'renderer'
  oracle?: boolean
  /** Required when `oracle` is false: names the decision the hand-written expectation comes from. */
  divergenceNote?: string
  channel: 'logError' | 'logInfo'
  value: unknown
}

type GoldenCase =
  | GoldenLineCase
  | GoldenChunksCase
  | GoldenRotateCase
  | GoldenCloseCase
  | GoldenRendererCase

// ---------------------------------------------------------------------------------------------------
// entries.json: what the forwarder must emit for each case
// ---------------------------------------------------------------------------------------------------

type FrameEntry =
  | {
      line: {
        ts: number
        tz: number
        level: LogLevel
        prefix: string
        msg: string
      }
    }
  | { raw: string }

interface Frame {
  target: GoldenTarget
  rotate: boolean
  entries: FrameEntry[]
}

type CaseEntries =
  | { id: string; frames: Frame[] }
  | { id: string; renderer: { channel: string; value: unknown } }

// ---------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------

function isGen(value: unknown): value is GoldenGen {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    '$gen' in value
  )
}

function expandGen(value: unknown): unknown {
  if (isGen(value)) return value.$gen.repeat.repeat(value.$gen.count)
  if (Array.isArray(value)) return value.map(expandGen)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expandGen(v)])
    )
  }
  return value
}

function prefixValue(key: string | undefined): string {
  if (key === undefined) return LogPrefix.General
  const value = (LogPrefix as Record<string, string>)[key]
  if (value === undefined) throw new Error(`unknown LogPrefix key ${key}`)
  return value
}

function buildMessage(c: GoldenLineCase): unknown {
  const raw = expandGen(c.message)
  switch (c.messageKind) {
    case 'empty':
      return ''
    case 'error': {
      const d = raw as { name: string; message: string; stack: string }
      const error = new Error(d.message)
      error.name = d.name
      error.stack = d.stack
      return error
    }
    case 'promise':
      return Promise.resolve(raw)
    default:
      return raw
  }
}

class Tree {
  readonly root = mkdtempSync(join(tmpdir(), 'gamelib-log-golden-'))
  private general: LogWriter | undefined
  private readonly pending: Promise<unknown>[] = []
  private readonly frames = new Map<LogWriter, Frame>()

  constructor() {
    mockOracle.generalPath = join(this.root, 'gamelib.log')
    mockOracle.logDebug = (message, prefix) => {
      // The real index.ts `logDebug` drops the promise; the oracle keeps it so the case can await it.
      this.pending.push(
        this.generalWriter().logDebug(message, { prefix: prefix ?? '' })
      )
    }
  }

  dispose() {
    rmSync(this.root, { recursive: true, force: true })
  }

  pathFor(target: GoldenTarget): string {
    switch (target.kind) {
      case 'general':
        return join(this.root, 'gamelib.log')
      case 'runner':
        return join(this.root, 'runners', `${target.runner}.log`)
      case 'game':
        return join(
          this.root,
          'games',
          `${target.appName}_${target.runner}`,
          `${target.type}.log`
        )
      case 'gogRedist':
        return join(this.root, 'userData', 'GamesConfig', 'gog-redist.log')
    }
  }

  /** The oracle's own general writer, shared by general-target cases and the `Logging to file(s)` lines. */
  generalWriter(): LogWriter {
    if (!this.general) {
      this.general = new LogWriter(
        this.pathFor({ kind: 'general' }),
        false,
        false
      )
      this.registerFrame(this.general, { kind: 'general' })
    }
    return this.general
  }

  writerFor(target: GoldenTarget, disabled: boolean): LogWriter {
    if (target.kind === 'general') return this.generalWriter()
    const writer = new LogWriter(this.pathFor(target), false, disabled)
    this.registerFrame(writer, target)
    return writer
  }

  private registerFrame(writer: LogWriter, target: GoldenTarget) {
    this.frames.set(writer, { target, rotate: false, entries: [] })
  }

  seed(target: GoldenTarget, existing?: string, existingOld?: string) {
    const file = this.pathFor(target)
    mkdirSync(dirname(file), { recursive: true })
    if (existing !== undefined) writeFileSync(file, existing)
    if (existingOld !== undefined) writeFileSync(`${file}.old`, existingOld)
  }

  /** Marks the first accepted entry of a non-general writer: its frame carries `rotate: true`. */
  private accept(writer: LogWriter, target: GoldenTarget): Frame {
    const frame = this.frames.get(writer) as Frame
    if (target.kind !== 'general' && !frame.entries.length && !frame.rotate) {
      frame.rotate = true
    }
    return frame
  }

  async settle() {
    // Awaits the `Logging to file(s)` lines the mocked index.ts `logDebug` started.
    while (this.pending.length) {
      await Promise.all(this.pending.splice(0))
    }
  }

  async line(
    writer: LogWriter,
    target: GoldenTarget,
    c: Pick<
      GoldenLineCase,
      'method' | 'prefix' | 'forceLog' | 'messageKind' | 'message'
    >,
    disabled: boolean
  ) {
    const level = c.method.toUpperCase() as LogLevel
    const prefix = prefixValue(c.prefix)
    const accepted = !disabled || c.forceLog === true
    let msg = ''
    if (accepted) {
      // The line's message body is the oracle's own output with its prefix chunk removed: format a
      // one-character marker to learn the header, then cut it from the real line.
      const header = (
        await formatLogMessage('X', level, prefix as LogPrefix)
      ).slice(0, -1)
      const full = await formatLogMessage(
        buildMessage(c as GoldenLineCase),
        level,
        prefix as LogPrefix
      )
      if (full.length) {
        expect(full.startsWith(header)).toBe(true)
        msg = full.slice(header.length)
      }
    }
    const options = { prefix: prefix as LogPrefix, forceLog: c.forceLog }
    const method = (
      {
        DEBUG: 'logDebug',
        INFO: 'logInfo',
        WARNING: 'logWarning',
        ERROR: 'logError'
      } as const
    )[level]
    await writer[method](buildMessage(c as GoldenLineCase), options)
    await this.settle()
    if (!accepted) return
    const frame = this.accept(writer, target)
    if (!msg.length) return
    const ts = Date.now()
    frame.entries.push({
      line: { ts, tz: -new Date(ts).getTimezoneOffset(), level, prefix, msg }
    })
  }

  async raw(
    writer: LogWriter,
    target: GoldenTarget,
    text: string,
    forceLog: boolean,
    disabled: boolean
  ) {
    const accepted = !disabled || forceLog
    await writer.writeString(text, forceLog)
    await this.settle()
    if (!accepted) return
    this.accept(writer, target).entries.push({ raw: text })
  }

  /** `close()` writes the end line through `writeString`: one more raw entry. */
  async close(writer: LogWriter, target: GoldenTarget) {
    await writer.close()
    await this.settle()
    this.accept(writer, target).entries.push({
      raw: '============= End of log ============='
    })
  }

  collectFrames(): Frame[] {
    return [...this.frames.values()].filter(
      (f) => f.entries.length > 0 || f.rotate
    )
  }

  /** Every file under the tree, relative path with `/` separators, content with the root tokenised. */
  readFiles(): Map<string, string> {
    const out = new Map<string, string>()
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else
          out.set(
            relative(this.root, full).split('\\').join('/'),
            this.tokenise(readFileSync(full, 'utf-8'))
          )
      }
    }
    walk(this.root)
    return out
  }

  /** Replaces the temp root with `${LOGDIR}`, normalising backslashes inside that token's path only. */
  tokenise(text: string): string {
    const rootPattern = this.root
      .replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
      .replace(/\\\\|\\\//g, '[\\\\/]')
    return text.replace(
      new RegExp(`${rootPattern}([^\\s'"]*)`, 'g'),
      (_match, tail: string) => `${LOGDIR_TOKEN}${tail.split('\\').join('/')}`
    )
  }
}

interface CaseResult {
  files: Map<string, string>
  entries: CaseEntries
}

async function runCase(c: GoldenCase): Promise<CaseResult> {
  jest.useFakeTimers({
    now: FAKE_NOW,
    // Only `Date` is faked; promises, fs and the event loop stay real.
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout'
    ]
  })
  const tree = new Tree()
  try {
    switch (c.kind) {
      case 'line': {
        const writer = tree.writerFor(c.target, c.disabled === true)
        await tree.line(writer, c.target, c, c.disabled === true)
        break
      }
      case 'chunks': {
        tree.seed(c.target, c.existing)
        const disabled = c.disabled === true
        const writer = tree.writerFor(c.target, disabled)
        for (const chunk of c.chunks) {
          const text = typeof chunk === 'string' ? chunk : chunk.text
          const forceLog = typeof chunk === 'string' ? false : chunk.forceLog
          await tree.raw(writer, c.target, text, forceLog, disabled)
        }
        break
      }
      case 'rotate': {
        tree.seed(c.target, c.existing, c.existingOld)
        for (const w of c.writers) {
          const disabled = w.disabled === true
          const writer = tree.writerFor(c.target, disabled)
          if (w.raw) {
            await tree.raw(
              writer,
              c.target,
              w.message,
              w.forceLog === true,
              disabled
            )
          } else {
            await tree.line(
              writer,
              c.target,
              {
                method: 'info',
                prefix: 'Backend',
                forceLog: w.forceLog,
                messageKind: 'string',
                message: w.message
              },
              disabled
            )
          }
        }
        break
      }
      case 'close': {
        const writer = tree.writerFor(c.target, false)
        for (const chunk of c.chunks) {
          await tree.raw(writer, c.target, chunk, false, false)
        }
        await tree.close(writer, c.target)
        await expect(writer.writeString('after close')).rejects.toThrow(
          /after it was closed/
        )
        break
      }
      case 'renderer': {
        const sanitized = sanitizeRendererLogMessage(expandGen(c.value))
        const writer = tree.generalWriter()
        await writer[c.channel === 'logError' ? 'logError' : 'logInfo'](
          sanitized,
          { prefix: LogPrefix.Frontend }
        )
        await tree.settle()
        return {
          files: tree.readFiles(),
          entries: {
            id: c.id,
            renderer: { channel: c.channel, value: c.value }
          }
        }
      }
    }
    return {
      files: tree.readFiles(),
      entries: { id: c.id, frames: tree.collectFrames() }
    }
  } finally {
    tree.dispose()
    jest.useRealTimers()
  }
}

/** Compares wall-clock time (ts + tz * 60000), so the fixtures hold on any host timezone. */
function normaliseEntries(entries: CaseEntries[]): unknown {
  return JSON.parse(
    JSON.stringify(entries, (key, value: unknown) => {
      if (
        key === 'line' &&
        typeof value === 'object' &&
        value !== null &&
        'ts' in value &&
        'tz' in value
      ) {
        const { ts, tz, ...rest } = value as { ts: number; tz: number }
        return { wall: ts + tz * 60000, ...rest }
      }
      return value
    })
  )
}

function readExpectedTree(id: string): Map<string, string> {
  const out = new Map<string, string>()
  const base = join(EXPECTED_ROOT, id)
  if (!existsSync(base)) return out
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else
        out.set(
          relative(base, full).split('\\').join('/'),
          readFileSync(full, 'utf-8')
        )
    }
  }
  walk(base)
  return out
}

const cases = JSON.parse(readFileSync(CASES_PATH, 'utf-8')) as GoldenCase[]
const oracleCases = cases.filter((c) => c.oracle !== false)
const generated: CaseEntries[] = []
/** Cases whose run produced at least one file (git cannot hold an empty directory). */
const casesWithFiles = new Set<string>()

describe('log golden (TS oracle)', () => {
  it.each(oracleCases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const result = await runCase(c)
    generated.push(result.entries)
    if (result.files.size) casesWithFiles.add(c.id)
    if (WRITE_MODE) {
      rmSync(join(EXPECTED_ROOT, c.id), { recursive: true, force: true })
      for (const [file, content] of result.files) {
        const target = join(EXPECTED_ROOT, c.id, file)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content)
      }
      return
    }
    const expected = readExpectedTree(c.id)
    expect([...result.files.keys()].sort()).toEqual([...expected.keys()].sort())
    for (const [file, content] of result.files) {
      expect({ file, content }).toEqual({ file, content: expected.get(file) })
    }
  })

  it('entries.json holds the frame entries of every oracle case', () => {
    if (WRITE_MODE) {
      writeFileSync(ENTRIES_PATH, JSON.stringify(generated, null, 2) + '\n')
      return
    }
    const expected = JSON.parse(
      readFileSync(ENTRIES_PATH, 'utf-8')
    ) as CaseEntries[]
    expect(normaliseEntries(generated)).toEqual(normaliseEntries(expected))
  })

  it('the expected tree holds one directory per case that wrote files, and hand-written cases exist', () => {
    const handWritten = cases.filter((c) => c.oracle === false)
    for (const c of handWritten) {
      expect(typeof c.divergenceNote).toBe('string')
    }
    const wanted = [...casesWithFiles, ...handWritten.map((c) => c.id)].sort()
    if (WRITE_MODE) {
      for (const dir of existsSync(EXPECTED_ROOT)
        ? readdirSync(EXPECTED_ROOT)
        : []) {
        if (!wanted.includes(dir))
          rmSync(join(EXPECTED_ROOT, dir), { recursive: true, force: true })
      }
    }
    const onDisk = existsSync(EXPECTED_ROOT)
      ? readdirSync(EXPECTED_ROOT).sort()
      : []
    expect(onDisk).toEqual(wanted)
    for (const c of handWritten) {
      expect(readExpectedTree(c.id).size).toBeGreaterThan(0)
    }
  })
})
