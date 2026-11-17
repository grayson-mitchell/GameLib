/**
 * quick 261117-q1t (reworks p38): the "Launch without Steam" per-game setting verdict.
 *
 * Steam DRM (a PE SteamStub wrapper, CEG markers, a curated `drm: "ceg"` known fix) is the
 * only probe result that makes the setting not apply. A Steam-API game, or one the probes
 * could not read, still applies, carrying a warning the renderer shows (it may quit, run
 * without Steam features, or reopen Steam).
 *
 * The decision is pure over injected probes (the real ones live in
 * directLaunchProbes.ts), so it is unit-testable without a filesystem or Rust.
 * Verdicts are cached per appId and keyed on buildid + install path + install
 * kind. Detection only reads; nothing here writes or emulates steam_api.
 */
import type {
  SteamDirectLaunchUnavailableReason,
  SteamDirectLaunchView,
  SteamDirectLaunchWarning
} from 'common/types/steam'

/** The ProcessRunner track label a Mac-native direct launch is spawned and stopped with. */
export const STEAM_DIRECT_TRACK_RUNNER = 'steam-direct'

export type DirectLaunchKind = 'mac-native' | 'bridge'

export interface DirectLaunchPlan {
  binaryPath?: string
  args: string[]
  workingDir?: string
}

type VerdictUnavailableReason = Exclude<
  SteamDirectLaunchUnavailableReason,
  'error'
>

export type DirectLaunchVerdict =
  | {
      applies: true
      kind: DirectLaunchKind
      warning: SteamDirectLaunchWarning
      launch: DirectLaunchPlan
    }
  | { applies: false; reason: VerdictUnavailableReason }

export interface LaunchEntry {
  executable: string
  arguments: string
  workingdir?: string
}

export interface DirectLaunchProbes {
  knownFixCeg(): boolean
  // mac-native
  readLaunchEntry(os: 'macos' | 'windows'): Promise<LaunchEntry | undefined>
  locateMacBinary(installPath: string, executable?: string): string | null
  macSteamApiFiles(installPath: string): Promise<string[]>
  macLinks(binaryPath: string): Promise<'links' | 'clean' | 'unreadable'>
  macRunnable(binaryPath: string): Promise<'yes' | 'no' | 'unreadable'>
  // bridge
  resolveBridgeExe(): Promise<string | undefined>
  peDrm(exePath: string): Promise<'steamstub' | 'ceg' | 'none' | undefined>
  peImports(exePath: string): Promise<'none' | 'steam-api' | 'error'>
  peSteamApiDlls(exePath: string): Promise<number>
}

interface VerdictStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface DirectLaunchDeps {
  store: VerdictStore
  probes: DirectLaunchProbes
  now(): number
  warn?(message: string): void
  info?(message: string): void
}

export interface DirectLaunchInput {
  appId: string
  host: NodeJS.Platform
  kind: DirectLaunchKind | null
  installPath?: string
  buildid: string
}

export function toView(verdict: DirectLaunchVerdict): SteamDirectLaunchView {
  return verdict.applies
    ? { applies: true, kind: verdict.kind, warning: verdict.warning }
    : { applies: false, reason: verdict.reason }
}

/** Whitespace split that honours double quotes. No shell semantics. */
export function splitLaunchArguments(raw: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  let has = false
  for (const ch of raw) {
    if (ch === '"') {
      inQuote = !inQuote
      has = true
    } else if (!inQuote && /\s/.test(ch)) {
      if (has) out.push(cur)
      cur = ''
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (has) out.push(cur)
  return out
}

// Host/route/install reasons are never computed here; 'unknown' warnings are not cached.
const no = (reason: VerdictUnavailableReason): DirectLaunchVerdict => ({
  applies: false,
  reason
})

async function computeMacNative(
  probes: DirectLaunchProbes,
  installPath: string
): Promise<DirectLaunchVerdict> {
  if (probes.knownFixCeg()) return no('steam-drm')
  const entry = await probes.readLaunchEntry('macos')
  const binaryPath = probes.locateMacBinary(installPath, entry?.executable)
  const args = splitLaunchArguments(entry?.arguments ?? '')
  const workingDir = entry?.workingdir ? { workingDir: entry.workingdir } : {}
  if (!binaryPath) {
    return {
      applies: true,
      kind: 'mac-native',
      warning: 'unknown',
      launch: { args, ...workingDir }
    }
  }
  // A binary this Mac cannot execute (i386/PPC only) can't be launched directly at all.
  if ((await probes.macRunnable(binaryPath)) === 'no') {
    return no('mac-arch-unsupported')
  }
  let warning: SteamDirectLaunchWarning = 'none'
  const files = await probes.macSteamApiFiles(installPath)
  if (files.length > 0) warning = 'steam-api'
  else {
    const links = await probes.macLinks(binaryPath)
    if (links === 'links') warning = 'steam-api'
    else if (links === 'unreadable') warning = 'unknown'
  }
  return {
    applies: true,
    kind: 'mac-native',
    warning,
    launch: { binaryPath, args, ...workingDir }
  }
}

async function computeBridge(
  probes: DirectLaunchProbes
): Promise<DirectLaunchVerdict> {
  if (probes.knownFixCeg()) return no('steam-drm')
  const entry = await probes.readLaunchEntry('windows')
  const launch = { args: splitLaunchArguments(entry?.arguments ?? '') }
  const yes = (warning: SteamDirectLaunchWarning): DirectLaunchVerdict => ({
    applies: true,
    kind: 'bridge',
    warning,
    launch
  })
  const exe = await probes.resolveBridgeExe()
  if (!exe) return yes('unknown')
  const drm = await probes.peDrm(exe)
  if (drm === undefined) return yes('unknown')
  if (drm !== 'none') return no('steam-drm')
  const imports = await probes.peImports(exe)
  if (imports === 'error') return yes('unknown')
  if (imports === 'steam-api') return yes('steam-api')
  if ((await probes.peSteamApiDlls(exe)) > 0) return yes('steam-api')
  return yes('none')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// v3: libsteam_api.bundle detection (WazHack); v2 records may wrongly say 'none'.
// v4: runnable-arch check (Legends of Aethereus, i386); v3 records may wrongly apply.
const CACHE_VERSION = 4

function readCached(
  deps: DirectLaunchDeps,
  input: DirectLaunchInput,
  installPath: string,
  kind: DirectLaunchKind
): DirectLaunchVerdict | undefined {
  try {
    const rec = deps.store.get(input.appId)
    if (!isRecord(rec) || rec.v !== CACHE_VERSION) return undefined
    if (
      rec.kind !== kind ||
      rec.installPath !== installPath ||
      rec.buildid !== input.buildid
    ) {
      return undefined
    }
    const v = rec.verdict
    if (!isRecord(v) || typeof v.applies !== 'boolean') return undefined
    if (v.applies) {
      if (v.warning !== 'none' && v.warning !== 'steam-api') {
        return undefined
      }
      const launch = v.launch
      if (v.kind !== kind || !isRecord(launch) || !Array.isArray(launch.args)) {
        return undefined
      }
      if (!launch.args.every((a) => typeof a === 'string')) return undefined
      if (
        launch.binaryPath !== undefined &&
        typeof launch.binaryPath !== 'string'
      ) {
        return undefined
      }
      if (
        launch.workingDir !== undefined &&
        typeof launch.workingDir !== 'string'
      ) {
        return undefined
      }
      return v as unknown as DirectLaunchVerdict
    }
    return v.reason === 'steam-drm'
      ? (v as unknown as DirectLaunchVerdict)
      : undefined
  } catch {
    return undefined
  }
}

export async function getDirectLaunchVerdict(
  deps: DirectLaunchDeps,
  input: DirectLaunchInput
): Promise<DirectLaunchVerdict> {
  if (input.host !== 'darwin') return no('host-unsupported')
  if (input.kind === null) return no('route-unsupported')
  if (!input.installPath) return no('not-installed')
  const { kind, installPath } = input

  const cached = readCached(deps, input, installPath, kind)
  if (cached) return cached

  let verdict: DirectLaunchVerdict
  try {
    verdict =
      kind === 'mac-native'
        ? await computeMacNative(deps.probes, installPath)
        : await computeBridge(deps.probes)
  } catch (err) {
    deps.warn?.(
      `direct-launch verdict for appId ${input.appId} failed: ${String(err)}`
    )
    verdict = {
      applies: true,
      kind,
      warning: 'unknown',
      launch: { args: [] }
    }
  }

  deps.info?.(
    `direct-launch verdict for appId ${input.appId} recomputed (${kind}, buildid ${input.buildid || 'unknown'}): ${verdict.applies ? `applies (warning ${verdict.warning})` : verdict.reason}`
  )

  if (
    input.buildid !== '' &&
    (!verdict.applies || verdict.warning !== 'unknown')
  ) {
    try {
      deps.store.set(input.appId, {
        v: CACHE_VERSION,
        kind,
        installPath,
        buildid: input.buildid,
        verdict,
        computedAt: deps.now()
      })
    } catch (err) {
      deps.warn?.(
        `direct-launch verdict for appId ${input.appId} not cached: ${String(err)}`
      )
    }
  }
  return verdict
}
