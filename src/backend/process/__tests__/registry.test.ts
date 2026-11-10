import { EventEmitter } from 'events'
import { createTeardownRegistry, createTrackedRegistry } from '../registry'
import type { ChildProcessLike } from '../registry'

const makeLog = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
const makeChild = (pid: number) =>
  Object.assign(new EventEmitter(), { pid }) as EventEmitter & ChildProcessLike

describe('tracked registry', () => {
  it('removes an entry when the child closes', () => {
    const reg = createTrackedRegistry({ killPid: () => true, log: makeLog() })
    const c = makeChild(1)
    reg.track(c, { runner: 'a', key: 'k' })
    expect(reg.size()).toBe(1)
    c.emit('close')
    expect(reg.size()).toBe(0)
  })

  it('A-WR-2: untracks on exit, before close', () => {
    const killPid = jest.fn(() => true)
    const reg = createTrackedRegistry({ killPid, log: makeLog() })
    const c = makeChild(1)
    reg.track(c, { runner: 'a', key: 'k' })
    c.emit('exit')
    expect(reg.size()).toBe(0)
    expect(reg.killAll()).toBe(0)
    expect(killPid).not.toHaveBeenCalled()
  })

  it('does not record a child without a pid', () => {
    const reg = createTrackedRegistry({ killPid: () => true, log: makeLog() })
    reg.track(new EventEmitter() as unknown as ChildProcessLike, {
      runner: 'a',
      key: 'k'
    })
    expect(reg.size()).toBe(0)
  })

  it('kills only matching entries and counts them', () => {
    const killPid = jest.fn(() => true)
    const reg = createTrackedRegistry({ killPid, log: makeLog() })
    reg.track(makeChild(1), { runner: 'wine', key: 'g1' })
    reg.track(makeChild(2), { runner: 'legendary', key: 'g2' })
    expect(reg.killTracked({ runner: 'wine' })).toBe(1)
    expect(killPid).toHaveBeenCalledWith(1)
    expect(killPid).toHaveBeenCalledTimes(1)
  })

  it('killAll kills once per entry', () => {
    const killPid = jest.fn(() => true)
    const reg = createTrackedRegistry({ killPid, log: makeLog() })
    reg.track(makeChild(1), { runner: 'a', key: 'x' })
    reg.track(makeChild(2), { runner: 'b', key: 'y' })
    expect(reg.killAll()).toBe(2)
    expect(killPid).toHaveBeenCalledTimes(2)
  })

  it('counts a false killPid as not killed and warns', () => {
    const log = makeLog()
    const reg = createTrackedRegistry({ killPid: () => false, log })
    reg.track(makeChild(1), { runner: 'a', key: 'x' })
    expect(reg.killAll()).toBe(0)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })
})

describe('teardown registry', () => {
  it('A-WR-6: keeps every teardown for a duplicate id; unregister removes only its own', () => {
    const reg = createTeardownRegistry({ log: makeLog() })
    const t1 = jest.fn()
    const t2 = jest.fn()
    const t3 = jest.fn()
    const unreg1 = reg.register('a', t1)
    reg.register('a', t2)
    reg.register('a', t3)
    expect(reg.size()).toBe(3)
    unreg1()
    unreg1()
    expect(reg.size()).toBe(2)
    reg.teardownAll()
    expect(t1).not.toHaveBeenCalled()
    expect(t2).toHaveBeenCalledTimes(1)
    expect(t3).toHaveBeenCalledTimes(1)
    expect(reg.size()).toBe(0)
  })

  it('isolates a throwing teardown, logs it, and empties the registry', () => {
    const log = makeLog()
    const reg = createTeardownRegistry({ log })
    const ok = jest.fn()
    reg.register('bad', () => {
      throw new Error('boom')
    })
    reg.register('good', ok)
    reg.teardownAll()
    expect(ok).toHaveBeenCalled()
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(reg.size()).toBe(0)
  })
})
