import { copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { readAcfInstalldir } from '../../../acfInstalldir'
import { capture, listFiles, withFixtureCopy } from './normalize'

export async function captureInstalldir(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('', async (root) => {
    for (const file of listFiles(join(root, 'acf'))) {
      const name = file.slice(0, -'.acf'.length)
      const dir = join(root, '_installdir', name)
      mkdirSync(dir, { recursive: true })
      copyFileSync(join(root, 'acf', file), join(dir, 'appmanifest_77.acf'))
      out[`installdir/readAcfInstalldir/${name}`] = await capture(
        () => readAcfInstalldir(dir, '77'),
        root
      )
    }
    out['installdir/readAcfInstalldir/missing'] = await capture(
      () => readAcfInstalldir(join(root, '_installdir'), '77'),
      root
    )
  })
  return out
}
