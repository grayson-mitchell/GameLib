import { readFileSync } from 'fs'
import { join } from 'path'
import {
  MAX_VALVE_MANIFEST_BYTES,
  parseValveClientManifest
} from '../../../bridge/drm/valveClient'
import { parseInstallScript, parseKv1 } from '../../../bridge/sharedRedists'
import { capture, listFiles, withFixtureCopy } from './normalize'

export async function captureBridge(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('', async (root) => {
    for (const file of listFiles(join(root, 'valve'))) {
      const name = file.slice(0, -'.vdf'.length)
      const text = readFileSync(join(root, 'valve', file), 'utf-8')
      out[`bridge/parseValveClientManifest/${name}`] = await capture(
        () => parseValveClientManifest(text),
        root
      )
    }
    out['bridge/parseValveClientManifest/oversize'] = await capture(
      () => parseValveClientManifest('x'.repeat(MAX_VALVE_MANIFEST_BYTES + 1)),
      root
    )
    out['bridge/parseValveClientManifest/not-text'] = await capture(
      () => parseValveClientManifest(undefined),
      root
    )

    for (const file of listFiles(join(root, 'installscript'))) {
      const name = file.slice(0, -'.vdf'.length)
      const text = readFileSync(join(root, 'installscript', file), 'utf-8')
      out[`bridge/parseInstallScript/${name}`] = await capture(
        () => parseInstallScript(text),
        root
      )
      out[`bridge/parseKv1/${name}`] = await capture(() => parseKv1(text), root)
    }
  })
  return out
}
