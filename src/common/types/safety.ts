/**
 * Phase 82 (FND-02, D-06): the TS mirror of the gamelib-safety wire types
 * (src-tauri/crates/gamelib-safety/src/wire.rs, tri.rs). Every closed set below equals the Rust
 * serde names, enforced by backend/__tests__/safetyWireParity.test.ts. Ids and keys only: a reply
 * never carries a path or a user name.
 */

/** A check result. A destructive op proceeds only on `yes`; `no` and `unknown` both refuse. */
export const SAFETY_VERDICTS = ['yes', 'no', 'unknown'] as const

export const SAFETY_TARGET_KINDS = [
  'game-install',
  'game-support',
  'prefix',
  'bottle',
  'sideload-folder',
  'app-data'
] as const

/** Reasons the Rust crate produces (wire.rs `Reason`). */
export const SAFETY_REASONS = [
  'ok',
  'not-absolute',
  'dot-segment',
  'nul-byte',
  'is-protected-root',
  'is-trust-root',
  'outside-trust-root',
  'no-trust-root',
  'nested-known-install',
  'inside-known-install',
  'known-installs-unreadable',
  'canonicalize-failed',
  'not-a-prefix',
  'folder-looks-shared',
  'delete-failed'
] as const

export const SAFETY_OUTCOMES = ['refused', 'removed', 'failed'] as const

/**
 * Reasons only the TS adapter produces (plan 82-05): a rejected rustInvoke, or a reply that
 * does not parse. Both read as `unknown`, so the op refuses. Never on the Rust wire.
 */
export const SAFETY_ADAPTER_REASONS = [
  'rust-invoke-failed',
  'bad-reply'
] as const

/** Every reason a caller can be handed: the Rust set, then the adapter's. */
export const REMOVAL_REASONS = [
  ...SAFETY_REASONS,
  ...SAFETY_ADAPTER_REASONS
] as const

/** @public exported ahead of its first cross-module import: the rustSafety adapter and refusal notice of plans 82-05 and 82-06 consume it. */
export type SafetyVerdict = (typeof SAFETY_VERDICTS)[number]
/** @public Wire type, see SafetyVerdict. */
export type SafetyTargetKind = (typeof SAFETY_TARGET_KINDS)[number]
/** @public Wire type, see SafetyVerdict. */
export type SafetyReason = (typeof SAFETY_REASONS)[number]
/** @public Wire type, see SafetyVerdict. */
export type RemovalReason = (typeof REMOVAL_REASONS)[number]
/** @public Wire type, see SafetyVerdict. */
export type SafetyOutcome = (typeof SAFETY_OUTCOMES)[number]

/** @public Wire type, see SafetyVerdict. */
export interface SafetyTarget {
  id: string
  path: string
  kind: SafetyTargetKind
  /** Only ever a caller-supplied parameter, never derived from the data being validated. */
  trustRoot?: string | null
  /** A sideload game's own executable (absolute, or relative to the folder). */
  executable?: string | null
}

/** @public Wire type, see SafetyVerdict. */
export interface SafetyKnownInstall {
  key: string
  path: string
}

/** @public Wire type, see SafetyVerdict. */
export interface SafetyRequest {
  targets: SafetyTarget[]
  /** `null` means the list could not be read; the verdict is then `unknown`. */
  knownInstalls: SafetyKnownInstall[] | null
  /** The key of the game being removed; its own entry is not a sibling. */
  selfKey?: string | null
  protectedRoots: string[]
}

/** @public Wire type, see SafetyVerdict. */
export interface SafetyItem {
  id: string
  verdict: SafetyVerdict
  reason: RemovalReason
  /** The other game's key, on `nested-known-install` and `inside-known-install`. */
  otherKey?: string
  /** The target is a symlink or junction and is removed as a link. */
  isLink: boolean
  /** Nothing exists at the target. */
  absent: boolean
}

/** @public Wire type, see SafetyVerdict. */
export interface SafetyReply {
  overall: SafetyVerdict
  items: SafetyItem[]
}

/** @public Wire type, see SafetyVerdict. */
export interface SafetyRemoveReply extends SafetyReply {
  outcome: SafetyOutcome
}
