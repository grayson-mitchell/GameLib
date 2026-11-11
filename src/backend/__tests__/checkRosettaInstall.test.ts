import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { checkRosettaInstall } from '../utils'

jest.mock('../logger')
jest.mock('../dialog/dialog')
jest.mock('../config')
jest.mock('../constants/environment', () => ({
  ...jest.requireActual('../constants/environment')
}))

const dialog = { showMessageBox: jest.fn() }

const ARCH_ARGV = ['-x86_64', '/usr/sbin/sysctl', 'sysctl.proc_translated']

describe('backend/utils.ts: checkRosettaInstall', () => {
  test('resolves (does not throw) and shows the Rosetta warning dialog when the arch spawn rejects', async () => {
    const runner = createScriptedRunner([
      { cmd: 'arch', argv: ARCH_ARGV, error: { code: 'EBADARCH' } }
    ])

    await expect(
      checkRosettaInstall({ runner, dialogs: dialog })
    ).resolves.toBeUndefined()

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
  })

  test('resolves and does not show the dialog when the arch spawn succeeds', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'arch',
        argv: ARCH_ARGV,
        result: { stdout: 'sysctl.proc_translated: 1' }
      }
    ])

    await expect(
      checkRosettaInstall({ runner, dialogs: dialog })
    ).resolves.toBeUndefined()

    expect(dialog.showMessageBox).not.toHaveBeenCalled()
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 10_000 })
  })

  test('does not throw when the arch spawn succeeds with empty stdout', async () => {
    const runner = createScriptedRunner([
      { cmd: 'arch', argv: ARCH_ARGV, result: { stdout: '' } }
    ])

    await expect(
      checkRosettaInstall({ runner, dialogs: dialog })
    ).resolves.toBeUndefined()
  })

  test('a non-zero exit counts as not installed (exec rejected on non-zero)', async () => {
    dialog.showMessageBox.mockClear()
    const runner = createScriptedRunner([
      { cmd: 'arch', argv: ARCH_ARGV, result: { code: 1 } }
    ])

    await checkRosettaInstall({ runner, dialogs: dialog })

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
  })

  test('a timed-out probe counts as not installed', async () => {
    dialog.showMessageBox.mockClear()
    const runner = createScriptedRunner([
      {
        cmd: 'arch',
        argv: ARCH_ARGV,
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      }
    ])

    await checkRosettaInstall({ runner, dialogs: dialog })

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
  })
})
