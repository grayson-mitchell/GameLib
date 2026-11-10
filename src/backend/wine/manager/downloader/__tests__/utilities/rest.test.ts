import { existsSync, writeFileSync } from 'graceful-fs'
import { getFolderSize, unlinkFile } from '../../utilities'
import { isMac } from 'backend/constants/environment'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

jest.mock('backend/logger')

const workDir = process.cwd()

// run test
describe('Utilities - Rest', () => {
  describe('getFolderSize', () => {
    const flag = isMac ? '-sk' : '-sb'
    const factor = isMac ? 1024 : 1

    test('runs du with the platform flag and a 60 s bound', async () => {
      const runner = createScriptedRunner([
        { cmd: 'du', argv: [flag, '/w'], result: { stdout: '42\t/w\n' } }
      ])
      expect(await getFolderSize({ runner }, '/w')).toBe(42 * factor)
      expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 60_000 })
    })

    test.each([
      ['non-zero exit', { code: 1, stdout: '' }],
      ['timeout', { timedOut: true, code: null, stdout: '' }],
      ['garbage output', { code: 0, stdout: 'nope' }]
    ])('%s yields 0, never NaN', async (_label, result) => {
      const runner = createScriptedRunner([
        { cmd: 'du', argv: [flag, '/w'], result }
      ])
      expect(await getFolderSize({ runner }, '/w')).toBe(0)
    })

    test('spawn error yields 0', async () => {
      const runner = createScriptedRunner([
        { cmd: 'du', argv: [flag, '/w'], error: { code: 'ENOENT' } }
      ])
      expect(await getFolderSize({ runner }, '/w')).toBe(0)
    })
  })

  test('unlink of folder fails', async () => {
    expect(() => {
      unlinkFile(__dirname)
    }).toThrowError(
      `Couldn't remove ${workDir}/src/backend/wine/manager/downloader/__tests__/utilities!`
    )
  })

  test('unlink files succeeds', () => {
    writeFileSync('newFile.txt', 'Hello new file!')

    expect(() => {
      unlinkFile('newFile.txt')
    }).not.toThrow()
    expect(existsSync('newFile.txt')).toBeFalsy()
  })
})
