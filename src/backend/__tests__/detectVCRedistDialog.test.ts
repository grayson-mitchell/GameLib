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
import { detectVCRedist } from '../utils'
import type { ButtonOptions } from 'common/types'

const mockedSpawn = spawn as unknown as jest.Mock
const mockedShowDialogBoxModalAuto = showDialogBoxModalAuto as jest.Mock
const mockedShowMessageBox = dialog.showMessageBox as jest.Mock

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
