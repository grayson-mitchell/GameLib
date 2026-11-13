import { mkdirSync, copyFileSync, rmSync } from 'fs'
import { join } from 'path'
import { getSteamLibraries } from 'backend/utils'
import {
  buildIncompleteInstallSet,
  buildInstalledMap
} from '../../../library/installedMap'
import {
  findOtherManifestsWithInstalldir,
  readAcfState,
  scanDownloadingAppIds
} from '../../../library/acfState'
import { breadcrumbAppIsFullyInstalledOnDisk } from '../../../library/resumeBreadcrumbs'
import { HANGS_MARKER, capture, listFiles, withFixtureCopy } from './normalize'

/** Distro path getSteamLibraries always prepends; filtered when absent. */
const SYSTEM_STEAM = '/usr/share/steam'

/** Library deps: only `config.getSettings().defaultSteamPath` is read. */
function depsFor(steamRoot: string) {
  return {
    config: { getSettings: () => ({ defaultSteamPath: steamRoot }) }
  } as never
}

/** A temp Steam root whose steamapps/libraryfolders.vdf is `fixture`. */
function steamRootWith(root: string, fixture: string, id: string): string {
  const steam = join(root, '_steam', id)
  mkdirSync(join(steam, 'steamapps'), { recursive: true })
  copyFileSync(
    join(root, 'libraryfolders', `${fixture}.vdf`),
    join(steam, 'steamapps', 'libraryfolders.vdf')
  )
  return steam
}

export async function captureLibrary(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('', async (root) => {
    // appmanifest_30.acf is truncated: @node-steam/vdf parse never returns on
    // it (see VDF_PARSE_HANGS), so every scan that would reach it hangs. The
    // scans run over a copy without it; the hang is recorded as its own case.
    rmSync(join(root, 'scan', 'lib1', 'steamapps', 'appmanifest_30.acf'))
    for (const fn of [
      'buildInstalledMap',
      'buildIncompleteInstallSet',
      'scanDownloadingAppIds',
      'findOtherManifestsWithInstalldir',
      'readAcfState/30'
    ]) {
      out[`library/${fn}/with-truncated-manifest`] = HANGS_MARKER
    }

    const stripSystem = (libs: string[]) =>
      libs.filter((l) => l !== SYSTEM_STEAM)

    for (const file of listFiles(join(root, 'libraryfolders'))) {
      const name = file.slice(0, -'.vdf'.length)
      const steam = steamRootWith(root, name, name)
      out[`library/getSteamLibraries/${name}`] = await capture(
        async () => stripSystem(await getSteamLibraries(depsFor(steam))),
        root
      )
    }
    out['library/getSteamLibraries/no-file'] = await capture(
      async () =>
        stripSystem(await getSteamLibraries(depsFor(join(root, '_nowhere')))),
      root
    )

    // modern.vdf lists scan/lib1, scan/lib2 and one missing path.
    const steam = steamRootWith(root, 'modern', 'scan')
    const deps = depsFor(steam)
    out['library/buildInstalledMap/scan'] = await capture(
      () => buildInstalledMap(deps),
      root
    )
    out['library/buildIncompleteInstallSet/scan'] = await capture(
      () => buildIncompleteInstallSet(deps),
      root
    )
    for (const appId of ['10', '20', '40', '99']) {
      out[`library/readAcfState/${appId}`] = await capture(
        () => readAcfState(deps, appId),
        root
      )
    }

    // Smallest fake of SteamLibraryStateDeps: only libraryState.library.has().
    const stateDeps = {
      ...(deps as object),
      steamSession: {
        libraryState: {
          library: new Map([
            ['10', {}],
            ['20', {}],
            ['40', {}]
          ])
        }
      }
    } as never
    // readdir order is filesystem dependent; the set is what is compared.
    out['library/scanDownloadingAppIds/scan'] = await capture(
      async () => (await scanDownloadingAppIds(stateDeps)).sort(),
      root
    )

    const lib1 = join(root, 'scan', 'lib1', 'steamapps')
    const lib2 = join(root, 'scan', 'lib2', 'steamapps')
    const others: [string, string, string, string][] = [
      ['lib1-self-installdir', lib1, 'ScanInstalled', '10'],
      ['lib1-nonnumeric-shares', lib1, 'NonNumeric', '10'],
      ['lib2-duplicate-dir', lib2, 'DuplicateDir', '40'],
      ['lib1-no-match', lib1, 'Nothing', '10']
    ]
    for (const [label, dir, installdir, self] of others) {
      out[`library/findOtherManifestsWithInstalldir/${label}`] = await capture(
        () => findOtherManifestsWithInstalldir(dir, installdir, self).sort(),
        root
      )
    }

    for (const appId of ['10', '20']) {
      out[`library/breadcrumbAppIsFullyInstalledOnDisk/${appId}`] =
        await capture(
          () =>
            breadcrumbAppIsFullyInstalledOnDisk(appId, {
              steamResumeTargetSteamappsDir: lib1
            }),
          root
        )
    }
    out['library/breadcrumbAppIsFullyInstalledOnDisk/no-dir'] = await capture(
      () => breadcrumbAppIsFullyInstalledOnDisk('10', {}),
      root
    )
    out['library/breadcrumbAppIsFullyInstalledOnDisk/no-manifest'] =
      await capture(
        () =>
          breadcrumbAppIsFullyInstalledOnDisk('99', {
            steamResumeTargetSteamappsDir: lib1
          }),
        root
      )
  })
  return out
}
