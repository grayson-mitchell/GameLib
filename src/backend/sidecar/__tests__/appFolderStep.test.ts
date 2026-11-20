/**
 * Behaviour of the 'app-folder' boot step's `prepareAppFolder` (D-66.4-04): the heroic -> GameLib
 * config-folder move, over fake-HOME temp directories. The rename
 * semantics are unchanged from the retired `constants/paths` import-time code.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { prepareAppFolder, type AppFolderDeps } from '../appFolderStep'

function realDeps(
  over: Partial<AppFolderDeps> = {}
): AppFolderDeps & { errors: string[] } {
  const errors: string[] = []
  return {
    fs: { existsSync, renameSync },
    logError: (line) => errors.push(line),
    ...over,
    errors
  }
}

describe('prepareAppFolder', () => {
  const profile = createFakeHomeProfile()
  afterAll(() => profile.dispose())

  let n = 0
  /** A fresh appData root per case under the fake HOME, so cases never see each other's folders. */
  function freshAppData(): { appData: string; appFolder: string } {
    const appData = join(profile.root, `case-${n++}`)
    mkdirSync(appData, { recursive: true })
    return { appData, appFolder: join(appData, 'GameLib') }
  }

  it('moves a legacy <appData>/heroic to <appData>/GameLib, contents preserved', () => {
    const { appData, appFolder } = freshAppData()
    mkdirSync(join(appData, 'heroic'))
    writeFileSync(join(appData, 'heroic', 'config.json'), '{"legacy":true}')

    prepareAppFolder({ appFolder }, realDeps())

    expect(existsSync(join(appData, 'heroic'))).toBe(false)
    expect(readFileSync(join(appFolder, 'config.json'), 'utf-8')).toBe(
      '{"legacy":true}'
    )
  })

  it('does nothing when GameLib already exists: heroic stays untouched', () => {
    const { appData, appFolder } = freshAppData()
    mkdirSync(join(appData, 'heroic'))
    writeFileSync(join(appData, 'heroic', 'old.json'), 'old')
    mkdirSync(appFolder)
    writeFileSync(join(appFolder, 'new.json'), 'new')

    prepareAppFolder({ appFolder }, realDeps())

    expect(readFileSync(join(appData, 'heroic', 'old.json'), 'utf-8')).toBe(
      'old'
    )
    expect(existsSync(join(appFolder, 'old.json'))).toBe(false)
    expect(readFileSync(join(appFolder, 'new.json'), 'utf-8')).toBe('new')
  })

  it('does nothing when there is no legacy folder', () => {
    const { appFolder } = freshAppData()
    prepareAppFolder({ appFolder }, realDeps())
    expect(existsSync(appFolder)).toBe(false)
  })

  it('a rename failure logs the legacy-migration message to stderr and does not throw', () => {
    const { appData, appFolder } = freshAppData()
    mkdirSync(join(appData, 'heroic'))
    const deps = realDeps({
      fs: {
        existsSync,
        renameSync: () => {
          throw new Error('EXDEV: cross-device link')
        }
      }
    })

    expect(() => prepareAppFolder({ appFolder }, deps)).not.toThrow()

    expect(deps.errors).toEqual([
      'Failed to migrate legacy Heroic config folder to GameLib: Error: EXDEV: cross-device link'
    ])
    expect(existsSync(join(appData, 'heroic'))).toBe(true)
  })

  it('makes only bounded synchronous fs calls (exit contract: no handle, no in-flight work)', () => {
    const { appData, appFolder } = freshAppData()
    mkdirSync(join(appData, 'heroic'))
    const calls: string[] = []
    const deps = realDeps({
      fs: {
        existsSync: (p) => {
          calls.push('existsSync')
          return existsSync(p)
        },
        renameSync: (a, b) => {
          calls.push('renameSync')
          renameSync(a, b)
        }
      }
    })

    prepareAppFolder({ appFolder }, deps)

    expect(calls).toEqual(['existsSync', 'existsSync', 'renameSync'])
  })
})
