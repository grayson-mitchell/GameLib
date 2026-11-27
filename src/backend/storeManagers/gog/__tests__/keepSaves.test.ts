/**
 * Quick 261127-v8b: planKeptSaves / installSaveLocations over real tmp trees. No module is mocked
 * and no process is spawned.
 */
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { installSaveLocations, planKeptSaves } from '../keepSaves'

let base: string
let install: string

const touch = (...parts: string[]) => {
  const path = join(install, ...parts)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'x')
}
const loc = (location: string) => [{ name: 'saves', location }]
const real = (p: string) => realpathSync.native(p)

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'gamelib-keepsaves-'))
  install = join(base, 'Game')
  mkdirSync(install, { recursive: true })
})

afterEach(() => {
  rmSync(base, { recursive: true, force: true })
})

describe('installSaveLocations (261127-v8b)', () => {
  it('resolves an <?INSTALL?> template against the install path', () => {
    expect(
      installSaveLocations('/g/Game', [
        { name: 'saves', location: '<?INSTALL?>/files/saves' }
      ])
    ).toEqual([{ name: 'saves', location: join('/g/Game', 'files', 'saves') }])
  })

  it('treats a backslash template the same on every OS', () => {
    expect(
      installSaveLocations('/g/Game', [
        { name: 'saves', location: '<?INSTALL?>\\files\\saves' }
      ])
    ).toEqual([{ name: 'saves', location: join('/g/Game', 'files', 'saves') }])
  })

  it.each([
    '<?DOCUMENTS?>/x',
    '<?INSTALL?>/<?DOCUMENTS?>/x',
    'C:/x/<?INSTALL?>/y',
    '%USERPROFILE%/x',
    ''
  ])('drops %p', (location) => {
    expect(installSaveLocations('/g/Game', [{ name: 'n', location }])).toEqual(
      []
    )
  })

  it('returns a parent-escaping template, which planKeptSaves then refuses to keep', () => {
    mkdirSync(join(base, 'outside'), { recursive: true })
    const found = installSaveLocations(install, [
      { name: 'n', location: '<?INSTALL?>/../outside' }
    ])
    expect(found).toEqual([{ name: 'n', location: join(base, 'outside') }])
    expect(planKeptSaves(install, found)).toEqual({
      kind: 'whole-tree',
      rootSave: false
    })
  })
})

describe('planKeptSaves (261127-v8b)', () => {
  it('gives whole-tree for no locations', () => {
    expect(planKeptSaves(install, [])).toEqual({
      kind: 'whole-tree',
      rootSave: false
    })
  })

  it('gives whole-tree for outside, absent, relative and %VAR% locations', () => {
    mkdirSync(join(base, 'outside'), { recursive: true })
    for (const location of [
      join(base, 'outside'),
      join(install, 'nope'),
      'saves',
      '%USERPROFILE%/x',
      join(install, '..', 'outside')
    ]) {
      expect(planKeptSaves(install, loc(location))).toEqual({
        kind: 'whole-tree',
        rootSave: false
      })
    }
  })

  it('flags a save location equal to the install folder', () => {
    expect(planKeptSaves(install, loc(install))).toEqual({
      kind: 'whole-tree',
      rootSave: true
    })
  })

  it('gives whole-tree for an absent install folder', () => {
    expect(
      planKeptSaves(join(base, 'gone'), loc(join(base, 'gone', 's')))
    ).toEqual({ kind: 'whole-tree', rootSave: false })
  })

  it('keeps one save folder and removes the entries around it', () => {
    touch('game.exe')
    touch('unins000.exe')
    touch('files', 'data.pak')
    touch('files', 'saves', 'slot1.sav')
    const plan = planKeptSaves(install, loc(join(install, 'files', 'saves')))
    const root = real(install)
    expect(plan).toEqual({
      kind: 'around',
      root,
      kept: [real(join(install, 'files', 'saves'))],
      remove: [
        join(root, 'files', 'data.pak'),
        join(root, 'game.exe'),
        join(root, 'unins000.exe')
      ]
    })
  })

  it('keeps two folders in different branches, removing their siblings', () => {
    touch('files', 'saves', 'a.sav')
    touch('files', 'other.bin')
    touch('cfg', 'c.ini')
    touch('cfg2', 'd.ini')
    const plan = planKeptSaves(install, [
      { name: 'a', location: join(install, 'files', 'saves') },
      { name: 'b', location: join(install, 'cfg') }
    ])
    const root = real(install)
    expect(plan.kind).toBe('around')
    if (plan.kind !== 'around') return
    expect(plan.kept).toHaveLength(2)
    expect(plan.remove).toEqual([
      join(root, 'cfg2'),
      join(root, 'files', 'other.bin')
    ])
  })

  it('keeps a and a/b, removing nothing at or under a', () => {
    touch('a', 'b', 'x.sav')
    touch('a', 'y.sav')
    touch('z.bin')
    const plan = planKeptSaves(install, [
      { name: 'a', location: join(install, 'a') },
      { name: 'b', location: join(install, 'a', 'b') }
    ])
    const root = real(install)
    expect(plan).toMatchObject({
      kind: 'around',
      remove: [join(root, 'z.bin')]
    })
  })

  it('keeps a save inside a folder whose name begins with ..', () => {
    touch('..cache', 'slot.sav')
    touch('game.exe')
    const plan = planKeptSaves(install, loc(join(install, '..cache')))
    const root = real(install)
    expect(plan).toMatchObject({
      kind: 'around',
      remove: [join(root, 'game.exe')]
    })
  })

  it('does not keep a save reached through a link that points outside the install folder', () => {
    mkdirSync(join(base, 'target'), { recursive: true })
    symlinkSync(join(base, 'target'), join(install, 'linked'), 'junction')
    expect(planKeptSaves(install, loc(join(install, 'linked')))).toEqual({
      kind: 'whole-tree',
      rootSave: false
    })
  })

  it('dedupes the stored and template forms of one folder', () => {
    touch('files', 'saves', 'slot1.sav')
    const stored = join(install, 'files', 'saves')
    const templated = installSaveLocations(install, [
      { name: 'saves', location: '<?INSTALL?>\\files\\saves' }
    ])
    const plan = planKeptSaves(install, [
      { name: 'saves', location: stored },
      ...templated
    ])
    expect(plan.kind).toBe('around')
    if (plan.kind === 'around') expect(plan.kept).toHaveLength(1)
  })

  const foldingIt =
    process.platform === 'win32' || process.platform === 'darwin' ? it : it.skip
  foldingIt('dedupes folders that differ only in case', () => {
    touch('files', 'saves', 'slot1.sav')
    const plan = planKeptSaves(install, [
      { name: 'a', location: join(install, 'files', 'saves') },
      { name: 'b', location: join(install, 'FILES', 'Saves') }
    ])
    expect(plan.kind).toBe('around')
    if (plan.kind === 'around') expect(plan.kept).toHaveLength(1)
  })

  it('reports unreadable when a directory on the chain cannot be listed', () => {
    touch('files', 'saves', 'slot1.sav')
    const plan = planKeptSaves(install, loc(join(install, 'files', 'saves')), {
      readdir: () => {
        throw new Error('EACCES')
      }
    })
    expect(plan).toEqual({ kind: 'unreadable' })
  })
})
