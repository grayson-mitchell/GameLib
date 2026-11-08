/**
 * Shared contracts for the versioned persisted stores (Phase 68).
 * Types only: no runtime code lives here.
 */

/** D-01: a cache can be rebuilt; user-state cannot. */
export type StoreKind = 'cache' | 'user-state'

export type StoreDeclaration = {
  readonly kind: StoreKind
  /** D-13: the store holds token material. */
  readonly tokenBearing?: true
  /** Read-only view served when a store failed to migrate. Default 'as-is'. */
  readonly failedView?: 'as-is' | 'empty'
}

/**
 * A pure function (D-04 clean rewrite): returns the new shape with the old
 * fields removed, never keeping them beside the new ones.
 */
export type Migration = {
  readonly id: string
  readonly to: number
  readonly identity?: true
  readonly run: (data: Record<string, unknown>) => Record<string, unknown>
}

/**
 * Lets one engine serve conf files (`__internal__.gamelib.schemaVersion`) and
 * settings files (top-level `version: 'vN'`).
 */
export type VersionCodec = {
  read: (data: Record<string, unknown>) => number
  write: (
    data: Record<string, unknown>,
    version: number
  ) => Record<string, unknown>
}

export type StoreReadOnlyReason = 'newer' | 'failed'
