/**
 * Quick task 260816-hdg — the one place that decides whether a
 * `steamMetadataStore` entry has actually captured the DEPOT signal, as
 * opposed to merely claiming it did.
 *
 * ## (a) The residue shape, and how much of it there is
 *
 * A survey of the real on-disk cache
 * (`~/Library/Application Support/GameLib/store_cache/steam_metadata.json`,
 * 380 entries, taken 2026-08-16 during Phase 34.14's D-08 UAT) found 370
 * entries carrying `platformsCaptured: true` with NO `is_windows_native`
 * field at all. Those entries are residue from a pre-D-17 build that wrote
 * the "platforms were read" flag before `is_windows_native` existed. There
 * is no schema version stamp on this store and no migration, so absent a
 * fix they are trusted indefinitely.
 *
 * That combination is the worst possible input to the install form's Steam
 * platform row. The depot signal reads as CAPTURED, so Phase 34.14's D-04
 * fail-open correctly declines to engage (fail-open exists only for "not
 * fetched yet"), while the absent field makes `hasSteamWindowsDepot()`
 * return `false`. Net: 370 games conclude "this game has no Windows build"
 * with full confidence and omit Windows from the selector — precisely the
 * false conclusion Phase 34.14 exists to prevent.
 *
 * ## (b) Uniqueness proof — this predicate cannot false-positive
 *
 * The CURRENT write path always writes both fields, in the same object
 * literal:
 *   - `games.ts:647` computes `const is_windows_native = !!data.platforms?.windows`
 *     — a `!!` coercion, so the result is ALWAYS a boolean and never
 *     `undefined`, regardless of what appdetails returned;
 *   - `games.ts:704-707` persists it into `steamMetadataStore.set(...)`
 *     inside the SAME object literal that carries `platformsCaptured: true`.
 *
 * There is therefore no code path that can produce a post-D-17 entry with
 * `platformsCaptured: true` and an absent `is_windows_native`. The
 * conjunction this module tests uniquely identifies pre-D-17 residue, and a
 * legitimately-written entry — including one whose real answer is "no
 * Windows depot", i.e. `is_windows_native: false` — still reads as
 * captured. A captured "no" is captured.
 *
 * ## (c) This is NOT the forbidden `hasSteamWindowsDepot` loosening
 *
 * Do not "unify" this helper with
 * `src/frontend/screens/Library/components/InstallModal/steamPlatformRow.ts`'s
 * `hasSteamWindowsDepot()`. They answer different questions and the
 * distinction is load-bearing:
 *   - `hasSteamWindowsDepot` answers "does this game HAVE a Windows build",
 *     and must stay a strict `=== true` comparison. Relaxing it to the
 *     inverted `is_windows_native !== false` form is the
 *     `treatsAbsentAsAvailable` saboteur that three shipped gates in
 *     `steamPlatformRow.test.ts` exist specifically to reject, because it
 *     would offer a Windows install for a game with no confirmed Windows
 *     depot.
 *   - This module answers "was the depot question ANSWERED at all", and
 *     never coerces an absent field into an availability verdict. It makes
 *     the answer MORE conservative (a residue entry stops claiming
 *     knowledge it does not have), never more permissive about depots.
 *
 * ## (d) Why clearing the false claim is the whole fix
 *
 * Reporting a residue entry as not-captured is exactly what re-arms the two
 * mechanisms that were already shipped and already correct:
 *   - Phase 34.14's D-04 fail-open engages for `platformsCaptured: false`,
 *     so the install form offers Windows again for the 370 games;
 *   - `games.ts` `getGameInfo()`'s existing self-heal refetch fires on
 *     library render, and because that refetch writes `is_windows_native`
 *     unconditionally (the `!!` at `games.ts:647`), the predicate flips to
 *     `true` after exactly ONE fetch per appId. There is no loop:
 *     `pendingFetches` dedup and `acquireMetadataSlot()` already bound the
 *     burst.
 *
 * The parameter is deliberately STRUCTURAL rather than
 * `SteamMetadataCacheEntry` from `./electronStores`: keeping this module
 * dependency-free means the Backend jest project can unit-test it without
 * pulling `electron-store` in — the same extraction pattern
 * `steamPlatformRow.ts` uses and documents in its own header.
 */

/**
 * True only when this cache entry genuinely carries the D-17 depot signal:
 * the platforms fetch is flagged complete AND the field that fetch is
 * obliged to write is actually present.
 *
 * Returns `false` for `null`/`undefined`/`{}` and for the 370-entry pre-D-17
 * residue shape described in this module's header. Returns `true` for both
 * inhabitants of a legitimately-written entry, including
 * `is_windows_native: false`.
 */
export function depotSignalCaptured(
  entry:
    | { platformsCaptured?: boolean; is_windows_native?: boolean }
    | null
    | undefined
): boolean {
  return (
    entry?.platformsCaptured === true && entry?.is_windows_native !== undefined
  )
}
