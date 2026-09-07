/**
 * Quick task 260907-fni (F-9 todo
 * `.planning/todos/pending/2026-08-23-f9-generic-rpc-timeout-cooccurrence-undetermined.md`).
 *
 * Live stderr capture harness + pure analyzer for the shell diagnostic
 *
 *   [shell] response for unknown/timed-out id={id} channel={channel} (dropped)
 *
 * (`src-tauri/src/main.rs:8332`). F-9's central, twice-repeated correction is that a clean
 * grep of the WRONG source is not evidence of absence: `gamelib.log` cannot see shell
 * `eprintln!` output (the sidecar's stdout is the RPC frame pipe, not a log stream), and
 * `gamelib-shell.log` cannot see this particular line EITHER -- `shell_diag()`
 * (main.rs:8521) writes to both stderr and that file, but the target line at main.rs:8332
 * is a plain `eprintln!` that never routes through `shell_diag()`. The shell process's
 * OWN stderr, captured whole, is the only valid source. This module is the apparatus that
 * makes that capture re-runnable on the next recurrence.
 *
 * Two halves, deliberately separated:
 *
 *  - The ANALYZER (`analyzeCapture` and its exports below) is pure, unit-tested, and
 *    fail-closed by construction: an anchorless capture can never certify as a clean
 *    watch. This repo has recreated a fail-open gate three times
 *    (`fixing-a-fail-open-gate-can-create-its-sibling.md`); the anchor gate below is
 *    written so the "no target lines" branch is structurally unreachable without a
 *    satisfied anchor gate first -- see `analyzeCapture`'s own comment.
 *  - The CLI DRIVER (everything from `preflightRefuseIfRunning` down to `runCapture`) is
 *    operator-run and untested: it launches `pnpm tauri:dev`, captures the child's stderr
 *    to `scratchpad/` (gitignored -- `.gitignore:65` names it as the home for raw
 *    `gamelib-*.log`-shaped captures precisely because they can carry secret material),
 *    and prints a verdict block the operator pastes back verbatim. Run with
 *    `pnpm capture:shell-scrollback`.
 *
 * Deliberately does NOT import `COOKIE_POLL_INTERVAL_MS` from `src/backend/humble/user.ts`
 * by live ES import, even though that is what the plan for this task asked for: that
 * module's own test file (`src/backend/humble/__tests__/user.test.ts`) jest.mock()s SIX
 * of its dependencies (`backend/platform`, `backend/logger`, `backend/ipc`,
 * `../electronStores`, `../adapter`, `../syncFence`) before importing it, which is a
 * strong signal that an unmocked import executes Electron/store-construction side effects
 * at module scope (`electronStores.ts` calls `new TypeCheckedStoreBackend(...)` at the top
 * level) -- exactly the kind of side effect this CLI-run, non-Electron script must never
 * trigger. Instead, `COOKIE_POLL_INTERVAL_MS` is read by parsing `user.ts`'s own source
 * text, the same anti-hard-coding technique this file already needs for
 * `LONG_RUNNING_CHANNELS` (which has no live-importable form at all -- it is Rust). This
 * keeps the "a rename can't silently break the read" property the plan asked for, without
 * the side-effect risk of a live import.
 *
 * Guarded per the Phase 41-07 idiom (`require.main === module &&
 * !process.env.JEST_WORKER_ID`): importing this module must never run `main()` --
 * `importing-a-meta-script-runs-its-main-and-rewrites-the-artifact.md` is a recorded
 * incident here.
 *
 * `runTs.cjs` spawns a JS shim on Windows and breaks under it
 * (`runts-cjs-esbuild-shim-breaks-every-meta-script-on-windows.md`), so the CLI half of
 * this file is a macOS/Linux operator tool -- which is true of the live gesture (a Humble
 * login window) regardless of that constraint.
 */
import {
  appendFileSync,
  copyFileSync,
  createWriteStream,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { stripSourceComments } from '../src/backend/testUtils/stripSourceComments'
import {
  RUST_HUMBLE_LOGIN_COOKIES,
  RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN,
  RUST_HUMBLE_LOGIN_CLEAR_COOKIES
} from '../src/common/types/sidecarTransport'

const REPO_ROOT = join(__dirname, '..')
const MAIN_RS_PATH = join(REPO_ROOT, 'src-tauri', 'src', 'main.rs')
const USER_TS_PATH = join(REPO_ROOT, 'src', 'backend', 'humble', 'user.ts')

// ---------------------------------------------------------------------------
// Source-text-derived constants (never hard-coded, so a rename/rework upstream
// surfaces as a thrown "not found" here rather than a silently stale literal).
// ---------------------------------------------------------------------------

/**
 * Re-verified against HEAD during planning (`<verified_starting_context>` in the plan for
 * this task) and re-read directly from `src-tauri/src/main.rs` here rather than retyped:
 * `readLongRunningChannels()` uses the exact extraction technique already proven in
 * `src/backend/__tests__/longRunningChannels.test.ts`'s `extractLongRunningChannels()`
 * (comment-strip, then slice the `const LONG_RUNNING_CHANNELS: &[&str] = &[ ... ];` array
 * body by a non-greedy bracket match, then pull every quoted literal out of it).
 */
function readLongRunningChannels(): string[] {
  const raw = readFileSync(MAIN_RS_PATH, 'utf-8')
  const stripped = stripSourceComments(raw)
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
  const match = /const LONG_RUNNING_CHANNELS[^=]*=\s*&\[([\s\S]*?)\];/.exec(
    stripped
  )
  if (!match) {
    throw new Error(
      'LONG_RUNNING_CHANNELS array not found in src-tauri/src/main.rs -- source shape drifted, re-verify captureShellScrollback.ts against HEAD'
    )
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((m) => m[1])
}

/** Exempt from the shell's 60s `INVOKE_TIMEOUT` bound (main.rs:845/994) -- see module docblock. */
export const LONG_RUNNING_CHANNELS: readonly string[] =
  readLongRunningChannels()

/**
 * `HumbleUser.watchForLogin()`'s cookie-read poll cadence (`src/backend/humble/user.ts`).
 * Read from source text, not a live import -- see module docblock for why.
 */
function readCookiePollIntervalMs(): number {
  const source = stripSourceComments(readFileSync(USER_TS_PATH, 'utf-8'))
  const match = /export const COOKIE_POLL_INTERVAL_MS\s*=\s*(\d+)/.exec(source)
  if (!match) {
    throw new Error(
      'COOKIE_POLL_INTERVAL_MS not found in src/backend/humble/user.ts -- source shape drifted, re-verify captureShellScrollback.ts against HEAD'
    )
  }
  return Number(match[1])
}

export const COOKIE_POLL_INTERVAL_MS: number = readCookiePollIntervalMs()

// ---------------------------------------------------------------------------
// Anchors, target/legacy diagnostic patterns, cookie-leg pattern.
// ---------------------------------------------------------------------------

/**
 * `[shell] ` literal substrings proving the capture sink was live for a given phase of the
 * run. `boot` requires ALL members present (both fire on every `tauri dev` launch
 * regardless of dev/packaged path -- `spawn_sidecar_dev` routes its own "spawned OK" line
 * through `shell_diag()`, which itself does `eprintln!("[shell] {message}")`, so the final
 * stderr text is identical either way). `gesture` and `teardown` each require AT LEAST ONE
 * member.
 *
 * Every literal below was re-read directly from `src-tauri/src/main.rs` at plan time, NOT
 * retyped from the plan document -- the plan's own quoted gesture anchors omitted the word
 * "for" that is actually present in both `eprintln!` call sites (`main.rs:6299` and
 * `main.rs:3662`), which is exactly the kind of drift `<verified_starting_context>`'s
 * "re-verify each literal ... do not retype from this plan" instruction exists to catch.
 * Anchors deliberately stop short of the dynamic `{label}'` suffix so they match
 * regardless of which login-window label the shell chose.
 */
export const CAPTURE_ANCHORS = {
  boot: [
    '[shell] sidecar process spawned OK', // main.rs:8163 (via shell_diag, dev path) / :8209 (packaged path)
    '[shell] sidecar signalled READY (' // main.rs:8274
  ],
  gesture: [
    "[shell] humble_login_open: login chrome CSS injected for '", // main.rs:6299
    "[shell] login-window sheet: present_login_window_as_sheet entered for '" // main.rs:3662
  ],
  teardown: [
    '[shell] sidecar terminated on exit', // main.rs:1158 (clean shutdown)
    '[shell] sidecar kill() failed during exit shutdown', // main.rs:1153
    '[shell] sidecar wait() failed during exit shutdown' // main.rs:1156
  ]
} as const

/**
 * The HEAD diagnostic (main.rs:8332), requiring the literal `channel=` segment added by
 * quick task `260905-omc`. Anchored to the whole line: this is the harness's own capture
 * file, a verbatim copy of one `eprintln!` call's output per line, so a full-line anchor
 * is strictly safer than a substring search and cannot be fooled by the phrase appearing
 * inside an unrelated, longer diagnostic.
 */
// Constructed via `new RegExp(String.raw\`...\`)` rather than a `/regex/` literal: TypeScript's
// parser rejects a *literal* regex token with named capture groups unless the compiling
// tsconfig's `target` is ES2018+ (TS1503) -- and this repo's root tsconfig.json (the one
// tsconfig.eslint.json extends for the meta/**/*.ts type-check gate) pins `target: "es2017"`.
// A `new RegExp(...)` call is not a literal token, so it is exempt from that syntax-level
// check, while still producing named groups exactly as before at runtime (Node has supported
// this since Node 10, long before this project's minimum). Do not revert to a literal form.
export const TARGET_DROP_RE = new RegExp(
  String.raw`^\[shell\] response for unknown/timed-out id=(?<id>\S+) channel=(?<channel>\S+) \(dropped\)$`
)

/**
 * The pre-`260905-omc` bare-id form, with NO `channel=` segment. A capture carrying lines
 * in this shape is running a stale shell binary -- `TARGET_DROP_RE` above cannot match it
 * (the two forms are mutually exclusive by construction: this form's `(dropped)` follows
 * `id=...` with a single space, `TARGET_DROP_RE`'s follows a `channel=...` token instead),
 * so a stale binary is DETECTED via `legacyFormatLines` rather than silently under-counted
 * as "no recurrence".
 */
export const LEGACY_TARGET_DROP_RE = new RegExp(
  String.raw`^\[shell\] response for unknown/timed-out id=(?<id>\S+) \(dropped\)$`
)

const COOKIE_CHANNELS = [
  RUST_HUMBLE_LOGIN_COOKIES,
  RUST_HUMBLE_LOGIN_COOKIES_FOR_DOMAIN,
  RUST_HUMBLE_LOGIN_CLEAR_COOKIES
] as const

/**
 * The sidecar→Rust leg's own timeout diagnostic (`sidecarRpc.ts:385`), restricted to the
 * three cookie channels named in `<hypothesis>` -- imported from
 * `src/common/types/sidecarTransport.ts` rather than retyped, so a rename cannot silently
 * break the match. The trailing `(?![A-Za-z0-9_])` is load-bearing: without it, an
 * alternation naively matching `humble_login_cookies` before
 * `humble_login_cookies_for_domain` would return the SHORTER name as a false partial match
 * against the longer channel's line.
 */
export const COOKIE_LEG_RE = new RegExp(
  `rustInvoke timed out after (?<ms>\\d+)ms: (?<channel>${COOKIE_CHANNELS.join(
    '|'
  )})(?![A-Za-z0-9_])`
)

const TIMESTAMP_LINE_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z) (.*)$/

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

export type Verdict = 'INVALID_ANCHORS' | 'CLEAN_ASSERTED' | 'RECURRENCE'

/**
 * `'CAUSAL'` is a real conceptual value (see `<hypothesis>`'s mechanism H: a timed-out
 * channel's sidecar handler awaiting an unresolved cookie `rustInvoke`) but is
 * DELIBERATELY unreachable from `analyzeCapture` -- proving H needs the sidecar's internal
 * await-state, which neither input file can ever carry. Co-occurrence in the same window
 * is adjacency, never proof of nesting.
 */
export type Nesting =
  | 'UNPROVEN_ADJACENCY'
  | 'EXEMPT_CHANNEL_CANNOT_TIMEOUT'
  | 'CAUSAL'
  | null

export interface AnalyzeCaptureInput {
  /** ISO-8601-per-line-prefixed copy of the shell's stderr. */
  timestampedStderr: string
  /** Byte-for-byte (per line) copy of the shell's stderr, same line count as the above. */
  rawStderr: string
  /** A snapshot of `gamelib.log` covering the same window. Structurally distinct from the
   * two stderr inputs above -- cookie-leg findings may ONLY come from this field. */
  gamelibLogSnapshot: string
}

export interface TargetMatch {
  /** The verbatim matched line, from `rawStderr`. */
  line: string
  id: string
  /** The parsed channel, including the literal `<unrecorded>` case -- never coerced. */
  channel: string
  timestamp: string | null
}

export interface CookieLegMatch {
  line: string
  channel: string
  ms: string
}

export interface AnchorsFound {
  boot: string[]
  gesture: string[]
  teardown: string[]
}

export interface AnalyzeCaptureResult {
  verdict: Verdict
  reasons: string[]
  anchorsFound: AnchorsFound
  targetMatches: TargetMatch[]
  legacyFormatLines: string[]
  cookieLegMatches: CookieLegMatch[]
  windowStartedAt: string | null
  gestureAt: string | null
  windowEndedAt: string | null
  durationMs: number | null
  derivedPollCount: number | null
  derivationRecipe: string
  nesting: Nesting
}

/** Splits on `\n`, dropping exactly one trailing empty element from a final newline --
 * never more, so a genuinely blank last line is preserved. */
function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

function extractTimestamp(timestampedLine: string | undefined): string | null {
  if (timestampedLine === undefined) return null
  const match = TIMESTAMP_LINE_RE.exec(timestampedLine)
  return match ? match[1] : null
}

interface AnchorScan {
  found: string[]
  firstIndex: number | null
  lastIndex: number | null
}

function scanAnchors(
  rawLines: string[],
  members: readonly string[]
): AnchorScan {
  const found = new Set<string>()
  let firstIndex: number | null = null
  let lastIndex: number | null = null
  rawLines.forEach((line, i) => {
    for (const member of members) {
      if (line.includes(member)) {
        found.add(member)
        if (firstIndex === null) firstIndex = i
        lastIndex = i
      }
    }
  })
  return { found: Array.from(found), firstIndex, lastIndex }
}

/**
 * Pure analyzer. Fail-closed by construction: the anchor gate (including the raw/timestamped
 * line-count parity check) is evaluated FIRST and unconditionally; the moment ANY reason is
 * collected, the function returns `INVALID_ANCHORS` immediately, before target/cookie-leg/
 * nesting evaluation ever runs. There is no code path that reaches a `CLEAN_ASSERTED` or
 * `RECURRENCE` verdict without first passing through this gate -- the "no target lines"
 * branch below is reachable ONLY inside the `reasons.length === 0` half of the function body,
 * not expressed as a re-orderable condition alongside it. Do not restructure this into a
 * single flat `if/else` chain where the anchor and target checks are siblings; that shape is
 * exactly the fail-open (T1) an inversion mutation would produce.
 */
export function analyzeCapture(
  input: AnalyzeCaptureInput
): AnalyzeCaptureResult {
  const rawLines = splitLines(input.rawStderr)
  const timestampedLines = splitLines(input.timestampedStderr)

  const reasons: string[] = []

  if (rawLines.length !== timestampedLines.length) {
    reasons.push(
      `parity-mismatch: rawStderr has ${rawLines.length} line(s), timestampedStderr has ${timestampedLines.length} line(s) -- the verbatim capture and its correlated timestamp file must be the same stream`
    )
  }

  const bootScan = scanAnchors(rawLines, CAPTURE_ANCHORS.boot)
  const gestureScan = scanAnchors(rawLines, CAPTURE_ANCHORS.gesture)
  const teardownScan = scanAnchors(rawLines, CAPTURE_ANCHORS.teardown)

  const missingBoot = CAPTURE_ANCHORS.boot.filter(
    (member) => !bootScan.found.includes(member)
  )
  if (missingBoot.length > 0) {
    reasons.push(
      `missing required boot anchor(s): ${missingBoot
        .map((m) => JSON.stringify(m))
        .join(
          ', '
        )} -- the capture sink cannot prove it was live from process start`
    )
  }
  if (gestureScan.found.length === 0) {
    reasons.push(
      'no gesture anchor present -- the operator never opened the Humble login window, so no cookie operation was exercised this run'
    )
  }
  if (teardownScan.found.length === 0) {
    reasons.push(
      'no teardown anchor present -- the sidecar exit/shutdown line never appeared (a force-kill or crash leaves the capture unable to prove it was live through to teardown)'
    )
  }

  const anchorsFound: AnchorsFound = {
    boot: bootScan.found,
    gesture: gestureScan.found,
    teardown: teardownScan.found
  }

  const windowStartedAt =
    bootScan.firstIndex !== null
      ? extractTimestamp(timestampedLines[bootScan.firstIndex])
      : null
  const gestureAt =
    gestureScan.firstIndex !== null
      ? extractTimestamp(timestampedLines[gestureScan.firstIndex])
      : null
  const windowEndedAt =
    teardownScan.lastIndex !== null
      ? extractTimestamp(timestampedLines[teardownScan.lastIndex])
      : null

  if (reasons.length > 0) {
    // FAIL-CLOSED: anchor gate not satisfied. Target/cookie-leg/nesting are never
    // evaluated -- an absent target line can never, on its own, be read as a clean watch.
    return {
      verdict: 'INVALID_ANCHORS',
      reasons,
      anchorsFound,
      targetMatches: [],
      legacyFormatLines: [],
      cookieLegMatches: [],
      windowStartedAt,
      gestureAt,
      windowEndedAt,
      durationMs: null,
      derivedPollCount: null,
      derivationRecipe: 'not computed: anchor gate failed, see reasons[]',
      nesting: null
    }
  }

  // --- Anchor gate satisfied past this point. Target evaluation is reachable ONLY here. ---

  const targetMatches: TargetMatch[] = []
  const legacyFormatLines: string[] = []
  rawLines.forEach((line, i) => {
    const targetMatch = TARGET_DROP_RE.exec(line)
    if (targetMatch?.groups) {
      targetMatches.push({
        line,
        id: targetMatch.groups.id,
        channel: targetMatch.groups.channel,
        timestamp: extractTimestamp(timestampedLines[i])
      })
      return
    }
    if (LEGACY_TARGET_DROP_RE.test(line)) {
      legacyFormatLines.push(line)
    }
  })

  const cookieLegMatches: CookieLegMatch[] = []
  splitLines(input.gamelibLogSnapshot).forEach((line) => {
    const match = COOKIE_LEG_RE.exec(line)
    if (match?.groups) {
      cookieLegMatches.push({
        line,
        channel: match.groups.channel,
        ms: match.groups.ms
      })
    }
  })

  const verdict: Verdict =
    targetMatches.length > 0 ? 'RECURRENCE' : 'CLEAN_ASSERTED'

  let durationMs: number | null = null
  let derivedPollCount: number | null = null
  let derivationRecipe = 'not computed: gesture or teardown timestamp missing'
  if (windowStartedAt && windowEndedAt) {
    durationMs = Date.parse(windowEndedAt) - Date.parse(windowStartedAt)
  }
  if (gestureAt && windowEndedAt) {
    const gestureMs = Date.parse(gestureAt)
    const endMs = Date.parse(windowEndedAt)
    derivedPollCount = Math.floor((endMs - gestureMs) / COOKIE_POLL_INTERVAL_MS)
    derivationRecipe =
      `derivedPollCount = floor((windowEndedAt[${windowEndedAt}] - gestureAt[${gestureAt}]) ` +
      `/ COOKIE_POLL_INTERVAL_MS[${COOKIE_POLL_INTERVAL_MS}]) = ${derivedPollCount}. ` +
      'This is a DERIVED upper bound over ticks not short-circuited by ' +
      '`settled || validationInFlight` in HumbleUser.watchForLogin() -- it is NEVER an ' +
      "observed count. Corroborate against gamelib.log's collapsed watchForLogin status " +
      'line and its own suppressed-tick count.'
  }

  // nesting: never assigned 'CAUSAL' from co-occurrence alone (see <hypothesis> / the
  // `Nesting` type's own doc comment). A recurrence naming a LONG_RUNNING_CHANNELS member
  // (e.g. humbleStartLogin/humbleReconnect, exempt from the 60s bound) cannot have been
  // produced by that channel's own timeout -- record_abandoned also fires on the
  // sidecar-disconnect branch (main.rs:1210/1221), so such a recurrence is a
  // disconnect-branch event, not a timeout, and is reported as such rather than as an
  // adjacency to the cookie leg.
  let nesting: Nesting = null
  if (verdict === 'RECURRENCE' && cookieLegMatches.length > 0) {
    const recurrenceChannel = targetMatches[0].channel
    nesting = LONG_RUNNING_CHANNELS.includes(recurrenceChannel)
      ? 'EXEMPT_CHANNEL_CANNOT_TIMEOUT'
      : 'UNPROVEN_ADJACENCY'
  }

  return {
    verdict,
    reasons: [],
    anchorsFound,
    targetMatches,
    legacyFormatLines,
    cookieLegMatches,
    windowStartedAt,
    gestureAt,
    windowEndedAt,
    durationMs,
    derivedPollCount,
    derivationRecipe,
    nesting
  }
}

// ---------------------------------------------------------------------------
// CLI driver (operator-run, untested -- see module docblock).
// ---------------------------------------------------------------------------

const DEV_SIDECAR_PATTERN = 'build/main/sidecar.js'
const DEV_BINARY_PATTERN = 'gamelib-shell' // src-tauri/Cargo.toml package name, no [[bin]] override

function pgrepPids(pattern: string): string[] {
  const result = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf-8' })
  if (result.status !== 0 || !result.stdout) return []
  return result.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Guard against `pnpm tauri:dev` exiting 0 without replacing a running instance
 * (`tauri-dev-noops-against-a-running-instance.md`) -- a second launch would measure
 * nothing. Exits 3 on any hit, per this task's plan. */
function preflightRefuseIfRunning(): void {
  const probes: Array<[string, string]> = [
    ['`tauri dev`', 'tauri dev'],
    ['sidecar (by PATH)', DEV_SIDECAR_PATTERN],
    ['dev shell binary', DEV_BINARY_PATTERN]
  ]
  const hits = probes
    .map(([label, pattern]) => ({ label, pattern, pids: pgrepPids(pattern) }))
    .filter((hit) => hit.pids.length > 0)

  if (hits.length === 0) return

  console.error(
    'A GameLib dev instance appears to already be running -- this run would measure ' +
      'nothing (`pnpm tauri:dev` exits 0 without replacing a running instance). Quit it ' +
      'first, then re-run this harness.'
  )
  for (const hit of hits) {
    console.error(`  ${hit.label}: pid(s) ${hit.pids.join(', ')}`)
  }
  const allPids = Array.from(new Set(hits.flatMap((h) => h.pids)))
  console.error(`  kill ${allPids.join(' ')}`)
  process.exit(3)
}

function resolveGamelibLogPath(): string {
  // Mirrors src/backend/logger/paths.ts's getBaseLogPath()/getLogFilePath({}) exactly, but
  // reimplemented locally rather than imported -- that module pulls in `../constants/environment`
  // and this CLI half must stay import-light and side-effect-free (see module docblock).
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    return join(localAppData, 'GameLib', 'logs', 'gamelib.log')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Logs', 'GameLib', 'gamelib.log')
  }
  const stateHome =
    process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
  return join(stateHome, 'GameLib', 'logs', 'gamelib.log')
}

function gitOutput(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf-8', cwd: REPO_ROOT })
  return (result.stdout ?? '').trim()
}

function reportOrphans(): void {
  const sidecarPids = pgrepPids(DEV_SIDECAR_PATTERN)
  const vitePids = pgrepPids('vite')
  if (sidecarPids.length === 0 && vitePids.length === 0) {
    console.log(
      'Orphan report: none found (sidecar by PATH, vite by name -- a vite orphan survives ' +
        'a PATH-only sweep, so it is checked separately by process name).'
    )
    return
  }
  console.log('Orphan report -- NOT auto-killed, kill manually if unwanted:')
  if (sidecarPids.length > 0) {
    console.log(
      `  sidecar (${DEV_SIDECAR_PATTERN}): pid(s) ${sidecarPids.join(
        ', '
      )} -- kill ${sidecarPids.join(' ')}`
    )
  }
  if (vitePids.length > 0) {
    console.log(
      `  vite: pid(s) ${vitePids.join(', ')} -- kill ${vitePids.join(' ')}`
    )
  }
}

function runCapture(): void {
  preflightRefuseIfRunning()

  const scratchDir = join(REPO_ROOT, 'scratchpad')
  mkdirSync(scratchDir, { recursive: true })

  const iso = new Date().toISOString().replace(/[:.]/g, '-')
  const base = `260907-fni-${iso}`
  const rawPath = join(scratchDir, `${base}.stderr.raw.log`)
  const tsPath = join(scratchDir, `${base}.stderr.ts.log`)
  const gamelibSnapshotPath = join(scratchDir, `${base}.gamelib.log`)
  const metaPath = join(scratchDir, `${base}.meta.json`)
  const stdoutPath = join(scratchDir, `${base}.stdout.log`)

  const startedAt = new Date().toISOString()
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        headSha: gitOutput(['rev-parse', 'HEAD']),
        gitStatusPorcelain: gitOutput(['status', '--porcelain']),
        command: 'pnpm tauri:dev',
        startedAt
      },
      null,
      2
    )
  )
  writeFileSync(rawPath, '')
  writeFileSync(tsPath, '')

  console.log('Capturing to:')
  console.log(`  raw stderr:        ${rawPath}`)
  console.log(`  timestamped stderr: ${tsPath}`)
  console.log(`  gamelib.log snapshot: ${gamelibSnapshotPath}`)
  console.log(`  run metadata:       ${metaPath}`)
  console.log('Launching `pnpm tauri:dev` -- waiting for the app window...\n')

  const child = spawn('pnpm', ['tauri:dev'], {
    cwd: REPO_ROOT,
    stdio: ['inherit', 'pipe', 'pipe']
  })

  const stdoutFile = createWriteStream(stdoutPath)
  child.stdout?.pipe(stdoutFile)

  let stderrBuffer = ''
  const flushCompleteLines = (chunk: string): void => {
    stderrBuffer += chunk
    const lines = stderrBuffer.split('\n')
    stderrBuffer = lines.pop() ?? ''
    for (const line of lines) {
      appendFileSync(rawPath, line + '\n')
      appendFileSync(tsPath, `${new Date().toISOString()} ${line}\n`)
    }
  }

  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk)
    flushCompleteLines(chunk.toString('utf-8'))
  })

  const finish = (): void => {
    if (stderrBuffer.length > 0) {
      appendFileSync(rawPath, stderrBuffer + '\n')
      appendFileSync(tsPath, `${new Date().toISOString()} ${stderrBuffer}\n`)
      stderrBuffer = ''
    }

    let gamelibSnapshot = ''
    try {
      copyFileSync(resolveGamelibLogPath(), gamelibSnapshotPath)
      gamelibSnapshot = readFileSync(gamelibSnapshotPath, 'utf-8')
    } catch (e) {
      console.error(
        `WARN: could not snapshot gamelib.log (${
          (e as Error).message
        }) -- cookie-leg detection will see nothing this run.`
      )
    }

    const rawStderr = readFileSync(rawPath, 'utf-8')
    const timestampedStderr = readFileSync(tsPath, 'utf-8')
    const result = analyzeCapture({
      timestampedStderr,
      rawStderr,
      gamelibLogSnapshot: gamelibSnapshot
    })

    console.log('\n===== VERDICT BLOCK (paste this back verbatim) =====')
    console.log(
      JSON.stringify(
        {
          ...result,
          endedAt: new Date().toISOString(),
          capturePaths: {
            rawPath,
            tsPath,
            gamelibSnapshotPath,
            metaPath,
            stdoutPath
          }
        },
        null,
        2
      )
    )
    console.log('===== END VERDICT BLOCK =====\n')

    reportOrphans()

    process.exit(result.verdict === 'INVALID_ANCHORS' ? 2 : 0)
  }

  child.on('error', (err) => {
    console.error(`Failed to launch \`pnpm tauri:dev\`: ${err.message}`)
    process.exit(1)
  })
  child.on('exit', finish)
  process.on('SIGINT', () => {
    child.kill('SIGINT')
  })
}

if (require.main === module && !process.env.JEST_WORKER_ID) {
  try {
    runCapture()
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
}
