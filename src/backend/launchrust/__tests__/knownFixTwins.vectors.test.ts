/**
 * The known-fix twins pinned to the Rust goldens (Phase 88, 88-13 and 88-14, 87 D-24, D-20).
 *
 * `launchrust/knownFixTwins.ts` holds synchronous copies of the known-fix reader and env formatters, for the
 * callers 88 cannot make async (the launcher's `installFixes` and `getKnownFixesEnvVariables`, storeManagerCommon's
 * `withKnownFixEnv`, and the Steam bridge's profile and launch-override reads, env lookup and overlay archive
 * reader and writer). Each is a row in the shim schedule, and this file is the vectors test the row names: it
 * replays the twins on the same cases the Rust crate replays, and compares what they answer and log with what the
 * goldens recorded.
 *
 * Slices (all under `gamelib-knownfix/tests/fixtures/golden/`):
 *   reader/          every `read` step that asks for `readKnownFixes` or `readKnownFixProfile` is run on the same
 *                    seeded layers
 *   launch_overrides/ every `overrides` step runs `readKnownFixLaunchOverridesSync` on its seeded tree; every
 *                    `resolve` step runs through it too, as a tier-1 fix carrying that `exeOverride`
 *   overlay_install/ the pure env helpers (`formatKnownFixEnvLine`, `logKnownFixEnv`, `withKnownFixEnv`,
 *                    `lastEnvOption`)
 *   overlay_archive/ `buildOverlayTarGz` and `readOverlayTarGz` over every recorded step
 *
 * A twin that differs from a golden is a todo, never an edit to the twin or the golden (D-20).
 *
 * Isolation (D-12, D-13, D-22): every reader case runs on a fresh fake HOME with `withPinnedBaseEnv`; nothing
 * reads the real profile. The logger is spied on, with the real writer never reached.
 */
import { createHash } from 'crypto'
import { readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { gunzipSync } from 'zlib'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  expandPlaceholders,
  goldenDir,
  loadCases,
  normalisePaths,
  seedProfile,
  withEngineOracleProfile,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import * as logger from 'backend/logger'
import { LogPrefix } from 'backend/logger'
import type { GameSettings, Runner } from 'common/types'
import { fix } from 'backend/__tests__/oracle/knownFixReader.cases'
import type {
  ReaderCase,
  Step
} from 'backend/__tests__/oracle/knownFixReader.cases'
import type {
  ArchiveCase,
  FileSpec
} from 'backend/__tests__/oracle/knownFixOverlay.cases'

import {
  buildOverlayTarGz,
  formatKnownFixEnvLine,
  lastEnvOption,
  logKnownFixEnv,
  readKnownFixes,
  readKnownFixLaunchOverridesSync,
  readKnownFixProfile,
  readOverlayTarGz,
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

type ReaderCall = 'readKnownFixes' | 'readKnownFixProfile'

const asks =
  (call: ReaderCall) =>
  (step: Step): boolean =>
    step.op === 'read' && step.calls.includes(call)
const asksForTier1 = asks('readKnownFixes')
const asksForProfile = asks('readKnownFixProfile')

/**
 * What the twin answered per step (`undefined` for a step that does not ask for `call`) and logged. The default is
 * the tier-1 reader, so the 88-13 comparisons read as they did.
 */
async function runReaderCase(
  c: ReaderCase,
  call: ReaderCall = 'readKnownFixes'
): Promise<{ answers: unknown[]; events: ReaderEvent[] }> {
  const readTwin =
    call === 'readKnownFixes' ? readKnownFixes : readKnownFixProfile
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
          call,
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
              s.op === 'read' && asks(call)(s)
                ? readTwin(
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

    describe('readKnownFixProfile against golden/reader (88-14)', () => {
      const cases = loadCases<ReaderCase>(CRATE, 'reader')
      const comparable = cases.filter((c) => c.steps.some(asksForProfile))

      it('compares every recorded case that asks for the tier-2 reader', () => {
        // anti-vacuity: the pairwise rows ask for it, so a comparison that skipped them would be hollow
        expect(comparable.length).toBeGreaterThanOrEqual(100)
      })

      it.each(comparable)('$id', async (c) => {
        const expected = readGolden('reader', c.id)
        const got = await runReaderCase(c, 'readKnownFixProfile')
        c.steps.forEach((s, index) => {
          if (!asksForProfile(s)) return
          expect(got.answers[index]).toEqual(
            expected.result.steps[index]?.answers?.readKnownFixProfile
          )
        })
        expect(got.events).toEqual(
          expected.events.filter((e) => e.call === 'readKnownFixProfile')
        )
      })

      it('self-test: a planted mismatch (one expected profile altered in memory) fails the comparison', async () => {
        const c = comparable.find((x) =>
          x.steps.some(
            (s, i) =>
              asksForProfile(s) &&
              readGolden('reader', x.id).result.steps[i]?.answers
                ?.readKnownFixProfile != null
          )
        )
        if (!c) throw new Error('no golden/reader case answers a profile')
        const expected = readGolden('reader', c.id)
        const index = c.steps.findIndex(
          (s, i) =>
            asksForProfile(s) &&
            expected.result.steps[i]?.answers?.readKnownFixProfile != null
        )
        const got = await runReaderCase(c, 'readKnownFixProfile')
        const planted = JSON.parse(
          JSON.stringify(
            expected.result.steps[index]?.answers?.readKnownFixProfile
          )
        ) as Record<string, unknown>
        expect(got.answers[index]).toEqual(planted)
        planted['plantedKey'] = true
        expect(got.answers[index]).not.toEqual(planted)
      })
    })

    describe('readKnownFixLaunchOverridesSync against golden/launch_overrides (88-14)', () => {
      const SLICE = 'launch_overrides'
      const LAUNCH_FLOOR = 19

      type LaunchStep = (
        | { op: 'resolve'; installPath: string; exeOverride: string }
        | {
            op: 'overrides'
            appName: string
            runner: Runner
            installPath: string | null
          }
      ) & { seed?: SeedEntry[]; remove?: string[] }
      interface LaunchCase {
        id: string
        tree?: SeedEntry[]
        steps: LaunchStep[]
      }
      interface LaunchEvent {
        step: number
        level: 'info' | 'warning'
        text: string
      }
      interface LaunchGolden {
        result: {
          steps: Array<{
            op: string
            resolved?: string | null
            overrides?: { launchArgs: string[]; exeOverride: string | null }
          }>
        }
        events: LaunchEvent[]
      }

      // The tree every case starts from: the oracle's own layout (`knownFixLaunch.oracle.test.ts`).
      const BASE = '<HOME>/games'
      const TREE: SeedEntry[] = [
        { path: `${BASE}/install/bin/game.exe`, text: 'x' },
        { path: `${BASE}/outside/real.exe`, text: 'x' },
        { path: `${BASE}/outside.exe`, text: 'x' }
      ]
      /** The app a `resolve` step is run through: a tier-1 fix in the remote layer carrying its `exeOverride`. */
      const RESOLVE_APP = 'resolve-app'

      /** macOS prints `/private` in front of a real path the temp dir resolves through; no other host does. */
      const dropRealpathPrefix = <T>(value: T): T =>
        JSON.parse(JSON.stringify(value).split('/private<').join('<')) as T

      const golden = (id: string): LaunchGolden => {
        const dir = join(goldenDir(CRATE, SLICE), 'expected', id)
        return {
          result: JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')),
          events: JSON.parse(readFileSync(join(dir, 'events.json'), 'utf8'))
        }
      }

      /** What the twin answered per step and logged (a `resolve` step logs through the reader, so only its answer counts). */
      async function runLaunchCase(
        c: LaunchCase
      ): Promise<{ answers: unknown[]; events: LaunchEvent[] }> {
        return withEngineOracleProfile(
          async (profile) => {
            const deps = {
              paths: {
                ...profile.paths,
                bundledFixesPath: join(profile.home, 'public', 'fixes')
              }
            }
            const events: LaunchEvent[] = []
            let step = 0
            const record =
              (level: LaunchEvent['level']) =>
              (message: unknown): void => {
                events.push({ step, level, text: String(message) })
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
                    for (const path of s.remove ?? []) {
                      rmSync(expandPlaceholders(path, profile), {
                        recursive: true,
                        force: true
                      })
                    }
                    if (s.seed) seedProfile(profile, s.seed)
                    if (s.op === 'resolve') {
                      seedProfile(profile, [
                        fix('remote', RESOLVE_APP, 'gog', 1, {
                          title: 't',
                          exeOverride: s.exeOverride
                        })
                      ])
                    }
                    const got = readKnownFixLaunchOverridesSync(
                      deps,
                      s.op === 'resolve' ? RESOLVE_APP : s.appName,
                      s.op === 'resolve' ? 'gog' : s.runner,
                      s.installPath === null
                        ? undefined
                        : expandPlaceholders(s.installPath, profile)
                    )
                    answers.push(
                      s.op === 'resolve'
                        ? (got.exeOverride ?? null)
                        : {
                            launchArgs: got.launchArgs,
                            exeOverride: got.exeOverride ?? null
                          }
                    )
                  })
                })
            )
            return {
              answers: dropRealpathPrefix(normalisePaths(answers, profile)),
              events: dropRealpathPrefix(normalisePaths(events, profile))
            }
          },
          { seed: [...TREE, ...(c.tree ?? [])] }
        )
      }

      const cases = loadCases<LaunchCase>(CRATE, SLICE)

      it('visits every recorded case, and both kinds of step are among them', () => {
        expect(cases.length).toBeGreaterThanOrEqual(LAUNCH_FLOOR)
        const ops = new Set(cases.flatMap((c) => c.steps.map((s) => s.op)))
        expect([...ops].sort()).toEqual(['overrides', 'resolve'])
      })

      it.each(cases)('$id', async (c) => {
        const expected = golden(c.id)
        const got = await runLaunchCase(c)
        c.steps.forEach((s, index) => {
          const want = expected.result.steps[index]
          expect(got.answers[index]).toEqual(
            s.op === 'resolve' ? want?.resolved : want?.overrides
          )
        })
        // Only an `overrides` step's own log lines are the golden's: a `resolve` step is run through the reader.
        const overridesSteps = new Set(
          c.steps.flatMap((s, i) => (s.op === 'overrides' ? [i] : []))
        )
        expect(got.events.filter((e) => overridesSteps.has(e.step))).toEqual(
          expected.events.filter((e) => overridesSteps.has(e.step))
        )
      })

      it('self-test: a planted mismatch (one expected exe override altered in memory) fails the comparison', async () => {
        const id =
          'knownFixLaunch--readknownfixlaunchoverrides-returns-launchargs-and-a-resolved-exeoverride'
        const c = cases.find((x) => x.id === id)
        if (!c) throw new Error(`${id} is missing from golden/launch_overrides`)
        const want = golden(id).result.steps[0]?.overrides
        const got = await runLaunchCase(c)
        const planted = JSON.parse(JSON.stringify(want)) as {
          exeOverride: string
        }
        expect(got.answers[0]).toEqual(planted)
        planted.exeOverride = `${planted.exeOverride}-planted`
        expect(got.answers[0]).not.toEqual(planted)
      })
    })

    describe('lastEnvOption against golden/overlay_install (88-14)', () => {
      const ID = 'knownFixOverlays--env-helpers-lastenvoption-last-match-wins'
      interface EnvStep {
        op: string
        options: Array<{ key: string; value: string }> | null
        key: string
        result: string | null
      }
      const steps = (): EnvStep[] =>
        (
          JSON.parse(
            readFileSync(
              join(
                goldenDir(CRATE, 'overlay_install'),
                'expected',
                ID,
                'result.json'
              ),
              'utf8'
            )
          ) as { steps: EnvStep[] }
        ).steps

      it('answers what the golden recorded, an absent options list included', () => {
        const recorded = steps()
        expect(recorded.length).toBeGreaterThanOrEqual(2)
        for (const s of recorded) {
          expect(s.op).toBe('lastEnvOption')
          expect(lastEnvOption(s.options ?? undefined, s.key) ?? null).toEqual(
            s.result
          )
        }
      })

      it('self-test: a planted mismatch (one expected value altered in memory) fails the comparison', () => {
        const first = steps()[0]
        if (!first) throw new Error('the golden has no first step')
        const got = lastEnvOption(first.options ?? undefined, first.key)
        expect(got).toEqual(first.result)
        expect(got).not.toEqual(`${first.result}-planted`)
      })
    })

    describe('buildOverlayTarGz and readOverlayTarGz against golden/overlay_archive (88-14)', () => {
      const SLICE = 'overlay_archive'
      const ARCHIVE_FLOOR = 25

      const sha256 = (data: Buffer): string =>
        createHash('sha256').update(data).digest('hex')
      const dataOf = (f: FileSpec): Buffer =>
        f.base64 !== undefined
          ? Buffer.from(f.base64, 'base64')
          : Buffer.from(f.text ?? '')
      /** The text after "bytes (" in a gunzip failure is the zlib build's own; the golden holds a token. */
      const normaliseMessage = (message: string): string =>
        message.startsWith('overlay archive: gunzip failed or exceeded')
          ? message.replace(/\([\s\S]*\)$/, '(<ZLIB-MESSAGE>)')
          : message
      const filesOf = (files: FileSpec[]) =>
        files.map((f) => ({ path: f.path, data: dataOf(f) }))
      const listOf = (map: Map<string, Buffer>) =>
        [...map].map(([path, data]) => ({
          path,
          size: data.length,
          sha256: sha256(data)
        }))

      async function runStep(
        s: ArchiveCase['steps'][number]
      ): Promise<Record<string, unknown>> {
        switch (s.op) {
          case 'build': {
            try {
              const out = buildOverlayTarGz(filesOf(s.files))
              const tar = gunzipSync(out)
              return {
                op: s.op,
                label: s.label ?? null,
                error: null,
                size: out.length,
                sha256: sha256(out),
                tarSize: tar.length,
                tarSha256: sha256(tar),
                base64: out.length < 64 * 1024 ? out.toString('base64') : null
              }
            } catch (error) {
              return {
                op: s.op,
                label: s.label ?? null,
                error: (error as Error).message
              }
            }
          }
          case 'buildPair': {
            const one = buildOverlayTarGz(filesOf(s.files))
            const two = buildOverlayTarGz([...filesOf(s.files)].reverse())
            return {
              op: s.op,
              identical: one.equals(two),
              size: one.length,
              sha256: sha256(one)
            }
          }
          case 'buildHeader': {
            const arc = buildOverlayTarGz(filesOf(s.files))
            const tar = gunzipSync(arc)
            const h = tar.subarray(0, 512)
            const cString = (start: number, len: number) => {
              const slice = h.subarray(start, start + len)
              const nul = slice.indexOf(0)
              return slice
                .subarray(0, nul === -1 ? len : nul)
                .toString('latin1')
            }
            return {
              op: s.op,
              gzipMtime: arc.readUInt32LE(4),
              gzipOsByte: arc[9],
              tarLengthModulo10240: tar.length % 10240,
              tarSize: tar.length,
              tarSha256: sha256(tar),
              firstEntry: {
                name: cString(0, 100),
                mode: cString(100, 8),
                uid: cString(108, 8),
                gid: cString(116, 8),
                size: cString(124, 12),
                mtime: cString(136, 12),
                checksum: h.subarray(148, 156).toString('latin1'),
                typeflag: h.subarray(156, 157).toString('latin1'),
                linkname: cString(157, 100),
                magic: h.subarray(257, 263).toString('latin1'),
                version: h.subarray(263, 265).toString('latin1'),
                unameAndGnameAreZero: h
                  .subarray(265, 329)
                  .every((b) => b === 0),
                prefixIsZero: h.subarray(345, 500).every((b) => b === 0)
              }
            }
          }
          case 'roundTrip': {
            const files = filesOf(s.files)
            const out = await readOverlayTarGz(
              buildOverlayTarGz(files),
              new Map(Object.entries(s.expected)),
              s.cap
            )
            return {
              op: s.op,
              files: listOf(out),
              byteExact: files.every(
                (f) => out.get(f.path)?.equals(f.data) === true
              )
            }
          }
          case 'read': {
            try {
              const out = await readOverlayTarGz(
                Buffer.from(s.archiveBase64, 'base64'),
                new Map(Object.entries(s.expected)),
                s.cap
              )
              return { op: s.op, label: s.label, ok: true, files: listOf(out) }
            } catch (error) {
              return {
                op: s.op,
                label: s.label,
                ok: false,
                message: normaliseMessage((error as Error).message)
              }
            }
          }
        }
      }

      const runCase = async (c: ArchiveCase): Promise<unknown> => {
        const steps: Array<Record<string, unknown>> = []
        for (const s of c.steps) steps.push(await runStep(s))
        return { steps }
      }
      const golden = (id: string): { steps: Array<Record<string, unknown>> } =>
        JSON.parse(
          readFileSync(
            join(goldenDir(CRATE, SLICE), 'expected', id, 'result.json'),
            'utf8'
          )
        )

      const cases = loadCases<ArchiveCase>(CRATE, SLICE)

      it('visits every recorded case, and every step kind is among them', () => {
        expect(cases.length).toBeGreaterThanOrEqual(ARCHIVE_FLOOR)
        const ops = new Set(cases.flatMap((c) => c.steps.map((s) => s.op)))
        expect([...ops].sort()).toEqual([
          'build',
          'buildHeader',
          'buildPair',
          'read',
          'roundTrip'
        ])
      })

      it.each(cases)('$id', async (c) => {
        expect(await runCase(c)).toEqual(golden(c.id))
      })

      it('self-test: a planted mismatch (one expected digest altered in memory) fails the comparison', async () => {
        const id = 'build-three-files-sorted-by-bytes'
        const c = cases.find((x) => x.id === id)
        if (!c) throw new Error(`${id} is missing from golden/overlay_archive`)
        const want = golden(id)
        expect(await runCase(c)).toEqual(want)
        const planted = JSON.parse(JSON.stringify(want)) as typeof want
        const first = planted.steps[0]
        if (!first) throw new Error('the golden has no first step')
        first['sha256'] = `${String(first['sha256'])}-planted`
        expect(await runCase(c)).not.toEqual(planted)
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
          const settings = s.settings as GameSettings
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
        const out = withKnownFixEnv(s.settings as GameSettings, s.env ?? {})
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
