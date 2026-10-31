/**
 * Engine decision layer (phase 59: D-07, D-09, D-14).
 *
 * Decides, per launch and per bottle creation, which engine runs a bridge
 * title. Stateless on purpose (D-07): CrossOver is probed afresh on every call
 * and nothing is stored here, so a title returns to CrossOver on the first
 * launch after CrossOver becomes healthy.
 *
 * Nothing runs at import; heavy collaborators are reached through injectable
 * deps whose defaults are built lazily inside each function.
 */
import { accessSync, constants as fsConstants, existsSync } from 'fs'
import { dirname, isAbsolute, join, relative } from 'path'
import { toolsPath } from 'backend/constants/paths'
import { logWarning, LogPrefix } from 'backend/logger'
import type { SteamEngineOption } from 'common/types/steam'
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
  readBuild(binDir: string): Promise<string | null>
  killCrossoverWineserver(bottleName: string, binDir: string): Promise<void>
  readOverride(appId: string): unknown
  listReadyBridgeBottleNames(): string[]
  wineManagerReleases(): WineManagerRelease[]
  isPinInstalled(pin: EnginePin): boolean
  pins: Readonly<{ current: EnginePin; previous: EnginePin | null }>
  fileExists(path: string): boolean
  wineManagerRoot: string
}

// ts-prune-ignore-next
export function defaultEngineDecisionDeps(): EngineDecisionDeps {
  return {
    async resolveCrossoverBinDir() {
      const { resolveCrossoverBinDirAsync } =
        await import('../crossoverLocation')
      const { persistedWineBins } = await import('../bottle')
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
      const { killBottleWineServerWith } = await import('../bottle')
      await killBottleWineServerWith(
        bottleName,
        join(binDir, 'wineserver'),
        { CX_ROOT: dirname(binDir) },
        15_000
      )
    },
    readOverride(appId) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GameConfig } = require('backend/game_config') as {
        GameConfig: {
          get(id: string): { config?: { steamEngineOverride?: unknown } }
        }
      }
      return GameConfig.get(appId).config?.steamEngineOverride
    },
    listReadyBridgeBottleNames() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bottle = require('../bottle') as typeof import('../bottle')
      return bottle.listReadyBridgeBottleNames()
    },
    wineManagerReleases() {
      const { wineDownloaderInfoStore } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('backend/wine/manager/electronStores') as typeof import('backend/wine/manager/electronStores')
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

export async function preflightCrossover(
  bottleName: string,
  deps?: Partial<EngineDecisionDeps>
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
  const [build, probe] = await Promise.all([
    d.readBuild(binDir).catch(() => null),
    d.probe({
      binDir,
      bottleName,
      baseEnv: d.probeEnv,
      timeoutMs: d.probeTimeoutMs
    })
  ])
  if (probe.kind === 'failed') {
    if (probe.reason === 'timeout') {
      try {
        await d.killCrossoverWineserver(bottleName, binDir)
      } catch (e) {
        logWarning(
          `SteamEngine: could not stop wineserver after probe timeout: ${String(e)}`,
          LogPrefix.Steam
        )
      }
    }
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

  const preflight = await preflightCrossover(args.bottleName, d)

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
  const binDir = await d.resolveCrossoverBinDir()
  if (binDir === undefined) return { kind: 'pinned', reason: 'cx-missing', pin }
  const ready = d.listReadyBridgeBottleNames()[0]
  if (ready === undefined) {
    // No bottle to run --demo-status against; rely on the create cap.
    return {
      kind: 'crossover',
      createTimeoutMs: CX_CREATE_CAP_MS,
      probed: false,
      build: await d.readBuild(binDir).catch(() => null)
    }
  }
  const pf = await preflightCrossover(ready, d)
  if (pf.kind === 'missing')
    return { kind: 'pinned', reason: 'cx-missing', pin }
  if (pf.kind === 'expired')
    return { kind: 'pinned', reason: 'cx-expired', pin }
  if (pf.kind === 'broken') return { kind: 'pinned', reason: 'cx-broken', pin }
  void args
  return {
    kind: 'crossover',
    createTimeoutMs: CX_CREATE_CAP_MS,
    probed: true,
    build: pf.build
  }
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
