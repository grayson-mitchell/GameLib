/**
 * quick 261117-p38: the "Launch without Steam" eligibility decision.
 *
 * A game is eligible only when it does not use the Steam API (PE import table or
 * a shipped steam_api(64).dll; Mach-O load command or a shipped libsteam_api /
 * steam_api.bundle) AND carries no Steam DRM wrapper (SteamStub, CEG markers, a
 * curated `drm: "ceg"` known fix). Anything unreadable fails closed ('unknown').
 *
 * The decision is pure over injected probes (the real ones live in
 * directLaunchProbes.ts), so it is unit-testable without a filesystem or Rust.
 * Verdicts are cached per appId and keyed on buildid + install path + install
 * kind. Detection only reads; nothing here writes or emulates steam_api.
 */
import type {
  SteamDirectLaunchIneligibleReason,
  SteamDirectLaunchView
} from 'common/types/steam'

/** The ProcessRunner track label a Mac-native direct launch is spawned and stopped with. */
export const STEAM_DIRECT_TRACK_RUNNER = 'steam-direct'

export type DirectLaunchKind = 'mac-native' | 'bridge'

export interface DirectLaunchPlan {
  binaryPath?: string
  args: string[]
  workingDir?: string
}

export type DirectLaunchVerdict =
  | { eligible: true; kind: DirectLaunchKind; launch: DirectLaunchPlan }
  | { eligible: false; reason: SteamDirectLaunchIneligibleReason }

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
  return verdict.eligible
    ? { eligible: true, kind: verdict.kind }
    : { eligible: false, reason: verdict.reason }
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

// A frozen tuple, not a module-level Set: the module-state census counts Sets, and this never mutates.
const NOT_CACHED: readonly SteamDirectLaunchIneligibleReason[] = [
  'unknown',
  'host-unsupported',
  'route-unsupported',
  'not-installed'
]

const no = (
  reason: SteamDirectLaunchIneligibleReason
): DirectLaunchVerdict => ({
  eligible: false,
  reason
})

async function computeMacNative(
  probes: DirectLaunchProbes,
  installPath: string
): Promise<DirectLaunchVerdict> {
  if (probes.knownFixCeg()) return no('steam-drm')
  const entry = await probes.readLaunchEntry('macos')
  const binaryPath = probes.locateMacBinary(installPath, entry?.executable)
  if (!binaryPath) return no('unknown')
  const files = await probes.macSteamApiFiles(installPath)
  if (files.length > 0) return no('steam-api')
  const links = await probes.macLinks(binaryPath)
  if (links === 'links') return no('steam-api')
  if (links === 'unreadable') return no('unknown')
  return {
    eligible: true,
    kind: 'mac-native',
    launch: {
      binaryPath,
      args: splitLaunchArguments(entry?.arguments ?? ''),
      ...(entry?.workingdir ? { workingDir: entry.workingdir } : {})
    }
  }
}

async function computeBridge(
  probes: DirectLaunchProbes
): Promise<DirectLaunchVerdict> {
  if (probes.knownFixCeg()) return no('steam-drm')
  const exe = await probes.resolveBridgeExe()
  if (!exe) return no('unknown')
  const drm = await probes.peDrm(exe)
  if (drm === undefined) return no('unknown')
  if (drm !== 'none') return no('steam-drm')
  const imports = await probes.peImports(exe)
  if (imports === 'error') return no('unknown')
  if (imports === 'steam-api') return no('steam-api')
  if ((await probes.peSteamApiDlls(exe)) > 0) return no('steam-api')
  const entry = await probes.readLaunchEntry('windows')
  return {
    eligible: true,
    kind: 'bridge',
    launch: { args: splitLaunchArguments(entry?.arguments ?? '') }
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function readCached(
  deps: DirectLaunchDeps,
  input: DirectLaunchInput,
  installPath: string,
  kind: DirectLaunchKind
): DirectLaunchVerdict | undefined {
  try {
    const rec = deps.store.get(input.appId)
    if (!isRecord(rec) || rec.v !== 1) return undefined
    if (
      rec.kind !== kind ||
      rec.installPath !== installPath ||
      rec.buildid !== input.buildid
    ) {
      return undefined
    }
    const v = rec.verdict
    if (!isRecord(v) || typeof v.eligible !== 'boolean') return undefined
    if (v.eligible) {
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
    return typeof v.reason === 'string' &&
      (v.reason === 'steam-api' || v.reason === 'steam-drm')
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
    verdict = no('unknown')
  }

  deps.info?.(
    `direct-launch verdict for appId ${input.appId} recomputed (${kind}, buildid ${input.buildid || 'unknown'}): ${verdict.eligible ? 'eligible' : verdict.reason}`
  )

  if (
    input.buildid !== '' &&
    (verdict.eligible || !NOT_CACHED.includes(verdict.reason))
  ) {
    try {
      deps.store.set(input.appId, {
        v: 1,
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
