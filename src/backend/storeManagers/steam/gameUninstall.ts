// Uninstall cluster lifted out of SteamGame (62-08, mechanical this->steamGame).
import i18next from 'i18next'
import { shell } from 'backend/platform'
import { rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ExecResult } from 'common/types'
import { RemoveArgs } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { isMac } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import { library } from './state'
import {
  startUninstallPolling,
  readAcfState,
  pollUninstallOnce,
  resolveInstallRoot,
  findOtherManifestsWithInstalldir,
  removeSteamInstallCopy
} from './library'
import {
  probeMacSteamPid,
  readAcfSnapshot,
  readPendingAdoption,
  clearPendingAdoption,
  decidePlayAdoption
} from './macSteamAdoption'
import {
  isBottleReady,
  getSteamBottleSettings,
  getBottleSteamappsDir,
  getBridgeBottleSettings,
  bridgeBottleNameFor,
  removePerGameBridgeBottle,
  findBridgeInstallBottle
} from './bottle'
import { isSteamNativeDeleteEnabled } from './nativeInstallSetting'
import { decideSteamNativeDelete } from './nativeDelete'
import { resolveBridgeLaunchExe } from './bridge/launchTarget'
import { NUMERIC_APP_ID } from './gameConstants'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import type SteamGame from './games'
import { ensurePlatformsCaptured, isBottleEligible } from './gameEligibility'
import {
  markBridgeGameUninstalled,
  resolveBridgeGameInstallRoot
} from './gameInstall'

export async function uninstall(
  steamGame: SteamGame,
  _args: RemoveArgs
): Promise<ExecResult> {
  await ensurePlatformsCaptured(steamGame)

  // Phase 51 Plan 09 (D-51-09): LOCATION, not eligibility — see launch()'s
  // identical comment above. uninstall() must act on wherever this
  // install's bits actually live, never on where a NEW install would
  // route (unaffected by the install_path routing fix below — see this
  // method's own JSDoc).
  if (findBridgeInstallBottle(steamGame.appId) !== null) {
    return steamGame.uninstallBridgeGame()
  }

  // D-10/D-11: a bottle-eligible title whose CrossOver bottle was never
  // provisioned has nothing installed there for install_path to resolve
  // against — request guided setup instead of a generic refuse. Unaffected
  // by the routing fix (orthogonal to WHERE install_path resolves).
  if (isBottleEligible(steamGame) && !isBottleReady()) {
    logInfo(
      `SteamGame: appId ${steamGame.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of uninstalling`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamBottleSetupRequired', {
      appName: steamGame.appId
    })
    return { stdout: '', stderr: '' }
  }

  // Reads the raw `library` Map entry directly rather than
  // getGameInfo() — getGameInfo() has a fire-and-forget lazy
  // metadata-fetch side effect (art_cover/platform capture) that an
  // internal routing read must never trigger (D-01/D-02: uninstall() must
  // not have side effects beyond the uninstall itself).
  //
  // 260907-e7a: this bypass forfeits MORE than the metadata fetch — it also
  // forfeits getGameInfo()'s `steamLibraryStore` fallback AND its Map
  // self-heal (SteamGame.getGameInfo() in games.ts; its
  // `library.set(this.appId, cached)` write-back).
  // So a bare Map read here would see nothing in the one state getGameInfo()
  // recovers from: Map miss + store hit. Audited and found UNREACHABLE — do
  // not re-open this without new evidence. The killing fact is ordering, not
  // timing: `uninstaller.ts:118` is the SOLE caller of `game.uninstall(...)`
  // in the backend (sole IPC registration: installFlowRegistration.ts:216),
  // and five lines earlier `uninstaller.ts:113` calls
  // `resolveGameTitle(libraryManagerMap, runner, appName)` ->
  // `utils/gameTitle.ts:58`'s `getGameInfo()` for THIS SAME appId. That call
  // already performed the store fallback and already wrote the entry back
  // into the Map. There is no `await` between those two calls, so nothing can
  // interleave and undo it. Corroborating (not load-bearing): SteamLibrary
  // `refresh()`'s clear->rebuild->persist span is one uninterrupted
  // synchronous block — `library.clear()` in library.ts's refresh(), the
  // plain (non-`for await`) rebuild loop after it, and the closing
  // `steamLibraryStore.set('games', Array.from(library.values()))`,
  // with ZERO await/.then/yield/return/throw in between — so no IPC handler
  // can observe a cleared Map, and the store is written FROM the Map and can
  // never hold an entry a completed refresh dropped.
  const installPath = library.get(steamGame.appId)?.install?.install_path
  const root = await resolveInstallRoot(installPath)

  if (root === 'bottle') {
    // debug/steam-bottle-uninstall-reverts (FINAL): direct deletion,
    // mechanism LIVE-CONFIRMED correct — see uninstallBottleGameDirectly()'s
    // own JSDoc. No install-provenance/ownership check remains here; that
    // distinction no longer changes routing (34.13 review A-19 removed the
    // `nativeBottleInstall` field that used to record it).
    return steamGame.uninstallBottleGameDirectly()
  }

  if (root === 'native') {
    const url = buildSteamProtocolUrl('uninstall', steamGame.appId)
    if (!url) {
      return { stdout: '', stderr: `Invalid appId: ${steamGame.appId}` }
    }

    // quick 261106-s3n: "Delete Steam games directly in GameLib" ON. OFF
    // falls through to everything below, unchanged.
    if (isSteamNativeDeleteEnabled())
      return steamGame.uninstallNativeInGameLib()

    // quick 261029-l9w: a running Steam that never adopted a GameLib install
    // ignores steam://uninstall, so remove that one state directly.
    const direct = await steamGame.uninstallUnadoptedMacNativeDirectly()
    if (direct) return direct

    logInfo(
      `SteamGame: delegating uninstall for appId ${steamGame.appId} via ${url}`,
      LogPrefix.Steam
    )
    await shell.openExternal(url)

    // Poll ACF so the badge flips to not-installed when Steam removes the
    // appmanifest, without requiring a focus round-trip (D-07). Symmetric to
    // install polling. State is never optimistically flipped here (D-02).
    startUninstallPolling(steamGame.appId)
    // quick 261029-ji2: a removed install has nothing left to adopt.
    clearPendingAdoption(steamGame.appId)

    return { stdout: '', stderr: '' }
  }

  // root === null: install_path resolves inside NEITHER the CrossOver
  // bottle nor any registered native Steam library — refuse rather than
  // guessing. This is the branch that closes the wrong-root data-loss
  // defect: a stale/empty/unresolvable install_path must never fall
  // through to deleting anything.
  logWarning(
    `SteamGame: uninstall() refused for appId ${steamGame.appId} — install_path "${installPath}" does not resolve inside any known root (bottle or native library)`,
    LogPrefix.Steam
  )
  return {
    stdout: '',
    stderr: `Refused to uninstall: install_path does not resolve inside any known root for appId ${steamGame.appId}`
  }
}

export async function uninstallBridgeGame(
  steamGame: SteamGame
): Promise<ExecResult> {
  const bottleName = getBridgeBottleSettings(
    steamGame.appId
  ).wineCrossoverBottle
  if (bottleName === bridgeBottleNameFor(steamGame.appId)) {
    const result = await removePerGameBridgeBottle(steamGame.appId)
    if (result.status === 'error') {
      logWarning(
        `SteamGame: uninstallBridgeGame failed to remove per-game bottle "${bottleName}" for appId ${steamGame.appId}: ${result.error}`,
        LogPrefix.Steam
      )
      return {
        stdout: '',
        stderr: `Failed to remove bridge bottle: ${result.error}`
      }
    }
    logInfo(
      `SteamGame: removed per-game bridge bottle "${bottleName}" for appId ${steamGame.appId} (${result.status})`,
      LogPrefix.Steam
    )
    // Finish through pollUninstallOnce, like uninstallBottleGameDirectly():
    // its 'absent' branch checks the other roots, so a surviving native or
    // bottle copy keeps the badge and gets its notice, and a full uninstall
    // gets the "Game Uninstalled" toast. markBridgeGameUninstalled() did
    // neither (live 2026-10-27, Grim Dawn 219990: native copy survived, no
    // message, badge flipped back to Play on the next refresh).
    await pollUninstallOnce(steamGame.appId, 'bridge')
    return { stdout: '', stderr: '' }
  }

  const exePath = await resolveBridgeLaunchExe(steamGame.appId)
  if (!exePath) {
    // 261017-bqw: this branch deliberately does NOT touch the manifest.
    // resolveBridgeLaunchExe returns undefined on no CM client, a PICS
    // failure or no Windows launch entry — in all three, the game's
    // files are usually still on disk. Deleting only the manifest here
    // would orphan an install GameLib could no longer see. A surviving
    // manifest re-marks a game whose files still exist, so it stays
    // visible, which is the correct outcome for this branch.
    logWarning(
      `SteamGame: uninstallBridgeGame could not resolve the bridge install location for appId ${steamGame.appId} — nothing to remove`,
      LogPrefix.Steam
    )
    markBridgeGameUninstalled(steamGame)
    return { stdout: '', stderr: '' }
  }

  const installRoot = resolveBridgeGameInstallRoot(
    steamGame,
    exePath,
    bottleName
  )
  if (!installRoot) {
    logWarning(
      `SteamGame: uninstallBridgeGame rejected an exe path outside the bridge bottle's common/ dir for appId ${steamGame.appId}`,
      LogPrefix.Steam
    )
    return {
      stdout: '',
      stderr: `Refused to uninstall: unsafe path for appId ${steamGame.appId}`
    }
  }

  // 261017-bqw (A-12 answered): no NUMERIC_APP_ID guard is added here.
  // It would be unreachable — getBridgeBottleSettings(steamGame.appId) on this
  // method's first line already throws for a non-numeric appId (via
  // bridgeBottleNameFor's NUMERIC_APP_ID test), and isBridgeEligible()
  // only admits allowlisted ids, which bridge/allowlist.ts validates with
  // a `^\d+$` zod regex. manifestPath is built only from steamGame.appId and
  // the resolved bottle's own steamapps dir, never from any other string.
  const manifestPath = join(
    getBottleSteamappsDir(bottleName),
    `appmanifest_${steamGame.appId}.acf`
  )

  try {
    rmSync(installRoot, { recursive: true, force: true })
    rmSync(manifestPath, { force: true })
  } catch (error) {
    logWarning(
      [
        `SteamGame: uninstallBridgeGame failed to remove "${installRoot}" or "${manifestPath}" for appId ${steamGame.appId}`,
        error
      ],
      LogPrefix.Steam
    )
    return {
      stdout: '',
      stderr: `Failed to remove bridge install: ${String(error)}`
    }
  }

  logInfo(
    `SteamGame: removed bridge install for appId ${steamGame.appId} at "${installRoot}" and its manifest "${manifestPath}"`,
    LogPrefix.Steam
  )
  // Same completion as the per-game branch above.
  await pollUninstallOnce(steamGame.appId, 'bridge')
  return { stdout: '', stderr: '' }
}

export async function uninstallNativeInGameLib(
  steamGame: SteamGame
): Promise<ExecResult> {
  const decision = await decideSteamNativeDelete(steamGame.appId)
  const game = steamGame.getGameInfo().title
  const refuse = (stderr: string): ExecResult => {
    sendFrontendMessage('gameStatusUpdate', {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    return { stdout: '', stderr }
  }

  switch (decision.route) {
    case 'steam-uninstalled':
      startUninstallPolling(steamGame.appId)
      clearPendingAdoption(steamGame.appId)
      return { stdout: '', stderr: '' }
    case 'fallback':
      logInfo(
        `SteamGame: deleting appId ${steamGame.appId} in GameLib (${decision.why})`,
        LogPrefix.Steam
      )
      return steamGame.removeNativeInstallDirectly()
    case 'refused-running':
      notify({
        title: game,
        body: i18next.t(
          'gamelib:steam.uninstall.gameRunning',
          '{{game}} is running. Quit it, then uninstall again.',
          { game }
        )
      })
      return refuse(`Refused to uninstall: ${steamGame.appId} is running`)
    case 'steam-error':
      notify({
        title: game,
        body: i18next.t(
          'gamelib:steam.uninstall.steamError',
          "Steam couldn't uninstall {{game}} (error {{code}}).",
          { game, code: decision.code }
        )
      })
      return refuse(
        `Steam refused to uninstall ${steamGame.appId} (error ${decision.code})`
      )
    case 'refused':
      return refuse(
        `Refused to uninstall: ${decision.reason} for appId ${steamGame.appId}`
      )
  }
}

export async function uninstallUnadoptedMacNativeDirectly(
  steamGame: SteamGame
): Promise<ExecResult | null> {
  if (!isMac) return null
  const record = readPendingAdoption(steamGame.appId)
  if (!record) return null

  const currentPid = await probeMacSteamPid().catch(() => null)
  const decision = decidePlayAdoption({
    record,
    currentPid,
    currentAcf: readAcfSnapshot(record.manifestPath)
  })
  if (decision !== 'restart') return null

  const acf = await readAcfState(steamGame.appId, 'native')
  if (acf.state !== 'installed' || !acf.installPath) return null

  // The ACF the decision was made about must be the one that gets deleted.
  const expectedManifest = join(
    resolve(acf.installPath, '..', '..'),
    `appmanifest_${steamGame.appId}.acf`
  )
  if (resolve(record.manifestPath) !== expectedManifest) {
    logWarning(
      `SteamGame: pending-adoption manifest "${record.manifestPath}" is not the native manifest "${expectedManifest}" for appId ${steamGame.appId} — delegating uninstall`,
      LogPrefix.Steam
    )
    return null
  }

  logInfo(
    `SteamGame: running Steam (pid ${currentPid}) never adopted the GameLib install of appId ${steamGame.appId} — removing it directly instead of steam://uninstall`,
    LogPrefix.Steam
  )

  return steamGame.removeNativeInstallDirectly()
}

export async function removeNativeInstallDirectly(
  steamGame: SteamGame
): Promise<ExecResult> {
  let failure: string
  try {
    const result = await removeSteamInstallCopy(steamGame.appId, 'native')
    if (result.status !== 'refused') {
      clearPendingAdoption(steamGame.appId)
      await pollUninstallOnce(steamGame.appId, 'native')
      return { stdout: '', stderr: '' }
    }
    failure = `Refused to uninstall: ${result.reason} for appId ${steamGame.appId}`
  } catch (error) {
    failure = `Failed to remove native install: ${String(error)}`
  }

  logWarning(`SteamGame: ${failure}`, LogPrefix.Steam)
  // uninstallGameCallback set "Uninstalling" and suppresses done for steam;
  // clear it (same reason as the A-10 refusal in uninstallBottleGameDirectly).
  // The record is kept, and no steam://uninstall fallback: Steam ignores it.
  sendFrontendMessage('gameStatusUpdate', {
    appName: steamGame.appId,
    runner: 'steam',
    status: 'done'
  })
  return { stdout: '', stderr: failure }
}

export async function uninstallBottleGameDirectly(
  steamGame: SteamGame
): Promise<ExecResult> {
  // 34.13 review A-12: validate the appId BEFORE building either delete
  // target. The method containment-checks `installRoot` with the full
  // resolve()+relative()+isAbsolute() idiom, then deletes a SECOND path —
  // `appmanifest_${steamGame.appId}.acf` — that got none of it. `steamGame.appId` is
  // renderer-supplied (getGame(appName) off the `uninstall` IPC channel)
  // and is validated nowhere else on this path: the sibling native branch
  // validates it via buildSteamProtocolUrl, and getSteamBottleEligibilityVerdict
  // carries NUMERIC_APP_ID for exactly this reason. `join` is not
  // containment (Phase 18) — an appId containing `../` moves the manifest
  // delete target out of steamapps/. One check at the top covers BOTH
  // delete targets, which is also what makes this method's own JSDoc claim
  // ("scoped to make over-deleting structurally impossible rather than
  // runtime-checked") true for both halves rather than only one.
  if (!NUMERIC_APP_ID.test(steamGame.appId)) {
    logWarning(
      `SteamGame: uninstallBottleGameDirectly rejected a non-numeric appId`,
      LogPrefix.Steam
    )
    return { stdout: '', stderr: 'Refused to uninstall: invalid appId' }
  }

  // Reads the raw `library` Map entry directly rather than
  // getGameInfo() — see uninstall()'s own comment on the same
  // pattern (avoids getGameInfo()'s fire-and-forget metadata-fetch side
  // effect on what must be a side-effect-free routing/guard read).
  //
  // 260907-e7a: like uninstall()'s read, this forfeits getGameInfo()'s
  // `steamLibraryStore` fallback and Map self-heal (SteamGame.getGameInfo() in games.ts), not
  // just the metadata fetch. Audited and found UNREACHABLE for the same
  // reason, and this site is strictly safer than uninstall()'s: the method
  // is `private` and its ONLY call site is `uninstall()` in gameUninstall.ts,
  // so it inherits uninstall()'s guarantee that `uninstaller.ts:113`'s
  // `resolveGameTitle` -> `getGameInfo()` already self-healed the Map for
  // this appId before control ever reached here. See uninstall()'s comment
  // above for the full evidence chain; do not re-open without new evidence.
  const entryInstallPath = library.get(steamGame.appId)?.install?.install_path
  const entryRoot = await resolveInstallRoot(entryInstallPath)
  if (entryRoot !== 'bottle') {
    logWarning(
      `SteamGame: uninstallBottleGameDirectly refused for appId ${steamGame.appId} — the library entry's install_path "${entryInstallPath}" does not resolve inside the bottle root`,
      LogPrefix.Steam
    )
    return {
      stdout: '',
      stderr: `Refused to uninstall: install_path does not resolve inside the bottle for appId ${steamGame.appId}`
    }
  }

  const acfState = await readAcfState(steamGame.appId, 'bottle')

  // 34.13 review A-10: readAcfState returns THREE states, and 'downloading'
  // (StateFlags bit 4 unset — a partial install, an interrupted depot
  // download, or a StateFlags-1026 handoff manifest) must never share the
  // 'absent' branch below. Two independent reasons:
  //   1. It is not safe to delete — a depot download may still be writing
  //      into that directory, so this is a REFUSAL, not a silent success.
  //   2. It must not reach pollUninstallOnce(), whose non-absent branch
  //      emits `gameStatusUpdate { status: 'uninstalling' }`. Nothing on
  //      this path terminates that status: uninstall() no longer calls
  //      startUninstallPolling() for the bottle root, so activeUninstallPolls
  //      is empty and no later tick or stopUninstallPolling() will ever run.
  //      The tile would read "Uninstalling" for the rest of the session with
  //      the files still on disk and no error surfaced.
  // Emit an explicit terminal `done` so any status the click already put on
  // the tile is cleared, and report a real stderr so the caller does not
  // treat this as a completed uninstall.
  if (acfState.state === 'downloading') {
    logWarning(
      `SteamGame: uninstallBottleGameDirectly refused for appId ${steamGame.appId} — the bottle manifest is mid-download/partial, cancel the in-progress install first`,
      LogPrefix.Steam
    )
    sendFrontendMessage('gameStatusUpdate', {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    return {
      stdout: '',
      stderr: `Refused to uninstall: the install for appId ${steamGame.appId} is still in progress — cancel it before uninstalling`
    }
  }

  if (acfState.state !== 'installed' || !acfState.installPath) {
    logWarning(
      `SteamGame: uninstallBottleGameDirectly found no installed bottle manifest for appId ${steamGame.appId} — nothing to remove`,
      LogPrefix.Steam
    )
    await pollUninstallOnce(steamGame.appId, 'bottle')
    return { stdout: '', stderr: '' }
  }

  const bottleName = getSteamBottleSettings().wineCrossoverBottle
  const steamappsDir = getBottleSteamappsDir(bottleName)
  const commonRoot = resolve(steamappsDir, 'common')
  const resolvedInstallPath = resolve(acfState.installPath)
  const relFromCommon = relative(commonRoot, resolvedInstallPath)
  const installdirSegment = relFromCommon.split(sep)[0]

  if (
    !installdirSegment ||
    relFromCommon.startsWith('..') ||
    isAbsolute(relFromCommon)
  ) {
    logWarning(
      `SteamGame: uninstallBottleGameDirectly rejected an install path outside the bottle's common/ dir for appId ${steamGame.appId}`,
      LogPrefix.Steam
    )
    return {
      stdout: '',
      stderr: `Refused to uninstall: unsafe path for appId ${steamGame.appId}`
    }
  }

  // SharedDepots hazard: installRoot is ALWAYS exactly one top-level
  // segment under common/ — this title's own installdir, and nothing
  // else. A shared depot's files live under a different app's own
  // installdir (a sibling of installRoot, never a parent/child of it),
  // so this rmSync can never reach into shared/redistributable depot
  // content even for a title (like Hoard) whose manifest declares
  // SharedDepots — see this method's own JSDoc.
  const installRoot = join(commonRoot, installdirSegment)
  const manifestPath = join(steamappsDir, `appmanifest_${steamGame.appId}.acf`)

  // 34.13 review A-13: the SharedDepots argument above is sound for the
  // shape its real-filesystem regression test proves, and silently assumes
  // away a different one — two installed appIds whose ACFs declare the SAME
  // `installdir`. Steam does that routinely (a game and its
  // dedicated-server/tool app, regional SKU variants, demo/base pairs), and
  // in that shape installRoot resolves to the SHARED directory: the
  // recursive rmSync would take the co-installed app's files with it while
  // only THIS appId's manifest is removed, leaving the other app's manifest
  // pointing at a now-empty path with Steam and GameLib both still believing
  // it is installed. Remove the manifest only, and let the completion
  // pipeline reconcile — a partial uninstall the user can retry beats
  // deleting a game they did not ask about.
  const conflicting = findOtherManifestsWithInstalldir(
    steamappsDir,
    installdirSegment,
    steamGame.appId
  )
  if (conflicting.length > 0) {
    logWarning(
      `SteamGame: uninstallBottleGameDirectly — installdir "${installdirSegment}" is shared with appId(s) ${conflicting.join(
        ','
      )}; removing this title's manifest only and leaving the shared directory in place`,
      LogPrefix.Steam
    )
    try {
      rmSync(manifestPath, { force: true })
    } catch (error) {
      logWarning(
        [
          `SteamGame: uninstallBottleGameDirectly failed to remove the manifest for appId ${steamGame.appId}`,
          error
        ],
        LogPrefix.Steam
      )
      return {
        stdout: '',
        stderr: `Failed to remove bottle install: ${String(error)}`
      }
    }
    await pollUninstallOnce(steamGame.appId, 'bottle')
    return { stdout: '', stderr: '' }
  }

  try {
    rmSync(installRoot, { recursive: true, force: true })
    rmSync(manifestPath, { force: true })
  } catch (error) {
    logWarning(
      [
        `SteamGame: uninstallBottleGameDirectly failed to remove "${installRoot}" for appId ${steamGame.appId}`,
        error
      ],
      LogPrefix.Steam
    )
    return {
      stdout: '',
      stderr: `Failed to remove bottle install: ${String(error)}`
    }
  }

  logInfo(
    `SteamGame: removed bottle install for appId ${steamGame.appId} at "${installRoot}"`,
    LogPrefix.Steam
  )

  // Manifest is now confirmed absent — reuse pollUninstallOnce's existing
  // 'absent' branch to flip the badge, persist, notify, and clear the
  // forcedWindowsViaBottle flag (D-17 reversibility),
  // exactly as the delegated path's own poller does once it observes this.
  await pollUninstallOnce(steamGame.appId, 'bottle')

  return { stdout: '', stderr: '' }
}
