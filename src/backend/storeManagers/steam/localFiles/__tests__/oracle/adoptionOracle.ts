import { copyFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { readAppManifestFlags } from '../../../library/manifestFlags'
import { isSteamAdoptedAcf } from '../../../macSteamAdoption'
import { readMacRunningAppId } from '../../../library/runningPoll'
import { capture, listFiles, unlessHangs, withFixtureCopy } from './normalize'

/** The oracle is the TS path; any Rust call is a harness bug. */
const THROWING_RUST = {
  requestRustInvoke: () =>
    Promise.reject(new Error('the oracle must not reach Rust'))
}

export async function captureAdoption(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('', async (root) => {
    const text = (n: string) =>
      readFileSync(join(root, 'acf', `${n}.acf`), 'utf-8')

    for (const file of listFiles(join(root, 'acf'))) {
      const name = file.slice(0, -'.acf'.length)
      const dir = join(root, '_adoption', name)
      mkdirSync(dir, { recursive: true })
      copyFileSync(join(root, 'acf', file), join(dir, 'appmanifest_77.acf'))
      out[`adoption/readAppManifestFlags/${name}`] = await unlessHangs(
        `acf/${file}`,
        root,
        () => readAppManifestFlags(THROWING_RUST, dir, '77')
      )
      out[`adoption/isSteamAdoptedAcf/null-baseline/${name}`] =
        await unlessHangs(`acf/${file}`, root, () =>
          isSteamAdoptedAcf(null, {
            content: readFileSync(join(root, 'acf', file), 'utf-8'),
            mtimeMs: 1
          })
        )
    }
    out['adoption/readAppManifestFlags/missing'] = await capture(
      () => readAppManifestFlags(THROWING_RUST, join(root, '_adoption'), '77'),
      root
    )

    const installed = text('installed')
    out['adoption/isSteamAdoptedAcf/null-current'] = await capture(
      () => isSteamAdoptedAcf({ content: installed, mtimeMs: 1 }, null),
      root
    )
    out['adoption/isSteamAdoptedAcf/same-content-same-mtime'] = await capture(
      () =>
        isSteamAdoptedAcf(
          { content: installed, mtimeMs: 5 },
          { content: installed, mtimeMs: 5 }
        ),
      root
    )
    out['adoption/isSteamAdoptedAcf/same-content-new-mtime'] = await capture(
      () =>
        isSteamAdoptedAcf(
          { content: installed, mtimeMs: 5 },
          { content: installed, mtimeMs: 6 }
        ),
      root
    )
    out['adoption/isSteamAdoptedAcf/differs-downloading'] = await capture(
      () =>
        isSteamAdoptedAcf(
          { content: installed, mtimeMs: 5 },
          { content: text('downloading'), mtimeMs: 6 }
        ),
      root
    )
    out['adoption/isSteamAdoptedAcf/differs-installed'] = await capture(
      () =>
        isSteamAdoptedAcf(
          { content: text('downloading'), mtimeMs: 5 },
          { content: installed, mtimeMs: 6 }
        ),
      root
    )

    const registries = listFiles(join(root, 'registry'))
    for (const file of registries) {
      const name = file.slice(0, -'.vdf'.length)
      const home = join(root, '_home', name)
      const steamDir = join(home, 'Library', 'Application Support', 'Steam')
      mkdirSync(steamDir, { recursive: true })
      copyFileSync(join(root, 'registry', file), join(steamDir, 'registry.vdf'))
      out[`adoption/readMacRunningAppId/${name}`] = await capture(
        () =>
          readMacRunningAppId({
            paths: { userHome: home },
            requestRustInvoke: THROWING_RUST.requestRustInvoke
          } as never),
        root
      )
    }
    out['adoption/readMacRunningAppId/no-file'] = await capture(
      () =>
        readMacRunningAppId({
          paths: { userHome: join(root, '_home', 'none') },
          requestRustInvoke: THROWING_RUST.requestRustInvoke
        } as never),
      root
    )
  })
  return out
}
