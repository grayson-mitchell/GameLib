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

jest.mock('backend/platform')
jest.mock('../dialog/dialog')
jest.mock('../logger')
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn()
}))
jest.mock('../constants/environment', () => ({
  ...jest.requireActual('../constants/environment'),
  isWindows: true
}))

import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import { dialog } from 'backend/platform'
import { showDialogBoxModalAuto } from '../dialog/dialog'
import { detectVCRedist, VC_REDIST_PROBE_TIMEOUT_MS } from '../utils'
import { logWarning, logError, logInfo } from '../logger'
import { configStore } from '../constants/key_value_stores'
import type { ButtonOptions } from 'common/types'

const mockedSpawn = spawn as unknown as jest.Mock
const mockedShowDialogBoxModalAuto = showDialogBoxModalAuto as jest.Mock
const mockedShowMessageBox = dialog.showMessageBox as jest.Mock
const mockedLogWarning = logWarning as jest.Mock
const mockedLogError = logError as jest.Mock
const mockedLogInfo = logInfo as jest.Mock

type StubStream = EventEmitter & { setEncoding: jest.Mock }

function makeStubStream(): StubStream {
  const stream = new EventEmitter() as StubStream
  stream.setEncoding = jest.fn()
  return stream
}

type StubChild = EventEmitter & { stdout: StubStream; stderr: StubStream }

function makeStubChild(): StubChild {
  const child = new EventEmitter() as StubChild
  child.stdout = makeStubStream()
  child.stderr = makeStubStream()
  return child
}

describe('backend/utils.ts: detectVCRedist (260919-sch)', () => {
  beforeEach(() => {
    mockedShowDialogBoxModalAuto.mockReset()
    mockedShowMessageBox.mockReset()
  })

  it('raises exactly one in-app dialog carrying three buttons, one vcRuntimeDownload and one vcRuntimeSkip, and never calls the native dialog', () => {
    const child = makeStubChild()
    mockedSpawn.mockReturnValue(child)

    detectVCRedist()

    // Feed fewer than 4 "Microsoft Visual C++ 2022" lines so the function
    // treats the runtime as not (fully) installed.
    child.stdout.emit('data', 'Some unrelated application\n')
    child.emit('close', 0)

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

  it('does not raise a dialog when 4 or more installations are detected', () => {
    const child = makeStubChild()
    mockedSpawn.mockReturnValue(child)

    detectVCRedist()

    for (let i = 0; i < 4; i++) {
      child.stdout.emit('data', 'Microsoft Visual C++ 2022 X86 Additional\n')
    }
    child.emit('close', 0)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedShowMessageBox).not.toHaveBeenCalled()
  })
})

// ── Quick task 260922-v2e: bounded probe + signal-safe close (D3/D4/D5/D6/D7) ──
describe('backend/utils.ts: detectVCRedist bounded probe (260922-v2e)', () => {
  beforeEach(() => {
    mockedShowDialogBoxModalAuto.mockReset()
    mockedShowMessageBox.mockReset()
    mockedLogWarning.mockReset()
    mockedLogError.mockReset()
    mockedLogInfo.mockReset()
    mockedSpawn.mockReset()
    jest.spyOn(configStore, 'get').mockReturnValue(false)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('spawns powershell.exe with -NoProfile/-NonInteractive ahead of the Get-ItemProperty tail, bounded by VC_REDIST_PROBE_TIMEOUT_MS and windowsHide', () => {
    const child = makeStubChild()
    mockedSpawn.mockReturnValue(child)

    detectVCRedist()

    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    const [command, argv, options] = mockedSpawn.mock.calls[0]
    expect(command).toBe('powershell.exe')
    expect(argv.slice(0, 2)).toEqual(['-NoProfile', '-NonInteractive'])
    expect(argv).toEqual(
      expect.arrayContaining(['Get-ItemProperty', 'Format-Table'])
    )
    expect(VC_REDIST_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(1)
    expect(VC_REDIST_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(30000)
    expect(options).toMatchObject({
      timeout: VC_REDIST_PROBE_TIMEOUT_MS,
      windowsHide: true
    })
  })

  it('a timeout kill (close with code null + a signal) raises NO dialog and logs one warning naming the signal', () => {
    const child = makeStubChild()
    mockedSpawn.mockReturnValue(child)

    detectVCRedist()

    // Zero matching lines fed before the kill -- if the signal branch were
    // missing, `code === null` is falsy and the function would fall through
    // to "fewer than 4 lines -> show the dialog", a false nag caused purely
    // by the bound (D5).
    child.emit('close', null, 'SIGTERM')

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedLogWarning).toHaveBeenCalledTimes(1)
    const [warningArg] = mockedLogWarning.mock.calls[0]
    const warningText = Array.isArray(warningArg)
      ? warningArg.join(' ')
      : String(warningArg)
    expect(warningText).toContain('SIGTERM')
  })

  it('a non-zero exit (no signal) raises no dialog and logs an error (existing behaviour, now pinned)', () => {
    const child = makeStubChild()
    mockedSpawn.mockReturnValue(child)

    detectVCRedist()

    child.stderr.emit('data', 'access denied\n')
    child.emit('close', 1, null)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedLogError).toHaveBeenCalledTimes(1)
  })

  it('4+ matching lines log the installed count and elapsed ms, no dialog', () => {
    const child = makeStubChild()
    mockedSpawn.mockReturnValue(child)

    detectVCRedist()

    for (let i = 0; i < 4; i++) {
      child.stdout.emit('data', 'Microsoft Visual C++ 2022 X86 Additional\n')
    }
    child.emit('close', 0, null)

    expect(mockedShowDialogBoxModalAuto).not.toHaveBeenCalled()
    expect(mockedLogInfo).toHaveBeenCalledTimes(1)
    const [infoArg] = mockedLogInfo.mock.calls[0]
    const infoText = Array.isArray(infoArg)
      ? infoArg.join(' ')
      : String(infoArg)
    expect(infoText).toContain('4 matching entries')
  })

  it('skips the probe entirely when skipVcRuntime is set, and logs why', () => {
    ;(configStore.get as jest.Mock).mockReturnValue(true)

    detectVCRedist()

    expect(mockedSpawn).not.toHaveBeenCalled()
    expect(mockedLogInfo).toHaveBeenCalledTimes(1)
    const [infoArg] = mockedLogInfo.mock.calls[0]
    const infoText = Array.isArray(infoArg)
      ? infoArg.join(' ')
      : String(infoArg)
    expect(infoText).toContain('skipVcRuntime')
  })
})
