/**
 * quick 261025-vnf: the two-tier known-fixes readers (decisions 1 and 6).
 * Tier 1 `readKnownFixes` (`<id>-<store>.json`): local > bundled > remote,
 * allow-listed at every layer. Tier 2 `readKnownFixProfile`
 * (`<id>-<store>.profile.json`): local > bundled only, never remote.
 * All layer directories resolve under tmp in jest; os.homedir is redirected as
 * in knownFixes.test.ts.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(
        actual.tmpdir(),
        `gamelib-knownfixes-layered-home-${process.pid}`
      )
  }
})

// Under jest app.getAppPath() resolves to the repo root, so the real
// bundledFixesPath is the repo's own public/fixes. Point it at a tmp dir so the
// tests can never write to or delete the shipped profiles.
jest.mock('../constants/paths', () => {
  const actual = jest.requireActual('../constants/paths')
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  return {
    ...actual,
    bundledFixesPath: path.join(
      os.tmpdir(),
      `gamelib-bundled-fixes-test-${process.pid}-layered`
    )
  }
})

jest.mock('../logger', () => ({
  logWarning: jest.fn()
}))

import {
  filterTier1KnownFixes,
  readKnownFixes,
  readKnownFixProfile,
  TIER1_KNOWN_FIX_KEYS
} from '../knownFixes'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'
import { logWarning as mockedLogWarning } from '../logger'

const REG = [
  {
    key: 'HKLM\\Software\\X',
    name: 'N',
    type: 'REG_DWORD',
    value: 1
  }
]

function put(
  dir: string,
  app: string,
  content: unknown,
  suffix = '.json',
  raw = false
) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${app}-steam${suffix}`),
    raw ? (content as string) : JSON.stringify(content)
  )
}

function clean() {
  rmSync(fixesPath, { recursive: true, force: true })
  rmSync(localFixesPath, { recursive: true, force: true })
  rmSync(bundledFixesPath, { recursive: true, force: true })
}

const LAYERS = [
  ['local', () => localFixesPath],
  ['bundled', () => bundledFixesPath],
  ['remote', () => fixesPath]
] as const

describe('readKnownFixes (tier 1)', () => {
  beforeEach(() => {
    clean()
    jest.clearAllMocks()
  })
  afterAll(clean)

  it('returns null when no layer has a file', () => {
    expect(readKnownFixes('1', 'steam')).toBeNull()
  })

  it('returns the bundled object', () => {
    put(bundledFixesPath, '1', { title: 'b', winetricks: ['x'] })
    expect(readKnownFixes('1', 'steam')).toEqual({
      title: 'b',
      winetricks: ['x']
    })
  })

  it('local wins over bundled as a whole file (no per-key merge)', () => {
    put(bundledFixesPath, '1', { title: 'b', winetricks: ['x'] })
    put(localFixesPath, '1', { title: 'l' })
    expect(readKnownFixes('1', 'steam')).toEqual({ title: 'l' })
  })

  it('bundled wins over remote', () => {
    put(fixesPath, '1', { title: 'r' })
    put(bundledFixesPath, '1', { title: 'b' })
    expect(readKnownFixes('1', 'steam')).toEqual({ title: 'b' })
  })

  it('falls back to remote when local and bundled are absent', () => {
    put(fixesPath, '1', { title: 'r' })
    expect(readKnownFixes('1', 'steam')).toEqual({ title: 'r' })
  })

  it('malformed local warns and falls through to bundled', () => {
    put(bundledFixesPath, '1', { title: 'b' })
    put(localFixesPath, '1', '{nope', '.json', true)
    expect(readKnownFixes('1', 'steam')).toEqual({ title: 'b' })
    expect(mockedLogWarning).toHaveBeenCalled()
  })

  it('non-object JSON is treated as malformed and falls through', () => {
    put(bundledFixesPath, '1', { title: 'b' })
    put(localFixesPath, '1', [1, 2])
    expect(readKnownFixes('1', 'steam')).toEqual({ title: 'b' })
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('not an object')
    )
  })

  it('returns every tier-1 key unchanged and drops the rest from a remote file', () => {
    const tier1 = {
      title: 't',
      envVariables: { A: '1' },
      winetricks: ['v'],
      runInPrefix: ['setup.exe'],
      notes: { a: 'b' },
      wikiLink: 'https://example.test',
      launchNotice: 'hello'
    }
    put(fixesPath, '1', { ...tier1, registry: REG, foo: 1 })
    const result = readKnownFixes('1', 'steam')
    expect(result).toEqual(tier1)
    expect(result).not.toHaveProperty('registry')
    expect(result).not.toHaveProperty('foo')
  })

  it.each(LAYERS)(
    'drops tier-2 keys from the %s layer with a warning naming the .profile.json',
    (label, dir) => {
      put(dir(), '1', {
        title: 't',
        registry: REG,
        steamSharedRedists: ['229007']
      })
      const result = readKnownFixes('1', 'steam')
      expect(result).toEqual({ title: 't' })
      expect(mockedLogWarning).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `registry.*${label}.*1-<store>\\.profile\\.json|${label}.*registry.*1-<store>\\.profile\\.json`
          )
        )
      )
      expect(mockedLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('steamSharedRedists')
      )
    }
  )

  it('drops an unknown non-tier-2 key with a warning naming the layer', () => {
    put(localFixesPath, '1', { title: 't', foo: 1 })
    expect(readKnownFixes('1', 'steam')).toEqual({ title: 't' })
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringMatching(/foo.*local|local.*foo/)
    )
  })

  it.each(LAYERS)('rejects a traversing appName in the %s layer', (_n, dir) => {
    // Plant a file at the traversal target so reading it would be visible.
    const target = join(dir(), '..', '..', 'etc')
    mkdirSync(target, { recursive: true })
    writeFileSync(
      join(target, 'x-steam.json'),
      JSON.stringify({ title: 'evil' })
    )
    try {
      expect(readKnownFixes('../../etc/x', 'steam')).toBeNull()
      expect(mockedLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('outside')
      )
    } finally {
      rmSync(target, { recursive: true, force: true })
    }
  })
})

describe('filterTier1KnownFixes', () => {
  beforeEach(() => jest.clearAllMocks())

  it('matches the reader output for a plain object', () => {
    expect(
      filterTier1KnownFixes('1', 'remote', {
        title: 't',
        envVariables: { A: '1' },
        registry: REG
      })
    ).toEqual({ title: 't', envVariables: { A: '1' } })
  })

  it.each([[null], [[1]], [3], ['x']])('returns null for %p', (value) => {
    expect(filterTier1KnownFixes('1', 'remote', value)).toBeNull()
  })

  it('exposes the allow-list without any tier-2 key', () => {
    expect(TIER1_KNOWN_FIX_KEYS).toContain('launchNotice')
    expect(TIER1_KNOWN_FIX_KEYS).not.toContain('registry' as never)
    expect(TIER1_KNOWN_FIX_KEYS).not.toContain('steamSharedRedists' as never)
  })
})

describe('readKnownFixProfile (tier 2)', () => {
  beforeEach(() => {
    clean()
    jest.clearAllMocks()
  })
  afterAll(clean)

  it('returns null when no layer has a profile', () => {
    expect(readKnownFixProfile('1', 'steam')).toBeNull()
  })

  it('local wins over bundled', () => {
    put(bundledFixesPath, '1', { title: 'b', registry: REG }, '.profile.json')
    put(localFixesPath, '1', { title: 'l' }, '.profile.json')
    expect(readKnownFixProfile('1', 'steam')).toEqual({ title: 'l' })
  })

  it('never reads a .profile.json that sits only in the remote directory', () => {
    put(fixesPath, '1', { title: 'r', registry: REG }, '.profile.json')
    expect(readKnownFixProfile('1', 'steam')).toBeNull()
  })

  it('returns title, notes, evidence, registry and steamSharedRedists unchanged', () => {
    const profile = {
      title: 't',
      notes: { a: 'b' },
      evidence: 'todo.md',
      registry: REG,
      steamSharedRedists: ['229007']
    }
    put(bundledFixesPath, '1', profile, '.profile.json')
    expect(readKnownFixProfile('1', 'steam')).toEqual(profile)
  })

  it('drops tier-1 functional keys with a warning naming the tier-1 file', () => {
    put(
      localFixesPath,
      '1',
      {
        title: 't',
        envVariables: { A: '1' },
        winetricks: ['v'],
        runInPrefix: ['s.exe'],
        wikiLink: 'x',
        launchNotice: 'n',
        registry: REG
      },
      '.profile.json'
    )
    const result = readKnownFixProfile('1', 'steam')
    expect(result).toEqual({ title: 't', registry: REG })
    for (const key of [
      'envVariables',
      'winetricks',
      'runInPrefix',
      'wikiLink',
      'launchNotice'
    ]) {
      expect(mockedLogWarning).toHaveBeenCalledWith(
        expect.stringContaining(key)
      )
    }
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('1-<store>.json')
    )
  })

  it('drops an unknown key with a warning', () => {
    put(localFixesPath, '1', { title: 't', foo: 1 }, '.profile.json')
    expect(readKnownFixProfile('1', 'steam')).toEqual({ title: 't' })
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('foo')
    )
  })

  it('is store-agnostic: gog and legendary (epic) resolve their own filenames', () => {
    mkdirSync(bundledFixesPath, { recursive: true })
    writeFileSync(
      join(bundledFixesPath, 'x-gog.profile.json'),
      JSON.stringify({ title: 'g' })
    )
    writeFileSync(
      join(bundledFixesPath, 'x-epic.profile.json'),
      JSON.stringify({ title: 'e' })
    )
    expect(readKnownFixProfile('x', 'gog')).toEqual({ title: 'g' })
    expect(readKnownFixProfile('x', 'legendary')).toEqual({ title: 'e' })
  })

  it('rejects a traversing appName', () => {
    expect(readKnownFixProfile('../../etc/x', 'steam')).toBeNull()
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('outside')
    )
  })
})

describe('tier independence', () => {
  beforeEach(() => {
    clean()
    jest.clearAllMocks()
  })
  afterAll(clean)

  it('takes tier 1 from remote and tier 2 from bundled in the same launch', () => {
    put(fixesPath, '1', { title: 'remote', envVariables: { A: '1' } })
    put(
      bundledFixesPath,
      '1',
      { title: 'profile', registry: REG },
      '.profile.json'
    )
    expect(readKnownFixes('1', 'steam')).toEqual({
      title: 'remote',
      envVariables: { A: '1' }
    })
    expect(readKnownFixProfile('1', 'steam')).toEqual({
      title: 'profile',
      registry: REG
    })
  })
})
