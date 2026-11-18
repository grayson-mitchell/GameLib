/**
 * Shell-originated channel the Rust steam poll uses to change sidecar-owned state (Phase 80
 * Plan 11, D-02).
 *
 *   invoke (ipcMain.handle, 1):
 *     - `steamPollStateEvent` -> applies one state event (installed, installIncomplete,
 *       updateDone, uninstalled, bridgeUninstalled, forcedWindowsViaBottleCleared,
 *       macArchVerdict, adoptionState) by calling the EXISTING TS functions, and replies
 *       `{applied, title?, macArchCheck?, bridgeAuthoritative?}` (gamelib-steampoll `AckReply`).
 *
 * `caller: 'shell'` (sidecarInternal.ts): it never reaches the renderer surface, and the payload
 * is schema-validated by `validateInbound` before this handler runs. Events carry the full
 * resulting state, so applying one twice leaves the same state (R1 idempotent replay).
 *
 * Seq guard (80-REVIEW C-IN-04): replay and live sends can cross, and a write the shell gave up
 * on can land late, so an older event can arrive after a newer one. The handler keeps the last
 * applied seq in memory, per appId for the install-state group (`installed`, `uninstalled`,
 * `installIncomplete`, matching the crate's `outbox::is_install_state_kind`) and per
 * (appId, kind) for every other kind. An event whose seq is not newer is answered
 * `applied: true` with no state change, so the crate drops it instead of retrying. The guard is
 * session state, never persisted: seq restarts at 1 with every shell process, and a sidecar
 * restart starts a fresh guard with the fresh registration.
 * Caveat: the guard orders Rust events among themselves only. A TS-originated write
 * (`refreshInstallState`, `pollUninstallOnce`) carries no seq, so a queued Rust event replayed
 * after it can still overwrite it; both read the same manifests, so the next reconcile converges.
 *
 * Refusals (80-REVIEW C-WR-08): the shell retries an unacked or `applied: false` event every
 * 10 s for the rest of the session. A refusal that retrying cannot change (a stale seq, no
 * library entry to update) is therefore answered `applied: true`. Only a thrown apply, which may
 * be transient, answers `applied: false`.
 *
 * Ordering (R2): `pushGameToLibrary` is sent from inside the apply, before the handler returns.
 * The shell's single stdout reader keeps that order, so the push precedes the ack on the wire.
 *
 * Logging: channel, appId and kind only, plus an error name on failure; never a path or payload
 * (T-28-04). No timers, watchers or handles are created here (sidecar exit contract).
 *
 * `applyInstalled` and `applyUninstalled` reproduce the library mutations the TS install poll
 * (the deleted per-tick install poll, installed branch) and library/uninstallPolling.ts
 * (survivor branch, not-installed branch) used to write inline; this handler is what survives.
 */

import type { SteamGameInfo } from 'common/types/steam'
import type { SteamPollStateEvent } from 'common/types/ipc/sidecarInternal'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { getFileSize } from 'backend/utils'
import type { ManagerDeps } from 'backend/services/types'
import type { IpcRegistry } from './ipcRegistry'
import SteamGame from '../storeManagers/steam/games'
import { installPlatformForSource } from '../storeManagers/steam/library/installRoot'
import type { AcfSource } from '../storeManagers/steam/library/installRoot'
import { isBridgeAuthoritativeForInstallState } from '../storeManagers/steam/library/installRoot'
import { installVersionField } from '../storeManagers/steam/library/installedMap'
import { markSteamInstallIncomplete } from '../storeManagers/steam/library/resumeBreadcrumbs'
import {
  applyMacArchVerdict,
  macArchCheckNeeded
} from '../storeManagers/steam/library/macArch'
import { invalidateSteamUpdateState } from '../storeManagers/steam/updateDetection'
import { clearForcedWindowsViaBottle } from '../storeManagers/steam/gameSessionState'
import { markBridgeGameUninstalled } from '../storeManagers/steam/bridgeInstallState'
import { clearAndUnwatchPendingAdoption } from '../storeManagers/steam/adoptionWatch'
import { noteAdoptionSignedIn } from '../storeManagers/steam/adoptionStatus'

export interface PollAckReply {
  applied: boolean
  title?: string
  macArchCheck?: boolean
  bridgeAuthoritative?: boolean
}

function persistAndPush(deps: ManagerDeps, updated: SteamGameInfo): void {
  const { libraryState } = deps.steamSession
  libraryState.library.set(updated.app_name, updated)
  // GAP-17-BOTTLE-STORE-DIVERGENCE: persist immediately so a restart cannot read a stale state.
  deps.stores.steam.steamLibraryStore.set(
    'games',
    Array.from(libraryState.library.values())
  )
  deps.sendFrontendMessage('pushGameToLibrary', updated)
}

/**
 * A raw ACF `SizeOnDisk` string from Rust, which passes it through unvalidated (it may be empty
 * or non-numeric). Anything that is not a finite, non-negative number counts as 0 bytes
 * (80-REVIEW C-WR-08).
 */
function sizeOnDiskBytes(raw: string): number {
  const bytes = Number(raw)
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : 0
}

type InstalledEvent = Extract<SteamPollStateEvent, { kind: 'installed' }>
type UninstalledEvent = Extract<SteamPollStateEvent, { kind: 'uninstalled' }>

function applyInstalled(deps: ManagerDeps, ev: InstalledEvent): void {
  const existing = deps.steamSession.libraryState.library.get(ev.appId)
  if (!existing) return // never fabricate an entry (as the TS poll)
  persistAndPush(deps, {
    ...existing,
    is_installed: true,
    install: {
      install_path: ev.installPath,
      install_size: getFileSize(sizeOnDiskBytes(ev.sizeOnDisk)),
      platform: installPlatformForSource(ev.source),
      ...installVersionField(ev.buildid)
    }
  })
}

function applyUninstalled(deps: ManagerDeps, ev: UninstalledEvent): void {
  const existing = deps.steamSession.libraryState.library.get(ev.appId)
  if (!existing) return
  const { survivor } = ev
  if (survivor) {
    persistAndPush(deps, {
      ...existing,
      is_installed: true,
      install: {
        install_path: survivor.installPath,
        install_size: getFileSize(sizeOnDiskBytes(survivor.sizeOnDisk)),
        platform: installPlatformForSource(survivor.source),
        ...installVersionField(survivor.buildid)
      }
    })
    return
  }
  persistAndPush(deps, { ...existing, is_installed: false, install: {} })
}

async function applyEvent(
  deps: ManagerDeps,
  ev: SteamPollStateEvent
): Promise<PollAckReply> {
  const titleOf = (appId: string) =>
    deps.steamSession.libraryState.library.get(appId)?.title ?? ''
  switch (ev.kind) {
    case 'installed': {
      applyInstalled(deps, ev)
      return {
        applied: true,
        title: titleOf(ev.appId),
        macArchCheck: macArchCheckNeeded(deps, ev.appId, ev.source as AcfSource)
      }
    }
    case 'installIncomplete':
      markSteamInstallIncomplete(deps, ev.appId)
      return { applied: true, title: titleOf(ev.appId) }
    case 'updateDone': {
      invalidateSteamUpdateState(deps, ev.appId)
      const existing = deps.steamSession.libraryState.library.get(ev.appId)
      if (ev.completed && existing) {
        deps.sendFrontendMessage('pushGameToLibrary', existing)
      }
      return { applied: true, title: titleOf(ev.appId) }
    }
    case 'uninstalled':
      applyUninstalled(deps, ev)
      return {
        applied: true,
        title: titleOf(ev.appId),
        bridgeAuthoritative: isBridgeAuthoritativeForInstallState(
          deps,
          ev.appId
        )
      }
    case 'bridgeUninstalled':
      markBridgeGameUninstalled(new SteamGame(ev.appId, deps))
      return { applied: true, title: titleOf(ev.appId) }
    case 'forcedWindowsViaBottleCleared':
      clearForcedWindowsViaBottle(deps, ev.appId)
      return {
        applied: true,
        title: titleOf(ev.appId),
        bridgeAuthoritative: isBridgeAuthoritativeForInstallState(
          deps,
          ev.appId
        )
      }
    case 'macArchVerdict':
      await applyMacArchVerdict(deps, ev.appId, ev.verdict)
      return { applied: true, title: titleOf(ev.appId) }
    case 'adoptionState':
      // Phase 81 D-03: store the watch's signed-in reading and push the page status once; the
      // note switches between "restart once" and "Sign in to Steam" without a reload.
      // D-07: Steam adopted the install, so the pending-adoption record is done. The clear drops
      // the cached reading and pushes pending:false (the note goes away); unwatching an entry
      // Rust already dropped is a no-op, and clearing an absent record is too.
      if (ev.adopted) {
        clearAndUnwatchPendingAdoption(deps, ev.appId)
        logInfo(
          `steamPollStateEvent adoptionState appId=${ev.appId} adopted`,
          LogPrefix.Steam
        )
      } else {
        noteAdoptionSignedIn(deps, ev.appId, ev.signedIn)
      }
      return { applied: true, title: titleOf(ev.appId) }
  }
}

/** The crate's `outbox::is_install_state_kind`: these kinds each write an app's whole install state. */
const INSTALL_STATE_KINDS: readonly SteamPollStateEvent['kind'][] = [
  'installed',
  'uninstalled',
  'installIncomplete'
]

/** The seq-guard key: one per appId for the install-state group, else one per (appId, kind). */
function seqGuardKey(ev: SteamPollStateEvent): string {
  const appId = 'appId' in ev ? ev.appId : ''
  return INSTALL_STATE_KINDS.includes(ev.kind)
    ? `${appId}`
    : `${appId}:${ev.kind}`
}

/**
 * Last-applied seq per guard key (80-REVIEW C-IN-04). In memory only, one per registration (one
 * per sidecar process); bounded by the number of library apps times the kinds.
 */
function createSeqGuard() {
  const lastApplied = new Map<string, number>()
  return {
    isStale: (ev: SteamPollStateEvent): boolean => {
      const last = lastApplied.get(seqGuardKey(ev))
      return last !== undefined && ev.seq <= last
    },
    noteApplied: (ev: SteamPollStateEvent): void => {
      const key = seqGuardKey(ev)
      const last = lastApplied.get(key)
      if (last === undefined || ev.seq > last) lastApplied.set(key, ev.seq)
    }
  }
}

/** Registers the one shell-originated poll channel. Called once from `handlers.ts`. */
export function registerSteamPollEventFlows(deps: {
  ipc: Pick<IpcRegistry, 'handle'>
  /** Built per call: ManagerDeps is assembled from services at call time. */
  manager: () => ManagerDeps
}): void {
  const seqGuard = createSeqGuard()
  deps.ipc.handle(
    'steamPollStateEvent',
    async (_event: unknown, ...args: unknown[]): Promise<PollAckReply> => {
      const ev = args[0] as SteamPollStateEvent
      try {
        if (seqGuard.isStale(ev)) {
          // Consumed, not applied: a newer event for the same state already landed.
          const manager = deps.manager()
          const title =
            manager.steamSession.libraryState.library.get(ev.appId)?.title ?? ''
          return { applied: true, title }
        }
        const reply = await applyEvent(deps.manager(), ev)
        if (reply.applied) seqGuard.noteApplied(ev)
        return reply
      } catch (err) {
        const name = err instanceof Error ? err.name : typeof err
        logWarning(
          `steamPollStateEvent failed for app ${ev.appId} kind ${ev.kind} (${name})`,
          LogPrefix.Steam
        )
        return { applied: false }
      }
    }
  )
}
