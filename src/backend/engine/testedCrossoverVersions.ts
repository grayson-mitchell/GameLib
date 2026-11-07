/**
 * Tested-CrossOver-builds record (phase 59, D-15). Warns, never blocks: every
 * export returns a boolean, string or null. Separate from NTDLL_PATCH_ROWS,
 * which additionally needs an ntdll hash.
 *
 * Nothing runs at import.
 */
import { defaultRunTool } from './runTool'
import type { RunTool } from './runTool'

type TestedCrossoverRow = { build: string; testedIn: string }

// Keyed by CFBundleVersion, which equals the bottle conf `Version`.
const TESTED_CROSSOVER_BUILDS: Readonly<Record<string, TestedCrossoverRow>> = {
  '26.3.0.39832': {
    build: '26.3.0.39832',
    testedIn: 'Phases 53/56 and spikes 056-060'
  }
}

const BUILD_RE = /^\d+\.\d+\.\d+\.\d+$/
const CX_BIN_SUFFIX = '/Contents/SharedSupport/CrossOver/bin'
const MAX_DISMISSED = 50

export function isTestedCrossover(build: string | null): boolean {
  if (build === null) return false
  return Object.prototype.hasOwnProperty.call(TESTED_CROSSOVER_BUILDS, build)
}

export function testedCrossoverBuilds(): string[] {
  return Object.keys(TESTED_CROSSOVER_BUILDS).sort()
}

export function untestedCrossoverLogLine(build: string | null): string | null {
  if (build === null) {
    return 'SteamEngine: CrossOver build could not be read; treating it as untested'
  }
  if (isTestedCrossover(build)) return null
  return `SteamEngine: CrossOver build ${build} is untested with GameLib; please report issues`
}

export type EngineNoticeStore = {
  get(key: string, fallback: unknown): unknown
  set(key: string, value: unknown): void
}

const UNTESTED_DISMISSED_KEY = 'dismissedUntestedCrossoverBuilds'

function readDismissed(store: EngineNoticeStore): string[] {
  const v = store.get(UNTESTED_DISMISSED_KEY, [])
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

export function shouldShowUntestedNotice(
  build: string | null,
  store: EngineNoticeStore
): boolean {
  if (build === null || isTestedCrossover(build)) return false
  return !readDismissed(store).includes(build)
}

export function dismissUntestedNotice(
  build: string,
  store: EngineNoticeStore
): boolean {
  if (!BUILD_RE.test(build)) return false
  const list = readDismissed(store)
  if (!list.includes(build)) list.push(build)
  store.set(UNTESTED_DISMISSED_KEY, list.slice(-MAX_DISMISSED))
  return true
}

export async function readCrossoverBuild(
  binDir: string,
  runTool: RunTool = defaultRunTool
): Promise<string | null> {
  if (!binDir.endsWith(CX_BIN_SUFFIX)) return null
  const appPath = binDir.slice(0, -CX_BIN_SUFFIX.length)
  if (!appPath.endsWith('.app')) return null
  const res = await runTool(
    '/usr/bin/plutil',
    [
      '-extract',
      'CFBundleVersion',
      'raw',
      '-o',
      '-',
      `${appPath}/Contents/Info.plist`
    ],
    { timeoutMs: 15_000 }
  )
  if (res.code !== 0 || res.timedOut) return null
  const out = res.stdout.trim()
  return BUILD_RE.test(out) ? out : null
}
