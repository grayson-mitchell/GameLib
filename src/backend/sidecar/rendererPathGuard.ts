/**
 * Renderer-supplied-input guards for the Tauri sidecar (Phase 34.6 Plan 11,
 * REQ-34.6-05 — discharges `T-34.5-C6-49-03`).
 *
 * `installFlowRegistration.ts` (`moveInstall`/`importGame`) and
 * `wineToolsFlowRegistration.ts` (`runWineCommandForGame`) were ported
 * byte-equivalently WITHOUT validation in plans 34.6-06/34.6-07 (D-02,
 * "port-then-harden": keep a live-gate failure bisectable to "the port broke
 * it" vs "validation rejected it"). This module is the dedicated, separately
 * committed hardening half those two plans deferred to.
 *
 * `assertContainedPath` mirrors `storeManagers/steam/depot.ts`'s own
 * `resolveContainedPath` (`PathTraversalError`) algorithm exactly: normalize
 * backslashes to forward slashes BEFORE `resolve()`, then verify containment
 * via `relative()` -- never a bare `startsWith(root)` string check (a sibling
 * directory that shares a string prefix with the root, e.g. `Games-evil`
 * against a `Games` root, would wrongly pass a `startsWith` check but is
 * correctly rejected by `relative()` diverging at the first path segment).
 *
 * Deliberately NOT a positive safe-character check on the input string
 * (REQ-37-06's documented anti-pattern): a character check would reject
 * legitimate punctuation a real game title or save-file path can contain
 * (e.g. the apostrophe in "Sid Meier's Civilization V"). Containment via
 * `resolve()`/`relative()` is the sole control; there is no secondary
 * character-class check in this module.
 */

import { resolve, relative, isAbsolute } from 'node:path'

/** Thrown when a renderer-supplied path resolves outside its declared root. */
export class PathContainmentError extends Error {}

/** Thrown when a renderer-supplied `commandParts` value is not a well-formed argv array. */
export class CommandShapeError extends Error {}

/**
 * Resolve `candidate` against `root` and verify containment via `relative()`
 * BEFORE any filesystem call. Backslashes are normalized to forward slashes
 * first -- an un-normalized `..\\..\\evil` resolves as one opaque,
 * non-traversing path segment on POSIX, which would silently defeat the
 * containment check if normalization ran after (or never).
 *
 * `context` is a caller-supplied label (e.g. `'moveInstall'`) surfaced in the
 * thrown error message so a rejection is distinguishable in logs across the
 * three call sites this module guards.
 *
 * Returns the resolved destination path on success -- callers use this
 * return value (not merely the absence of a throw) as the path they act on.
 */
export function assertContainedPath(
  root: string,
  candidate: string,
  context: string
): string {
  const dest = resolve(root, candidate.replace(/\\/g, '/'))
  const rel = relative(root, dest)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathContainmentError(
      `${context}: rejected path "${candidate}" (escapes ${root})`
    )
  }
  return dest
}

/**
 * Shape-only guard for `runWineCommandForGame`'s renderer-supplied
 * `commandParts`: verifies it is a non-empty array of strings before it can
 * reach `spawnAsync()`/a joined shell string. This is NOT a content or
 * character-class check -- an argument containing spaces or punctuation
 * (e.g. a path under "Sid Meier's Civilization V") is a valid array element
 * and must pass; only the outer SHAPE (array-of-strings, non-empty) is
 * checked here.
 */
export function assertCommandParts(
  commandParts: unknown
): asserts commandParts is string[] {
  if (!Array.isArray(commandParts)) {
    throw new CommandShapeError(
      `runWineCommandForGame: commandParts must be an array, got ${typeof commandParts}`
    )
  }
  if (commandParts.length === 0) {
    throw new CommandShapeError(
      'runWineCommandForGame: commandParts must not be empty'
    )
  }
  if (!commandParts.every((part) => typeof part === 'string')) {
    throw new CommandShapeError(
      'runWineCommandForGame: commandParts must be an array of strings'
    )
  }
}
