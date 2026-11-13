/**
 * Unit tests for the TS depot modules that survive the pipeline deletion (73-20): the
 * failure helpers
 * (outcome, planModel), the content-server reduction, the progress formatters and the depot
 * error classifier. Every download runs in Rust: downloadSteamDepots and the CM half are tested
 * in depot.cmPlan.test.ts and depotRust/__tests__ over the Rust stub, and the deleted
 * pipeline's assertions map to Rust tests in 73-19-SUMMARY.md.
 *
 * Mock strategy follows games.test.ts/library.test.ts conventions:
 *  - backend/logger uses factory form (prevents transitive fs-extra native crash)
 *  - ../user is auto-mocked (jest.mock('../user')) so the real steam-user stack never loads
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  reduceContentServers,
  describeDepotFailure,
  formatDownloadFailureSummary,
  selectPrimaryDepotFailure,
  type DepotDownloadFailure,
  type RawContentServer
} from '../depot'
import { formatEta, rollingRateMiBs } from '../depotRust/progress'
import { classifyDepotError, isNonRetryableDepotError } from '../depotErrors'
import { isDecodeStageError } from '../depotDecodeErrors'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// ── Logger mock (factory form) ────────────────────────────────────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── SteamUser mock — keeps the real steam-user stack out of this suite ────────

// ── i18next mock — returns the fallback string for classifyDepotError
//    assertions (library.test.ts's established pattern) ─────────────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

/** depot.ts plus every submodule folded out of it (62-09): negative source
 *  censuses ("nowhere in depot.ts") must keep covering the moved code. */
function readDepotFoldedSources(): string {
  return [
    '../depot/index.ts',
    ...['planModel', 'plan', 'outcome'].map((n) => `../depot/${n}.ts`)
  ]
    .map((f) => readFileSync(join(__dirname, f), 'utf8'))
    .join('\n')
}

/**
 * 23.2-03 (G-23-01) skip-and-warn: the source censuses that pin what the skip policy may NOT
 * grow into. The behavioural half (only the literal EResult 40 skips; every other terminal code
 * aborts) moved to depot.cmPlan.test.ts with buildDepotRefs in 73-19.
 */
describe('23.2-03 (G-23-01): skip-and-warn EResult 40 Blocked depots', () => {
  describe('D-02/D-04/D-05 source censuses (no essentiality axis at selection time, no bypass parameter on the completeness gate, no skip-driven recovery path)', () => {
    it('D-02: select.ts (after stripSourceComments) has no eresult reference and no essentiality/required/optional depot-selection-time classification — there is no such signal in appinfo, and D-02 explicitly rejects inventing one', () => {
      const source = stripSourceComments(
        readFileSync(join(__dirname, '..', 'depot', 'select.ts'), 'utf8')
      )
      expect(source).not.toMatch(/eresult|essential|required|optional/i)
    })

    it('D-02 RED: the census DOES trip on a known-bad specimen that adds an essentiality classification', () => {
      const specimen = stripSourceComments(
        'export function classifyEssential(depotId: string): boolean {\n' +
          '  return isEssential(depotId)\n' +
          '}\n'
      )
      expect(specimen).toMatch(/eresult|essential|required|optional/i)
    })

    it('D-05: depot.ts (after stripSourceComments) has no retry/repair/re-check path keyed on skippedDepots — the skipped set is read for reporting only (D-05: no recovery path)', () => {
      const source = stripSourceComments(readDepotFoldedSources())
      const skipLines = source
        .split('\n')
        .filter((l) => l.includes('skippedDepots'))

      // The census must have something to examine — an empty match set
      // would make the assertion below vacuously true.
      expect(skipLines.length).toBeGreaterThan(0)
      for (const line of skipLines) {
        expect(line).not.toMatch(/retry|repair|re-?check/i)
      }
    })

    it('D-05 RED: the census DOES trip on a known-bad specimen that keys a retry off skippedDepots', () => {
      const specimen = stripSourceComments(
        'if (skippedDepots.length) {\n' +
          '  await retrySkippedDepots(skippedDepots)\n' +
          '}\n'
      )
      const skipLines = specimen
        .split('\n')
        .filter((l) => l.includes('skippedDepots'))
      expect(skipLines.some((l) => /retry|repair|re-?check/i.test(l))).toBe(
        true
      )
    })
  })
})

/**
 * Quick 260927-tpm (A1-A5): unit tests for formatDownloadFailureSummary, the
 * function factored out of downloadSteamDepots' aggregate download-failed
 * log line to correct its file-failure count — a run-scoped stall give-up
 * (tagged `scope: 'run'`, see DepotDownloadFailure) used to be counted
 * alongside per-file failures, so N failed files logged as N+1.
 */
describe('formatDownloadFailureSummary (quick 260927-tpm)', () => {
  const fileFailure = (
    file: string,
    error = 'boom',
    cause?: unknown
  ): DepotDownloadFailure => ({ file, error, cause })

  const runFailure = (
    error = 'download stalled: no forward progress'
  ): DepotDownloadFailure => ({
    file: '(run)',
    error,
    scope: 'run'
  })

  // A1: the defect itself — one file failure plus one run-level give-up
  // used to report "2 file failure(s)". It must report 1.
  it('A1: a run-scoped failure alongside file failures does not inflate the file count', () => {
    const summary = formatDownloadFailureSummary(
      '480',
      [fileFailure('a.bin'), runFailure()],
      'steam.download.error.generic'
    )
    expect(summary).toContain('1 file failure(s)')
    expect(summary).not.toContain('2 file failure(s)')
  })

  // A2 (case A ordering, REWRITTEN by quick 260927-v8i): this arm used to
  // assert `first: file="a.bin"` on D-C's rationale — "first: must still
  // read failures[0] verbatim, regardless of the file failure being
  // present." 260927-v8i's D-01 supersedes D-C: the run-level record is now
  // PREFERRED wherever it sits in the array, deterministically, because a
  // single file failure alongside a run give-up is usually a symptom of the
  // same dying run and the stall branch carries the actionable
  // `action: 'retry'` copy (see selectPrimaryDepotFailure's doc comment).
  // See the `selectPrimaryDepotFailure (quick 260927-v8i)` describe block
  // below for the full ordering matrix (B1-B6).
  it('A2: "first:" now prefers the run-scoped record over an earlier file failure (D-01 supersedes D-C, case A ordering)', () => {
    const summary = formatDownloadFailureSummary(
      '480',
      [fileFailure('a.bin', 'sha1 mismatch'), runFailure()],
      'steam.download.error.stalled'
    )
    expect(summary).toContain('first: file="(run)"')
    expect(summary).not.toContain('first: file="a.bin"')
  })

  // A2 (case C ordering): if the run-level record happens to sit at
  // failures[0] (a stall that overtakes a file failure still resolving),
  // "first:" reads THAT record. Unchanged in outcome by 260927-v8i, but for
  // a different and stronger reason than D-C's "byte-for-byte failures[0]":
  // under D-01 the run-level record is preferred wherever it sits in the
  // array, not merely tolerated when array order happens to put it first.
  it('A2: "first:" reads the run-scoped record verbatim when it sits at failures[0] (D-C, case C ordering)', () => {
    const summary = formatDownloadFailureSummary(
      '480',
      [runFailure(), fileFailure('b.bin', 'sha1 mismatch')],
      'steam.download.error.generic'
    )
    expect(summary).toContain('first: file="(run)"')
  })

  // A3: no run-level failure present -> no run fragment at all, and the
  // output is byte-for-byte what the aggregate line produced before this
  // quick task (this is also T-D4's exact shape, reproduced here as a
  // targeted unit test of the formatter alone).
  it('A3: no run-scoped failure present -> no "; run:" fragment', () => {
    const summary = formatDownloadFailureSummary(
      '480',
      [fileFailure('a.bin', 'sha1 mismatch')],
      'steam.download.error.verifyFailed'
    )
    expect(summary).not.toContain('; run:')
    expect(summary).toBe(
      'downloadSteamDepots: appId=480 download failed — 1 file failure(s), ' +
        'classified as steam.download.error.verifyFailed; first: ' +
        'file="a.bin" sha1 mismatch'
    )
  })

  // A4: a run-scoped failure with ZERO file-level failures (the coverage-
  // gap case: stalled before any file ever completed or failed) -> "0 file
  // failure(s)", the run fragment IS present, and "first:" falls back to
  // the run record itself (D-C: there is no other failures[0] to read).
  it('A4: a run-scoped-only failure reports 0 file failures and still surfaces the run reason', () => {
    const summary = formatDownloadFailureSummary(
      '480',
      [runFailure('download stalled: no forward progress for 180000ms')],
      'steam.download.error.generic'
    )
    expect(summary).toContain('0 file failure(s)')
    expect(summary).toContain('first: file="(run)"')
    expect(summary).toContain(
      '; run: download stalled: no forward progress for 180000ms'
    )
  })

  // A5: the partition is decided by the `scope` property alone — not by
  // sniffing the `file` string for the '(run)' sentinel. A file that is
  // (implausibly) itself literally named "(run)" but carries no `scope`
  // marker is counted as a file failure, proving the discriminant is the
  // property, matching the precedent `.eresult`/`.code`/`isStall` already
  // set on this exact path (installStallWatchdog.ts).
  it('A5: partitions on the `scope` property, not on the "(run)" file-name string', () => {
    const summary = formatDownloadFailureSummary(
      '480',
      [fileFailure('(run)', 'coincidental filename, no scope marker')],
      'steam.download.error.generic'
    )
    expect(summary).toContain('1 file failure(s)')
    expect(summary).not.toContain('; run:')
  })
})

/**
 * Quick 260927-v8i (D-01/D-02/D-03/D-05): unit tests for
 * selectPrimaryDepotFailure, the shared deterministic-selection helper that
 * replaces the two independent `failures[0]` reads
 * (formatDownloadFailureSummary's `first:` fragment and downloadSteamDepots'
 * error-path classifier argument) with ONE call, read twice. Before this
 * task, the same underlying condition — a run that both had a real per-file
 * failure and then stalled — could present two different classified
 * messages depending on which of `FILE_CONCURRENCY` workers' catches
 * happened to run first (a race, not a decision). B1 is the arm that would
 * have caught it.
 */
describe('selectPrimaryDepotFailure (quick 260927-v8i)', () => {
  const fileFailure = (
    file: string,
    error = 'boom',
    cause?: unknown
  ): DepotDownloadFailure => ({ file, error, cause })

  // The run-level builder needs a StallError-shaped cause (`isStall: true`,
  // numeric `msSinceProgress`) so classifyDepotError reaches its stall
  // branch (depotErrors.ts:283) via `isStallError`'s PROPERTY check, not
  // via text — a fixture carrying only a message string would land in the
  // generic bucket and every arm below would assert the wrong key while
  // still passing.
  const runFailure = (
    error = 'download stalled: no forward progress for 180000ms across the whole run — giving up with 3 file(s) unattempted'
  ): DepotDownloadFailure => ({
    file: '(run)',
    error,
    cause: Object.assign(new Error(error), {
      isStall: true as const,
      msSinceProgress: 180000
    }),
    scope: 'run'
  })

  // B1: ordering A (the race, and the deliberate change). A file-level
  // failure at index 0, the run-level record appended after it — the exact
  // shape a real run produces when a per-file worker's catch happens to run
  // BEFORE the run-scoped stall give-up is recorded. Fails today on all
  // three expectations: unmodified `failures[0]` reads the file record.
  it('B1: ordering A (file first, run second) selects the run-level record, deterministically', () => {
    const fileRecord = fileFailure('a.bin', 'sha1 mismatch')
    const runRecord = runFailure()
    const failures = [fileRecord, runRecord]

    const selected = selectPrimaryDepotFailure(failures)
    expect(selected).toBe(runRecord)

    const summary = formatDownloadFailureSummary(
      '480',
      failures,
      'steam.download.error.stalled'
    )
    expect(summary).toContain('first: file="(run)"')
    expect(summary).not.toContain('first: file="a.bin"')

    expect(classifyDepotError(selected.cause ?? selected.error).key).toBe(
      'steam.download.error.stalled'
    )
    expect(classifyDepotError(selected.cause ?? selected.error).key).not.toBe(
      'steam.download.error.verifyFailed'
    )
  })

  // B2: ordering B — the run-level record already sits at index 0 today, so
  // this ordering is already deterministic. Asserted so the fix is provably
  // a determinism fix for ordering A, not a rewrite of an already-correct
  // case. Passes today.
  it('B2: ordering B (run first, file second) — already deterministic today, unchanged by the fix', () => {
    const fileRecord = fileFailure('a.bin', 'sha1 mismatch')
    const runRecord = runFailure()
    const failures = [runRecord, fileRecord]

    const selected = selectPrimaryDepotFailure(failures)
    expect(selected).toBe(runRecord)

    const summary = formatDownloadFailureSummary(
      '480',
      failures,
      'steam.download.error.stalled'
    )
    expect(summary).toContain('first: file="(run)"')
    expect(summary).not.toContain('first: file="a.bin"')

    expect(classifyDepotError(selected.cause ?? selected.error).key).toBe(
      'steam.download.error.stalled'
    )
  })

  // B3: ordering C (run-level only, no file-level failure at all) — already
  // deterministic today (there is nothing else to pick), asserted rather
  // than assumed so the matrix is complete.
  it('B3: ordering C (run-level only) — unchanged from today', () => {
    const runRecord = runFailure()
    const failures = [runRecord]

    const selected = selectPrimaryDepotFailure(failures)
    expect(selected).toBe(runRecord)

    const summary = formatDownloadFailureSummary(
      '480',
      failures,
      'steam.download.error.stalled'
    )
    expect(summary).toContain('first: file="(run)"')

    expect(classifyDepotError(selected.cause ?? selected.error).key).toBe(
      'steam.download.error.stalled'
    )
  })

  // B4: no run-level record at all — the tier-2 fallback. Pins that the
  // fallback is index 0 SPECIFICALLY, not "any file failure", by using two
  // distinct file failures and asserting on the first one by identity.
  it('B4: no run-level record — the tier-2 fallback is index 0 specifically, not "any file failure"', () => {
    const first = fileFailure('a.bin', 'sha1 mismatch')
    const second = fileFailure('b.bin', 'sha1 mismatch')
    const failures = [first, second]

    const selected = selectPrimaryDepotFailure(failures)
    expect(selected).toBe(first)

    const summary = formatDownloadFailureSummary(
      '480',
      failures,
      'steam.download.error.verifyFailed'
    )
    expect(summary).toContain('first: file="a.bin"')
    expect(summary).not.toContain('b.bin')
  })

  // B5: the classifier input and the "first:" fragment select the SAME
  // record, in every ordering — table-driven over all four fixture shapes
  // from B1-B4. Non-vacuity lives in the sibling test below: at least one
  // ordering here selects a record that is NOT failures[0], or this arm
  // would pass unchanged against the old code and prove nothing.
  describe('B5: mutual consistency across every ordering', () => {
    const orderings: Array<{
      name: string
      build: () => DepotDownloadFailure[]
    }> = [
      {
        name: 'ordering A: file first, run second',
        build: () => [fileFailure('a.bin', 'sha1 mismatch'), runFailure()]
      },
      {
        name: 'ordering B: run first, file second',
        build: () => [runFailure(), fileFailure('a.bin', 'sha1 mismatch')]
      },
      {
        name: 'ordering C: run-level only',
        build: () => [runFailure()]
      },
      {
        name: 'ordering D: no run-level record (tier-2 fallback)',
        build: () => [fileFailure('a.bin'), fileFailure('b.bin')]
      }
    ]

    it.each(orderings)(
      '$name: the "first:" fragment names the same record the classifier was fed',
      ({ build }) => {
        const failures = build()

        const selectedForClassifier = selectPrimaryDepotFailure(failures)
        const classifiedKey = classifyDepotError(
          selectedForClassifier.cause ?? selectedForClassifier.error
        ).key
        const summary = formatDownloadFailureSummary(
          '480',
          failures,
          classifiedKey
        )

        // The formatter re-derives its OWN selection internally (over the
        // same failures array) rather than being handed
        // selectedForClassifier — so this is what actually proves the two
        // call sites cannot diverge, not a tautology.
        expect(summary).toContain(`first: file="${selectedForClassifier.file}"`)
        expect(summary).toContain(`classified as ${classifiedKey}`)
      }
    )

    it('B5 non-vacuity: at least one ordering selects a record that is NOT failures[0]', () => {
      const anyNonIndexZero = orderings.some(({ build }) => {
        const failures = build()
        return selectPrimaryDepotFailure(failures) !== failures[0]
      })
      expect(anyNonIndexZero).toBe(true)
    })
  })

  // B6: the single-call shape, structurally (D-03) — reads depot.ts's own
  // source, strips comments, and counts code-level occurrences directly,
  // rather than trusting the behavioural arms above alone to prove there is
  // only ONE call site feeding both consumers.
  it("B6: exactly one shared selectPrimaryDepotFailure call feeds both consumers — the only failures[0] read left is the helper's own tier-2 fallback", () => {
    const read = (rel: string) =>
      stripSourceComments(readFileSync(join(__dirname, '..', rel), 'utf8'))
    const outcome = read('depot/outcome.ts')
    // 73-19: the consumers moved to the Rust path. errorMap feeds the classifier, and install.ts
    // feeds the aggregate log line from the same selection.
    const errorMap = read('depotRust/errorMap.ts')
    const install = read('depotRust/install.ts')

    // Non-vacuity: a broken read path or an over-eager strip cannot make the
    // counts below pass by measuring nothing.
    expect(outcome).toContain('export function selectPrimaryDepotFailure')

    expect((outcome.match(/\bfailures\[0\]/g) ?? []).length).toBe(1)
    for (const consumer of [errorMap, install]) {
      expect(consumer.match(/\bfailures\[0\]/g) ?? []).toEqual([])
      expect(
        (consumer.match(/selectPrimaryDepotFailure\(failures\)/g) ?? []).length
      ).toBe(1)
    }
    // The log line describes the record the classifier was fed, not a second pick.
    expect(install).toMatch(
      /formatDownloadFailureSummary\(appId, failures, key\)/
    )
  })
})

/**
 * T-21-07: the TS depot modules never write StateFlags "4" themselves. The orchestration tests
 * that used to live here (finalize convergence on success/failure/cancel, plan-build cancel and
 * retry, Retry overwrite) moved with downloadSteamDepots to the Rust job in 73-19: see
 * depot.cmPlan.test.ts, depotRust/__tests__/rustInstall.test.ts and the gamelib-depot crate.
 */
describe('depot sources (T-21-07)', () => {
  it('never writes StateFlags "4" anywhere in depot.ts (T-21-07)', () => {
    const source = readDepotFoldedSources()
    const uncommented = source
      .split('\n')
      .filter(
        (line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')
      )
      .join('\n')
    expect(uncommented).not.toMatch(/"StateFlags"[^\n]*"4"/)
  })
})

/**
 * Unit tests for classifyDepotError (Phase 21-06, D-06) — maps the
 * downloader's failure modes to plain-language, actionable copy. Accepts
 * either a real Error (thrown plan-orchestration failures) or a plain string
 * (downloadDepotFiles's DepotDownloadFailure.error is already a string by
 * the time it reaches the caller).
 */
describe('formatEta (D-UAT-02)', () => {
  it('formats seconds as zero-padded HH:MM:SS', () => {
    expect(formatEta(0)).toBe('00:00:00')
    expect(formatEta(47)).toBe('00:00:47')
    expect(formatEta(1247)).toBe('00:20:47') // was the unreadable "1247s"
    expect(formatEta(3723)).toBe('01:02:03')
    expect(formatEta(90061)).toBe('25:01:01')
  })

  it('never emits negative time (clamps to 0)', () => {
    expect(formatEta(-5)).toBe('00:00:00')
  })
})

describe('rollingRateMiBs', () => {
  const MIB = 1024 * 1024

  it('computes an instantaneous MiB/s rate over the given window', () => {
    // 5 MiB transferred in 500ms => 10 MiB/s.
    expect(rollingRateMiBs(5 * MIB, 500, 0)).toBeCloseTo(10)
  })

  it('reports 0 during a stall (no bytes this window), not the previous rate', () => {
    // Regression: the old cumulative-average never dropped to 0 while stalled.
    expect(rollingRateMiBs(0, 500, 42)).toBe(0)
  })

  it('reuses the previous rate when the window is too small to be meaningful', () => {
    // A forced emit landing right on top of a throttled one (~0ms) must not
    // divide by a near-zero window and produce a garbage spike.
    expect(rollingRateMiBs(1 * MIB, 1, 7.5)).toBe(7.5)
  })

  it('never returns a negative rate', () => {
    expect(rollingRateMiBs(-1 * MIB, 500, 3)).toBe(0)
  })
})

// Debug/steam-install-slow-start (cycle 5): pure reduction of the raw
// getContentServers directory response into {hosts, weightedLoads} —
// extracted so the weightedload-threading fix is testable without a live CM
// round-trip. See depot/hostHealth.test.ts for how weightedLoads then seeds
// HostHealthTracker's cold-start PRIOR.
describe('reduceContentServers', () => {
  it('maps Host to hostname and threads a numeric weightedload into the parallel map', () => {
    const servers: RawContentServer[] = [
      { Host: 'cache1-akl-tpwr.steamcontent.com', weightedload: 37 },
      { Host: 'cache2-akl-tpwr.steamcontent.com', weightedload: 48 }
    ]
    const { hosts, weightedLoads } = reduceContentServers(servers)
    expect(hosts).toEqual([
      'cache1-akl-tpwr.steamcontent.com',
      'cache2-akl-tpwr.steamcontent.com'
    ])
    expect(weightedLoads.get('cache1-akl-tpwr.steamcontent.com')).toBe(37)
    expect(weightedLoads.get('cache2-akl-tpwr.steamcontent.com')).toBe(48)
  })

  it('falls back to vhost when Host is absent', () => {
    const servers: RawContentServer[] = [
      { vhost: 'fastly.cdn.steampipe.steamcontent.com' }
    ]
    const { hosts } = reduceContentServers(servers)
    expect(hosts).toEqual(['fastly.cdn.steampipe.steamcontent.com'])
  })

  it('skips a server with neither Host nor vhost, never producing an empty-string/undefined hostname', () => {
    const servers: RawContentServer[] = [
      { weightedload: 130 },
      { Host: 'steampipe.akamaized.net', weightedload: 130 }
    ]
    const { hosts, weightedLoads } = reduceContentServers(servers)
    expect(hosts).toEqual(['steampipe.akamaized.net'])
    expect(weightedLoads.size).toBe(1)
  })

  it('omits a host from weightedLoads entirely when the field is missing or non-finite — never invents a synthetic worst-case ranking', () => {
    const servers: RawContentServer[] = [
      { Host: 'no-weightedload-field.example' },
      { Host: 'nan-weightedload.example', weightedload: Number.NaN },
      { Host: 'good.example', weightedload: 20 }
    ]
    const { weightedLoads } = reduceContentServers(servers)
    expect(weightedLoads.has('no-weightedload-field.example')).toBe(false)
    expect(weightedLoads.has('nan-weightedload.example')).toBe(false)
    expect(weightedLoads.get('good.example')).toBe(20)
  })

  // Debug/steam-install-slow-start (cycle 8): the REAL directory response
  // returns weightedload/load as STRINGS ("130", "20", ...), not numbers —
  // this is the regression that slipped through cycles 5-7 (their fixtures
  // only ever used numeric weightedload values, so `weightedLoads=0` on
  // every real hardware run went undetected by the test suite).
  it('coerces STRING-valued weightedload into a number, so weightedLoads is populated from a real (string-typed) directory response', () => {
    const servers: RawContentServer[] = [
      { Host: 'cache1-akl-edgx.steamcontent.com', weightedload: '20' },
      { Host: 'cache1-akl-tpwr.steamcontent.com', weightedload: '37' },
      { Host: 'cache2-akl-tpwr.steamcontent.com', weightedload: '48' },
      { Host: 'steampipe.akamaized.net', weightedload: '130' },
      { Host: 'alibaba.cdn.steampipe.steamcontent.com', weightedload: '130' },
      { Host: 'fastly.cdn.steampipe.steamcontent.com', weightedload: '130' }
    ]
    const { hosts, weightedLoads } = reduceContentServers(servers)
    expect(weightedLoads.size).toBe(hosts.length)
    expect(weightedLoads.get('cache1-akl-edgx.steamcontent.com')).toBe(20)
    expect(weightedLoads.get('cache1-akl-tpwr.steamcontent.com')).toBe(37)
    expect(weightedLoads.get('cache2-akl-tpwr.steamcontent.com')).toBe(48)
    expect(weightedLoads.get('steampipe.akamaized.net')).toBe(130)
    expect(weightedLoads.get('alibaba.cdn.steampipe.steamcontent.com')).toBe(
      130
    )
    expect(weightedLoads.get('fastly.cdn.steampipe.steamcontent.com')).toBe(130)
  })

  it('omits a host from weightedLoads when weightedload is a non-numeric string, without throwing', () => {
    const servers: RawContentServer[] = [
      { Host: 'bad-string.example', weightedload: 'not-a-number' },
      { Host: 'empty-string.example', weightedload: '' },
      { Host: 'good.example', weightedload: '20' }
    ]
    const { weightedLoads } = reduceContentServers(servers)
    expect(weightedLoads.has('bad-string.example')).toBe(false)
    // Number('') === 0, which IS finite — an empty string coerces to the
    // (arguably degenerate but not wrong) value 0, exactly matching
    // Number(...)'s own documented coercion behavior; not special-cased.
    expect(weightedLoads.get('empty-string.example')).toBe(0)
    expect(weightedLoads.get('good.example')).toBe(20)
  })

  it('preserves the directory response order in the returned hosts array', () => {
    const servers: RawContentServer[] = [
      { Host: 'z-host.example', weightedload: 1 },
      { Host: 'a-host.example', weightedload: 2 }
    ]
    const { hosts } = reduceContentServers(servers)
    expect(hosts).toEqual(['z-host.example', 'a-host.example'])
  })

  // Debug/steam-install-slow-start (cycle 7): hostMeta (https_support +
  // usetokenauth) — the data fetchChunk needs for EXACT steam-user
  // URL-scheme/token parity. See depot/decompress.ts's fetchChunk.
  it('threads https_support into the hostMeta map, keyed by hostname', () => {
    const servers: RawContentServer[] = [
      { Host: 'cache1-akl-tpwr.steamcontent.com', https_support: 'mandatory' },
      // The real cycle-5 hardware diagnosis's directory response for
      // alibaba.cdn.steampipe.steamcontent.com.
      {
        Host: 'alibaba.cdn.steampipe.steamcontent.com',
        https_support: 'unavailable'
      }
    ]
    const { hostMeta } = reduceContentServers(servers)
    expect(hostMeta.get('cache1-akl-tpwr.steamcontent.com')?.httpsSupport).toBe(
      'mandatory'
    )
    expect(
      hostMeta.get('alibaba.cdn.steampipe.steamcontent.com')?.httpsSupport
    ).toBe('unavailable')
  })

  it("maps usetokenauth === 1 to true (steam-user's own `== 1` gate, not a loose truthy check) and every other value (absent/0/other) to false", () => {
    const servers: RawContentServer[] = [
      { Host: 'wants-token.example', usetokenauth: 1 },
      { Host: 'no-usetokenauth-field.example' },
      { Host: 'zero-usetokenauth.example', usetokenauth: 0 }
    ]
    const { hostMeta } = reduceContentServers(servers)
    expect(hostMeta.get('wants-token.example')?.usetokenauth).toBe(true)
    expect(hostMeta.get('no-usetokenauth-field.example')?.usetokenauth).toBe(
      false
    )
    expect(hostMeta.get('zero-usetokenauth.example')?.usetokenauth).toBe(false)
  })

  it('every host present in `hosts` has a corresponding hostMeta entry, even when https_support/usetokenauth/type are all absent from the raw server', () => {
    const servers: RawContentServer[] = [{ Host: 'bare-host.example' }]
    const { hosts, hostMeta } = reduceContentServers(servers)
    expect(hosts).toEqual(['bare-host.example'])
    expect(hostMeta.has('bare-host.example')).toBe(true)
    expect(hostMeta.get('bare-host.example')).toEqual({
      httpsSupport: undefined,
      usetokenauth: false,
      type: undefined
    })
  })

  // CDN-auth implementation cycle, PART 2: `type` threads into hostMeta so
  // decompress.ts's `wantsCdnAuthToken` can widen the token gate to
  // `type === 'CDN'` -- see the RESEARCH SPIKE's content_log.txt finding
  // (real client authenticates on every type=CDN host unconditionally,
  // regardless of the never-populated usetokenauth flag).
  it("threads the raw server's `type` (CDN vs SteamCache) into the hostMeta map, keyed by hostname", () => {
    const servers: RawContentServer[] = [
      { Host: 'alibaba.cdn.steampipe.steamcontent.com', type: 'CDN' },
      { Host: 'cache1-akl-tpwr.steamcontent.com', type: 'SteamCache' }
    ]
    const { hostMeta } = reduceContentServers(servers)
    expect(hostMeta.get('alibaba.cdn.steampipe.steamcontent.com')?.type).toBe(
      'CDN'
    )
    expect(hostMeta.get('cache1-akl-tpwr.steamcontent.com')?.type).toBe(
      'SteamCache'
    )
  })
})

describe('classifyDepotError', () => {
  it('37-02 Task 1 (D-08): the ORIGINAL cause object survives to the classifier, unreachable through the pre-flattened error string', () => {
    // Construct the exact shape downloadDepotFiles' per-file catch now
    // produces: { file, error: err.message, cause: err }.
    const err = new Error(
      'chunk abc123 failed after 5 attempts: bad footer magic'
    ) as Error & { code?: string }
    err.code = 'unknown_container' // one of DECODE_STAGE_ERROR_CODES
    const failure = { file: 'game.bin', error: err.message, cause: err }

    // Non-vacuity, direction 1: the preserved cause carries the `.code`.
    expect(isDecodeStageError(failure.cause)).toBe(true)
    // Non-vacuity, direction 2 (the half that fails against pre-fix code,
    // where classifyDepotError only ever received `failure.error`): the
    // pre-flattened string has no `.code` to read at all.
    expect(isDecodeStageError(failure.error)).toBe(false)
  })

  it('maps an ENOSPC error to a disk-full message', () => {
    const result = classifyDepotError(
      new Error('ENOSPC: no space left on device, write')
    )
    expect(result.message).toMatch(/disk space/i)
  })

  it('maps a CDN/connection-exhausted error to a "Steam servers dropped the connection" message', () => {
    const result = classifyDepotError(
      new Error('chunk abc123 failed after 4 attempts: CDN 503')
    )
    expect(result.message).toMatch(/steam servers dropped the connection/i)
  })

  it('maps a path-traversal rejection to its own message', () => {
    const result = classifyDepotError(
      'downloadDepotFiles: rejected path-traversal filename "../../evil.txt" (escapes /tmp/x)'
    )
    expect(result.message).toMatch(/unsafe file path/i)
  })

  it('maps a whole-file SHA1 mismatch to a verify message', () => {
    const result = classifyDepotError(
      'downloadDepotFiles: whole-file SHA1 mismatch for game.bin: abc123 != def456'
    )
    expect(result.message).toMatch(/failed verification/i)
  })

  it('falls back to a generic message for an unrecognized error', () => {
    const result = classifyDepotError(
      new Error('something totally unexpected happened')
    )
    expect(result.message).toMatch(/steam download failed/i)
  })

  it('accepts a plain string (DepotDownloadFailure.error shape), not only Error instances', () => {
    const result = classifyDepotError('ENOSPC: no space left on device')
    expect(result.message).toMatch(/disk space/i)
  })

  it('D-UAT-08: a wrapDepotKeyError-shaped message carrying a terminal `.eresult` is classified as depot-unavailable, NEVER "connection dropped", and embeds the depot/app-id detail', () => {
    const err = new Error(
      "couldn't get decryption key for depot 1460472 (app 54321): FileNotFound"
    ) as Error & { eresult?: number }
    err.eresult = 9 // FileNotFound — wrapDepotKeyError preserves this from the original steam-user error
    const result = classifyDepotError(err)
    expect(result.message).not.toMatch(/dropped the connection/i)
    expect(result.key).toBe('steam.download.error.depotUnavailable')
    expect(result.message).toMatch(/1460472/)
    expect(result.message).toMatch(/54321/)
  })

  it('D-UAT-08: an Error carrying a terminal `.eresult` (e.g. AccessDenied=15) is classified as depot-unavailable even without the wrapped message text', () => {
    const err = new Error('AccessDenied') as Error & { eresult?: number }
    err.eresult = 15
    const result = classifyDepotError(err)
    expect(result.key).toBe('steam.download.error.depotUnavailable')
    expect(result.message).not.toMatch(/dropped the connection/i)
  })

  it('D-UAT-08: a getDepotDecryptionKey failure with NO eresult (e.g. a genuine transient ECONNRESET, still wrapped with depot/app context) falls through to the connection-dropped classification, unchanged from before', () => {
    const result = classifyDepotError(
      new Error(
        "couldn't get decryption key for depot 111 (app 12345): ECONNRESET"
      )
    )
    expect(result.key).toBe('steam.download.error.connectionDropped')
    expect(result.message).toMatch(/dropped the connection/i)
  })

  it('G-23-01: a wrapDepotKeyError-shaped message carrying eresult=40 (Blocked) is classified as depotBlocked, names the blocked depot id, and tells the user the game may still be installable through Steam directly', () => {
    const err = new Error(
      "couldn't get decryption key for depot 1771304 (app 1771300): Blocked"
    ) as Error & { eresult?: number }
    err.eresult = 40
    const result = classifyDepotError(err)
    expect(result.key).toBe('steam.download.error.depotBlocked')
    expect(result.message).toMatch(/1771304/)
    expect(result.message).toMatch(
      /installable directly through the steam client/i
    )
  })

  it('G-23-01: other terminal EResults (8, 9, 15, 17, 42, 43) are unaffected by the new Blocked branch — only 40 gets depotBlocked', () => {
    for (const eresult of [8, 9, 15, 17, 42, 43]) {
      const err = new Error('x') as Error & { eresult?: number }
      err.eresult = eresult
      const result = classifyDepotError(err)
      expect(result.key).toBe('steam.download.error.depotUnavailable')
    }
  })

  it("37-02 Task 2 (a): a ChunkDecodeError-shaped exhaustion (message text IS fetchChunk's generic wrapper) classifies as decodeFailed, NOT connectionDropped", () => {
    const err = new Error(
      'chunk abc123 failed after 5 attempts: bad footer magic'
    ) as Error & { code?: string }
    err.code = 'unknown_container'
    const result = classifyDepotError(err)
    expect(result.key).toBe('steam.download.error.decodeFailed')
    expect(result.action).toBe('retry')

    // Non-vacuity pair: the SAME message with its .code removed classifies
    // as generic instead — proving the branch fires on the property, not on
    // the "failed after N attempts" text both errors share.
    delete err.code
    const withoutCode = classifyDepotError(err)
    expect(withoutCode.key).toBe('steam.download.error.generic')
  })

  it('37-02 Task 2 (b): a bare ECONNRESET still classifies as connectionDropped with action retry (genuine-network regression guard)', () => {
    const result = classifyDepotError(new Error('ECONNRESET'))
    expect(result.key).toBe('steam.download.error.connectionDropped')
    expect(result.action).toBe('retry')
  })

  it('37-02 Task 2 (c): a no-authenticated-CM-connection plan-build abort classifies as notSignedIn with action signIn and never says "retry"', () => {
    const result = classifyDepotError(
      new Error(
        'downloadSteamDepots: no authenticated Steam CM connection available for appId 259130'
      )
    )
    expect(result.key).toBe('steam.download.error.notSignedIn')
    expect(result.action).toBe('signIn')
    expect(result.message).not.toMatch(/retry/i)
  })

  it('37-02 Task 2 (d): a bare exhaustion message with NO .code now classifies as generic — the direct behavioral consequence of removing the "failed after N attempts" network-alternation term (D-08)', () => {
    const result = classifyDepotError(
      new Error('chunk abc123 failed after 5 attempts: socket hang up')
    )
    expect(result.key).toBe('steam.download.error.generic')
    expect(result.action).toBe('retry')
  })

  // debug/depot-stall-bound-did-not-fire, specialist review W-2 (2026-09-25).
  it("W-2: downloadDepotFiles' RUN-SCOPED stall failure classifies as stalled with the honest no-progress copy, never the causeless generic bucket", () => {
    const err = Object.assign(
      new Error(
        'download stalled: no forward progress for 180500ms across the whole run — giving up with 812 file(s) unattempted'
      ),
      { isStall: true as const, msSinceProgress: 180500 }
    )
    const result = classifyDepotError(err)
    expect(result.key).toBe('steam.download.error.stalled')
    expect(result.action).toBe('retry')
    expect(result.message).not.toMatch(/the steam download failed/i)
    expect(result.message).toMatch(/no download progress/i)
  })

  it('W-2 non-vacuity + ordering guard: the SAME sentence WITHOUT the isStall marker is unchanged — a per-chunk stall carrying a genuine network signature still classifies as connectionDropped, and a bare one still falls to generic', () => {
    // downloadFileChunks composes a similar stall suffix onto the underlying
    // chunk error but stamps no marker, so this shape — the common one in
    // the wild — must be untouched by the new branch. Proves the branch
    // fires on the PROPERTY, not on the "stalled" text the two share.
    expect(
      classifyDepotError(
        new Error(
          'chunk abc123 failed after 8 attempts: ECONNRESET (download stalled: no forward progress for 180500ms across the whole run)'
        )
      ).key
    ).toBe('steam.download.error.connectionDropped')

    expect(
      classifyDepotError(
        new Error(
          'download stalled: no forward progress for 180500ms across the whole run'
        )
      ).key
    ).toBe('steam.download.error.generic')
  })

  it('W-2: the stall branch mints NO new locale key — it reuses gamelib:box.error.install.stalled, which is already filled in all 48 locales, so the lint-translations:gamelib presence baseline stays at totalPairs 0', () => {
    const source = readFileSync(
      join(__dirname, '..', 'depotErrors.ts'),
      'utf-8'
    )
    expect(source).toContain('gamelib:box.error.install.stalled')
    // The tempting alternative, and the reason this assertion exists.
    expect(source).not.toContain('gamelib:steam.download.error.stalled')
  })
})

// debug/steam-depot-unclassified-generic-error (F2): `code`/`eresult` are the
// exact two properties classifyDepotError reads, and `(err as Error).message`
// alone drops both — so a failure that reaches the UNCLASSIFIED generic bucket
// left behind LESS evidence than the classifier itself saw.
describe('describeDepotFailure', () => {
  it('carries `code` alongside the message (the EISDIR/ENOSPC fs shapes)', () => {
    const out = describeDepotFailure(
      Object.assign(new Error('EISDIR: illegal operation on a directory'), {
        code: 'EISDIR'
      })
    )
    expect(out).toContain('EISDIR: illegal operation on a directory')
    expect(out).toContain('code=EISDIR')
  })

  it('carries `eresult` (the Steam CM shape)', () => {
    expect(
      describeDepotFailure(Object.assign(new Error('blocked'), { eresult: 40 }))
    ).toContain('eresult=40')
  })

  it('omits absent fields rather than printing undefined', () => {
    const out = describeDepotFailure(new Error('plain'))
    expect(out).toBe('plain')
    expect(out).not.toContain('undefined')
  })

  // A diagnostic helper that throws would REPLACE a download failure with a
  // TypeError at the exact moment the log is the only evidence there is.
  it.each([
    ['a string', 'just a string'],
    ['undefined', undefined],
    ['null', null],
    ['a number', 42]
  ])('never throws on %s thrown as a non-Error', (_label, thrown) => {
    expect(() => describeDepotFailure(thrown)).not.toThrow()
    expect(typeof describeDepotFailure(thrown)).toBe('string')
  })

  it('falls back to String(err) when message is present but empty', () => {
    expect(describeDepotFailure(new Error(''))).toBe('Error')
  })
})

describe('isNonRetryableDepotError', () => {
  it('returns true for each terminal EResult (FileNotFound=9, AccessDenied=15, and peers)', () => {
    for (const eresult of [8, 9, 15, 17, 40, 42, 43]) {
      const err = new Error('x') as Error & { eresult?: number }
      err.eresult = eresult
      expect(isNonRetryableDepotError(err)).toBe(true)
    }
  })

  it('returns false for an error with no eresult property (e.g. ECONNRESET) — stays retryable', () => {
    expect(isNonRetryableDepotError(new Error('ECONNRESET'))).toBe(false)
  })

  it('returns false for an eresult NOT in the terminal set (e.g. a transient server-side code)', () => {
    const err = new Error('x') as Error & { eresult?: number }
    err.eresult = 2 // Fail — generic, not in the terminal set
    expect(isNonRetryableDepotError(err)).toBe(false)
  })

  it('returns false for non-object/non-Error values', () => {
    expect(isNonRetryableDepotError('plain string')).toBe(false)
    expect(isNonRetryableDepotError(null)).toBe(false)
    expect(isNonRetryableDepotError(undefined)).toBe(false)
  })
})
