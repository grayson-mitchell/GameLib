import { reduceDialogRequest, DialogQueueState } from '../dialogQueue'

const closed: DialogQueueState = { current: { showDialog: false }, queue: [] }

describe('reduceDialogRequest', () => {
  it('opens a dialog immediately when none is open', () => {
    const next = reduceDialogRequest(closed, { title: 'A' })
    expect(next.current).toMatchObject({ showDialog: true, title: 'A' })
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
    expect(state.current).toMatchObject({
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

  it('G28: a promoted dialog gets a dialogKey distinct from the closed one', () => {
    let state = reduceDialogRequest(closed, { title: 'A' })
    state = reduceDialogRequest(state, { title: 'B' })
    const closedKey = state.current.dialogKey
    expect(closedKey).toBeDefined()
    state = reduceDialogRequest(state, { showDialog: false })
    expect(state.current.title).toBe('B')
    expect(state.current.dialogKey).toBeDefined()
    expect(state.current.dialogKey).not.toBe(closedKey)
  })

  it('G28: consecutive dialogs opened one after another have different dialogKeys', () => {
    let state = reduceDialogRequest(closed, { title: 'A' })
    const keyA = state.current.dialogKey
    state = reduceDialogRequest(state, { showDialog: false })
    state = reduceDialogRequest(state, { title: 'B' })
    expect(keyA).toBeDefined()
    expect(state.current.dialogKey).toBeDefined()
    expect(state.current.dialogKey).not.toBe(keyA)
  })

  it('G28: queuing does not change the open dialog dialogKey', () => {
    const first = reduceDialogRequest(closed, { title: 'A' })
    const second = reduceDialogRequest(first, { title: 'B' })
    expect(first.current.dialogKey).toBeDefined()
    expect(second.current.dialogKey).toBe(first.current.dialogKey)
  })

  it('CR-01: a same-dialogId request updates the open dialog in place', () => {
    let state = reduceDialogRequest(closed, { title: 'A', dialogId: 'p' })
    const key = state.current.dialogKey
    state = reduceDialogRequest(state, { title: 'A (7s)', dialogId: 'p' })
    expect(state.current.title).toBe('A (7s)')
    expect(state.current.dialogKey).toBe(key)
    expect(state.queue).toHaveLength(0)
  })

  it('CR-01: a same-dialogId request updates a queued entry in place', () => {
    let state = reduceDialogRequest(closed, { title: 'B' })
    state = reduceDialogRequest(state, { title: 'A', dialogId: 'p' })
    const key = state.queue[0].dialogKey
    state = reduceDialogRequest(state, { title: 'A2', dialogId: 'p' })
    expect(state.queue).toHaveLength(1)
    expect(state.queue[0].title).toBe('A2')
    expect(state.queue[0].dialogKey).toBe(key)
  })

  it('CR-01: a different or missing dialogId still queues', () => {
    let state = reduceDialogRequest(closed, { title: 'A', dialogId: 'p' })
    state = reduceDialogRequest(state, { title: 'B', dialogId: 'q' })
    state = reduceDialogRequest(state, { title: 'C' })
    expect(state.queue.map((d) => d.title)).toEqual(['B', 'C'])
  })

  it('WR-01: a repeated close naming the first dialog is a no-op', () => {
    let state = reduceDialogRequest(closed, { title: 'A' })
    state = reduceDialogRequest(state, { title: 'B' })
    const keyA = state.current.dialogKey
    state = reduceDialogRequest(state, { showDialog: false, dialogKey: keyA })
    expect(state.current.title).toBe('B')
    const again = reduceDialogRequest(state, {
      showDialog: false,
      dialogKey: keyA
    })
    expect(again).toBe(state)
  })

  it('WR-01: closing a queued dialog by key leaves the current one', () => {
    let state = reduceDialogRequest(closed, { title: 'A' })
    state = reduceDialogRequest(state, { title: 'B' })
    state = reduceDialogRequest(state, {
      showDialog: false,
      dialogKey: state.queue[0].dialogKey
    })
    expect(state.current.title).toBe('A')
    expect(state.queue).toEqual([])
  })

  it('WR-01: close by dialogId removes a queued entry or promotes when current', () => {
    let state = reduceDialogRequest(closed, { title: 'A' })
    state = reduceDialogRequest(state, { title: 'P', dialogId: 'p' })
    state = reduceDialogRequest(state, { showDialog: false, dialogId: 'p' })
    expect(state.queue).toEqual([])
    state = reduceDialogRequest(state, { title: 'P', dialogId: 'p' })
    state = reduceDialogRequest(state, { showDialog: false })
    expect(state.current.title).toBe('P')
    state = reduceDialogRequest(state, { title: 'N' })
    state = reduceDialogRequest(state, { showDialog: false, dialogId: 'p' })
    expect(state.current.title).toBe('N')
  })
})
