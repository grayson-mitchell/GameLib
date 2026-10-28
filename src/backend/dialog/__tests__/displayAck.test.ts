import {
  acknowledgeDialogDisplay,
  pendingDialogAckCount,
  trackDialogDisplay,
  newDialogAckId
} from '../displayAck'

describe('dialog display ack', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('settles confirmed when the ack arrives, and clears the timer', () => {
    const settle = jest.fn()
    const id = newDialogAckId()
    trackDialogDisplay(id, settle, 1000)
    jest.advanceTimersByTime(250)
    expect(acknowledgeDialogDisplay(id)).toBe(true)
    expect(settle).toHaveBeenCalledWith({ confirmed: true, elapsedMs: 250 })
    jest.advanceTimersByTime(5000)
    expect(settle).toHaveBeenCalledTimes(1)
    expect(pendingDialogAckCount()).toBe(0)
  })

  it('settles unconfirmed with the timeout when no ack arrives', () => {
    const settle = jest.fn()
    const id = newDialogAckId()
    trackDialogDisplay(id, settle, 1000)
    jest.advanceTimersByTime(999)
    expect(settle).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(settle).toHaveBeenCalledWith({ confirmed: false, timeoutMs: 1000 })
    expect(pendingDialogAckCount()).toBe(0)
    // a late ack is ignored
    expect(acknowledgeDialogDisplay(id)).toBe(false)
    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('ignores unknown, repeated and non-string ids', () => {
    const settle = jest.fn()
    const id = newDialogAckId()
    trackDialogDisplay(id, settle, 1000)
    expect(acknowledgeDialogDisplay('nope')).toBe(false)
    expect(acknowledgeDialogDisplay(42)).toBe(false)
    expect(acknowledgeDialogDisplay(id)).toBe(true)
    expect(acknowledgeDialogDisplay(id)).toBe(false)
    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('unref()s its timer so it cannot hold the sidecar open', () => {
    const unref = jest.fn()
    const spy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((() => ({ unref })) as never)
    const id = newDialogAckId()
    trackDialogDisplay(id, jest.fn(), 1000)
    expect(unref).toHaveBeenCalledTimes(1)
    spy.mockRestore()
    acknowledgeDialogDisplay(id)
  })
})
