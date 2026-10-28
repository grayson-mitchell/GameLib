import { ackWhenVisible } from '../ackWhenVisible'

function fakeDoc(state: string) {
  const listeners = new Set<() => void>()
  return {
    visibilityState: state,
    addEventListener: (_t: 'visibilitychange', l: () => void) =>
      listeners.add(l),
    removeEventListener: (_t: 'visibilitychange', l: () => void) =>
      listeners.delete(l),
    fire: () => [...listeners].forEach((l) => l()),
    count: () => listeners.size
  }
}

describe('ackWhenVisible', () => {
  it('acks at once when the document is visible', () => {
    const send = jest.fn()
    ackWhenVisible('id-1', send, fakeDoc('visible'))
    expect(send).toHaveBeenCalledWith('id-1')
  })

  it('holds the ack while hidden and sends it once on becoming visible', () => {
    const send = jest.fn()
    const doc = fakeDoc('hidden')
    ackWhenVisible('id-2', send, doc)
    expect(send).not.toHaveBeenCalled()
    doc.fire()
    expect(send).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'
    doc.fire()
    doc.fire()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('id-2')
    expect(doc.count()).toBe(0)
  })

  it('cleanup cancels a pending ack', () => {
    const send = jest.fn()
    const doc = fakeDoc('hidden')
    const cleanup = ackWhenVisible('id-3', send, doc)
    cleanup()
    doc.visibilityState = 'visible'
    doc.fire()
    expect(send).not.toHaveBeenCalled()
  })
})
