import {
  handleRemovalRefusedNoticeSignal,
  useRemovalRefusedNotice
} from '../RemovalRefusedNotice'
import type { IpcRendererEvent } from 'common/types/hostTypes'
import { REMOVAL_REASONS } from 'common/types/safety'

const evt = {} as IpcRendererEvent
const send = (p: unknown) => handleRemovalRefusedNoticeSignal(evt, p)
const notices = () => useRemovalRefusedNotice.getState().notices

const valid = {
  kind: 'uninstall',
  outcome: 'refused',
  reason: 'nested-known-install',
  title: 'Half-Life 2',
  appName: '220',
  runner: 'steam',
  otherTitle: 'Portal'
}

describe('RemovalRefusedNotice store', () => {
  beforeEach(() => {
    useRemovalRefusedNotice.setState({ notices: [], nextId: 1 })
  })

  it('queues a valid payload with an id', () => {
    send(valid)
    expect(notices()).toEqual([{ ...valid, id: 1 }])
  })

  it('accepts a reset with no title and every non-ok reason', () => {
    for (const reason of REMOVAL_REASONS.filter((r) => r !== 'ok')) {
      useRemovalRefusedNotice.setState({ notices: [], nextId: 1 })
      send({ kind: 'reset', outcome: 'refused', reason })
      expect(notices()).toEqual([
        { kind: 'reset', outcome: 'refused', reason, id: 1 }
      ])
    }
  })

  it('drops an out-of-set reason, kind or outcome', () => {
    send({ ...valid, reason: 'bogus' })
    send({ ...valid, kind: 'bogus' })
    send({ ...valid, outcome: 'removed' })
    expect(notices()).toEqual([])
  })

  it('drops the ok reason: a pass is never a refusal', () => {
    send({ ...valid, reason: 'ok' })
    expect(notices()).toEqual([])
  })

  it('drops non-string text fields and an unknown runner', () => {
    send({ ...valid, title: 5 })
    send({ ...valid, appName: {} })
    send({ ...valid, otherTitle: ['x'] })
    send({ ...valid, runner: 'bogus' })
    send({ ...valid, runner: 'toString' })
    expect(notices()).toEqual([])
  })

  it('ignores malformed payloads', () => {
    send(null)
    send('x')
    send(7)
    send({})
    expect(notices()).toEqual([])
  })

  it('copies only known fields, so a smuggled path never reaches the store', () => {
    send({ ...valid, path: '/home/u/Games/x' })
    expect(notices()).toEqual([{ ...valid, id: 1 }])
    expect(JSON.stringify(notices())).not.toContain('/home')
  })

  it('gives each notice its own id and dismisses by id', () => {
    send(valid)
    send({ ...valid, kind: 'remove-bottle' })
    expect(notices().map((n) => n.id)).toEqual([1, 2])
    useRemovalRefusedNotice.getState().dismiss(1)
    expect(notices().map((n) => n.id)).toEqual([2])
  })

  it('keeps only the newest five', () => {
    for (let i = 0; i < 7; i++) send({ ...valid, title: `G${i}` })
    expect(notices().map((n) => n.title)).toEqual([
      'G2',
      'G3',
      'G4',
      'G5',
      'G6'
    ])
  })
})
