import { copyFileSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  parseAcfInstalledDepots,
  readAcfInstalledDepots
} from '../../../acfInstalledDepots'
import { readAcfUpdateFieldsFromDir } from '../../../library/acfUpdateState'
import {
  readAcfBetaKey,
  readLocalConfigBetaKey
} from '../../../depot/betaBranch'
import { capture, listFiles, unlessHangs, withFixtureCopy } from './normalize'

export async function captureAcfUpdate(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('', async (root) => {
    for (const file of listFiles(join(root, 'acf'))) {
      const name = file.slice(0, -'.acf'.length)
      const dir = join(root, '_acfupdate', name)
      mkdirSync(dir, { recursive: true })
      copyFileSync(join(root, 'acf', file), join(dir, 'appmanifest_77.acf'))
      const text = readFileSync(join(root, 'acf', file), 'utf-8')
      out[`acfUpdate/readAcfBetaKey/${name}`] = await unlessHangs(
        `acf/${file}`,
        root,
        () => readAcfBetaKey(dir, '77')
      )
      out[`acfUpdate/parseAcfInstalledDepots/${name}`] = await capture(
        () => parseAcfInstalledDepots(text),
        root
      )
      out[`acfUpdate/readAcfInstalledDepots/${name}`] = await capture(
        () => readAcfInstalledDepots(dir, '77'),
        root
      )
      out[`acfUpdate/readAcfUpdateFieldsFromDir/${name}`] = await capture(
        () => readAcfUpdateFieldsFromDir(dir, '77'),
        root
      )
    }
    out['acfUpdate/readAcfInstalledDepots/bad-appid'] = await capture(
      () => readAcfInstalledDepots(root, '../x'),
      root
    )
    out['acfUpdate/readAcfUpdateFieldsFromDir/missing'] = await capture(
      () => readAcfUpdateFieldsFromDir(join(root, '_acfupdate'), '77'),
      root
    )

    for (const file of listFiles(join(root, 'localconfig'))) {
      const name = file.slice(0, -'.vdf'.length)
      for (const appId of ['10', '20', '99', 'abc']) {
        out[`acfUpdate/readLocalConfigBetaKey/${name}/${appId}`] =
          await capture(
            () =>
              readLocalConfigBetaKey(join(root, 'localconfig', file), appId),
            root
          )
      }
    }
    out['acfUpdate/readLocalConfigBetaKey/missing-file'] = await capture(
      () => readLocalConfigBetaKey(join(root, 'localconfig', 'nope.vdf'), '10'),
      root
    )
  })
  return out
}
