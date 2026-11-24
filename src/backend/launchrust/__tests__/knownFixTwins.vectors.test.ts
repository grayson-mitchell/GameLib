/**
 * The known-fix twins pinned to the Rust goldens (Phase 88, 88-13, 87 D-24, D-20).
 *
 * `launchrust/knownFixTwins.ts` holds synchronous copies of the known-fix reader and env formatters, for the
 * two callers 88 cannot make async (the launcher's `installFixes` and `getKnownFixesEnvVariables`, and
 * storeManagerCommon's `withKnownFixEnv`). Each is a row in the shim schedule, and this file is the vectors test
 * the row names: it replays the twins on the same cases the Rust crate replays, and compares what they answer
 * and log with what the goldens recorded.
 *
 * Slices (both under `gamelib-knownfix/tests/fixtures/golden/`):
 *   reader/          every `read` step that asks for `readKnownFixes` is run on the same seeded layers
 *   overlay_install/ the pure env helpers (`formatKnownFixEnvLine`, `logKnownFixEnv`, `withKnownFixEnv`)
 *
 * A twin that differs from a golden is a todo, never an edit to the twin or the golden (D-20).
 *
 * Isolation (D-12, D-13, D-22): every reader case runs on a fresh fake HOME with `withPinnedBaseEnv`; nothing
 * reads the real profile. The logger is spied on, with the real writer never reached.
 */
import { readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  expandPlaceholders,
  goldenDir,
  loadCases,
  normalisePaths,
  seedProfile,
  withEngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import * as logger from 'backend/logger'
import { LogPrefix } from 'backend/logger'
import type { GameSettings } from 'common/types'
import type {
  ReaderCase,
  Step
} from 'backend/__tests__/oracle/knownFixReader.cases'

import {
  formatKnownFixEnvLine,
  logKnownFixEnv,
  readKnownFixes,
  withKnownFixEnv
} from '../knownFixTwins'

const CRATE = 'gamelib-knownfix'

/** The reader slice's recorded case count; the twin run must visit at least this many (the MANIFEST floor). */
const READER_MANIFEST = JSON.parse(
  readFileSync(join(goldenDir(CRATE, 'reader'), 'MANIFEST.json'), 'utf8')
) as { count: number; floor: number }

/** The `<PARSER-MESSAGE>` token the golden records where V8 and serde_json differ (reader/deltas.json). */
const PARSER_MESSAGE = '<PARSER-MESSAGE>'
function neutraliseParserMessage(line: string): string {
  const marker = 'ignoring.\n'
  if (!line.startsWith('Known fixes could not be applied')) return line
  const at = line.indexOf(marker)
  return at === -1 ? line : line.slice(0, at + marker.length) + PARSER_MESSAGE
}

interface ReaderEvent {
  step: number
  call: string
  level: 'info' | 'warning'
  text: string
}

interface ReaderGolden {
  result: { steps: Array<{ op: string; answers?: Record<string, unknown> }> }
  events: ReaderEvent[]
}

function readGolden(slice: string, id: string): ReaderGolden {
  const dir = join(goldenDir(CRATE, slice), 'expected', id)
  return {
    result: JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')),
    events: JSON.parse(readFileSync(join(dir, 'events.json'), 'utf8'))
  }
}

const asksForTier1 = (step: Step): boolean =>
  step.op === 'read' && step.calls.includes('readKnownFixes')

/** What the twin answered per step (`undefined` for a step that does not ask for `readKnownFixes`) and logged. */
async function runReaderCase(
  c: ReaderCase
): Promise<{ answers: unknown[]; events: ReaderEvent[] }> {
  return withEngineOracleProfile(async (profile) => {
    const deps = {
      paths: {
        ...profile.paths,
        bundledFixesPath: join(profile.home, 'public', 'fixes')
      }
    }
    const events: ReaderEvent[] = []
    let step = 0
    const record =
      (level: ReaderEvent['level']) =>
      (message: unknown): void => {
        events.push({
          step,
          call: 'readKnownFixes',
          level,
          text: neutraliseParserMessage(String(message))
        })
      }
    const warn = jest.spyOn(logger, 'logWarning')
    warn.mockImplementation(record('warning'))
    const info = jest.spyOn(logger, 'logInfo')
    info.mockImplementation(record('info'))
    const answers: unknown[] = []
    await withInjected(
      [
        injectPlatform('mac'),
        () => warn.mockRestore(),
        () => info.mockRestore()
      ],
      () =>
        withPinnedBaseEnv(profile.fake, () => {
          c.steps.forEach((s, index) => {
            step = index
            // The same removals and seeds the recorder applied, whatever the step's op.
            for (const path of s.remove ?? []) {
              rmSync(expandPlaceholders(path, profile), {
                recursive: true,
                force: true
              })
            }
            if (s.seed) seedProfile(profile, s.seed)
            answers.push(
              s.op === 'read' && asksForTier1(s)
                ? readKnownFixes(
                    deps,
                    expandPlaceholders(s.appName, profile),
                    s.runner
                  )
                : undefined
            )
          })
        })
    )
    return {
      answers: normalisePaths(answers, profile),
      events: normalisePaths(events, profile)
    }
  })
}

describeSkipOnWindows(
  'known-fix twins pinned to the Rust goldens (88-13)',
  () => {
    describe('readKnownFixes against golden/reader', () => {
      const cases = loadCases<ReaderCase>(CRATE, 'reader')
      const comparable = cases.filter((c) => c.steps.some(asksForTier1))

      it('visits every recorded case, and compares every one that asks for the tier-1 reader', () => {
        expect(cases.length).toBeGreaterThanOrEqual(READER_MANIFEST.count)
        expect(READER_MANIFEST.count).toBeGreaterThanOrEqual(125)
        // anti-vacuity: the pairwise rows alone ask for it, so a comparison that skipped them would be hollow
        expect(comparable.length).toBeGreaterThanOrEqual(100)
      })

      it.each(comparable)('$id', async (c) => {
        const expected = readGolden('reader', c.id)
        const got = await runReaderCase(c)
        c.steps.forEach((s, index) => {
          if (!asksForTier1(s)) return
          expect(got.answers[index]).toEqual(
            expected.result.steps[index]?.answers?.readKnownFixes
          )
        })
        expect(got.events).toEqual(
          expected.events.filter((e) => e.call === 'readKnownFixes')
        )
      })

      it('self-test: a planted mismatch (one expected value altered in memory) fails the comparison', async () => {
        const c = comparable.find((x) => x.id === 'pairwise-002')
        if (!c) throw new Error('pairwise-002 is missing from golden/reader')
        const expected = readGolden('reader', c.id)
        const got = await runReaderCase(c)
        const planted = JSON.parse(
          JSON.stringify(expected.result.steps[0]?.answers?.readKnownFixes)
        ) as { title: string }
        expect(got.answers[0]).toEqual(planted)
        planted.title = `${planted.title} (planted)`
        expect(got.answers[0]).not.toEqual(planted)
      })
    })

    describe('the pure env helpers against golden/overlay_install', () => {
      const OVERLAY_FORMAT =
        'knownFixOverlays--env-helpers-formatknownfixenvline-logknownfixenv'
      const OVERLAY_WITH_ENV =
        'knownFixOverlays--env-helpers-withknownfixenv-appends-without-mutating'

      interface OverlayStep {
        op: string
        label?: string
        entries?: Array<{ key: string; value: string; source: string }>
        settings?: unknown
        env?: Record<string, string>
        result?: unknown
        isTheSameObject?: boolean
        originalOptionCountAfter?: number | null
        originalOptionCountBefore?: number | null
      }
      interface OverlayGolden {
        result: { steps: OverlayStep[] }
        events: Array<{
          step: number
          level: string
          prefix: string
          text: string
        }>
      }
      const golden = (id: string): OverlayGolden => {
        const dir = join(goldenDir(CRATE, 'overlay_install'), 'expected', id)
        return {
          result: JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')),
          events: JSON.parse(readFileSync(join(dir, 'events.json'), 'utf8'))
        }
      }

      it('the two cases are in the committed cases.json', () => {
        const ids = loadCases(CRATE, 'overlay_install').map((c) => c.id)
        expect(ids).toContain(OVERLAY_FORMAT)
        expect(ids).toContain(OVERLAY_WITH_ENV)
      })

      it('formatKnownFixEnvLine and logKnownFixEnv answer and log what the golden recorded', () => {
        const expected = golden(OVERLAY_FORMAT)
        const info = jest.spyOn(logger, 'logInfo').mockImplementation(() => {
          return undefined
        })
        try {
          const logged: Array<{ step: number; text: string; prefix: string }> =
            []
          let index = 0
          info.mockImplementation((message: unknown, prefix?: unknown) => {
            logged.push({
              step: index,
              text: String(message),
              prefix: String(prefix)
            })
          })
          expected.result.steps.forEach((s, i) => {
            index = i
            const entries = s.entries ?? []
            if (s.op === 'formatLine') {
              expect(formatKnownFixEnvLine(entries)).toEqual(s.result)
            } else if (s.op === 'logLine') {
              expect(
                logKnownFixEnv(s.label ?? '', entries, LogPrefix.Backend)
              ).toEqual(s.result)
            } else {
              throw new Error(`unexpected op ${s.op} in ${OVERLAY_FORMAT}`)
            }
          })
          expect(logged).toEqual(
            expected.events.map((e) => ({
              step: e.step,
              text: e.text,
              prefix: e.prefix
            }))
          )
          // anti-vacuity: the golden holds a truncated value and a logged line
          expect(String(expected.result.steps[1]?.result)).toContain('... (')
          expect(logged.length).toBeGreaterThanOrEqual(1)
        } finally {
          info.mockRestore()
        }
      })

      it('withKnownFixEnv answers what the golden recorded and never mutates its input', () => {
        const expected = golden(OVERLAY_WITH_ENV)
        expect(expected.result.steps.length).toBeGreaterThanOrEqual(2)
        for (const s of expected.result.steps) {
          const settings = s.settings as unknown as GameSettings
          const before = settings.enviromentOptions?.length ?? null
          const out = withKnownFixEnv(settings, s.env ?? {})
          expect(out).toEqual(s.result)
          expect(out === settings).toBe(s.isTheSameObject)
          expect(settings.enviromentOptions?.length ?? null).toBe(
            s.originalOptionCountAfter
          )
          expect(before).toBe(s.originalOptionCountBefore)
        }
      })

      it('self-test: a planted mismatch (one expected value altered in memory) fails the comparison', () => {
        const expected = golden(OVERLAY_WITH_ENV)
        const s = expected.result.steps[1]
        if (!s) throw new Error('the golden has no second step')
        const out = withKnownFixEnv(
          s.settings as unknown as GameSettings,
          s.env ?? {}
        )
        const planted = JSON.parse(JSON.stringify(s.result)) as {
          enviromentOptions: Array<{ key: string; value: string }>
        }
        expect(out).toEqual(planted)
        const last =
          planted.enviromentOptions[planted.enviromentOptions.length - 1]
        if (!last) throw new Error('the golden answered no options')
        last.value = `${last.value}-planted`
        expect(out).not.toEqual(planted)
      })
    })
  }
)
