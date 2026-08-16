/**
 * Quick task 260816-qcn — the single freshest-write-wins precedence decision
 * shared by BOTH Steam platform-signal writers: `games.ts`'s per-game
 * `appdetails` fetch and `platformCapture.ts`'s bulk PICS `oslist` capture.
 * Closes todo `2026-08-16-steam-platform-signal-two-writers-no-precedence-rule.md`
 * (Phase 34.15 review finding WR-02 — the root mechanism behind the CR-01
 * BLOCKER, whose symptom was fixed in `77f094bfd` while the cause stayed
 * live). Before this module, whichever writer ran most recently won, purely
 * by call ordering.
 *
 * Kept dependency-free — no `electron-store` import, only structural
 * parameter types — mirroring `./metadataCapture.ts`'s extraction pattern
 * (its own header explains why: it is what lets the Backend jest project
 * unit-test this module without pulling `electron-store` in).
 *
 * THE RULE (D-A, locked, see `260816-qcn-CONTEXT.md`): neither `appdetails`
 * nor PICS `oslist` is authoritative. Whichever capture is STRICTLY NEWER
 * wins; a tie goes to the incoming write. An existing entry with no
 * `platformsCapturedAt` (every pre-this-task cache entry) is treated as
 * indefinitely old and is writable by either source (D-D) — no `Migration`
 * is added anywhere for this (`MigrationSystem` is dead code under Tauri:
 * `applyMigrations()` only runs in Electron's `whenReady()`).
 *
 * THE HONESTY LIMIT (D-B, load-bearing — read this before touching this
 * file): freshest-write-wins makes the ordering EXPLICIT and AUDITABLE, and
 * makes a silently-lost write impossible — that is the whole of what it
 * fixes. It does NOT reconcile a genuine `appdetails`-vs-PICS disagreement:
 * when the two sources disagree about an app, the surviving answer STILL
 * depends on which sync ran most recently. What changes is that the outcome
 * is now inspectable after the fact via `platformsSource` +
 * `platformsCapturedAt`. Do not describe WR-02 as closed, or the two-writer
 * conflict as resolved/reconciled, anywhere in this file or its callers.
 */

export type PlatformSignalSource = 'appdetails' | 'pics'

export interface PlatformTriple {
  is_windows_native: boolean
  is_mac_native: boolean
  is_linux_native: boolean
}

export interface PlatformWriteResolution {
  platforms: PlatformTriple
  platformsSource: PlatformSignalSource
  platformsCapturedAt: number
  accepted: boolean
}

/**
 * Structural view of the fields this function reads off an existing cache
 * entry. Deliberately a LOCAL structural twin of the relevant slice of
 * `SteamMetadataCacheEntry` — importing that type would pull `./electronStores`
 * (and therefore `electron-store`) in, breaking the dependency-free contract
 * documented above. Also deliberately NOT importing `platformCapture.ts`'s
 * `CapturedPlatforms` for the same reason `platformCapture.ts` doesn't import
 * `PlatformTriple` from here — either direction would make the two modules
 * circular.
 */
export interface ExistingPlatformEntry {
  is_windows_native?: boolean
  is_mac_native?: boolean
  is_linux_native?: boolean
  platformsSource?: PlatformSignalSource
  platformsCapturedAt?: number
}

/** Hard constraint 2 (three-valued platform contract): an existing entry can
 *  only WIN a precedence decision if it can supply a COMPLETE triple. A
 *  strictly-newer entry with one or more platform booleans still `undefined`
 *  must not be allowed to stand — declining there would leave a partial
 *  capture in place, which is exactly the "manufactured partial capture"
 *  hard constraint 2 forbids. */
function hasCompleteTriple(entry: ExistingPlatformEntry): boolean {
  return (
    entry.is_windows_native !== undefined &&
    entry.is_mac_native !== undefined &&
    entry.is_linux_native !== undefined
  )
}

/**
 * Decides, by strict timestamp comparison, whether an incoming platform
 * write should be persisted (`accepted: true`, use `incoming`) or declined
 * in favour of the existing capture (`accepted: false`, use `existing`'s
 * triple). See this module's header for the full rule and its honesty
 * limit — this function implements D-A/D-D exactly, symmetrically, for
 * both `'pics'` and `'appdetails'` callers.
 *
 * The `existing?.platformsCapturedAt` read is guarded with
 * `typeof === 'number' && Number.isFinite(...)` rather than a bare
 * comparison: the on-disk store is untyped JSON, so a corrupted or
 * unexpectedly-typed value (`NaN`, a string, etc.) is a legitimate runtime
 * shape here, not a programming error. Such a value degrades to
 * "indefinitely old / writable by either source" rather than to a `NaN`
 * comparison, which would silently decline every future write forever (see
 * T-qcn-01 in this task's threat register).
 */
export function resolvePlatformWrite(
  existing: ExistingPlatformEntry | null | undefined,
  incoming: PlatformTriple,
  source: PlatformSignalSource,
  capturedAt: number
): PlatformWriteResolution {
  const existingCapturedAt = existing?.platformsCapturedAt
  const hasValidExistingTimestamp =
    typeof existingCapturedAt === 'number' &&
    Number.isFinite(existingCapturedAt)

  const existingIsStrictlyNewer =
    hasValidExistingTimestamp && (existingCapturedAt as number) > capturedAt

  if (existingIsStrictlyNewer && existing && hasCompleteTriple(existing)) {
    // DECLINE: the existing capture is strictly newer and complete. On
    // decline, `platformsSource` falls back to the incoming `source` only if
    // `existing.platformsSource` is itself absent — an entry that has a
    // timestamp but no recorded source is stamped honestly rather than left
    // blank, rather than silently attributing it to the writer that just
    // lost.
    return {
      platforms: {
        is_windows_native: existing.is_windows_native as boolean,
        is_mac_native: existing.is_mac_native as boolean,
        is_linux_native: existing.is_linux_native as boolean
      },
      platformsSource: existing.platformsSource ?? source,
      platformsCapturedAt: existingCapturedAt as number,
      accepted: false
    }
  }

  // ACCEPT: covers every other case per D-A/D-D — existing is
  // null/undefined/{}, has no valid timestamp (legacy entry or a corrupted
  // one), has an equal or older timestamp (ties go to the incoming writer),
  // or is strictly newer but cannot supply a complete triple.
  return {
    platforms: incoming,
    platformsSource: source,
    platformsCapturedAt: capturedAt,
    accepted: true
  }
}
