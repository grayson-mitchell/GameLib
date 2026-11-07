/**
 * Phase 61 D-12/D-15: store-agnostic engine payload types. Identity is
 * `runner` + `appName`; the payload carries labels and ids only, never
 * filesystem paths (T-59-36, T-61-27).
 */

/** Which engine a title runs on (Phase 59 D-06, D-14). */
type EngineKind = 'crossover' | 'builtin' | 'unsupported'

/** Phase 60 G4: the closed overlay-setup step union (common/ must not import backend). */
export type OverlayNoticeStep =
  | 'steam-dylibs'
  | 'shim'
  | 'crossover-detect'
  | 'clone'
  | 'resign'
  | 'env'

/** Per-title engine display state for the game page. */
export interface EngineState {
  runner: string
  appName: string
  engine: EngineKind | null
  reason:
    | 'cx-healthy'
    | 'cx-missing'
    | 'cx-expired'
    | 'cx-broken'
    | 'override'
    | null
  engineLabel: string | null
  trialDaysRemaining: number | null
  showTrialNotice: boolean
  crossoverInstalled: boolean
  showNoCrossoverNote: boolean
  untestedCrossoverBuild: string | null
  /**
   * True only for a title in its own per-game bridge bottle that is not a
   * DRM-mode title: the only case where an engine override has any effect.
   * Always set by the backend; optional so older fixtures compile.
   */
  overrideEligible?: boolean
  /**
   * Phase 60 D-02: true for any title with a bridge install on macOS, DRM-mode
   * titles included (unlike overrideEligible). Always set by the backend;
   * optional so older fixtures compile.
   */
  overlayEligible?: boolean
  /**
   * Set only for a forced CrossOver override whose preflight is expired or
   * conclusively broken (CrossOver will nag or the launch may fail). Closed
   * enum: the renderer maps it to catalogue strings.
   */
  overrideWarning?: 'cx-expired' | 'cx-broken' | null
  /**
   * Non-null only in the state pushed by a launch that automatically dropped
   * to the built-in engine. `seq` strictly increases per sidecar session so
   * the renderer can show the notice once per launch.
   */
  launchNotice?: {
    reason: 'cx-missing' | 'cx-expired' | 'cx-broken'
    seq: number
  } | null
  /**
   * Phase 60 G4: set only on the push from publishOverlayNotice; renderer shows
   * once per seq.
   */
  overlayNotice?: { step: OverlayNoticeStep; seq: number } | null
  /**
   * Quick 261105-ast: set only on the push from publishOverlayExitNotice; the
   * renderer shows it once per seq. The game has already exited.
   */
  exitNotice?: { seq: number } | null
  /**
   * Plan 61-27 (WR-02): set only on the push from publishLaunchDeadlineNotice; the renderer
   * shows it once per seq. The 180 s launch deadline fired with no game process seen; nothing
   * was stopped. The title is a display label, not a path (T-61-27 payload rule).
   */
  deadlineNotice?: { title: string; seconds: number; seq: number } | null
  /** Phase 61: closed engine id, or `legacy:<label>` for display only. */
  effectiveEngineId?: string
  engineSource?: 'stored' | 'derived'
  prefixKind?: 'bottle' | 'plain' | 'legacy' | null
  perGameBottleName?: string | null
  legacyLabel?: string | null
}

/** One choice in the per-game engine override picker (D-14, D-15 legacy). */
export interface EngineOption {
  id: string
  kind: 'automatic' | 'crossover' | 'pinned' | 'wine-manager' | 'legacy'
  label: string
  available: boolean
  installed: boolean
  isPreviousPin: boolean
}

export type EngineNoticeDismissal =
  | { kind: 'no-crossover' }
  | { kind: 'untested-crossover'; build: string }
