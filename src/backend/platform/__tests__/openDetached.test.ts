import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import { spawnOpenDetached } from '../openDetached'

jest.mock('child_process')

const spawnMock = spawn as unknown as jest.Mock
const URL_OFF = 'steam://open/gooffline'

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { unref: jest.Mock }
  child.unref = jest.fn()
  return child
}

beforeEach(() => {
  spawnMock.mockReset()
  spawnMock.mockImplementation(() => fakeChild())
})

describe('spawnOpenDetached', () => {
  it('spawns open -g detached with no env, unrefs, and reports errors', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const onError = jest.fn()
    spawnOpenDetached(URL_OFF, onError)
    expect(spawnMock).toHaveBeenCalledWith('/usr/bin/open', ['-g', URL_OFF], {
      detached: true,
      stdio: 'ignore'
    })
    expect(spawnMock.mock.calls[0][2]).not.toHaveProperty('env')
    expect(child.unref).toHaveBeenCalled()
    child.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }))
    expect(onError).toHaveBeenCalledWith('ENOENT')
    child.emit('error', new Error('y'))
    expect(onError).toHaveBeenCalledWith('error')
  })
  it('does not throw without onError', () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    spawnOpenDetached(URL_OFF)
    expect(() => child.emit('error', new Error('z'))).not.toThrow()
  })
})
