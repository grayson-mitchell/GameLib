/**
 * quick 261027-ch9: readGamelibFixStatus. Local + bundled only, both tiers;
 * the remote layer never counts. All layer dirs resolve under tmp.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-knownfixes-gfs-home-${process.pid}`)
  }
})

jest.mock('../constants/paths', () => {
  const actual = jest.requireActual('../constants/paths')
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  return {
    ...actual,
    bundledFixesPath: path.join(
      os.tmpdir(),
      `gamelib-bundled-fixes-test-${process.pid}-gfs`
    )
  }
})

jest.mock('../logger', () => ({
  logWarning: jest.fn()
}))

import { readGamelibFixStatus, TIER1_KNOWN_FIX_KEYS } from '../knownFixes'
import { bundledFixesPath, fixesPath, localFixesPath } from '../constants/paths'

const write = (dir: string, name: string, body: unknown) =>
  writeFileSync(
    join(dir, name),
    typeof body === 'string' ? body : JSON.stringify(body)
  )

describe('readGamelibFixStatus', () => {
  beforeEach(() => {
    for (const d of [fixesPath, localFixesPath, bundledFixesPath]) {
      rmSync(d, { recursive: true, force: true })
      mkdirSync(d, { recursive: true })
    }
  })
  afterEach(() => {
    rmSync(bundledFixesPath, { recursive: true, force: true })
    rmSync(fixesPath, { recursive: true, force: true })
  })

  it('bundled tier-1 only -> bundled, no notice', () => {
    write(bundledFixesPath, 'app-steam.json', { title: 't' })
    expect(readGamelibFixStatus('app', 'steam')).toEqual({ origin: 'bundled' })
  })

  it('local tier-1 only -> local', () => {
    write(localFixesPath, 'app-steam.json', { title: 't' })
    expect(readGamelibFixStatus('app', 'steam')).toEqual({ origin: 'local' })
  })

  it('bundled tier-2 only -> bundled', () => {
    write(bundledFixesPath, 'app-steam.profile.json', { title: 't' })
    expect(readGamelibFixStatus('app', 'steam')).toEqual({ origin: 'bundled' })
  })

  it('remote tier-1 only -> null, with or without launchNotice', () => {
    write(fixesPath, 'app-steam.json', { title: 't' })
    expect(readGamelibFixStatus('app', 'steam')).toBeNull()
    write(fixesPath, 'app-steam.json', { title: 't', launchNotice: 'hi' })
    expect(readGamelibFixStatus('app', 'steam')).toBeNull()
  })

  it('nothing anywhere -> null', () => {
    expect(readGamelibFixStatus('app', 'steam')).toBeNull()
  })

  it("local's launchNotice wins over bundled's", () => {
    write(localFixesPath, 'app-steam.json', { title: 'l', launchNotice: 'L' })
    write(bundledFixesPath, 'app-steam.json', { title: 'b', launchNotice: 'B' })
    expect(readGamelibFixStatus('app', 'steam')).toEqual({
      origin: 'local',
      launchNotice: 'L'
    })
  })

  it('bundled tier-2 + remote tier-1 notice -> remote text never surfaces', () => {
    write(bundledFixesPath, 'app-steam.profile.json', { title: 't' })
    write(fixesPath, 'app-steam.json', { title: 't', launchNotice: 'remote' })
    const r = readGamelibFixStatus('app', 'steam')
    expect(r).toEqual({ origin: 'bundled' })
    expect(r?.launchNotice).toBeUndefined()
  })

  it.each([[''], [5], ['   ']])('launchNotice %p -> undefined', (n) => {
    write(bundledFixesPath, 'app-steam.json', { title: 't', launchNotice: n })
    expect(readGamelibFixStatus('app', 'steam')?.launchNotice).toBeUndefined()
  })

  it('rating is not a tier-1 key', () => {
    expect(TIER1_KNOWN_FIX_KEYS as readonly string[]).not.toContain('rating')
  })

  it('sideload -> null', () => {
    write(bundledFixesPath, 'app-steam.json', { title: 't' })
    expect(readGamelibFixStatus('app', 'sideload')).toBeNull()
  })

  it('traversal appName -> null', () => {
    expect(readGamelibFixStatus('../../etc/passwd', 'steam')).toBeNull()
  })

  it('malformed bundled tier-1 falls through to tier-2, else null', () => {
    write(bundledFixesPath, 'app-steam.json', '{not json')
    expect(readGamelibFixStatus('app', 'steam')).toBeNull()
    write(bundledFixesPath, 'app-steam.profile.json', { title: 't' })
    expect(readGamelibFixStatus('app', 'steam')).toEqual({ origin: 'bundled' })
  })

  describe('quick 261027-gtd: routing-only tier-1 files are not a fix', () => {
    it('macArch-only -> null', () => {
      write(bundledFixesPath, 'app-steam.json', { title: 't', macArch: '32' })
      expect(readGamelibFixStatus('app', 'steam')).toBeNull()
    })

    it('macArch + drm + notes -> null', () => {
      write(bundledFixesPath, 'app-steam.json', {
        title: 't',
        notes: { drm: 'x' },
        macArch: '32',
        drm: 'ceg'
      })
      expect(readGamelibFixStatus('app', 'steam')).toBeNull()
    })

    it('drm + envVariables -> bundled', () => {
      write(bundledFixesPath, 'app-steam.json', {
        title: 't',
        drm: 'ceg',
        envVariables: { A: 'b' }
      })
      expect(readGamelibFixStatus('app', 'steam')).toEqual({
        origin: 'bundled'
      })
    })

    it('drm + launchNotice -> bundled with the notice', () => {
      write(bundledFixesPath, 'app-steam.json', {
        title: 't',
        drm: 'ceg',
        launchNotice: 'hi'
      })
      expect(readGamelibFixStatus('app', 'steam')).toEqual({
        origin: 'bundled',
        launchNotice: 'hi'
      })
    })

    it('routing-only tier-1 + tier-2 profile -> the profile still counts', () => {
      write(bundledFixesPath, 'app-steam.json', { title: 't', drm: 'ceg' })
      write(bundledFixesPath, 'app-steam.profile.json', { title: 't' })
      expect(readGamelibFixStatus('app', 'steam')).toEqual({
        origin: 'bundled'
      })
    })

    it('local routing-only shadows a bundled real fix -> null', () => {
      write(localFixesPath, 'app-steam.json', { title: 'l', macArch: '32' })
      write(bundledFixesPath, 'app-steam.json', {
        title: 'b',
        envVariables: { A: 'b' }
      })
      expect(readGamelibFixStatus('app', 'steam')).toBeNull()
    })

    it('a rejected drm value filters to title-only -> bundled', () => {
      write(bundledFixesPath, 'app-steam.json', {
        title: 't',
        drm: 'steamstub'
      })
      expect(readGamelibFixStatus('app', 'steam')).toEqual({
        origin: 'bundled'
      })
    })
  })
})
