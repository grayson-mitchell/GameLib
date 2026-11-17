import raw from '../nativePortCatalogue.json'
import {
  findNativePort,
  nativePortPlatformKeys,
  parseNativePortCatalogue,
  NATIVE_PORT_CATALOGUE,
  type NativePortEntry
} from '../nativePortCatalogue'

const good = {
  id: 'x',
  name: 'X',
  url: 'https://example.com/x',
  licence: 'MIT',
  appIds: [1],
  mac: 'arm64',
  linux: true,
  windows: true,
  dataStyle: 'point'
}

describe('shipped catalogue', () => {
  it('drops no rows, ids and AppIds are unique', () => {
    expect(parseNativePortCatalogue(raw).length).toBe(raw.length)
    const ids = NATIVE_PORT_CATALOGUE.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const apps = NATIVE_PORT_CATALOGUE.flatMap((e) => e.appIds)
    expect(new Set(apps).size).toBe(apps.length)
  })
})

describe('parseNativePortCatalogue', () => {
  it('keeps a good row and rejects non-arrays', () => {
    expect(parseNativePortCatalogue([good])).toHaveLength(1)
    expect(parseNativePortCatalogue({})).toEqual([])
    expect(parseNativePortCatalogue(null)).toEqual([])
  })

  const bad: Array<[string, Record<string, unknown>]> = [
    ['empty id', { id: '' }],
    ['empty name', { name: '' }],
    ['empty licence', { licence: '' }],
    ['http url', { url: 'http://example.com' }],
    ['empty appIds', { appIds: [] }],
    ['non-integer appId', { appIds: [1.5] }],
    ['negative appId', { appIds: [-1] }],
    ['bad mac', { mac: 'ppc' }],
    ['non-boolean linux', { linux: 'yes' }],
    ['non-boolean windows', { windows: 1 }],
    ['bad dataStyle', { dataStyle: 'magic' }],
    ['copy without dataFiles', { dataStyle: 'copy' }],
    ['copy with empty dataFiles', { dataStyle: 'copy', dataFiles: [] }],
    ['non-string note', { note: 5 }],
    ['bad gogIds', { gogIds: [1] }]
  ]
  it.each(bad)('drops a row with %s', (_n, over) => {
    expect(parseNativePortCatalogue([{ ...good, ...over }])).toEqual([])
  })

  it('accepts optional fields', () => {
    const rows = parseNativePortCatalogue([
      { ...good, note: 'n', gogIds: ['1'], dataStyle: 'import' }
    ])
    expect(rows).toHaveLength(1)
  })
})

describe('findNativePort', () => {
  it('matches by AppId', () => {
    expect(findNativePort('38400', 'darwin')?.id).toBe('fallout1-ce')
    expect(findNativePort(38410, 'darwin')?.id).toBe('fallout2-ce')
    expect(findNativePort('730', 'darwin')).toBeUndefined()
    expect(findNativePort('abc', 'darwin')).toBeUndefined()
    expect(findNativePort('', 'darwin')).toBeUndefined()
  })

  it('filters by platform', () => {
    const cat = parseNativePortCatalogue([
      { ...good, id: 'a', appIds: [5], mac: 'none', linux: true },
      { ...good, id: 'b', appIds: [6], windows: false }
    ]) as readonly NativePortEntry[]
    expect(findNativePort(5, 'linux', cat)?.id).toBe('a')
    expect(findNativePort(5, 'darwin', cat)).toBeUndefined()
    expect(findNativePort(6, 'win32', cat)).toBeUndefined()
    expect(findNativePort(6, 'darwin', cat)?.id).toBe('b')
    expect(findNativePort(6, 'unknown', cat)).toBeUndefined()
    expect(findNativePort(6, 'freebsd', cat)).toBeUndefined()
  })

  it('lists platform keys', () => {
    const [e] = parseNativePortCatalogue([{ ...good, mac: 'universal' }])
    expect(nativePortPlatformKeys(e!)).toEqual([
      'mac-universal',
      'linux',
      'windows'
    ])
  })
})
