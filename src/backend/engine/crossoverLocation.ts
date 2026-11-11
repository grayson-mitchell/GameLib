/**
 * Single resolver for the CrossOver `bin` directory (quick 261024-cjq).
 *
 * CrossOver may live in /Applications, in ~/Applications, or anywhere
 * Spotlight finds the bundle id (getCrossover() runs mdfind). Nothing under
 * src/ may hard-code one of those; every cxbottle / wineserver / wine spawn
 * resolves through here.
 */
import { join, dirname } from 'path'
import { existsSync } from 'graceful-fs'
import type { AppPaths } from 'backend/process/context'
import { logWarning, LogPrefix } from 'backend/logger'
import type { WineInstallation } from 'common/types'
import type { ProcessRunner } from 'backend/process/types'

const CROSSOVER_BIN_SUBPATH = 'Contents/SharedSupport/CrossOver/bin'
const WINE_BIN_SUFFIX = '/SharedSupport/CrossOver/bin/wine'

export function crossoverBinDirFromWineBin(
  wineBin: string
): string | undefined {
  if (typeof wineBin !== 'string' || !wineBin.endsWith(WINE_BIN_SUFFIX)) {
    return undefined
  }
  return dirname(wineBin)
}

function hasCxbottle(dir: string | undefined): dir is string {
  return !!dir && existsSync(join(dir, 'cxbottle'))
}

export interface CrossoverLocator {
  resolveCrossoverBinDir: (opts?: {
    wineVersion?: WineInstallation
    hintWineBins?: string[]
  }) => string | undefined
  resolveCrossoverBinDirAsync: (
    deps: { runner: Pick<ProcessRunner, 'run'> },
    opts?: {
      wineVersion?: WineInstallation
      hintWineBins?: string[]
    }
  ) => Promise<string | undefined>
}

/** One locator per boot: the memoised bin dir is closure state, probed on first use, never at construction. */
export function createCrossoverLocator(deps: {
  paths: Pick<AppPaths, 'userHome'>
}): CrossoverLocator {
  let memoisedBinDir: string | undefined

  function resolveCrossoverBinDir(opts?: {
    wineVersion?: WineInstallation
    hintWineBins?: string[]
  }): string | undefined {
    const candidates: (string | undefined)[] = []
    if (opts?.wineVersion?.type === 'crossover') {
      candidates.push(crossoverBinDirFromWineBin(opts.wineVersion.bin))
    }
    for (const bin of opts?.hintWineBins ?? []) {
      candidates.push(crossoverBinDirFromWineBin(bin))
    }
    candidates.push(
      memoisedBinDir,
      // Probe candidates (the two default install locations), not hard-codes.
      join('/Applications/CrossOver.app', CROSSOVER_BIN_SUBPATH),
      join(
        deps.paths.userHome,
        'Applications/CrossOver.app',
        CROSSOVER_BIN_SUBPATH
      )
    )
    return candidates.find(hasCxbottle)
  }

  async function resolveCrossoverBinDirAsync(
    asyncDeps: { runner: Pick<ProcessRunner, 'run'> },
    opts?: {
      wineVersion?: WineInstallation
      hintWineBins?: string[]
    }
  ): Promise<string | undefined> {
    const sync = resolveCrossoverBinDir(opts)
    if (sync) return sync
    try {
      const { getCrossover } =
        await import('backend/utils/compatibility_layers')
      const found = await getCrossover({ runner: asyncDeps.runner })
      for (const entry of found ?? []) {
        const dir = crossoverBinDirFromWineBin(entry.bin)
        if (hasCxbottle(dir)) {
          memoisedBinDir = dir
          return dir
        }
      }
    } catch (error) {
      logWarning(
        ['resolveCrossoverBinDirAsync: getCrossover failed', error],
        LogPrefix.Backend
      )
    }
    return undefined
  }

  return { resolveCrossoverBinDir, resolveCrossoverBinDirAsync }
}
