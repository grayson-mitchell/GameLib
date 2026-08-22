/**
 * Direct-call behavior tests for `readKnownFixes` (Phase 34.2 Plan 03, D-05,
 * REQ-34.2-05). Every assertion calls `readKnownFixes` DIRECTLY -- never
 * through `main.ts`/IPC/RPC -- proving the fs-read body extracted out of
 * `launcher.ts` still behaves exactly as it did before the move.
 *
 * `os.homedir()` is redirected to a disposable per-process tmp directory
 * (`appShellFlows.test.ts`'s own GAP-FIX precedent) so this suite can never
 * touch a developer's real config directory -- this repo's own
 * `tests-clobbering-real-steam-store` precedent proved an `afterAll` restore
 * alone is not a sufficient safety net under jest worker force-exit.
 * `electron-store` is never `requireActual`'d anywhere in this file.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ── os — redirect homedir() to a disposable per-process tmp directory, same
// GAP-FIX pattern as appShellFlows.test.ts, defense-in-depth alongside the
// project-wide `electron` automock (below) which already anchors
// `constants/paths.ts`'s `configFolder`/`fixesPath` under `os.tmpdir()` via
// `app.getPath('appData')`.
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-knownfixes-test-home-${process.pid}`)
  }
})

// ── backend/logger mock — mirrors appshellModules.test.ts's own reasoning:
// `heroicLogWriter` is unset until bootstrap's init() runs, so calling the
// real logWarning() here would throw on the unset writer rather than no-op.
jest.mock('../logger', () => ({
  logWarning: jest.fn()
}))

import { readKnownFixes } from '../knownFixes'
import { fixesPath } from '../constants/paths'
import { logWarning as mockedLogWarning } from '../logger'

describe('readKnownFixes', () => {
  beforeEach(() => {
    mkdirSync(fixesPath, { recursive: true })
  })

  afterAll(() => {
    rmSync(fixesPath, { recursive: true, force: true })
  })

  it('REQ-34.2-05 returns null when no fix file exists for the appName/runner pair', () => {
    expect(readKnownFixes('no-such-app', 'gog')).toBeNull()
  })

  it('REQ-34.2-05 returns the parsed object when a well-formed fix file exists', () => {
    const fixture = { winetricks: ['vcrun2019'], runInPrefix: ['setup.exe'] }
    writeFileSync(
      join(fixesPath, 'well-formed-app-gog.json'),
      JSON.stringify(fixture)
    )

    expect(readKnownFixes('well-formed-app', 'gog')).toEqual(fixture)
  })

  it('REQ-34.2-05 returns null AND logs a warning when the file exists but is malformed JSON', () => {
    writeFileSync(join(fixesPath, 'malformed-app-gog.json'), '{ not valid json')

    const result = readKnownFixes('malformed-app', 'gog')

    expect(result).toBeNull()
    expect(mockedLogWarning).toHaveBeenCalledTimes(1)
    expect(mockedLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('Known fixes could not be applied, ignoring.')
    )
  })

  it('REQ-34.2-05 resolves a different filename for two different runners with the same appName', () => {
    const gogFixture = { winetricks: ['gog-only-fix'] }
    const legendaryFixture = { winetricks: ['epic-only-fix'] }
    writeFileSync(
      join(fixesPath, 'shared-app-gog.json'),
      JSON.stringify(gogFixture)
    )
    writeFileSync(
      join(fixesPath, 'shared-app-epic.json'),
      JSON.stringify(legendaryFixture)
    )

    expect(readKnownFixes('shared-app', 'gog')).toEqual(gogFixture)
    expect(readKnownFixes('shared-app', 'legendary')).toEqual(legendaryFixture)
  })

  // WR-06 (34.2-REVIEW.md round 1): `appName` reaches this function as a free
  // string from the renderer via the `getKnownFixes` channel, and `join`
  // NORMALISES `..` segments rather than rejecting them -- so a traversing
  // appName escaped `fixesPath` and turned this into an arbitrary-file read
  // primitive. These two cases go RED against the pre-fix code: the first
  // returned the out-of-tree file's parsed contents instead of null, and the
  // second read a sibling directory.
  it('WR-06 returns null and does NOT read an out-of-tree file when appName traverses', () => {
    const outside = join(fixesPath, '..', 'outside-the-fixes-dir-gog.json')
    writeFileSync(outside, JSON.stringify({ winetricks: ['pwned'] }))

    try {
      expect(readKnownFixes('../outside-the-fixes-dir', 'gog')).toBeNull()
      expect(mockedLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('outside the known-fixes directory')
      )
    } finally {
      rmSync(outside, { force: true })
    }
  })

  it('WR-06 returns null for a deeper traversal even though the target EXISTS', () => {
    // Discriminating on purpose: create the escape target first. Without this
    // the assertion would pass against the UNFIXED code for the wrong reason
    // (file simply absent), which is a vacuous test, not a containment test.
    const deep = join(fixesPath, '..', '..', 'deep-escape-gog.json')
    writeFileSync(deep, JSON.stringify({ winetricks: ['pwned-deep'] }))

    try {
      expect(readKnownFixes('../../deep-escape', 'gog')).toBeNull()
    } finally {
      rmSync(deep, { force: true })
    }
  })

  // Anti-vacuity: the containment guard must NOT reject the ordinary case the
  // function exists to serve. Without this, deleting the whole function body
  // and returning null unconditionally would satisfy the two tests above.
  it('WR-06 guard does not reject a normal appName (anti-vacuity)', () => {
    const fixture = { winetricks: ['corefonts'] }
    writeFileSync(
      join(fixesPath, 'ordinary-app-gog.json'),
      JSON.stringify(fixture)
    )
    expect(readKnownFixes('ordinary-app', 'gog')).toEqual(fixture)
  })

  it('REQ-34.2-05 resolves fixesPath under os.tmpdir(), never the real config directory', () => {
    expect(fixesPath.startsWith(tmpdir())).toBe(true)
    expect(existsSync(fixesPath)).toBe(true)
  })
})
