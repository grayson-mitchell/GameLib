/**
 * Engine decision layer (phase 59: D-07, D-09, D-14).
 *
 * Decides, per launch and per bottle creation, which engine runs a bridge
 * title. Stateless on purpose (D-07): CrossOver is probed afresh on every call
 * and nothing is stored here, so a title returns to CrossOver on the first
 * launch after CrossOver becomes healthy. A --demo-status timeout is retried
 * once within the same preflight; only two timeouts in a row count as broken.
 *
 * Nothing runs at import; heavy collaborators are reached through injectable
 * deps whose defaults are built lazily inside each function.
 */
import { accessSync, constants as fsConstants, existsSync } from 'fs'
import { dirname, isAbsolute, join, relative } from 'path'
import { toolsPath } from 'backend/constants/paths'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamEngineOption } from 'common/types/steam'
import { readStoredTitleConfig } from 'backend/storeManagers/steam/titleSettings'
import { probeDemoStatus } from './demoStatus'
import type { DemoStatusProbe } from './demoStatus'
import { ENGINE_PINS } from './enginePins'
import type { EnginePin } from './enginePins'
import { parseEngineOverride } from './engineIds'
import type { EngineOverrideId } from './engineIds'
import { engineLogLabel } from './engineTypes'
import type {
  EngineSelection,
  FallbackReason,
  NonCrossoverEngine
} from './engineTypes'
import { isPinnedEngineInstalled, pinnedEnginePaths } from './fallbackEngine'
import {
  readCrossoverBuild,
  untestedCrossoverLogLine
} from './testedCrossoverVersions'

/** Bounds the D-12 create-under-expiry case; a normal cxbottle create is well under a minute. */
export const CX_CREATE_CAP_MS = 120_000

/**
 * A --demo-status timeout, nonzero exit or spawn error must be corroborated
 * before CrossOver counts as broken (todo 2026-11-01 demo-status-probe-timeout;
 * G29: one nonzero exit 3 s after an overlay-clone session demoted a healthy
 * CrossOver). D-09 as amended 2026-11-03: broken only when seen on two
 * consecutive attempts; the budget is two probes in total across failure
 * kinds. D-07: the corroboration lives inside one preflight call; nothing is
 * stored between launches.
 */
const PROBE_ATTEMPTS = 2

/** Settle wait before a retry after a nonzero exit or spawn error (G29). */
const RETRY_SETTLE_MS = 2000

export type CrossoverPreflight =
  | {
      kind: 'healthy'
      binDir: string
      build: string | null
      trialDaysRemaining: number | null
    }
  | { kind: 'expired'; binDir: string; build: string | null; daysAgo: number }
  | {
      kind: 'broken'
      binDir: string | null
      build: string | null
      detail: string
      /** A page read timed out without a retry; says nothing certain about CrossOver. */
      inconclusive?: boolean
    }
  | { kind: 'missing'; detail: string }

export type LaunchDecision =
  | {
      kind: 'use'
      selection: EngineSelection
      preflight: CrossoverPreflight | null
      pin: EnginePin | null
      needsDownload: boolean
      override: EngineOverrideId
      logLines: string[]
    }
  | { kind: 'unavailable'; override: EngineOverrideId; detail: string }

export type CreationDecision =
  | {
      kind: 'crossover'
      createTimeoutMs: number
      probed: boolean
      build: string | null
    }
  | { kind: 'pinned'; reason: FallbackReason; pin: EnginePin }

export interface WineManagerRelease {
  version: string
  type: string
  isInstalled: boolean
  installDir: string
}

export interface EngineDecisionDeps {
  resolveCrossoverBinDir(): Promise<string | undefined>
  isExecutable(path: string): boolean
  probe(args: {
    binDir: string
    bottleName: string
    timeoutMs?: number
    baseEnv?: NodeJS.ProcessEnv
  }): Promise<DemoStatusProbe>
  /** Env passed to the probe; undefined means the real process env (real-profile arm). */
  probeEnv?: NodeJS.ProcessEnv
  probeTimeoutMs?: number
  /** Wait before a transient-failure retry; default 2000 ms. */
  retrySettleMs?: number
  readBuild(binDir: string): Promise<string | null>
  killCrossoverWineserver(bottleName: string, binDir: string): Promise<void>
  readOverride(appId: string): unknown
  /** Process-monitor phase for a title; non-null means a game is running or starting. */
  monitorPhase(appId: string): 'starting' | 'running' | null
  wineManagerReleases(): WineManagerRelease[]
  isPinInstalled(pin: EnginePin): boolean
  pins: Readonly<{ current: EnginePin; previous: EnginePin | null }>
  fileExists(path: string): boolean
  wineManagerRoot: string
}

export function defaultEngineDecisionDeps(): EngineDecisionDeps {
  return {
    async resolveCrossoverBinDir() {
      const { resolveCrossoverBinDirAsync } =
        await import('backend/engine/crossoverLocation')
      const { persistedWineBins } =
        await import('backend/storeManagers/steam/bottle')
      return resolveCrossoverBinDirAsync({ hintWineBins: persistedWineBins() })
    },
    isExecutable(path) {
      try {
        accessSync(path, fsConstants.X_OK)
        return true
      } catch {
        return false
      }
    },
    probe: probeDemoStatus,
    readBuild: (binDir) => readCrossoverBuild(binDir),
    async killCrossoverWineserver(bottleName, binDir) {
      const { killBottleWineServerWith } = await import('./bottlePrimitives')
      await killBottleWineServerWith(
        bottleName,
        join(binDir, 'wineserver'),
        { CX_ROOT: dirname(binDir) },
        15_000
      )
    },
    readOverride: readStoredEngineOverride,
    monitorPhase(appId) {
      const { getBottleProcessMonitorPhase } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('backend/storeManagers/steam/bottleProcessMonitor') as typeof import('backend/storeManagers/steam/bottleProcessMonitor')
      return getBottleProcessMonitorPhase(appId)
    },
    wineManagerReleases() {
      const { wineDownloaderInfoStore } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('backend/wine/manager/stores') as typeof import('backend/wine/manager/stores')
      return wineDownloaderInfoStore.get(
        'wine-releases',
        []
      ) as unknown as WineManagerRelease[]
    },
    isPinInstalled: isPinnedEngineInstalled,
    pins: ENGINE_PINS,
    fileExists: existsSync,
    wineManagerRoot: join(toolsPath, 'wine')
  }
}

function withDefaults(deps?: Partial<EngineDecisionDeps>): EngineDecisionDeps {
  return { ...defaultEngineDecisionDeps(), ...deps }
}

/** The CrossOver bin dir the engine layer resolves (persisted wine bins as hint). */
export async function resolveCrossoverBinDirForEngine(): Promise<
  string | undefined
> {
  return defaultEngineDecisionDeps().resolveCrossoverBinDir()
}

/**
 * G25: true when CrossOver is not installed. Mirrors the two 'missing' branches
 * at the top of preflightCrossover without the probe, so it is safe to call
 * before the D-09 pre-flight. An error is "unknown", which must never produce a
 * refusal, so it reports false.
 */
export async function isCrossoverMissing(
  deps?: Partial<EngineDecisionDeps>
): Promise<boolean> {
  try {
    const d = withDefaults(deps)
    const binDir = await d.resolveCrossoverBinDir()
    if (binDir === undefined) return true
    return !d.fileExists(join(binDir, 'wine'))
  } catch {
    return false
  }
}

export async function preflightCrossover(
  bottleName: string,
  deps?: Partial<EngineDecisionDeps>,
  opts?: { killOnTimeout?: boolean; appId?: string }
): Promise<CrossoverPreflight> {
  const d = withDefaults(deps)
  const binDir = await d.resolveCrossoverBinDir()
  if (binDir === undefined) {
    return { kind: 'missing', detail: 'CrossOver is not installed' }
  }
  const wineBin = join(binDir, 'wine')
  if (!d.fileExists(wineBin)) {
    return { kind: 'missing', detail: 'CrossOver bin/wine is missing' }
  }
  if (!d.isExecutable(wineBin)) {
    return {
      kind: 'broken',
      binDir,
      build: null,
      detail: 'CrossOver bin/wine is not executable'
    }
  }
  const runProbe = () =>
    d.probe({
      binDir,
      bottleName,
      baseEnv: d.probeEnv,
      timeoutMs: d.probeTimeoutMs
    })
  const stopWineserver = async () => {
    try {
      await d.killCrossoverWineserver(bottleName, binDir)
    } catch (e) {
      logWarning(
        `SteamEngine: could not stop wineserver after a failed probe: ${String(e)}`,
        LogPrefix.Steam
      )
    }
  }
  const [build, firstProbe] = await Promise.all([
    d.readBuild(binDir).catch(() => null),
    runProbe()
  ])
  let probe = firstProbe
  // 59-REVIEW WR-07: never stop a wineserver for a display read, or while a
  // game of this title is running or starting.
  const noKillReason =
    opts?.killOnTimeout === false
      ? 'page read'
      : opts?.appId !== undefined && d.monitorPhase(opts.appId) !== null
        ? 'game running'
        : null
  const settle = (ms: number) =>
    ms > 0
      ? new Promise<void>((resolve) => {
          const t = setTimeout(resolve, ms)
          ;(t as { unref?: () => void }).unref?.()
        })
      : Promise.resolve()
  const settleMs = d.retrySettleMs ?? RETRY_SETTLE_MS
  // A single timeout, nonzero exit or spawn error is inconclusive: stop the
  // wineserver (when allowed), settle, and probe again (G29).
  for (
    let attempt = 1;
    probe.kind === 'failed' &&
    (probe.reason === 'timeout' ||
      probe.reason === 'nonzero-exit' ||
      probe.reason === 'spawn-error');
    attempt++
  ) {
    const isTimeout = probe.reason === 'timeout'
    if (isTimeout && noKillReason !== null) {
      return {
        kind: 'broken',
        binDir,
        build,
        inconclusive: true,
        detail: `--demo-status timeout (not retried: ${noKillReason}): ${probe.detail}`
      }
    }
    const last = attempt >= PROBE_ATTEMPTS
    if (isTimeout) {
      await stopWineserver()
    } else if (!last && noKillReason === null) {
      await stopWineserver()
    }
    if (last) {
      return {
        kind: 'broken',
        binDir,
        build,
        detail: `--demo-status ${probe.reason} on ${PROBE_ATTEMPTS} consecutive attempts: ${probe.detail}`
      }
    }
    logWarning(
      `SteamEngine: --demo-status ${probe.reason} for bottle ${bottleName.slice(0, 64)} (attempt ${attempt}/${PROBE_ATTEMPTS}); inconclusive, retrying once`,
      LogPrefix.Steam
    )
    await settle(settleMs)
    probe = await runProbe()
  }
  if (probe.kind === 'failed') {
    return {
      kind: 'broken',
      binDir,
      build,
      detail: `--demo-status ${probe.reason}: ${probe.detail}`
    }
  }
  const s = probe.status
  if (s.kind === 'licensed') {
    return { kind: 'healthy', binDir, build, trialDaysRemaining: null }
  }
  if (s.kind === 'trial') {
    return {
      kind: 'healthy',
      binDir,
      build,
      trialDaysRemaining: s.daysRemaining
    }
  }
  if (s.kind === 'expired') {
    return { kind: 'expired', binDir, build, daysAgo: s.daysAgo }
  }
  return {
    kind: 'broken',
    binDir,
    build,
    detail: '--demo-status output was not recognised'
  }
}

export function resolveWineManagerStaging(
  version: string,
  deps?: Partial<EngineDecisionDeps>
): NonCrossoverEngine | null {
  const d = withDefaults(deps)
  if (version.endsWith('-DXMT')) return null
  const rel = d
    .wineManagerReleases()
    .find(
      (r) =>
        r.type === 'Wine-Staging-macOS' &&
        r.isInstalled &&
        r.version === version &&
        typeof r.installDir === 'string'
    )
  if (!rel) return null
  const binDir = join(rel.installDir, 'Contents', 'Resources', 'wine', 'bin')
  const wineBin = join(binDir, 'wine')
  const wineserverBin = join(binDir, 'wineserver')
  if (!d.fileExists(wineBin) || !d.fileExists(wineserverBin)) return null
  const rp = relative(d.wineManagerRoot, wineBin)
  if (rp === '' || rp.startsWith('..') || isAbsolute(rp)) return null
  return {
    wineBin,
    wineserverBin,
    label: `Wine Manager: ${version}`,
    version,
    dxvk: null
  }
}

function pinnedSelection(
  pin: EnginePin,
  reason: FallbackReason | 'override'
): EngineSelection {
  const p = pinnedEnginePaths(pin)
  return {
    kind: 'pinned',
    pinId: pin.id,
    reason,
    wineBin: p.wineBin,
    wineserverBin: p.wineserverBin,
    label: pin.label,
    version: pin.wine.version,
    dxvk: { dir: p.dxvkDir, version: pin.dxvk.version }
  }
}

/**
 * 59-UAT G11: the title's stored override, read straight from its GameConfig
 * file. `GameConfig.get(id).config` is filled asynchronously after
 * construction, so the first read after a restart saw undefined and the
 * launch silently ran Automatic (file-read rationale: titleSettings.ts).
 * Unvalidated: callers pass the value through parseEngineOverride.
 */
export function readStoredEngineOverride(appId: string): unknown {
  return readStoredTitleConfig(appId)?.steamEngineOverride
}

export async function decideLaunchEngine(
  args: { appId: string; bottleName: string },
  deps?: Partial<EngineDecisionDeps>
): Promise<LaunchDecision> {
  const d = withDefaults(deps)
  const override = parseEngineOverride(d.readOverride(args.appId))
  const logLines: string[] = []
  const finish = (
    selection: EngineSelection,
    preflight: CrossoverPreflight | null,
    pin: EnginePin | null,
    needsDownload: boolean
  ): LaunchDecision => {
    logLines.unshift(engineLogLabel(selection))
    const build =
      preflight && 'build' in preflight ? (preflight.build ?? null) : null
    if (preflight && preflight.kind !== 'missing') {
      const line = untestedCrossoverLogLine(build)
      if (line) logLines.push(line)
    }
    return {
      kind: 'use',
      selection,
      preflight,
      pin,
      needsDownload,
      override,
      logLines
    }
  }

  if (override.startsWith('pinned:')) {
    const id = override.slice('pinned:'.length)
    const pin = [d.pins.current, d.pins.previous].find((p) => p?.id === id)
    if (!pin) {
      return {
        kind: 'unavailable',
        override,
        detail: `pinned engine ${id} is not available`
      }
    }
    return finish(
      pinnedSelection(pin, 'override'),
      null,
      pin,
      !d.isPinInstalled(pin)
    )
  }

  if (override.startsWith('wine-manager:')) {
    const version = override.slice('wine-manager:'.length)
    const wm = resolveWineManagerStaging(version, d)
    if (!wm) {
      return {
        kind: 'unavailable',
        override,
        detail: `Wine Manager build ${version} is not installed`
      }
    }
    const cur = d.pins.current
    let dxvk: NonCrossoverEngine['dxvk'] = null
    if (d.isPinInstalled(cur)) {
      dxvk = {
        dir: pinnedEnginePaths(cur).dxvkDir,
        version: cur.dxvk.version
      }
    } else {
      logLines.push(
        'SteamEngine: built-in DXVK is not installed; running the Wine Manager build without DXVK'
      )
    }
    return finish(
      {
        kind: 'wine-manager',
        managerVersion: version,
        reason: 'override',
        ...wm,
        dxvk
      },
      null,
      null,
      false
    )
  }

  const preflight = await preflightCrossover(args.bottleName, d, {
    killOnTimeout: true,
    appId: args.appId
  })

  if (override === 'crossover') {
    if (preflight.kind === 'missing' || preflight.kind === 'broken') {
      return {
        kind: 'unavailable',
        override,
        detail: `CrossOver override is not usable: ${preflight.detail}`
      }
    }
    return finish(
      {
        kind: 'crossover',
        reason: 'override',
        crossoverBuild: preflight.build,
        binDir: preflight.binDir
      },
      preflight,
      null,
      false
    )
  }

  if (preflight.kind === 'healthy') {
    return finish(
      {
        kind: 'crossover',
        reason: 'cx-healthy',
        crossoverBuild: preflight.build,
        binDir: preflight.binDir
      },
      preflight,
      null,
      false
    )
  }
  const reason: FallbackReason =
    preflight.kind === 'missing'
      ? 'cx-missing'
      : preflight.kind === 'expired'
        ? 'cx-expired'
        : 'cx-broken'
  const pin = d.pins.current
  return finish(
    pinnedSelection(pin, reason),
    preflight,
    pin,
    !d.isPinInstalled(pin)
  )
}

export async function decideCreationEngine(
  args: { appId: string },
  deps?: Partial<EngineDecisionDeps>
): Promise<CreationDecision> {
  const d = withDefaults(deps)
  const pin = d.pins.current
  // 59-REVIEW WR-03: presence check only. --demo-status against another
  // title's bottle read that bottle's trial clock, not this one's.
  const decide = async (): Promise<CreationDecision> => {
    const binDir = await d.resolveCrossoverBinDir()
    if (binDir === undefined)
      return { kind: 'pinned', reason: 'cx-missing', pin }
    const wineBin = join(binDir, 'wine')
    if (!d.fileExists(wineBin))
      return { kind: 'pinned', reason: 'cx-missing', pin }
    if (!d.isExecutable(wineBin))
      return { kind: 'pinned', reason: 'cx-broken', pin }
    return {
      kind: 'crossover',
      createTimeoutMs: CX_CREATE_CAP_MS,
      probed: false,
      build: await d.readBuild(binDir).catch(() => null)
    }
  }
  const decision = await decide()
  logInfo(
    `SteamEngine: appId ${args.appId} bottle creation engine ${decision.kind} (presence check only; a CrossOver create failure falls back, 59-REVIEW WR-02/WR-03)`,
    LogPrefix.Steam
  )
  return decision
}

export async function listEngineOverrideOptions(
  deps?: Partial<EngineDecisionDeps>
): Promise<SteamEngineOption[]> {
  const d = withDefaults(deps)
  const out: SteamEngineOption[] = [
    {
      id: 'automatic',
      kind: 'automatic',
      label: 'Automatic',
      available: true,
      installed: true,
      isPreviousPin: false
    }
  ]
  const binDir = await d.resolveCrossoverBinDir()
  out.push({
    id: 'crossover',
    kind: 'crossover',
    label: 'CrossOver',
    available: binDir !== undefined,
    installed: binDir !== undefined,
    isPreviousPin: false
  })
  const pins: Array<[EnginePin, boolean]> = [[d.pins.current, false]]
  if (d.pins.previous) pins.push([d.pins.previous, true])
  for (const [pin, isPrev] of pins) {
    const installed = d.isPinInstalled(pin)
    out.push({
      id: `pinned:${pin.id}`,
      kind: 'pinned',
      label: pin.label,
      available: true,
      installed,
      isPreviousPin: isPrev
    })
  }
  for (const r of d.wineManagerReleases()) {
    if (r.type !== 'Wine-Staging-macOS' || !r.isInstalled) continue
    if (/-DXMT$|gptk|toolkit/i.test(r.version)) continue
    if (parseEngineOverride(`wine-manager:${r.version}`) === 'automatic')
      continue
    out.push({
      id: `wine-manager:${r.version}`,
      kind: 'wine-manager',
      label: `Wine Manager: ${r.version}`,
      available: true,
      installed: true,
      isPreviousPin: false
    })
  }
  return out
}
