/**
 * Phase 60 D-08: overlay setup steps and their fail-open notice line.
 * Import-free on purpose (symmetry with the DRM module); nothing throws.
 */

// ts-prune-ignore-next
export const OVERLAY_STEPS = [
  'steam-dylibs',
  'shim',
  'crossover-detect',
  'clone',
  'resign',
  'env'
] as const

// ts-prune-ignore-next
export type OverlayStep = (typeof OVERLAY_STEPS)[number]

// ts-prune-ignore-next
export const OVERLAY_CAUSE_MAX_CHARS = 160

// ts-prune-ignore-next
export type OverlayStepError = {
  status: 'error'
  step: OverlayStep
  cause: string
}

// ts-prune-ignore-next
export type OverlayStepResult<T extends object = Record<never, never>> =
  | ({ status: 'ok' } & T)
  | OverlayStepError

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
  out = out.replace(/\s+/g, ' ').trim().slice(0, OVERLAY_CAUSE_MAX_CHARS).trim()
  return out === '' ? 'unknown' : out
}

/** Builds the error arm from any thrown value. Never throws. */
// ts-prune-ignore-next
export function overlayStepError(
  step: OverlayStep,
  cause: unknown
): OverlayStepError {
  return { status: 'error', step, cause: normaliseCause(cause) }
}

function safeId(appId: string): string {
  return /^[0-9]{1,10}$/.test(appId) ? appId : 'invalid'
}

/**
 * `[bridge-notice] appId=<id> reason=overlay-<step> cause=<token>`. The cause
 * is a single whitespace-free token, so it cannot inject a second log line.
 */
// ts-prune-ignore-next
export function formatOverlayNoticeLine(
  appId: string,
  step: OverlayStep,
  cause: string
): string {
  let token = normaliseCause(cause)
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._:/@+=,-]/g, '_')
  if (token === '') token = 'unknown'
  return `[bridge-notice] appId=${safeId(appId)} reason=overlay-${step} cause=${token}`
}

// ts-prune-ignore-next
export function formatOverlayExitNoticeLine(appId: string): string {
  return `[bridge-notice] appId=${safeId(appId)} reason=overlay-exit-abnormal`
}

// ts-prune-ignore-next
export const OVERLAY_STEP_TEXT: Record<
  OverlayStep,
  { key: string; en: string }
> = {
  'steam-dylibs': {
    key: 'steam.overlay.step.steamDylibs',
    en: "Mac Steam's overlay files were not found."
  },
  shim: {
    key: 'steam.overlay.step.shim',
    en: "GameLib's overlay helper is missing from this build."
  },
  'crossover-detect': {
    key: 'steam.overlay.step.crossoverDetect',
    en: 'CrossOver could not be found.'
  },
  clone: {
    key: 'steam.overlay.step.clone',
    en: 'The overlay copy of CrossOver could not be prepared.'
  },
  resign: {
    key: 'steam.overlay.step.resign',
    en: 'The overlay copy of CrossOver could not be signed.'
  },
  env: {
    key: 'steam.overlay.step.env',
    en: 'An overlay path contains a character GameLib cannot pass to the game.'
  }
}
