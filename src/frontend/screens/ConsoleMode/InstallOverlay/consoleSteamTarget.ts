import { hasCapability } from 'common/storeCapabilities'
import type { Runner } from 'common/types'
import {
  resolveQuickInstallTarget,
  evaluateQuickInstallTarget,
  steamClientSetupCause,
  type SteamInstallLibraryTarget,
  type SteamQuickInstallDegrade
} from 'frontend/state/InstallGameModal'
import { useSteamClientSetup } from 'frontend/state/SteamClientSetup'

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
 *
 * The library-missing branch DOES run the shared D-UAT-15 client-setup recheck
 * (`steamClientSetupCause`, the same predicate the desktop quick install
 * uses). `SteamClientSetup` is mounted only in `App.tsx`'s non-console
 * branch, so on a client cause the card offers a hand-off to desktop mode,
 * where that dialog lives (operator decision 2026-11-02, todo
 * `2026-11-02-console-mode-steam-client-setup-unreachable`). The recheck's own
 * backend push opens the setup store under `/console` with nothing rendered,
 * which is why the overlay releases a store it did not hand off
 * (`releaseUnclaimedSteamClientSetup`).
 */

export type ConsoleFocusKey =
  | 'platform'
  | 'wine'
  | 'cancel'
  | 'install'
  | 'setupSteam'

/**
 * The setup reason the backend recheck reported when the Steam client is the
 * cause of a library-missing verdict. Derived from `steamClientSetupCause`,
 * never re-declared.
 */
export type ConsoleClientSetupHandOff = NonNullable<
  Awaited<ReturnType<typeof steamClientSetupCause>>
>

// Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
// flagged the previously-exported form as a used-in-module finding -- there
// is no external consumer, so the export served no purpose).
type ConsoleSteamVerdict =
  // `targetPath` is the resolved primary target's `path`, the library root the
  // user recognises. It is backend-enumerated, so the renderer never composes
  // it, and it is present only when a target resolved.
  | { ok: true; targetPath?: string }
  | {
      ok: false
      degrade: SteamQuickInstallDegrade
      clientSetup?: ConsoleClientSetupHandOff
    }

/**
 * Sequence: fetch `listSteamLibraryTargets()` (fail-open to `[]` on
 * rejection — native install OFF returns `[]` server-side too for a mac-native
 * title (a bottle-routed title always gets targets), so an empty
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
export async function probeSteamQuickInstallTarget(
  appName?: string
): Promise<ConsoleSteamVerdict> {
  let libraries: SteamInstallLibraryTarget[] = []
  try {
    libraries = await window.api.listSteamLibraryTargets(appName)
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

  const verdict = evaluateQuickInstallTarget(target, disk)
  if (verdict.ok) {
    return { ok: true, targetPath: target.path }
  }
  if (!verdict.ok && verdict.degrade.reason === 'library-missing' && appName) {
    const clientSetup = await steamClientSetupCause(appName)
    if (clientSetup) {
      return { ...verdict, clientSetup }
    }
  }
  return verdict
}

/**
 * Hand Steam client setup off to desktop mode. Opens the module-global
 * `useSteamClientSetup` store FIRST and leaves Console Mode SECOND. The
 * desktop `SteamClientSetup` mounts with App.tsx's non-console branch after
 * the route change and renders from an already-open store on its first render
 * (W0/W1 in `SteamClientSetup.waitingDialog.test.tsx`), so opening first leaves
 * no window in which the desktop branch renders with the store closed. The
 * explicit open also makes the hand-off independent of when the backend push
 * lands.
 */
export function handOffSteamClientSetupToDesktop(
  appName: string,
  clientSetup: ConsoleClientSetupHandOff,
  exitConsole: () => void
): void {
  useSteamClientSetup.getState().open(appName, clientSetup)
  exitConsole()
}

/**
 * Close a client-setup session the overlay did not hand off.
 * `ensureSteamClientReady` pushes `steamClientSetupRequired` while answering
 * the probe's recheck, and nothing under `/console` renders
 * `SteamClientSetup`, so the push leaves the store open with no dialog. If the
 * user dismisses the card instead of handing off, that store must not survive
 * into desktop mode as a stray dialog. Closes only a session for the SAME
 * appName, never one some other flow opened for a different game.
 */
export function releaseUnclaimedSteamClientSetup(appName: string): void {
  const state = useSteamClientSetup.getState()
  if (state.isOpen && state.appName === appName) {
    state.close()
  }
}

/**
 * What does A (or Enter/Space) do for the focused row? Both the confirm-button
 * gamepad handler (`getActionButtonIndex`) and the Enter/Space keydown branch
 * route through this pure function instead of testing `focused` directly.
 * Steam renders the same Cancel/Install row as every other store, so A on
 * Install means install for Steam too; A on Cancel dismisses; A on the
 * client-cause card's hand-off chip (`setupSteam`) hands off to desktop mode.
 *
 * The "no install before an ok verdict" guarantee is held by the overlay, not
 * here: Install is disabled and `installGame` returns early until the probe
 * resolved ok. That gate can't live in this function because the B4 test pins
 * its parameters to `{runner, focused}`. History: before quick 261107-kn8 the
 * Steam branch had no install control and auto-installed on mount, so A mapped
 * to dismiss.
 */
export function resolveConsoleActionIntent({
  runner,
  focused
}: {
  runner: Runner
  focused: ConsoleFocusKey
}): 'install' | 'dismiss' | 'handoff' | 'none' {
  if (focused === 'setupSteam') {
    return hasCapability(runner, 'installHandOffToClient') ? 'handoff' : 'none'
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
    "Your Steam library folder couldn't be found. Check that Steam is installed and has been opened at least once, and that the library's drive is connected."
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
