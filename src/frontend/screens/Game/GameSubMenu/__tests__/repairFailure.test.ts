/**
 * Gap cycle 2 / CR-01 renderer half (REQ-34.2-12, REQ-34.2-14).
 *
 * Direct proof of reportRepairFailure()'s three independent failure signals
 * (console.error, window.api.logError, an ERROR showDialogModal call), plus
 * the T-34.2-52 information-disclosure guard: the dialog message must never
 * contain the raw error text.
 *
 * No jsdom is installed in this project (testEnvironment: 'node', see
 * src/frontend/jest.config.js) -- reportRepairFailure is a plain function,
 * not a component, so it is called directly with no rendering required.
 */
import { reportRepairFailure } from '../repairFailure'

describe('reportRepairFailure (gap cycle 2, CR-01 renderer half)', () => {
  let logErrorMock: jest.Mock
  let showDialogModalMock: jest.Mock
  let consoleErrorSpy: jest.SpyInstance
  const t = ((key: string, defaultValue: string) => defaultValue) as never

  beforeEach(() => {
    logErrorMock = jest.fn()
    showDialogModalMock = jest.fn()

    const globalWithWindow = globalThis as unknown as { window?: unknown }
    if (!globalWithWindow.window) {
      globalWithWindow.window = {}
    }
    ;(globalThis as unknown as { window: { api: { logError: jest.Mock } } }).window.api =
      { logError: logErrorMock }

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  // RED-PROOF: covers side effect 1 (console.error). Deleting the
  // console.error call in repairFailure.ts fails only this test.
  it('calls console.error exactly once, with a message containing the appName', () => {
    reportRepairFailure({
      appName: 'MyGame',
      error: new Error('boom'),
      showDialogModal: showDialogModalMock,
      t
    })

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    const [message] = consoleErrorSpy.mock.calls[0] as [string]
    expect(message).toContain('MyGame')
  })

  // RED-PROOF: covers side effect 2 (window.api.logError). Deleting the
  // logError call in repairFailure.ts fails only this test.
  it('calls window.api.logError exactly once with a string containing the appName and the error text', () => {
    reportRepairFailure({
      appName: 'MyGame',
      error: new Error('boom'),
      showDialogModal: showDialogModalMock,
      t
    })

    expect(logErrorMock).toHaveBeenCalledTimes(1)
    const [message] = logErrorMock.mock.calls[0] as [string]
    expect(message).toContain('MyGame')
    expect(message).toContain('boom')
  })

  // RED-PROOF: covers side effect 3 (showDialogModal) AND the T-34.2-52
  // information-disclosure guard in a single test, since both assertions
  // read the SAME showDialogModal call. Deliberately kept as one test (not
  // split across two `it` blocks) so that deleting the single
  // showDialogModal call in repairFailure.ts fails EXACTLY one test in this
  // suite, per this plan's own RED spot-check requirement -- spot-checked
  // by hand, see 34.2-17-SUMMARY.md.
  it('calls showDialogModal exactly once with showDialog true, type ERROR, a non-empty title/message, and never includes the raw error text (T-34.2-52)', () => {
    const secretToken = 'SENTINEL-TOKEN-9f3a2c-/Users/secret/path'

    reportRepairFailure({
      appName: 'MyGame',
      error: new Error(secretToken),
      showDialogModal: showDialogModalMock,
      t
    })

    expect(showDialogModalMock).toHaveBeenCalledTimes(1)
    const [options] = showDialogModalMock.mock.calls[0] as [
      { showDialog: boolean; type: string; title: string; message: string }
    ]
    expect(options.showDialog).toBe(true)
    expect(options.type).toBe('ERROR')
    expect(options.title.length).toBeGreaterThan(0)
    expect(options.message.length).toBeGreaterThan(0)
    // Information-disclosure guard: the FIXED translated string only, never
    // the raw error text (which may carry absolute paths or credential-
    // adjacent detail).
    expect(options.message).not.toContain(secretToken)
  })

  // Independent 4th test (not tied to the showDialogModal call): proves the
  // console.error/logError signals also fire for a non-Error thrown value
  // (e.g. a plain string), the kind of "hostile reason" this gap cycle's
  // sibling plans (34.2-15) have specifically hardened against elsewhere.
  it('still reports console.error and window.api.logError for a non-Error thrown value', () => {
    reportRepairFailure({
      appName: 'MyGame',
      error: 'a plain string rejection',
      showDialogModal: showDialogModalMock,
      t
    })

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    const [logMessage] = logErrorMock.mock.calls[0] as [string]
    expect(logMessage).toContain('a plain string rejection')
  })
})
