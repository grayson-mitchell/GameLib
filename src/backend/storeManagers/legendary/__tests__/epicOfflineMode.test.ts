/**
 * 49-03 Task 3 (R8): an expired Epic store is treated like `offlineMode` for
 * games that can run offline. `resolveEpicOfflineMode` can only turn offline
 * mode ON; it never blocks a launch and never touches another store.
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Runner } from 'common/types'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { resolveEpicOfflineMode } from '../epicOfflineMode'

const base = {
  offlineMode: false,
  runner: 'legendary' as Runner,
  canRunOffline: true,
  storeExpired: true
}

describe('resolveEpicOfflineMode (R8)', () => {
  it('Test 1: an expired Epic store with a canRunOffline game launches offline', () => {
    expect(resolveEpicOfflineMode(base)).toBe(true)
  })

  it('Test 2: a game that cannot run offline is left alone (the stderr modal stays the fallback)', () => {
    expect(resolveEpicOfflineMode({ ...base, canRunOffline: false })).toBe(
      false
    )
  })

  it('Test 3: a store that is not expired is left alone', () => {
    expect(resolveEpicOfflineMode({ ...base, storeExpired: false })).toBe(false)
  })

  it.each(['gog', 'nile', 'steam', 'zoom', 'sideload'] as Runner[])(
    'Test 4: runner %p with an expired flag returns the input offlineMode unchanged',
    (runner) => {
      expect(resolveEpicOfflineMode({ ...base, runner })).toBe(false)
      expect(
        resolveEpicOfflineMode({ ...base, runner, offlineMode: true })
      ).toBe(true)
    }
  )

  it('Test 5: offlineMode=true is never turned off, for every combination', () => {
    const bools = [true, false]
    const runners: Runner[] = [
      'legendary',
      'gog',
      'nile',
      'steam',
      'zoom',
      'sideload'
    ]
    for (const runner of runners)
      for (const canRunOffline of bools)
        for (const storeExpired of bools)
          expect(
            resolveEpicOfflineMode({
              offlineMode: true,
              runner,
              canRunOffline,
              storeExpired
            })
          ).toBe(true)
  })
})

/**
 * Pure source inspection so the gate can be run against both the real tree and
 * RED specimens: how many times is the expired flag read, and are all reads
 * inside `prepareLaunch`'s body?
 */
function inspectExpiredReads(launcherSource: string) {
  const code = stripSourceComments(launcherSource)
  const read = /legendaryConfigStore\.get_nodefault\(\s*'expired'\s*\)/g
  const total = (code.match(read) ?? []).length
  const start = code.indexOf('async function prepareLaunch(')
  const end = start === -1 ? -1 : code.indexOf('\n}\n', start)
  const body = start === -1 || end === -1 ? '' : code.slice(start, end)
  const inside = (body.match(read) ?? []).length
  return { total, inside }
}

describe('R8 source gate (comment-stripped)', () => {
  const backendDir = join(__dirname, '..', '..', '..')
  const launcherSource = readFileSync(join(backendDir, 'launcher.ts'), 'utf8')

  it('Test 6a: launcher.ts reads legendaryConfigStore expired exactly once, inside prepareLaunch', () => {
    expect(inspectExpiredReads(launcherSource)).toEqual({
      total: 1,
      inside: 1
    })
  })

  it('Test 6b: the gate has teeth - a second read outside prepareLaunch is caught', () => {
    const specimen = `${launcherSource}
async function sneakyLaunchGate() {
  return legendaryConfigStore.get_nodefault('expired')
}
`
    const found = inspectExpiredReads(specimen)
    expect(found.total).toBe(2)
    expect(found.inside).toBe(1)
  })

  it('Test 6c: no store manager games.ts consults the sign-in state', () => {
    const managers = readdirSync(join(backendDir, 'storeManagers'), {
      withFileTypes: true
    }).filter((d) => d.isDirectory())
    const gamesFiles = managers
      .map((d) => join(backendDir, 'storeManagers', d.name, 'games.ts'))
      .filter((p) => {
        try {
          readFileSync(p)
          return true
        } catch {
          return false
        }
      })
    // non-vacuity: the census must actually see the per-store games.ts files
    expect(gamesFiles.length).toBeGreaterThanOrEqual(5)
    for (const file of gamesFiles) {
      const code = stripSourceComments(readFileSync(file, 'utf8'))
      expect({ file, hit: /legendaryConfigStore/.test(code) }).toEqual({
        file,
        hit: false
      })
      expect({ file, hit: /common\/signInState/.test(code) }).toEqual({
        file,
        hit: false
      })
      expect({ file, hit: /signInProbe/.test(code) }).toEqual({
        file,
        hit: false
      })
    }
  })
})
