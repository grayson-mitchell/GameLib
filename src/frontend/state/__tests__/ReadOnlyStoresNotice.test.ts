import {
  handleReadOnlyStoresNoticeSignal,
  useReadOnlyStoresNotice
} from '../ReadOnlyStoresNotice'
import type { IpcRendererEvent } from 'common/types/hostTypes'

const evt = {} as IpcRendererEvent
const send = (p: unknown) => handleReadOnlyStoresNoticeSignal(evt, p)

describe('ReadOnlyStoresNotice store', () => {
  beforeEach(() => {
    useReadOnlyStoresNotice.setState({
      entries: [],
      visible: false,
      dismissed: false
    })
  })

  it('shows a valid payload', () => {
    send({ entries: [{ area: 'steam-library', reason: 'failed' }] })
    const s = useReadOnlyStoresNotice.getState()
    expect(s.entries).toEqual([{ area: 'steam-library', reason: 'failed' }])
    expect(s.visible).toBe(true)
  })

  it('drops unknown ids and ignores malformed payloads', () => {
    send({
      entries: [
        { area: 'nope', reason: 'failed' },
        { area: 'settings', reason: 'weird' },
        { area: 'settings', reason: 'newer' },
        { area: 'settings', reason: 'newer' }
      ]
    })
    expect(useReadOnlyStoresNotice.getState().entries).toEqual([
      { area: 'settings', reason: 'newer' }
    ])
    useReadOnlyStoresNotice.setState({ entries: [], visible: false })
    send(null)
    send('x')
    send({})
    send({ entries: 'a' })
    expect(useReadOnlyStoresNotice.getState().entries).toEqual([])
    expect(useReadOnlyStoresNotice.getState().visible).toBe(false)
  })

  it('stays hidden after dismiss even if the list grows', () => {
    send({ entries: [{ area: 'settings', reason: 'newer' }] })
    useReadOnlyStoresNotice.getState().dismiss()
    send({
      entries: [
        { area: 'settings', reason: 'newer' },
        { area: 'humble', reason: 'failed' }
      ]
    })
    const s = useReadOnlyStoresNotice.getState()
    expect(s.entries).toHaveLength(2)
    expect(s.visible).toBe(false)
  })

  it('empty entries are not visible', () => {
    send({ entries: [] })
    expect(useReadOnlyStoresNotice.getState().visible).toBe(false)
  })
})
