import { GameInfo, InstalledInfo } from 'common/types'
import { join } from 'path'
import type { SteamStoresDeps } from './installRoot'
import type { SteamLibraryStateDeps } from 'backend/services/types'
import type { FrontendMessageDeps } from '../../../host/frontendMessage'
import { isFullyInstalledStateFlags } from './installedMap'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'

/**
 * D-UAT-09 (21-17): marks a Steam library entry as incomplete/resumable
 * after a SAME-SESSION native depot-download cancel (games.ts's
 * runNativeDepotDownload cancelled branch) — the one cancel path init()'s
 * startup-surface scan (above) does NOT cover, since the process never
 * restarted. Mirrors init()'s startup-surface pattern (surface as
 * resumable, never auto-drive) and reuses the existing steamResumePending
 * field (types.ts) rather than inventing a new one. Persists immediately
 * (GAP-17-BOTTLE-STORE-DIVERGENCE precedent — see pollInstallOnce's
 * 'installed' branch) so a restart mid-cancel can't read a stale
 * is_installed:true from steamLibraryStore. A no-op (never throws) when the
 * appId has no in-memory library entry — matches every other per-appId
 * surfacing helper in this file.
 */
export function markSteamInstallIncomplete(
  deps: SteamStoresDeps & SteamLibraryStateDeps & FrontendMessageDeps,
  appId: string
): void {
  const existing = deps.steamSession.libraryState.library.get(appId)
  if (!existing) return

  const updated: GameInfo = {
    ...existing,
    is_installed: false,
    install: { ...existing.install, steamResumePending: true }
  }
  deps.steamSession.libraryState.library.set(appId, updated)
  deps.stores.steam.steamLibraryStore.set(
    'games',
    Array.from(deps.steamSession.libraryState.library.values())
  )
  deps.sendFrontendMessage('pushGameToLibrary', updated)
}

/**
 * 260821-rb5: persists a crash-surviving breadcrumb the MOMENT a native
 * depot download starts (games.ts's runNativeDepotDownload, synchronously
 * before the downloadSteamDepots await), so a hard kill (kill -9, crash,
 * power loss) — which leaves partial bytes on disk with NO appmanifest_*.acf
 * (case C of
 * .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md) —
 * still leaves a record somewhere init() can find it. `targetSteamappsDir`
 * and `installdir` are the values ACTUALLY resolved for this run (including
 * a bottle-root override), never re-derived or guessed later.
 *
 * Deliberately does NOT set `is_installed: false`, unlike
 * markSteamInstallIncomplete above — this runs at install START, and on an
 * update/reinstall the existing complete install is still launchable at
 * this moment, so dropping Play here would be a lie. The interrupted-update
 * sub-case self-heals instead (its .acf still has bit 4 set, so the startup
 * self-heal in init() below clears the breadcrumb rather than surfacing
 * it) — that is the conservative, non-nagging outcome and is intended, not
 * an oversight.
 *
 * No-op (never throws) when the appId has no in-memory library entry —
 * matches every other per-appId surfacing helper in this file. Persists
 * IMMEDIATELY (same markSteamInstallIncomplete sequence) so a kill
 * microseconds later already finds it on disk.
 */
export function markSteamNativeInstallStarted(
  deps: SteamStoresDeps & SteamLibraryStateDeps & FrontendMessageDeps,
  appId: string,
  breadcrumb: {
    targetSteamappsDir: string
    installdir: string
    installedAtStart?: boolean
  }
): void {
  const existing = deps.steamSession.libraryState.library.get(appId)
  if (!existing) return

  const updated: GameInfo = {
    ...existing,
    install: {
      ...existing.install,
      steamResumePending: true,
      steamResumeTargetSteamappsDir: breadcrumb.targetSteamappsDir,
      steamResumeInstalldir: breadcrumb.installdir,
      steamResumeInstalledAtStart: breadcrumb.installedAtStart === true
    }
  }
  deps.steamSession.libraryState.library.set(appId, updated)
  deps.stores.steam.steamLibraryStore.set(
    'games',
    Array.from(deps.steamSession.libraryState.library.values())
  )
  deps.sendFrontendMessage('pushGameToLibrary', updated)
}

/**
 * 260821-rb5: clears the install-start breadcrumb above. Called both on a
 * successful native depot run (the ACF-derived path now covers this appId,
 * so keeping the breadcrumb would double-surface it) and at startup by
 * init()'s self-heal (a breadcrumb whose appId turns out to already have a
 * fully-installed on-disk manifest — see breadcrumbAppIsFullyInstalledOnDisk
 * below).
 *
 * Strips both breadcrumb fields by deleting them rather than setting them to
 * '' — absence is the discriminator getSteamResumeBreadcrumbAppIds reads.
 * No-op when there is no entry, or when the entry carries neither breadcrumb
 * field nor steamResumePending, avoiding a pointless whole-library
 * re-persist on every success.
 */
export function clearSteamResumeBreadcrumb(
  deps: SteamStoresDeps & SteamLibraryStateDeps & FrontendMessageDeps,
  appId: string
): void {
  const existing = deps.steamSession.libraryState.library.get(appId)
  if (!existing) return
  if (
    !existing.install?.steamResumePending &&
    !existing.install?.steamResumeTargetSteamappsDir &&
    !existing.install?.steamResumeInstalldir &&
    !existing.install?.steamResumeInstalledAtStart
  ) {
    return
  }

  const install = { ...existing.install }
  delete install.steamResumeTargetSteamappsDir
  delete install.steamResumeInstalldir
  delete install.steamResumeInstalledAtStart

  const updated: GameInfo = {
    ...existing,
    install: { ...install, steamResumePending: false }
  }
  deps.steamSession.libraryState.library.set(appId, updated)
  deps.stores.steam.steamLibraryStore.set(
    'games',
    Array.from(deps.steamSession.libraryState.library.values())
  )
  deps.sendFrontendMessage('pushGameToLibrary', updated)
}

/**
 * 260821-rb5: pure in-memory read over `library` — returns appIds whose
 * install-start breadcrumb is present (both steamResumeInstalldir AND
 * steamResumeTargetSteamappsDir set). Cannot throw. Exported for unit
 * testing, and consumed by init() to union with the ACF-derived
 * scanDownloadingAppIds(deps) result — case C by definition leaves no ACF, so
 * the breadcrumb is the ONLY record for that case.
 */
export function getSteamResumeBreadcrumbAppIds(
  deps: SteamLibraryStateDeps
): string[] {
  const ids: string[] = []
  for (const [
    appId,
    info
  ] of deps.steamSession.libraryState.library.entries()) {
    if (
      info.install?.steamResumeInstalldir &&
      info.install?.steamResumeTargetSteamappsDir
    ) {
      ids.push(appId)
    }
  }
  return ids
}

/**
 * 260821-rb5 self-heal predicate: is a breadcrumb-carrying appId ALREADY
 * fully installed on disk? Checked at the breadcrumb's OWN persisted
 * `steamResumeTargetSteamappsDir` rather than re-scanning
 * getSteamLibraries(deps) — the only way a bottle-rooted install
 * (targetSteamappsDirOverride) is checkable at all here. Reuses
 * isFullyInstalledStateFlags so the installed/incomplete bit logic can
 * never diverge from buildInstalledMap/buildIncompleteInstallSet.
 *
 * False (never surfaces a false-positive clear) when the breadcrumb dir is
 * absent, when no ACF exists yet (the case-C path — no manifest means
 * SURFACE, not clear), or on any throw / corrupt ACF / NaN StateFlags — fail
 * toward surfacing, since surfacing is non-destructive (matches the "skip
 * corrupt ACF" discipline used elsewhere in this file).
 */
export async function breadcrumbAppIsFullyInstalledOnDisk(
  rust: RustInvokeDeps,
  appId: string,
  install: Partial<InstalledInfo> | undefined
): Promise<boolean> {
  if (!install?.steamResumeTargetSteamappsDir) return false
  try {
    const read = await invokeSteamFiles(rust, RUST_STEAMFILES_READ_ACF, {
      path: join(
        install.steamResumeTargetSteamappsDir,
        `appmanifest_${appId}.acf`
      )
    })
    const stateFlags = read.record?.stateFlags
    if (!read.exists || !read.parsed || typeof stateFlags !== 'number') {
      return false
    }
    return isFullyInstalledStateFlags(stateFlags)
  } catch {
    return false
  }
}
