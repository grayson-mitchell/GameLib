/**
 * Phase 24 Plan 05 (R3, Task 2): automatic per-bottle `steam_api.dll` shim
 * placement -- the per-game bottle-setup hook that makes an allowlisted
 * game bridge-ready. No manual copy step; a single callable
 * (`placeShimForGame`) is the sole entry point, intended for 24-08's
 * `installBridgeGame()` to call inline.
 *
 * Sanitize-then-place shape mirrors `bottle.ts`'s `provisionBottle()`
 * (24-PATTERNS.md "shimGenerate.ts"): reject unsafe inputs before ANY
 * path/copy operation, then an idempotent byte-IDENTITY guard (D-UAT-24-04,
 * fixed 24-11 -- was a pure existence guard that always short-circuited)
 * before doing real work.
 *
 * ACKNOWLEDGED DIVERGENCE (review finding #9, must_haves): the placed
 * shim is 24-01's single SUPERSET `steam_api.def` (`FLAT_EXPORTS_SUPERSET`
 * in `meta/gen_vtables.ts`), not a per-game-tailored export set. This
 * module's objdump-derived import set (via `importScan.ts`) is used to
 * VALIDATE coverage (superset ⊇ game imports), not to drive per-game
 * generation. A game whose imports exceed the superset was, originally,
 * rejected with NO auto-remediation -- surfaced to the caller via a typed
 * 'miss' result (Phase 51 Plan 07: this used to throw the verdict away as a
 * bare `'error'`; it returned the full `SteamBridgeScanVerdict` for the
 * caller to persist, D-51-07). SUPERSEDED, see the next paragraph.
 *
 * Amended 2026-10-23 (quick 261023-oq7, user: "Place shim anyway"): a
 * coverage miss no longer withholds the shim. The shim is placed anyway and
 * the result is 'placed-miss' carrying the same miss verdict, which the
 * caller persists. Per the user, bottled Steam is a narrow fallback to
 * eliminate; the recorded missingSymbols drive shim widening. Caveat: an
 * exe whose STATIC imports the shim lacks will most likely fail at load
 * with a Windows "entry point not found" error. That is expected by design.
 * A `<dll>@runtime-loaded` marker (51-22, CR-04) is a miss without that
 * load-time failure, and such titles may play.
 *
 * Amended 2026-10-24 (quick 261024-j4l, Manor Lords 1363080): static-import
 * misses and marker-only misses are still placed anyway, but a delay-imported
 * missing symbol or an unservable interface version WITH importer evidence is
 * withheld: the shim is not placed (a GameLib shim already on disk is
 * restored from `<dll>.gamelib-orig`) and the result is 'withheld' carrying
 * the persisted miss verdict. Every overwrite of a game-original dll keeps a
 * `.gamelib-orig` backup. A missing backup can be restored from the Steam
 * depot by `restoreBridgeSteamApiOriginals` (bridge/originalRestore.ts, quick
 * 261026-lif); placement then prefers the backup over the persisted pool and
 * rescans when a backup is new or its fingerprint changed.
 *
 * Revised 2026-10-26 (quick 261026-mhg, operator option a): the withhold
 * triggers only on a delay-imported miss or a BLOCKING interface gap (a core
 * startup family, or a version the shim would answer with NULL). A non-core
 * gap answered by the x64 null object (SteamController, SteamUGC,
 * SteamTimeline, SteamRemotePlay, ...) is placed (placed-miss) and still named
 * in the verdict. Served-map growth had turned those half-served families
 * into "skew" and regressed ELEX; the native resolver's runtime answer never
 * changed (exact-version match, else the null object).
 *
 * BLOCKER 2: the compiled x86 `.dll` is read from `builtBridgeShimPath`
 * (`backend/constants/paths.ts`, 24-01) -- the SAME shared location 24-07
 * (packaging) writes to. This module never invents a second/divergent
 * shim location. At dev time the `.dll` may not exist yet (built by 24-07
 * at packaging) -- that is a typed `'shim-not-built'` result, not a throw.
 * Phase 51 Plan 07 adds the arch-aware x64 counterpart
 * (`builtBridgeShim64Path`) alongside it, same rule.
 *
 * Phase 51 Plan 07 (D-51-07/D-51-13): placement is now arch-aware (a game
 * importing `steam_api64.dll` places `steam_api64.dll`, sourced from the
 * x64 shim) and captures the game's required interface VERSIONS -- not
 * just its flat symbol imports -- from the game's own original
 * `steam_api(64)?.dll` (and, for runtime-interface-lookup games, its exe)
 * BEFORE that original is overwritten. The returned verdict (missing
 * symbols, resolved versions, stubbed interfaces, the shim export-set
 * stamp) is exactly `SteamBridgeScanVerdict` -- the same shape 51-09
 * persists and 51-07's `resolveBridgeRoute` reads back.
 */

import { resolve } from 'node:path'
import { resolveBridgeBottleName } from '../bridgeBottle'
import {
  getBottleDir,
  sanitizeBottleName
} from 'backend/engine/bottlePrimitives'
import { containedGameExeReal, detectLaunchDrmWrapper } from './drm/drmScanExe'
import type { PlaceShimResult } from './shimOriginals'
import {
  detectDrmWrapper,
  detectExeSteamDrm,
  withDrmWrapper
} from './shimDrmWrapper'
import { placeShimForGameInner } from './shimPlacement'

/**
 * Places the shared, superset-exporting `steam_api(64)?.dll` shim next to
 * a bridge-eligible game's own `.exe` inside the bridge bottle,
 * OVERWRITING whatever is already at that path unless it is already
 * byte-identical to the built shim. Every input is guarded before any
 * path/copy operation:
 *  1. appId must be numeric (T-24-06).
 *  2. bottleName (default: this game's own per-game bridge bottle, via
 *     resolveBridgeBottleName -- quick/261016-u1w D-B) must sanitize clean
 *     (T-24-06, same `sanitizeBottleName` chokepoint `provisionBridgeBottle`
 *     uses).
 *  3. `gameExePath` must resolve INSIDE that bottle's directory --
 *     rejects a path escaping the bottle before touching the filesystem.
 *
 * Phase 51 Plan 07: the game's import scan runs BEFORE the arch/filename
 * is known (imports, not just the exe, say whether this is a `steam_api.dll`
 * or `steam_api64.dll` title) -- an exe importing nothing from
 * `steam_api(64)?.dll` at all short-circuits to `'no-steam-api'` here,
 * before any path is even computed. This means the import scan now runs on
 * EVERY call (unlike the pre-51-07 shape, which skipped it once a shim was
 * already byte-identical in place) -- objdump is cheap, and there is no
 * way to know a game's target FILENAME without it.
 *
 * D-UAT-24-04 (BLOCKER, fixed 24-11): the overwrite guard is by IDENTITY,
 * not existence. If a file is present at the computed `shimPath` and it is
 * already byte-identical to the built shim, placement is a no-op success
 * (`already-placed`, no needless churn, no verdict -- the caller keeps
 * whatever verdict it already persisted). Otherwise -- including when the
 * game's own, byte-DIFFERENT original `steam_api(64)?.dll` is present, or
 * an OLDER GameLib shim release is present -- the interface-version
 * capture and coverage check run first, and then `copyFileSync` OVERWRITES
 * the target. Amended 2026-10-23 (quick 261023-oq7): this used to happen
 * "only on a covered pass"; a coverage miss now places the shim anyway and
 * returns 'placed-miss' (user: "Place shim anyway"). Caveat: a static-import
 * miss will most likely fail at load with a Windows entry-point error --
 * expected by design; a `<dll>@runtime-loaded` miss may play.
 *
 * Interface-version capture (D-51-07): when the file currently at
 * `shimPath` is the game's own original dll (`!isGameLibShimBytes`), its
 * version strings are read from THAT file -- BEFORE it is overwritten.
 * When the file at `shimPath` is already an older GameLib shim (there is
 * no "original" left to read), `opts.persistedInterfaceVersions` supplies
 * the versions instead (the caller's own previously-persisted verdict);
 * absent that, every required family resolves as unknown-version (a named
 * miss, never a silent guess). Runtime-interface-lookup games
 * (`usesRuntimeInterfaceLookup`) also read the exe's own version strings
 * into the same pool.
 *
 * `shimSourcePath`/`shim64SourcePath` default to the real, shared
 * `builtBridgeShimPath`/`builtBridgeShim64Path` (BLOCKER 2) -- callers
 * never need to pass them; the parameters exist so this module's own
 * tests can point at fixture files without mocking module-level constants.
 *
 * Quick 261024-br4 (Steam CEG DRM): every non-'error' result also carries a
 * `drm` signal from a ranged PE resource scan of the game exe
 * (`peSteamDrm.ts`). The scan runs only AFTER the appId / bottle-name /
 * containment validation has passed (T-24-06, T-br4-03), so no byte of an
 * out-of-bottle path is ever read. The shim is still placed either way: the
 * caller decides, so a user's forced 'bridge' route keeps working.
 */
export async function placeShimForGame(
  appId: string,
  gameExePath: string,
  opts?: Parameters<typeof placeShimForGameInner>[2]
): Promise<PlaceShimResult> {
  const result = await placeShimForGameInner(appId, gameExePath, opts)
  if (result.status === 'error') return result
  // Gap 11 (56-21): UE titles carry .bind on the Shipping exe, not the
  // bootstrap; stamp from the same resolver launch routing uses.
  const stampBottle = sanitizeBottleName(
    opts?.bottleName ?? resolveBridgeBottleName(appId)
  )
  const launchWrapper = stampBottle
    ? await detectLaunchDrmWrapper(
        resolve(getBottleDir(stampBottle)),
        resolve(gameExePath)
      )
    : undefined
  // Quick 261029-my4: the no-bottle fallback applies the same realpath
  // game-folder containment as detectLaunchDrmWrapper; only the contained
  // real path is ever opened (real scanned, lexical returned).
  const fallbackReal = launchWrapper
    ? null
    : await containedGameExeReal(resolve(gameExePath), 'placeShimForGame')
  // CR-02: drm (CEG) is read from the same exe the resolver chose for
  // drmWrapper, so launch routing and the persisted verdict agree.
  const drmSource = launchWrapper ? launchWrapper.drmExe : fallbackReal
  const drm = drmSource ? await detectExeSteamDrm(appId, drmSource) : undefined
  const fallbackWrapper = launchWrapper
    ? undefined
    : fallbackReal
      ? await detectDrmWrapper(fallbackReal)
      : undefined
  const flagged = withDrmWrapper(
    appId,
    gameExePath,
    result,
    launchWrapper ?? {
      drmWrapper: fallbackWrapper,
      drmExe: resolve(gameExePath)
    }
  )
  return drm === undefined ? flagged : { ...flagged, drm }
}
