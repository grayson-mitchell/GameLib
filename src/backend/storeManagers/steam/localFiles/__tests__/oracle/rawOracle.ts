import { readFileSync } from 'fs'
import { join } from 'path'
import { parse } from '@node-steam/vdf'
import { parseAcfTree } from '../../../acfInstalledDepots'
import { capture, listFiles, withFixtureCopy } from './normalize'

const TEXT_DIRS = [
  ['acf', '.acf'],
  ['libraryfolders', '.vdf'],
  ['registry', '.vdf'],
  ['localconfig', '.vdf'],
  ['valve', '.vdf'],
  ['installscript', '.vdf']
] as const

/**
 * Raw parser output for every text fixture: `@node-steam/vdf` `parse` and
 * `parseAcfTree` (both stable library-level APIs, untouched until the gate).
 */
export async function captureRaw(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('', async (root) => {
    for (const [dir, ext] of TEXT_DIRS) {
      for (const file of listFiles(join(root, dir))) {
        if (!file.endsWith(ext)) continue
        const name = file.slice(0, -ext.length)
        const text = readFileSync(join(root, dir, file), 'utf-8')
        // @node-steam/vdf assigns block keys directly, so a "__proto__" block
        // would write into Object.prototype; the real caller (valveClient)
        // rejects it before parsing, so the oracle does not run parse on it.
        out[`raw/vdf/${dir}/${name}`] =
          name === 'forbidden-proto'
            ? { skipped: 'forbidden key guard runs before parse (D-05)' }
            : await capture(() => parse(text), root)
        out[`raw/tree/${dir}/${name}`] = await capture(
          () => parseAcfTree(text),
          root
        )
      }
    }
  })
  return out
}
