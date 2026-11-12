/**
 * Quick task 260919-sch — regression test for `detectVCRedist` (`backend/utils.ts`)
 * after it moved off the native 3-button `dialog.showMessageBox` onto the
 * in-app `showDialogBoxModalAuto` path.
 *
 * The native path structurally could not carry a third "don't show again"
 * button (the Rust dialog command only maps a `buttons` array to a native
 * dialog when its length is exactly 2), so `response === 2` could never
 * fire. This suite pins that the replacement raises exactly one in-app
 * dialog with all three buttons, one carrying `action: 'vcRuntimeDownload'`
 * and one carrying `action: 'vcRuntimeSkip'` -- the assertion the native
 * path could not have satisfied -- and that the native `dialog.showMessageBox`
 * is never called from this path (a partial revert leaving the follow-up
 * native box in place would otherwise stay green).
 *
 * Neither this suite nor any live run on this machine can verify the
 * Windows-only behavior end-to-end -- `isWindows` is force-mocked to `true`
 * below purely to exercise the branch.
 *
 * Quick task 260922-v2e appends a second describe block below (unchanged
 * suite above) covering the bounded spawn (D3/D4), the signal-safe close
 * handler (D5), the `-NoProfile -NonInteractive` argv hardening (D6), and
 * the skip/installed observability log lines (D7).
 */

jest.mock('../dialog/dialog')
jest.mock('../logger')
jest.mock('../constants/environment', () => ({
  ...jest.requireActual('../constants/environment'),
  isWindows: true
}))

import { createTestStoreRoot } from '../testUtils/testStoreRoot'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import type { ScriptStep } from 'backend/testUtils/scriptedRunner'
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { showDialogBoxModalAuto } from '../dialog/dialog'
import { detectVCRedist, VC_REDIST_PROBE_TIMEOUT_MS } from '../utils'
import { logWarning, logError, logInfo } from '../logger'
import type { ButtonOptions } from 'common/types'
import { createTestStores } from 'backend/testUtils/testServices'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createKvsStores } from '../constants/key_value_stores'

const { configStore } = createKvsStores({
  registry: createStoreRegistry(),
  root: createTestStoreRoot()
})

const stores = createTestStores({ kvs: { configStore } as never })

const mockedShowDialogBoxModalAuto = showDialogBoxModalAuto as jest.Mock
const mockedShowMessageBox = jest.fn()
const mockedLogWarning = logWarning as jest.Mock
const mockedLogError = logError as jest.Mock
const mockedLogInfo = logInfo as jest.Mock

/** One scripted powershell.exe probe; the argv is asserted separately from the calls log. */
function probe(result: ScriptStep['result']): ScriptStep {
  return { cmd: 'powershell.exe', match: () => true, result }
}

function depsFor(...steps: ScriptStep[]) {
  const runner = createScriptedRunner(steps)
  const host = createTestHostServices()
  return {
    runner,
    deps: {
      sendFrontendMessage: jest.fn(),
      stores,
      runner,
      dialogs: {
        ...host.dialogs,
        showMessageBox: mockedShowMessageBox
      },
      appState: host.appState
    }
  }
}

describe('backend/utils.ts: detectVCRedist (260919-sch)', () => {
  beforeEach(() => {
    mockedShowDialogBoxModalAuto.mockReset()
    mockedShowMessageBox.mockReset()
  })

  it('raises exactly one in-app dialog carrying three buttons, one vcRuntimeDownload and one vcRuntimeSkip, and never calls the native dialog', async () => {
    // Fewer than 4 "Microsoft Visual C++ 2022" lines: the runtime is treated as not (fully) installed.
    const { deps } = depsFor(
      probe({ stdout: 'Some unrelated application\n', code: 0 })
    )

    await detectVCRedist(deps)

    expect(mockedShowDialogBoxModalAuto).toHaveBeenCalledTimes(1)

    const call = mockedShowDialogBoxModalAuto.mock.calls[0][0]
    const buttons: ButtonOptions[] = call.buttons
    expect(buttons).toHaveLength(3)

    const actions = buttons.map((button) => button.action)
    expect(
      actions.filter((action) => action === 'vcRuntimeDownload')
    ).toHaveLength(1)
    expect(actions.filter((action) => action === 'vcRuntimeSkip')).toHaveLength(
      1
    )

    expect(mockedShowMessageBox).not.toHaveBeenCalled()
  })

  it('does not raise a dialog when 4 or more installations are detected', async () => {
    const { deps } = depsFor(
      probe({
        stdout: 'Microsoft Visual C++ 2022 X86 Additional\n'.repeat(4),
        code: 0
      })
    )

    await detectVCRedist(deps)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedShowMessageBox).not.toHaveBeenCalled()
  })
})

// ── Quick task 260922-v2e: bounded probe + timeout-safe result (D3/D4/D5/D6/D7) ──
describe('backend/utils.ts: detectVCRedist bounded probe (260922-v2e)', () => {
  beforeEach(() => {
    mockedShowDialogBoxModalAuto.mockReset()
    mockedShowMessageBox.mockReset()
    mockedLogWarning.mockReset()
    mockedLogError.mockReset()
    mockedLogInfo.mockReset()
    jest.spyOn(configStore, 'get').mockReturnValue(false)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('runs powershell.exe with -NoProfile/-NonInteractive ahead of the Get-ItemProperty tail, bounded by VC_REDIST_PROBE_TIMEOUT_MS and windowsHide', async () => {
    const { runner, deps } = depsFor(probe({ stdout: '', code: 0 }))

    await detectVCRedist(deps)

    expect(runner.calls).toHaveLength(1)
    const call = runner.calls[0]!
    expect(call.cmd).toBe('powershell.exe')
    expect(call.argv.slice(0, 2)).toEqual(['-NoProfile', '-NonInteractive'])
    expect(call.argv).toEqual(
      expect.arrayContaining(['Get-ItemProperty', 'Format-Table'])
    )
    expect(VC_REDIST_PROBE_TIMEOUT_MS).toBe(15_000)
    expect(call.opts).toMatchObject({
      timeoutMs: VC_REDIST_PROBE_TIMEOUT_MS,
      windowsHide: true
    })
  })

  it('a timed-out probe raises NO dialog and logs one warning naming the bound', async () => {
    // Zero matching lines before the kill -- if the timedOut branch were
    // missing, `code === null` is falsy and the function would fall through
    // to "fewer than 4 lines -> show the dialog", a false nag caused purely
    // by the bound (D5).
    const { deps } = depsFor(
      probe({ timedOut: true, code: null, signal: 'SIGKILL' })
    )

    await detectVCRedist(deps)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedLogWarning).toHaveBeenCalledTimes(1)
    const [warningArg] = mockedLogWarning.mock.calls[0]
    const warningText = Array.isArray(warningArg)
      ? warningArg.join(' ')
      : String(warningArg)
    expect(warningText).toContain('VC_REDIST_PROBE_TIMEOUT_MS')
  })

  it('a non-zero exit raises no dialog and logs an error (existing behaviour, now pinned)', async () => {
    const { deps } = depsFor(probe({ stderr: 'access denied\n', code: 1 }))

    await detectVCRedist(deps)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedLogError).toHaveBeenCalledTimes(1)
  })

  it('a spawn failure raises no dialog and logs the crash', async () => {
    const { deps } = depsFor({
      cmd: 'powershell.exe',
      match: () => true,
      error: { code: 'ENOENT' }
    })

    await detectVCRedist(deps)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedLogError).toHaveBeenCalledTimes(1)
  })

  it('4+ matching lines log the installed count and elapsed ms, no dialog', async () => {
    const { deps } = depsFor(
      probe({
        stdout: 'Microsoft Visual C++ 2022 X86 Additional\n'.repeat(4),
        code: 0
      })
    )

    await detectVCRedist(deps)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedLogInfo).toHaveBeenCalledTimes(1)
    const [infoArg] = mockedLogInfo.mock.calls[0]
    const infoText = Array.isArray(infoArg)
      ? infoArg.join(' ')
      : String(infoArg)
    expect(infoText).toContain('4 matching entries')
  })

  it('skips the probe entirely when skipVcRuntime is set, and logs why', async () => {
    ;(configStore.get as jest.Mock).mockReturnValue(true)
    const { runner, deps } = depsFor()

    await detectVCRedist(deps)

    expect(runner.calls).toHaveLength(0)
    expect(mockedLogInfo).toHaveBeenCalledTimes(1)
    const [infoArg] = mockedLogInfo.mock.calls[0]
    const infoText = Array.isArray(infoArg)
      ? infoArg.join(' ')
      : String(infoArg)
    expect(infoText).toContain('skipVcRuntime')
  })
})
