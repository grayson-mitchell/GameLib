import type { SteamDialogLibraryOption } from './SteamDialog/installTarget'

/**
 * quick 261105-upw (todo 2026-11-05-steam-installapp-modal-owns-disk-and-
 * folder) -- which route installs a Steam title, as the install modal sees it.
 *
 * Zero-runtime-import module (types only) for the same reason as
 * `steamSectionGating.ts`: `InstallModal/index.tsx` imports scss, so pure
 * logic must live outside it to be testable.
 *
 * Two meanings are kept apart on purpose:
 *   - `nativeInstallOn` -- "GameLib's depot installer installs this" (a
 *     non-empty `listSteamLibraryTargets` list). Feeds `SteamDialog`'s
 *     sign-in gate and notice copy. UNCHANGED, and false on the InstallApp
 *     route.
 *   - `libraryChoiceOwned` -- "GameLib owns the library choice". True on the
 *     native route AND on the opt-in InstallApp route (Steam's own dialog
 *     never opens there). Feeds the section-gating resolver, so the library
 *     dropdown and free-space line render.
 * Both derive from backend replies only (RESEARCH Pitfall 4: no renderer
 * settings read).
 */

type SteamLibraryRoute = {
  targets: SteamDialogLibraryOption[]
  installAppRoute: boolean
}

type RouteApi = {
  getSteamInstallAppTargets: (appName?: string) => Promise<{
    installAppRoute: boolean
    libraries: SteamDialogLibraryOption[]
  }>
  logError: (message: string) => void
}

const CLOSED = (): SteamLibraryRoute => ({
  targets: [],
  installAppRoute: false
})

/**
 * Resolves the route after the primary `listSteamLibraryTargets` fetch. Asks
 * the follow-up only when that list was empty. NEVER rejects: the caller's
 * outer `.catch` must keep meaning "the primary fetch was rejected".
 */
export async function resolveSteamLibraryRoute(
  api: RouteApi,
  appName: string,
  libraries: SteamDialogLibraryOption[]
): Promise<SteamLibraryRoute> {
  if (libraries.length > 0) {
    return { targets: libraries, installAppRoute: false }
  }
  try {
    const reply = await api.getSteamInstallAppTargets(appName)
    if (
      reply &&
      reply.installAppRoute === true &&
      Array.isArray(reply.libraries)
    ) {
      return { targets: reply.libraries, installAppRoute: true }
    }
    return CLOSED()
  } catch {
    api.logError(
      `quick 261105-upw InstallModal: InstallApp route fetch failed for appName "${appName}"`
    )
    return CLOSED()
  }
}

export function deriveSteamLibraryOwnership(
  settled: SteamLibraryRoute | undefined
): { nativeInstallOn: boolean; libraryChoiceOwned: boolean } {
  const nativeInstallOn =
    !!settled && !settled.installAppRoute && settled.targets.length > 0
  return {
    nativeInstallOn,
    libraryChoiceOwned:
      nativeInstallOn || (!!settled && settled.installAppRoute)
  }
}
