import { readFileSync } from 'fs'
import { join } from 'path'
import { parseBuffer, writeBuffer } from 'steam-shortcut-editor'
import { capture, normalizeForGolden, withFixtureCopy } from './normalize'

/** The options nonesteamgame.ts readShortcutFile passes. */
const PARSE_OPTIONS = {
  autoConvertArrays: true,
  autoConvertBooleans: true,
  dateProperties: ['LastPlayTime']
}

const FIXED_ENTRY = () => ({
  AppName: 'Golden Game',
  Exe: '"/x/gamelib"',
  StartDir: '"/x"',
  appid: 1234567,
  LaunchOptions: '--no-gui',
  IsHidden: false,
  AllowDesktopConfig: true,
  AllowOverlay: true,
  OpenVR: false,
  Devkit: false,
  DevkitOverrideAppID: false,
  LastPlayTime: new Date(1700000000000)
})

const NAMES = [
  'empty',
  'one-entry',
  'tags',
  'two-entries',
  'sparse-indexes',
  'lexical-order',
  'unknown-type',
  'trailing-bytes',
  'truncated',
  'non-utf8',
  'negative-appid',
  'upstream/shortcuts_commandmc',
  'upstream/shortcuts_felipecrs',
  'upstream/shortcuts_missing_appname',
  'upstream/shortcuts_missing_exe',
  'upstream/shortcuts_missing_launchoptions',
  'upstream/shortcuts_redromnon',
  'upstream/shortcuts_valid'
]

const EDIT_NAMES = [
  'one-entry',
  'two-entries',
  'sparse-indexes',
  'upstream/shortcuts_valid'
]

type Parsed = { shortcuts?: Array<Record<string, unknown>> }

/** Result of write -> re-parse, plus the raw key list (the index rule). */
function roundTrip(content: Parsed, root: string) {
  const buf = writeBuffer(content as never)
  return {
    written: buf.toString('hex'),
    reparsed: normalizeForGolden(
      parseBuffer(buf, PARSE_OPTIONS as never),
      root
    ),
    // Without autoConvertArrays the numeric keys of the shortcuts map show
    // exactly how the oracle renumbered the entries on write.
    numericKeys: Object.keys(
      ((parseBuffer(buf) as { shortcuts?: object }).shortcuts ?? {}) as object
    )
  }
}

export async function captureShortcuts(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  await withFixtureCopy('shortcuts', async (root) => {
    const read = (n: string) => readFileSync(join(root, `${n}.vdf`))
    for (const name of NAMES) {
      out[`shortcuts/parse/${name}`] = await capture(
        () => parseBuffer(read(name), PARSE_OPTIONS as never),
        root
      )
    }
    for (const name of EDIT_NAMES) {
      out[`shortcuts/edit-add/${name}`] = await capture(() => {
        const content = parseBuffer(
          read(name),
          PARSE_OPTIONS as never
        ) as Parsed
        content.shortcuts?.push(FIXED_ENTRY())
        return roundTrip(content, root)
      }, root)
      out[`shortcuts/edit-remove-first/${name}`] = await capture(() => {
        const content = parseBuffer(
          read(name),
          PARSE_OPTIONS as never
        ) as Parsed
        const shortcuts = content.shortcuts ?? []
        const title = shortcuts[0]?.AppName
        const index = shortcuts.findIndex((e) => e.AppName === title)
        if (index >= 0) shortcuts.splice(index, 1)
        return { title, index, ...roundTrip(content, root) }
      }, root)
    }
  })
  return out
}
