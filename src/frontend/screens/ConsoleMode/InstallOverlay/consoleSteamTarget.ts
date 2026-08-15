import type { Runner } from 'common/types'
import {
  resolveQuickInstallTarget,
  evaluateQuickInstallTarget,
  type SteamInstallLibraryTarget,
  type SteamQuickInstallDegrade
} from 'frontend/state/InstallGameModal'

/**
 * The Console Mode half of D-24, extended by D-29. This module deliberately
 * does NOT call `startSteamQuickInstall` (`frontend/state/InstallGameModal`)
 * — that function's degrade branch flips `useInstallGameModal.isOpen`, which
 * would open the DESKTOP options dialog underneath a full-screen gamepad
 * overlay: either invisible or a second modal the user cannot navigate with
 * a controller, exactly what D-29 forbids. Instead this module composes the
 * same two PURE decision functions the desktop quick-install path uses
 * (`resolveQuickInstallTarget`, `evaluateQuickInstallTarget`) directly — one
 * definition of the check, two degrade shapes (the desktop options dialog vs.
 * this module's terminal in-place failure card).
 */

export type ConsoleFocusKey = 'platform' | 'wine' | 'cancel' | 'install'

export type ConsoleSteamVerdict =
  | { ok: true }
  | { ok: false; degrade: SteamQuickInstallDegrade }

/**
 * Sequence: fetch `listSteamLibraryTargets()` (fail-open to `[]` on
 * rejection — native install OFF returns `[]` server-side too, so an empty
 * list ALSO means "GameLib controls no local target", the delegated
 * `steam://install` path D-24 structurally cannot fire on); if empty, `ok`
 * with no `checkDiskSpace` call at all (a check with no subject). Otherwise
 * resolve the primary target the same way the desktop path does; if none
 * resolves, `ok`. Then probe `target.steamappsDir` — deliberately never
 * `target.path` — because `steamappsDir` is the directory the backend
 * actually writes to, and it is backend-enumerated and round-tripped
 * unmodified, never renderer-composed (see this plan's threat model,
 * T-34.13-15-02). A rejected `checkDiskSpace` yields `undefined`, which
 * `evaluateQuickInstallTarget` treats as fail-open (an UNKNOWN verdict is
 * not a failed one) — Console Mode is a couch surface with no keyboard, so a
 * misbehaving probe must never be able to wedge its only install path.
 */
export async function probeSteamQuickInstallTarget(): Promise<ConsoleSteamVerdict> {
  let libraries: SteamInstallLibraryTarget[] = []
  try {
    libraries = await window.api.listSteamLibraryTargets()
  } catch {
    libraries = []
  }

  if (libraries.length === 0) {
    return { ok: true }
  }

  const target = resolveQuickInstallTarget(libraries)
  if (!target) {
    return { ok: true }
  }

  let disk: { free: number; validPath: boolean } | undefined
  try {
    disk = await window.api.checkDiskSpace(target.steamappsDir)
  } catch {
    disk = undefined
  }

  return evaluateQuickInstallTarget(target, disk, libraries.length)
}

/**
 * The defect this closes: `focused` defaults to `'install'` and both the
 * `BTN_ACTION` gamepad handler and the Enter/Space keydown branch called
 * `installGame()` with no runner test — so before this function, one A press
 * could fire the install a D-29 check had just refused (and, on the
 * transient "Opening Steam…" state, a second concurrent install). Both input
 * paths now route through this pure function instead of testing `focused`
 * directly. Steam's Console Mode branch renders no `FocusKey` row and no
 * install control on ANY path (the transient state or the D-29 failure
 * card), so for `runner === 'steam'` the only sane answer to "what does A
 * do?" is "get me out" — unconditionally, regardless of `focused`.
 */
export function resolveConsoleActionIntent({
  runner,
  focused
}: {
  runner: Runner
  focused: ConsoleFocusKey
}): 'install' | 'dismiss' | 'none' {
  if (runner === 'steam') {
    return 'dismiss'
  }
  if (focused === 'install') {
    return 'install'
  }
  if (focused === 'cancel') {
    return 'dismiss'
  }
  return 'none'
}

/**
 * Exhaustive `[i18nKey, englishDefault]` table over
 * `SteamQuickInstallDegrade['reason']`. A third reason added upstream is a
 * compile error HERE (`Record<union, ...>` cannot be satisfied without the
 * new member), not a silently missing catalog key.
 *
 * WHY the pair and not the key alone (34.13 review WR-01): the previous
 * key-only export was never imported outside `__tests__`, and the real
 * render site inlined its own
 * `reason === 'library-missing' ? ... : ...` ternary — which routes ANY
 * future third reason into the *library-full* copy, the exact defect the
 * exhaustive mapping claims to prevent. Carrying the English default
 * alongside the key is what makes the render site a single lookup with no
 * branch left to get wrong.
 *
 * The tuple shape is also the gate-sanctioned one: `hardcodedStringGate.ts`'s
 * Pattern 2 (`isKeyDefaultTupleElement`) exempts both elements of a
 * `[dottedKey, defaultText]` pair, the same idiom `CrossoverBadge.tsx` and
 * `stateLabels.ts` already use. A bare `return 'consoleMode.x'` is NOT
 * exempt and is a blocking violation once this file enters
 * `meta/i18nGateScope.json`.
 */
const STEAM_BLOCKED_MESSAGES: Record<
  SteamQuickInstallDegrade['reason'],
  [string, string]
> = {
  'library-missing': [
    'consoleMode.steamInstallLibraryMissing',
    "Your Steam library folder isn't available right now. Reconnect the drive and try again."
  ],
  'library-full': [
    'consoleMode.steamInstallLibraryFull',
    "There isn't enough free space in your Steam library folder. Free up space and try again."
  ]
}

/**
 * The `[key, default]` pair for a degrade reason. Callers pass both straight
 * into `t()` — never re-branch on `reason` at the render site.
 */
export function steamBlockedMessage(
  reason: SteamQuickInstallDegrade['reason']
): [string, string] {
  return STEAM_BLOCKED_MESSAGES[reason]
}

/**
 * Back-compat accessor for the key alone. Kept because the exhaustiveness
 * proof in `__tests__` asserts against it directly.
 */
export function steamBlockedMessageKey(
  reason: SteamQuickInstallDegrade['reason']
): string {
  return steamBlockedMessage(reason)[0]
}
