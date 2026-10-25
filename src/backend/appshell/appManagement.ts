/**
 * macOS "App Management" permission probe (quick 261026-b9r).
 *
 * CrossOver's `cxbottle --create` (spawned by GameLib, so GameLib is the
 * responsible process) writes inside app bundles. macOS gates that behind the
 * App Management TCC service and shows "GameLib was prevented from modifying
 * apps" mid-install. The write is CrossOver's own, so it cannot be avoided; the
 * permission is requested up front instead (RESEARCH Finding 1).
 *
 * There is no public API to read the grant. A create-and-unlink probe inside
 * the detected CrossOver bundle's `Contents/` works (RESEARCH Finding 2):
 * EPERM -> denied, success -> granted. EACCES is POSIX ownership (for example
 * a root-owned bundle), not TCC, so it is `unknown`, never `denied`.
 *
 * An EPERM probe deliberately makes macOS list GameLib (toggled off) under
 * System Settings > Privacy & Security > App Management and show its
 * notification, so the user only has to flip the switch. A grant takes effect
 * only after GameLib relaunches.
 *
 * Sidecar exit contract: only awaited one-shot fs promises, no timers,
 * watchers or retained handles, and nothing runs at import or boot.
 *
 * MUST NOT import `electron`.
 */
import { join, resolve } from 'path'
import { writeFile, unlink } from 'fs/promises'

import type { AppManagementStatus } from '../../common/types'
import { resolveCrossoverBinDirAsync } from '../storeManagers/steam/crossoverLocation'
import { logInfo, logWarning, LogPrefix } from '../logger'

export const APP_MANAGEMENT_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles'

const APP_MANAGEMENT_PROBE_NAME = '.gamelib-appmgmt-probe'

export function classifyProbeError(error: unknown): AppManagementStatus {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'EPERM'
  ) {
    return 'denied'
  }
  return 'unknown'
}

function errorCode(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined
  return typeof code === 'string' ? code : 'none'
}

interface AppManagementDeps {
  platform?: NodeJS.Platform
  resolveBinDir?: () => Promise<string | undefined>
  writeFile?: (path: string, data: string) => Promise<void>
  unlink?: (path: string) => Promise<void>
}

export async function getAppManagementStatus(
  deps: AppManagementDeps = {}
): Promise<AppManagementStatus> {
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') return 'not-needed'

  const binDir = await (
    deps.resolveBinDir ?? (() => resolveCrossoverBinDirAsync())
  )()
  if (!binDir) return 'not-needed'

  // bin -> CrossOver -> SharedSupport -> Contents
  const contents = resolve(binDir, '..', '..', '..')
  const probePath = join(contents, APP_MANAGEMENT_PROBE_NAME)

  try {
    await (deps.writeFile ?? writeFile)(probePath, '')
  } catch (error) {
    const status = classifyProbeError(error)
    logInfo(
      `App Management probe failed (code ${errorCode(error)}) -> ${status}`,
      LogPrefix.Backend
    )
    return status
  }

  try {
    await (deps.unlink ?? unlink)(probePath)
  } catch (error) {
    logWarning(
      `App Management probe file could not be removed (code ${errorCode(
        error
      )}); access itself is granted`,
      LogPrefix.Backend
    )
  }
  return 'granted'
}
