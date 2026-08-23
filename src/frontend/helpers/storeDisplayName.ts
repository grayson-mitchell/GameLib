import type { Runner } from 'common/types'

/**
 * The canonical runner-id → user-facing store name mapping.
 *
 * Extracted from `helpers/index.ts` by quick task `260823-qsm` (Phase 34.4 code-review WR-02) so
 * that surfaces which must stay dependency-light can use it. `helpers/index.ts`'s first statement
 * is a side-effecting `import '../../preload/tauriAttach'`, which dereferences `window` at module
 * scope — importing it from a component pulls that in and hard-fails this repo's jsdom-less
 * frontend jest project (`ReferenceError: window is not defined`). 34.4-REVIEW.md's WR-02 fix
 * prescribed exactly that import; it was measured and rejected.
 *
 * This module has ONE import, and it is type-only. Keep it that way — its whole value is being
 * safe to import from anywhere.
 *
 * `helpers/index.ts` re-exports this as `getStoreName`, so there is a single source of truth and
 * the two cannot drift.
 */
export const getStoreDisplayName = (runner: Runner, other: string): string => {
  switch (runner) {
    case 'legendary':
      return 'Epic Games'
    case 'gog':
      return 'GOG'
    case 'nile':
      return 'Amazon Games'
    case 'steam':
      return 'Steam'
    default:
      return other
  }
}
