/**
 * Renderer-supplied-input guards for the Tauri sidecar (Phase 34.6 Plan 11,
 * REQ-34.6-05 — discharges `T-34.5-C6-49-03`; re-dispositioned by gap plan
 * 34.6-18 after `34.6-VERIFICATION.md` CR-01).
 *
 * `installFlowRegistration.ts` (`moveInstall`/`importGame`) and
 * `wineToolsFlowRegistration.ts` (`runWineCommandForGame`) were ported
 * byte-equivalently WITHOUT validation in plans 34.6-06/34.6-07 (D-02,
 * "port-then-harden": keep a live-gate failure bisectable to "the port broke
 * it" vs "validation rejected it"). This module is the dedicated, separately
 * committed hardening half those two plans deferred to.
 *
 * `moveInstall`/`importGame` use `assertPlausibleAbsolutePath` (below), NOT
 * `assertContainedPath` — gap plan 34.6-18 removed containment for these two
 * channels specifically. `defaultInstallPath` (the old containment root) is
 * renderer-writable via the `setSetting` channel
 * (`settingsFlowRegistration.ts:160`), so containing against it was circular
 * against the very adversary T-34.5-C6-49-03 names: a renderer that can call
 * `moveInstall` could first call `setSetting` to widen its own root and then
 * move anywhere. It also rejected the cross-drive move / out-of-tree import
 * each feature exists to perform. The real trust boundary for these two
 * channels is the OS-native directory picker the renderer-supplied `path`
 * comes from in normal operation; see `34.6-VERIFICATION.md` CR-01 and this
 * gap plan's `<decision>` block for the full rationale.
 *
 * `assertContainedPath` mirrors `storeManagers/steam/depot.ts`'s own
 * `resolveContainedPath` (`PathTraversalError`) algorithm exactly: normalize
 * backslashes to forward slashes BEFORE `resolve()`, then verify containment
 * via `relative()` -- never a bare `startsWith(root)` string check (a sibling
 * directory that shares a string prefix with the root, e.g. `Games-evil`
 * against a `Games` root, would wrongly pass a `startsWith` check but is
 * correctly rejected by `relative()` diverging at the first path segment).
 * It now has ZERO production call sites (`runWineCommandForGame` uses
 * `assertCommandParts`, not this primitive) — retained deliberately as the
 * shared containment primitive, not left behind by omission. Its named
 * future consumer is the open todo
 * `.planning/todos/pending/2026-08-24-importgame-wineprefix-wineversion-not-contained-by-34-6-11.md`,
 * whose design question is exactly "what containment root is correct for a
 * Wine prefix."
 *
 * Deliberately NOT a positive safe-character check on the input string
 * (REQ-37-06's documented anti-pattern): a character check would reject
 * legitimate punctuation a real game title or save-file path can contain
 * (e.g. the apostrophe in "Sid Meier's Civilization V"). Containment via
 * `resolve()`/`relative()` (for `assertContainedPath`) and segment-wise `..`
 * detection (for `assertPlausibleAbsolutePath`) are the only controls; there
 * is no character-class check anywhere in this module.
 */

import { resolve, relative, isAbsolute } from 'node:path'

/** Thrown when a renderer-supplied path resolves outside its declared root. */
export class PathContainmentError extends Error {}

/** Thrown when a renderer-supplied `commandParts` value is not a well-formed argv array. */
export class CommandShapeError extends Error {}

/** Thrown when a renderer-supplied path fails the `moveInstall`/`importGame` shape check (gap plan 34.6-18). */
export class PathShapeError extends Error {}

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
 * Shape/plausibility-only guard for `moveInstall`/`importGame`'s
 * renderer-supplied `path` (gap plan 34.6-18, `34.6-VERIFICATION.md` CR-01).
 * Unlike `assertContainedPath` above, this does NOT check containment
 * against any root — these two channels' real trust boundary is the
 * OS-native directory picker the value comes from in normal operation, not
 * a config value the renderer can itself widen (see the module header).
 *
 * REJECTS (throws `PathShapeError`), in this order: not a string; a NUL
 * byte anywhere in the raw value; empty or whitespace-only after trim; not
 * absolute once backslashes are normalized to forward slashes; or absolute
 * but containing a `..` path SEGMENT (segment-wise comparison, never a
 * substring test -- a legitimate directory NAME like `..hidden` is not a
 * traversal segment and must be accepted, T-34.6-47).
 *
 * Does NOT call `resolve()` -- the point is to reject a `..` segment
 * outright, not to collapse it away. Returns `void`; callers forward the
 * ORIGINAL renderer-supplied string downstream unchanged, exactly like
 * `assertContainedPath`'s gate-not-rewrite contract above.
 */
export function assertPlausibleAbsolutePath(
  candidate: unknown,
  context: string
): void {
  if (typeof candidate !== 'string') {
    throw new PathShapeError(`${context}: rejected path (not a string)`)
  }
  if (candidate.includes(String.fromCharCode(0))) {
    throw new PathShapeError(`${context}: rejected path (contains a NUL byte)`)
  }
  if (candidate.trim().length === 0) {
    throw new PathShapeError(`${context}: rejected path (empty)`)
  }

  const normalized = candidate.replace(/\\/g, '/')

  if (!isAbsolute(normalized)) {
    throw new PathShapeError(`${context}: rejected path (not absolute)`)
  }

  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new PathShapeError(
      `${context}: rejected path (contains a ".." segment)`
    )
  }
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
