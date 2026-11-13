import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { readAcfInstalldir } from '../../../acfInstalldir'
import { listFiles, unlessHangs, withFixtureCopy } from './normalize'

// The oracle runs the TS flag, so the Rust transport must never be reached.
const NO_RUST = {
  requestRustInvoke: () => {
    throw new Error('oracle must not reach Rust')
  }
}

export async function captureInstalldir(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('', async (root) => {
    for (const file of listFiles(join(root, 'acf'))) {
      const name = file.slice(0, -'.acf'.length)
      const dir = join(root, '_installdir', name)
      mkdirSync(dir, { recursive: true })
      copyFileSync(join(root, 'acf', file), join(dir, 'appmanifest_77.acf'))
      out[`installdir/readAcfInstalldir/${name}`] = await unlessHangs(
        `acf/${file}`,
        root,
        () => readAcfInstalldir(NO_RUST, dir, '77')
      )
    }
    out['installdir/readAcfInstalldir/missing'] = await unlessHangs(
      '',
      root,
      () => readAcfInstalldir(NO_RUST, join(root, '_installdir'), '77')
    )
  })
  return out
}
