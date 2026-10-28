import { reduceDialogRequest, DialogQueueState } from '../dialogQueue'

const closed: DialogQueueState = { current: { showDialog: false }, queue: [] }

describe('reduceDialogRequest', () => {
  it('opens a dialog immediately when none is open', () => {
    const next = reduceDialogRequest(closed, { title: 'A' })
    expect(next.current).toEqual({ showDialog: true, title: 'A' })
    expect(next.queue).toEqual([])
  })

  it('queues a second dialog instead of overwriting the open one', () => {
    const first = reduceDialogRequest(closed, { title: 'A' })
    const second = reduceDialogRequest(first, { title: 'B' })
    expect(second.current.title).toBe('A')
    expect(second.queue.map((d) => d.title)).toEqual(['B'])
  })

  it('shows the queued dialog after the first closes, not dropping it', () => {
    let state = reduceDialogRequest(closed, { title: 'A' })
    state = reduceDialogRequest(state, { title: 'B', ackId: 'b-1' })
    state = reduceDialogRequest(state, { title: 'C' })
    state = reduceDialogRequest(state, { showDialog: false })
    expect(state.current).toEqual({
      showDialog: true,
      title: 'B',
      ackId: 'b-1'
    })
    state = reduceDialogRequest(state, { showDialog: false })
    expect(state.current.title).toBe('C')
    state = reduceDialogRequest(state, { showDialog: false })
    expect(state).toEqual(closed)
  })

  it('a button that closes then opens a follow-up in one batch shows the follow-up', () => {
    let state = reduceDialogRequest(closed, { title: 'A' })
    state = reduceDialogRequest(state, { showDialog: false })
    state = reduceDialogRequest(state, { title: 'Follow-up' })
    expect(state.current.title).toBe('Follow-up')
    expect(state.queue).toEqual([])
  })

  it('closing with nothing open stays closed', () => {
    expect(reduceDialogRequest(closed, { showDialog: false })).toEqual(closed)
  })
})
