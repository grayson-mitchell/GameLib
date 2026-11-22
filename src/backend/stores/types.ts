/**
 * What a persisted store declares about itself (Phase 68; moved here from the deleted TS
 * versioning engine's types in 85-24). Types only: no runtime code lives here.
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
