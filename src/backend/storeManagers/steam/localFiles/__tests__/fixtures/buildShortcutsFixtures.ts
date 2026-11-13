/**
 * Deterministic hand-encoder for binary shortcuts.vdf fixtures (Phase 75-02).
 *
 * Deliberately does not import the shortcut-editor npm package: these fixtures must outlive its
 * deletion. Binary KV: 0x00 map, 0x01 string, 0x02 int32 (LE), 0x08 end-of-map; keys and strings
 * are NUL-terminated. A shortcuts.vdf is the map "shortcuts" followed by one root terminator.
 */

const T_MAP = 0x00
const T_STR = 0x01
const T_INT32 = 0x02
const T_FLOAT32 = 0x03
const T_UINT64 = 0x07
const T_END = 0x08

const cstr = (s: string): Buffer =>
  Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])])

const raw = (type: number, key: string, payload: Buffer): Buffer =>
  Buffer.concat([Buffer.from([type]), cstr(key), payload])

const end = (): Buffer => Buffer.from([T_END])

const map = (key: string, children: Buffer[]): Buffer =>
  Buffer.concat([raw(T_MAP, key, Buffer.alloc(0)), ...children, end()])

const str = (key: string, value: string | Buffer): Buffer =>
  raw(
    T_STR,
    key,
    typeof value === 'string'
      ? cstr(value)
      : Buffer.concat([value, Buffer.from([0])])
  )

const int32 = (key: string, n: number): Buffer => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n >>> 0, 0)
  return raw(T_INT32, key, b)
}

const file = (entries: Buffer[], trailer: Buffer = Buffer.alloc(0)): Buffer =>
  Buffer.concat([map('shortcuts', entries), end(), trailer])

/** One entry with the exact field order GameLib writes (nonesteamgame.ts). */
const gamelibEntry = (
  index: string,
  opts: { appid: number; name: string | Buffer; tags?: string[] }
): Buffer =>
  map(index, [
    int32('appid', opts.appid),
    str('AppName', opts.name),
    str('Exe', '"/opt/gamelib/gamelib"'),
    str('StartDir', '"/opt/gamelib"'),
    str('icon', '/home/synthetic/icons/10.png'),
    str('ShortcutPath', ''),
    str(
      'LaunchOptions',
      '--no-gui --no-sandbox "gamelib://launch?appName=10&runner=legendary"'
    ),
    int32('IsHidden', 0),
    int32('AllowDesktopConfig', 1),
    int32('AllowOverlay', 1),
    int32('OpenVR', 0),
    int32('Devkit', 0),
    str('DevkitGameID', ''),
    int32('DevkitOverrideAppID', 0),
    int32('LastPlayTime', 1700000000),
    str('FlatpakAppID', ''),
    map(
      'tags',
      (opts.tags ?? []).map((t, i) => str(String(i), t))
    )
  ])

export function buildShortcutsFixtures(): Record<string, Buffer> {
  const entry = (i: string, name = 'Synthetic Game') =>
    gamelibEntry(i, { appid: 0x80000001 + Number(i), name })

  const oneEntry = file([entry('0')])
  const truncatedFrom = oneEntry
  const cut = truncatedFrom.indexOf(Buffer.from('Synthetic Game')) + 5

  return {
    'empty.vdf': file([]),
    'one-entry.vdf': oneEntry,
    'tags.vdf': file([
      gamelibEntry('0', {
        appid: 0x80000001,
        name: 'Tagged Game',
        tags: ['fav', 'ok']
      })
    ]),
    'two-entries.vdf': file([
      entry('0', 'First Game'),
      entry('1', 'Second Game')
    ]),
    'sparse-indexes.vdf': file([entry('0', 'Zero'), entry('2', 'Two')]),
    'lexical-order.vdf': file([
      entry('0', 'Zero'),
      entry('1', 'One'),
      entry('10', 'Ten'),
      entry('2', 'Two')
    ]),
    'unknown-type.vdf': file([
      map('0', [
        int32('appid', 0x80000002),
        str('AppName', 'Unknown Types'),
        raw(T_UINT64, 'BigField', Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])),
        raw(T_FLOAT32, 'Ratio', Buffer.from([0, 0, 0x80, 0x3f])),
        str('Exe', '"/bin/true"')
      ])
    ]),
    'trailing-bytes.vdf': file([entry('0')], Buffer.from([0xde, 0xad])),
    'truncated.vdf': oneEntry.subarray(0, cut),
    'non-utf8.vdf': file([
      gamelibEntry('0', {
        appid: 0x80000003,
        name: Buffer.concat([
          Buffer.from('Caf', 'utf8'),
          Buffer.from([0xe9]),
          Buffer.from(' Game', 'utf8')
        ])
      })
    ]),
    'negative-appid.vdf': file([
      gamelibEntry('0', { appid: 0xfffffffe, name: 'Negative Appid' })
    ])
  }
}
