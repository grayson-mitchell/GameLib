import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { BottleSettingsDeps } from 'backend/storeManagers/steam/bottle'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import { getFileSize, removeFolder, sendGameStatusUpdate } from '../utils'
import {
  ConnectivityStatus,
  DMQueueElement,
  DMStatus,
  DownloadManagerState
} from 'common/types'
import {
  installQueueElement,
  resolveGameTitle,
  updateQueueElement
} from './utils'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import { notify, type DialogBoxDeps, type NotifyDeps } from '../dialog/dialog'
import type { GlobalConfigSlice } from '../config'
import i18next from 'i18next'
import { createRedistDMQueueElement } from 'backend/storeManagers/gog/redist'
import { getSteamInstallSize } from 'backend/storeManagers/steam/gameRequirements'
import { deleteCancelledSteamInstall } from 'backend/storeManagers/steam/cancelDelete'
import { steamQueueHeadAlreadyInstalled } from 'backend/storeManagers/steam/queueHeadRevalidation'
import { existsSync } from 'fs'
import type { AppPaths } from 'backend/process/context'
import { deriveGogPaths } from 'backend/storeManagers/gog/constants'
import type { OnlineMonitor } from 'backend/online_monitor'
import type {
  SteamSessionServices,
  Stores,
  StoreManagers
} from 'backend/services/types'
import { keepKnownRunnerElements, upsertFinished } from './finishedList'
import {
  hasCapability,
  isStore,
  storeCapabilities
} from 'common/storeCapabilities'

/** What the queue reads: the persisted queue store, the manager map and the connectivity feed. */
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

export interface DownloadQueueDeps
  extends DialogBoxDeps, NotifyDeps, RustInvokeDeps, AppRuntimeSlice<'events'> {
  config: GlobalConfigSlice
  stores: Pick<Stores, 'downloadManager' | 'steam'>
  managers: Pick<StoreManagers, 'library'>
  onlineMonitor: Pick<OnlineMonitor, 'isOnline' | 'onConnectivityChange'>
  /** The boot-owned abort registry a cancel signals through (66.4-13). */
  aborts: Pick<AbortRegistry, 'has' | 'call'>
  /** The boot-owned library map and per-session game maps the steam queue-head checks read (D-66.3-13). */
  steamSession: Pick<SteamSessionServices, 'libraryState' | 'gameSession'>
  /** The boot-owned Steam bottle helpers the cancelled-install cleanup resolves the bottle root through (D-66.3-15). */
  steamBottle: BottleSettingsDeps['steamBottle']
  /** The boot-owned engine runtime and path roots the bridge-bottle settings read (66.4-05). */
  engineRuntime: BottleSettingsDeps['engineRuntime']
  steamLaunchRuntime: BottleSettingsDeps['steamLaunchRuntime']
  paths: BottleSettingsDeps['paths'] &
    Pick<
      AppPaths,
      'appFolder' | 'toolsPath' | 'userData' | 'gamesConfigPath' | 'fixesPath'
    >
}

export function createDownloadQueue(deps: DownloadQueueDeps) {
  const { downloadManager } = deps.stores.downloadManager

  /*
#### Private ####
*/

  let queueState: DownloadManagerState = 'idle'
  // D-UAT-05: seeded from the persisted queue head at module load (instead of
  // staying null until initQueue()'s while loop first assigns it) so
  // pause/stop/cancel are never no-ops for a queue head that survived an app
  // restart — main.ts only calls initQueue() 5s after startup, and until this
  // var was populated, cancelCurrentDownload/pauseCurrentDownload/
  // stopCurrentDownload's `if (currentElement)` guards silently did nothing
  // (not even removing the item from the persisted queue) for that whole
  // window, so a fast click during it appeared completely non-functional and
  // the item stayed queued to auto-resume+re-wedge on the very next restart.
  let currentElement: DMQueueElement | null = null
  let autoPaused = false

  // 66.1-10/11: the steam stores slice arrives from the boot's stores service, so this module
  // no longer loads the steam store backends itself.
  const steamStoresDeps = {
    stores: { steam: deps.stores.steam },
    config: deps.config,
    requestRustInvoke: deps.requestRustInvoke,
    notifications: deps.notifications,
    steamSession: deps.steamSession,
    steamBottle: deps.steamBottle,
    engineRuntime: deps.engineRuntime,
    steamLaunchRuntime: deps.steamLaunchRuntime,
    paths: deps.paths,
    sendFrontendMessage: deps.sendFrontendMessage,
    appRuntime: deps.appRuntime
  }

  function onConnectivity(status: ConnectivityStatus) {
    if (status === 'offline' && isRunning()) {
      logInfo(
        'System offline, auto-pausing downloads',
        LogPrefix.DownloadManager
      )
      pauseCurrentDownload()
      autoPaused = true
    } else if (status === 'online' && autoPaused) {
      logInfo(
        'System online, auto-resuming downloads',
        LogPrefix.DownloadManager
      )
      autoPaused = false
      void resumeCurrentDownload()
    }
  }

  function getFirstQueueElement() {
    const elements = downloadManager.get('queue', [])
    return elements.at(0) ?? null
  }

  function isPaused(): boolean {
    return queueState === 'paused'
  }

  function isIdle(): boolean {
    return queueState === 'idle' || !currentElement
  }

  function isRunning(): boolean {
    return queueState === 'running'
  }

  function addToFinished(element: DMQueueElement, status: DMStatus) {
    const elements = downloadManager.get('finished', [])

    upsertFinished(elements, element, status)

    downloadManager.set('finished', elements)
    logInfo(
      [element.params.appName, 'added to download manager finished.'],
      LogPrefix.DownloadManager
    )
  }

  /*
#### Public ####
*/

  /**
   * Drops persisted queue/finished elements whose runner is no longer a known store (for
   * example `'zoom'` written by a build that still shipped the Zoom Platform store).
   * `deps.managers.library[runner]` would be undefined for those and crash the queue.
   */
  function pruneUnknownRunnerElements() {
    const dropped: string[] = []
    for (const key of ['queue', 'finished'] as const) {
      const list = downloadManager.get(key, [])
      const kept = keepKnownRunnerElements(list)
      if (kept.length !== list.length) {
        for (const element of list) {
          if (!kept.includes(element)) {
            dropped.push(String(element?.params?.appName))
          }
        }
        downloadManager.set(key, kept)
      }
    }
    if (dropped.length) {
      logWarning(
        `Dropped ${dropped.length} persisted download element(s) with an unknown runner: ${dropped.join(', ')}`,
        LogPrefix.DownloadManager
      )
    }
  }

  /**
   * @param isStartup debug/steam-install-slow-start (Thread B): true ONLY for
   *   the single call main.ts makes 5s after app launch. A persisted Steam
   *   queue head must never be auto-started by that unattended call — Steam
   *   native (and off-path) installs are surfaced as resumable instead,
   *   mirroring the Steam startup gate's own "surfacing as resumable, NOT
   *   auto-resuming" contract (library.ts's scanDownloadingAppIds loop), which
   *   covers installs Steam itself drives but has no effect on GameLib's own
   *   DownloadManager queue restart-auto-start. GOG/Epic/Amazon keep their
   *   existing, intended auto-resume-on-launch behavior — this flag only ever
   *   changes behavior for `runner === 'steam'`. Every OTHER caller (the
   *   Resume button's resumeCurrentDownload, a fresh addToQueue while idle,
   *   the online-reconnect auto-resume) leaves this at its default `false`,
   *   so an explicit user/app action always processes a deferred Steam item
   *   normally.
   */
  async function initQueue(isStartup = false) {
    if (isStartup) {
      pruneUnknownRunnerElements()
    }
    let element = getFirstQueueElement()

    while (element) {
      // Todo 2026-11-09: a persisted Steam install head whose exact target is
      // already a current full install (Steam took over while it was queued) is
      // dropped, not started or surfaced as resumable. Not finished either: it
      // installed nothing. 'update' elements are not revalidated, an update job
      // legitimately runs over a bit-4 manifest.
      if (
        element.type === 'install' &&
        storeCapabilities[element.params.runner].installManagedExternally &&
        (await steamQueueHeadAlreadyInstalled(
          steamStoresDeps,
          element.params.appName,
          element.params
        ))
      ) {
        const droppedName = element.params.appName
        if (currentElement?.params.appName === droppedName) {
          currentElement = null
        }
        removeFromQueue(droppedName, true)
        element = getFirstQueueElement()
        continue
      }

      if (
        isStartup &&
        storeCapabilities[element.params.runner].installManagedExternally
      ) {
        // Defer without mutating the persisted queue entry. Re-point
        // currentElement at it (it may currently reference an earlier,
        // already-completed item processed by THIS same startup call) so
        // pause/cancel/resume controls target the right element; queueState
        // is normalized to 'idle' below, which the frontend already renders
        // identically to 'paused' (isPaused = ['idle','paused'].includes) —
        // i.e. a "Resume download" affordance, not an active download.
        currentElement = element
        logInfo(
          [
            element.params.appName,
            'is a persisted Steam queue head — surfacing as resumable, NOT auto-resuming on launch (debug/steam-install-slow-start Thread B)'
          ],
          LogPrefix.DownloadManager
        )
        deps.sendFrontendMessage(
          'changedDMQueueInformation',
          downloadManager.get('queue', []),
          queueState
        )
        break
      }

      const queuedElements = downloadManager.get('queue', [])
      element.startTime = Date.now()
      queuedElements[0] = element
      downloadManager.set('queue', queuedElements)

      currentElement = element

      queueState = 'running'
      deps.sendFrontendMessage(
        'changedDMQueueInformation',
        queuedElements,
        queueState
      )

      const { status, deferredToSetup } =
        element.type === 'install'
          ? await installQueueElement(deps, element.params)
          : {
              ...(await updateQueueElement(deps, element.params)),
              deferredToSetup: false
            }
      element.endTime = Date.now()

      processNotification(element, status, deferredToSetup)

      if (!isPaused()) {
        // quick 261024-cjq: a setup-deferred install installed nothing, so it is
        // not recorded as finished.
        if (!deferredToSetup) {
          addToFinished(element, status)
        }
        removeFromQueue(element.params.appName)
        element = getFirstQueueElement()
      } else {
        element = null
      }
    }

    if (queueState !== 'paused') {
      queueState = 'idle'
    }
  }

  async function addToQueue(element: DMQueueElement) {
    if (!element) {
      logError(
        'Can not add undefined element to queue!',
        LogPrefix.DownloadManager
      )
      return
    }

    sendGameStatusUpdate(deps, {
      appName: element.params.appName,
      runner: element.params.runner,
      folder: element.params.path,
      status: 'queued'
    })

    const elements = downloadManager.get('queue', [])

    const elementIndex = elements.findIndex(
      (el) =>
        el.params.appName === element.params.appName &&
        el.params.runner === element.params.runner
    )

    if (elementIndex >= 0) {
      elements[elementIndex] = element
    } else {
      const gameInfo = deps.managers.library[element.params.runner].getGameInfo(
        element.params.appName
      )
      if (!gameInfo?.isEAManaged && !gameInfo?.isUbisoftManaged) {
        // Steam-specific size path (D-04): fetch via store appdetails API at enqueue
        // time so the DM queue shows a real GB/MB figure instead of '?? MB'.
        // GOG/Epic/Amazon continue to use getInstallInfo unchanged.
        if (
          storeCapabilities[element.params.runner].installSizeFromSteamStore
        ) {
          element.params.size = await getSteamInstallSize(
            element.params.appName,
            element.params.gameInfo
          )
        } else {
          const installInfo = await deps.managers.library[
            element.params.runner
          ].getInstallInfo(
            element.params.appName,
            element.params.platformToInstall,
            {
              branch: element.params.branch,
              build: element.params.build
            }
          )

          element.params.size = installInfo?.manifest?.download_size
            ? getFileSize(installInfo?.manifest?.download_size)
            : '?? MB'

          if (
            isStore(element.params.runner, 'gog') &&
            element.params.platformToInstall.toLowerCase() === 'windows' &&
            installInfo &&
            installInfo.manifest &&
            'dependencies' in installInfo.manifest
          ) {
            const newDependencies = installInfo.manifest.dependencies || []
            if (
              newDependencies?.length ||
              !existsSync(deriveGogPaths(deps.paths).gogRedistPath)
            ) {
              // create redist element
              const redistElement = createRedistDMQueueElement({
                libraryManagers: deps.managers.library,
                paths: deps.paths
              })
              redistElement.params.dependencies = newDependencies
              elements.push(redistElement)
            }
          }
        }
      } else {
        element.params.size = '?? MB'
      }
      elements.push(element)
    }

    downloadManager.set('queue', elements)
    logInfo(
      [element.params.gameInfo.title, ' was added to the download queue.'],
      LogPrefix.DownloadManager
    )

    deps.sendFrontendMessage('changedDMQueueInformation', elements, queueState)

    if (isIdle()) {
      void initQueue()
    }
  }

  /**
   * @param forceStatusUpdate debug/steam-cancel-abort-thread-a: when true,
   *   sends the 'done' status update UNCONDITIONALLY, even for a Steam
   *   `runner` — bypassing the "ACF poller emits the real done" suppression
   *   below. Only ever passed `true` by cancelCurrentDownload (below), which
   *   is BY DEFINITION always a deliberate user cancel: a native Steam install
   *   that gets cancelled never starts an ACF poller at all (games.ts's
   *   runNativeDepotDownload returns `{status: 'abort'}` before reaching its
   *   startInstallPolling call), so nothing else would ever clear this game's
   *   "installing"/"downloading" badge — the user-reported Thread A symptom.
   *   This clears it IMMEDIATELY, synchronously with the cancel click, instead
   *   of waiting for the in-flight install() promise to actually unwind
   *   (bounded now by the fetchChunk signal-threading fix, but still not
   *   instant). Defaults to false, preserving the exact previous behavior for
   *   every other call site (natural completion via initQueue, where the
   *   poller genuinely will fire for a successful Steam install).
   */
  function removeFromQueue(appName: string, forceStatusUpdate = false) {
    if (appName && downloadManager.has('queue')) {
      const elements = downloadManager.get('queue', [])
      const index = elements.findIndex(
        (queueElement) => queueElement?.params.appName === appName
      )
      // Capture runner BEFORE splice so the steam guard below can reference it.
      // splice/delete/set and changedDMQueueInformation MUST remain unconditional
      // so the queue always clears (cancel path included) — GAME-02.
      const removedRunner =
        index !== -1 ? elements[index]?.params.runner : undefined
      if (index !== -1) {
        elements.splice(index, 1)
        downloadManager.delete('queue')
        downloadManager.set('queue', elements)
      }

      // Steam: ACF poller emits the real done — suppress it here to prevent badge flash.
      if (
        !hasCapability(removedRunner, 'installManagedExternally') ||
        forceStatusUpdate
      ) {
        sendGameStatusUpdate(deps, {
          appName,
          status: 'done'
        })
      }

      logInfo(
        [appName, 'removed from download manager.'],
        LogPrefix.DownloadManager
      )

      deps.sendFrontendMessage(
        'changedDMQueueInformation',
        elements,
        queueState
      )
    }
  }

  function getQueueInformation() {
    const elements = downloadManager.get('queue', [])
    const finished = downloadManager.get('finished', [])

    return { elements, finished, state: queueState }
  }

  function cancelCurrentDownload({ removeDownloaded = false }) {
    if (currentElement) {
      if (Array.isArray(currentElement.params.installDlcs)) {
        const dlcsToRemove = currentElement.params.installDlcs
        for (const dlc of dlcsToRemove) {
          removeFromQueue(dlc, true)
        }
      }
      if (isRunning()) {
        stopCurrentDownload()
      }
      // debug/steam-cancel-abort-thread-a: forceStatusUpdate=true — this call
      // is BY DEFINITION a deliberate user cancel (see removeFromQueue's doc
      // comment), so the "installing"/"downloading" badge must clear now,
      // not depend on an ACF poller that a cancelled native install never
      // starts.
      removeFromQueue(currentElement.params.appName, true)

      if (removeDownloaded) {
        const { appName, runner } = currentElement.params
        if (storeCapabilities[runner].installManagedExternally) {
          // Steam never sets folder_name, so the generic delete below is a
          // no-op for it. deleteCancelledSteamInstall waits for the aborted
          // native run to settle itself (this function is synchronous), never
          // throws and logs every outcome. See todo
          // 2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.
          void deleteCancelledSteamInstall(steamStoresDeps, appName)
        } else {
          const { folder_name } = deps.managers.library[runner]
            .getGame(appName)
            .getGameInfo()
          if (folder_name) {
            void removeFolder(
              deps,
              currentElement.params.path,
              folder_name
            ).catch((error) =>
              logError(
                ['Could not remove cancelled download folder:', error],
                LogPrefix.DownloadManager
              )
            )
          }
        }
      }
      currentElement = null
    }
  }

  function pauseCurrentDownload() {
    if (currentElement) {
      stopCurrentDownload()
    }
    queueState = 'paused'
    autoPaused = false
    deps.sendFrontendMessage(
      'changedDMQueueInformation',
      downloadManager.get('queue', []),
      queueState
    )
  }

  function resumeCurrentDownload() {
    autoPaused = false
    void initQueue()
  }

  function stopCurrentDownload() {
    const { appName, runner } = currentElement!.params
    deps.aborts.call(appName)
    deps.managers.library[runner].getGame(appName).stop(false)
  }

  // notify the user based on the status of the element and the status of the queue
  function processNotification(
    element: DMQueueElement,
    status: DMStatus,
    deferredToSetup = false
  ) {
    const action = element.type === 'install' ? 'Installation' : 'Update'
    if (
      isStore(element.params.runner, 'gog') &&
      element.params.appName === 'gog-redist'
    ) {
      return
    }
    // Quick task 260905-luf (D-01): the bare, unguarded destructure this used
    // to be (`const { title } = deps.managers.library[...].getGame(...).getGameInfo()`)
    // notified with `title === undefined` whenever a Steam GameInfo double
    // cache miss returned `{}` -- a nameless OS notification. `resolveGameTitle`
    // falls back to `element.params.gameInfo?.title` (captured at enqueue
    // time, unaffected by a later cache miss) before finally falling back to
    // the raw appName. Covers every branch below (paused/canceled/failed/
    // finished) at once.
    const title = resolveGameTitle(
      deps.managers.library,
      element.params.runner,
      element.params.appName,
      element.params.gameInfo
    )

    if (status === 'abort') {
      if (isPaused()) {
        logWarning(
          [action, 'of', element.params.appName, 'paused!'],
          LogPrefix.DownloadManager
        )
        // i18next.t('notify.update.paused', 'Update Paused')
        // i18next.t('notify.install.paused', 'Installation Paused')
        notify(deps, {
          title,
          body: i18next.t(`notify.${element.type}.paused`)
        })
      } else {
        logWarning(
          [action, 'of', element.params.appName, 'aborted!'],
          LogPrefix.DownloadManager
        )
        // i18next.t('notify.update.canceled', 'Update Canceled')
        // i18next.t('notify.install.canceled', 'Installation Canceled')
        notify(deps, {
          title,
          body: i18next.t(`notify.${element.type}.canceled`)
        })
      }
    } else if (status === 'error') {
      logWarning(
        [action, 'of', element.params.appName, 'failed!'],
        LogPrefix.DownloadManager
      )
      // i18next.t('notify.update.failed', 'Update Failed')
      // i18next.t('notify.install.failed', 'Installation Failed')
      notify(deps, { title, body: i18next.t(`notify.${element.type}.failed`) })
    } else if (status === 'done') {
      // Steam: ACF poller owns the confirmed-completion toast — suppress the DM one
      // (mirrors the gog-redist early-return guard above). Epic/GOG/Amazon unchanged.
      if (!storeCapabilities[element.params.runner].installManagedExternally) {
        // i18next.t('notify.update.finished', 'Update Finished')
        // i18next.t('notify.install.finished', 'Installation Finished')
        notify(deps, {
          title,
          body: i18next.t(`notify.${element.type}.finished`)
        })
      }

      if (deferredToSetup) {
        logInfo(
          [
            action,
            'of',
            element.params.appName,
            'deferred to setup — nothing was installed'
          ],
          LogPrefix.DownloadManager
        )
        return
      }
      logInfo(
        ['Finished', action, 'of', element.params.appName],
        LogPrefix.DownloadManager
      )
    }
  }

  /**
   * Reads the persisted queue head once and subscribes to connectivity changes. Called by the
   * 'download-queue' boot step so that constructing a queue does no I/O. D-UAT-05: seeding
   * currentElement here keeps pause/stop/cancel from being no-ops for a queue head that survived
   * an app restart (initQueue only runs 5s after startup).
   */
  function start() {
    currentElement = getFirstQueueElement()
    deps.onlineMonitor.onConnectivityChange(onConnectivity)
  }

  return {
    start,
    initQueue,
    addToQueue,
    removeFromQueue,
    getQueueInformation,
    cancelCurrentDownload,
    pauseCurrentDownload,
    resumeCurrentDownload,
    isRunning
  }
}

export type DownloadQueue = ReturnType<typeof createDownloadQueue>
