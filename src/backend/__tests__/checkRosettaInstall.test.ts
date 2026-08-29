import { exec } from 'child_process'
import { dialog } from 'backend/platform'
import { checkRosettaInstall } from '../utils'

jest.mock('backend/platform')
jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('../config')
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  exec: jest.fn()
}))
jest.mock('../constants/environment', () => ({
  ...jest.requireActual('../constants/environment')
}))

const mockedExec = exec as unknown as jest.Mock

describe('backend/utils.ts: checkRosettaInstall', () => {
  test('resolves (does not throw) and shows the Rosetta warning dialog when the arch spawn rejects', async () => {
    mockedExec.mockImplementation((_cmd, cb) =>
      cb(
        new Error(
          'arch: posix_spawnp: /usr/sbin/sysctl: Bad CPU type in executable'
        )
      )
    )

    await expect(checkRosettaInstall()).resolves.toBeUndefined()

    expect(dialog.showMessageBox as jest.Mock).toHaveBeenCalledTimes(1)
  })

  test('resolves and does not show the dialog when the arch spawn succeeds', async () => {
    mockedExec.mockImplementation((_cmd, cb) =>
      cb(null, { stdout: 'sysctl.proc_translated: 1', stderr: '' })
    )

    await expect(checkRosettaInstall()).resolves.toBeUndefined()

    expect(dialog.showMessageBox as jest.Mock).not.toHaveBeenCalled()
  })

  test('does not throw when the arch spawn succeeds with empty stdout', async () => {
    mockedExec.mockImplementation((_cmd, cb) =>
      cb(null, { stdout: '', stderr: '' })
    )

    await expect(checkRosettaInstall()).resolves.toBeUndefined()
  })
})
