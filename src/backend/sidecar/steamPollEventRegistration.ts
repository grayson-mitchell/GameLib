/**
 * Shell-originated channel the Rust steam poll uses to change sidecar-owned state (Phase 80
 * Plan 11, D-02).
 *
 *   invoke (ipcMain.handle, 1):
 *     - `steamPollStateEvent` -> applies one state event (installed, installIncomplete,
 *       updateDone, uninstalled, bridgeUninstalled, forcedWindowsViaBottleCleared,
 *       macArchVerdict, rearmSettled) by calling the EXISTING TS functions, and replies
 *       `{applied, title?, macArchCheck?, bridgeAuthoritative?}` (gamelib-steampoll `AckReply`).
 *
 * `caller: 'shell'` (sidecarInternal.ts): it never reaches the renderer surface, and the payload
 * is schema-validated by `validateInbound` before this handler runs. Events carry the full
 * resulting state, so applying one twice leaves the same state (R1 idempotent replay).
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
import { logWarning, LogPrefix } from 'backend/logger'
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
      install_size: getFileSize(Number(ev.sizeOnDisk)),
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
        install_size: getFileSize(Number(survivor.sizeOnDisk)),
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
  ev: SteamPollStateEvent,
  refreshInstallState: () => Promise<void>
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
    case 'rearmSettled':
      if (ev.needsReconcile) await refreshInstallState()
      return { applied: true }
  }
}

/** Registers the one shell-originated poll channel. Called once from `handlers.ts`. */
export function registerSteamPollEventFlows(deps: {
  ipc: Pick<IpcRegistry, 'handle'>
  /** Built per call: ManagerDeps is assembled from services at call time. */
  manager: () => ManagerDeps
  refreshInstallState: () => Promise<void>
}): void {
  deps.ipc.handle(
    'steamPollStateEvent',
    async (_event: unknown, ...args: unknown[]): Promise<PollAckReply> => {
      const ev = args[0] as SteamPollStateEvent
      try {
        return await applyEvent(deps.manager(), ev, deps.refreshInstallState)
      } catch (err) {
        const name = err instanceof Error ? err.name : typeof err
        const appId = 'appId' in ev ? ev.appId : '?'
        logWarning(
          `steamPollStateEvent failed for app ${appId} kind ${ev.kind} (${name})`,
          LogPrefix.Steam
        )
        return { applied: false }
      }
    }
  )
}
