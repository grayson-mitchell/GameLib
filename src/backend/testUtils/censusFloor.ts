/**
 * Shared vacuous-scan guard for the census-style drift gates (Phase 82 Plan 02, D-05).
 *
 * A census gate that scans nothing proves nothing: an empty directory, a mis-rooted walk or a
 * parser that silently returns zero declarations all leave an equality or "does NOT match" check
 * green. Each gate therefore asserts that what it scanned is at or above a pinned floor, and
 * carries a deliberate empty-input test that must fail through this function.
 *
 * Pure: no timers, no handles, no work at import, no module-level state. Never mock anything to
 * test it (the backend-di-ceilings jestMock ratchet has no headroom for new mocks).
 */

/**
 * Throws unless `scanned` is a finite number at or above `floor`.
 *
 * `floor` must itself be a positive integer: a floor of zero is the vacuous guard this helper
 * exists to refuse. `label` names the gate in the message so a red run points at its owner.
 */
export function assertAtOrAboveFloor(
  label: string,
  scanned: number,
  floor: number
): void {
  if (!Number.isInteger(floor) || floor < 1) {
    throw new Error(
      `${label}: the floor must be a positive integer, got ${String(floor)}; a zero floor is itself vacuous`
    )
  }
  if (!Number.isFinite(scanned) || scanned < floor) {
    throw new Error(
      `${label}: scanned ${String(scanned)}, below the floor of ${floor}; the scan is broken`
    )
  }
}
