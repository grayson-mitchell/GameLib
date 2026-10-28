/**
 * Phase 56 plan 04: DRM-mode contracts shared by every later DRM plan.
 *
 * D-12 routes every `.bind` (SteamStub) launch exe to the steamclient-layer
 * mode, with no allowlist and no per-title override. CEG exes are never
 * routed here: they keep the existing refusal path in launchBridgeGame.
 *
 * D-13 failures are named by exactly one `DrmStep` and are reported as
 * `reason=drm-<step>`. They never fall back to the Phase 52 forwarder or to
 * bottled Steam.
 *
 * Zero imports by design (D-51-15), the same discipline as peSteamDrm.ts:
 * meta/bridgeCensus.ts may bundle this module with no backend module graph.
 * `grep -c "^import" steamclientLayerMode.ts` must print 0.
 *
 * Nothing in this module throws.
 */

// ts-prune-ignore-next
export type BridgeMode = 'tcp' | 'steamclient-layer'

// ts-prune-ignore-next
export const STEAMCLIENT_LAYER_MODE = 'steamclient-layer' as const

/**
 * Pure routing decision. `'tcp'` for a CEG exe means "not DRM mode": the
 * existing CEG refusal in `launchBridgeGame` still stops the launch.
 * `undefined` (unreadable exe) stays on the existing TCP path, unchanged from
 * today. This function never returns a bottled-Steam route (D-13).
 */
// ts-prune-ignore-next
export function resolveBridgeMode(
  drmWrapper: 'steamstub' | 'none' | undefined,
  cegMarkers?: readonly string[]
): BridgeMode {
  if (drmWrapper !== 'steamstub') return 'tcp'
  if (cegMarkers && cegMarkers.length > 0) return 'tcp'
  return 'steamclient-layer'
}

/**
 * The fixed setup order 56-11 runs: Mac Steam check, then the CrossOver
 * allowlist, then the component, then the runner, then the Valve client,
 * then bottle staging.
 */
// ts-prune-ignore-next
export const DRM_STEPS = [
  'steam-not-running',
  'unsupported-crossover',
  'component-missing',
  'component-verify',
  'runner-clone',
  'runner-patch',
  'valve-fetch',
  'valve-verify',
  'bottle-stage'
] as const

// ts-prune-ignore-next
export type DrmStep = (typeof DRM_STEPS)[number]

// ts-prune-ignore-next
export function isDrmStep(value: unknown): value is DrmStep {
  return (
    typeof value === 'string' &&
    (DRM_STEPS as readonly string[]).includes(value)
  )
}

// ts-prune-ignore-next
export type DrmNoticeReason = `drm-${DrmStep}`

// ts-prune-ignore-next
export function drmNoticeReason(step: DrmStep): DrmNoticeReason {
  return `drm-${step}`
}

// ts-prune-ignore-next
export type DrmStepError = { status: 'error'; step: DrmStep; cause: string }

// ts-prune-ignore-next
export type DrmStepResult<T extends object = Record<never, never>> =
  | ({ status: 'ok' } & T)
  | DrmStepError

// ts-prune-ignore-next
export const DRM_CAUSE_MAX_CHARS = 160

function normaliseCause(cause: unknown): string {
  let text: string
  try {
    if (cause instanceof Error) text = cause.message
    else if (typeof cause === 'string') text = cause
    else text = String(cause)
  } catch {
    text = 'unknown'
  }
  if (typeof text !== 'string') text = 'unknown'
  let out = ''
  for (const ch of text) {
    const c = ch.charCodeAt(0)
    out += c <= 0x1f || c === 0x7f ? ' ' : ch
  }
  out = out.replace(/\s+/g, ' ').trim().slice(0, DRM_CAUSE_MAX_CHARS).trim()
  return out === '' ? 'unknown' : out
}

/** Builds the error arm from any thrown value. Never throws. */
// ts-prune-ignore-next
export function drmStepError(step: DrmStep, cause: unknown): DrmStepError {
  return { status: 'error', step, cause: normaliseCause(cause) }
}

/**
 * `[bridge-notice] appId=<id> reason=drm-<step> cause=<token>`. The cause is a
 * single whitespace-free token, so a game- or filesystem-supplied string
 * cannot inject a second log line or a forged `[bridge-drm]` prefix.
 */
// ts-prune-ignore-next
export function formatDrmNoticeLine(
  appId: string,
  step: DrmStep,
  cause: string
): string {
  const id = /^[0-9]{1,10}$/.test(appId) ? appId : 'invalid'
  let token = normaliseCause(cause)
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._:/@+=,-]/g, '_')
  if (token === '') token = 'unknown'
  return `[bridge-notice] appId=${id} reason=${drmNoticeReason(step)} cause=${token}`
}

// ts-prune-ignore-next
export type BridgeDrmAnchorFields = {
  appId: string
  crossover: string
  client: string
  trace: string
}

/**
 * `[bridge-drm] appId=<id> mode=steamclient-layer crossover=<build>
 * client=<manifest-version> trace=<file>`. `trace=` is deliberately the LAST
 * field and runs to end of line, because the macOS appFolder path contains a
 * space (`Application Support`). The 56-05 parser therefore reads trace as the
 * rest of the line, not as a `\S+` token. Returns null on any invalid field.
 */
// ts-prune-ignore-next
export function formatBridgeDrmAnchor(f: BridgeDrmAnchorFields): string | null {
  if (!/^[0-9]{1,10}$/.test(f.appId)) return null
  if (!/^[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/.test(f.crossover)) return null
  if (!/^[0-9]{1,20}$/.test(f.client)) return null
  if (
    typeof f.trace !== 'string' ||
    !f.trace.startsWith('/') ||
    f.trace.length > 1024 ||
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f]/.test(f.trace)
  ) {
    return null
  }
  return `[bridge-drm] appId=${f.appId} mode=steamclient-layer crossover=${f.crossover} client=${f.client} trace=${f.trace}`
}
