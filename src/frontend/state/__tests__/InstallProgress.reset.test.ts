import type { InstallProgress, Runner } from 'common/types'

type Listener = (
  e: unknown,
  payload: { appName: string; runner: Runner; progress: InstallProgress }
) => void

describe('InstallProgress store', () => {
  // Pins the frontend half of the D-UAT-11 wiring: the zero-percent progress
  // the backend emits after a Delete Files cancel overwrites the stale entry.
  it('overwrites a stale percent with a zero-percent progressUpdate', () => {
    let listener: Listener | undefined
    ;(globalThis as unknown as { window: unknown }).window = {
      api: {
        onProgressUpdate: jest.fn((cb: Listener) => {
          listener = cb
        })
      }
    }
    let mod: typeof import('../InstallProgress') | undefined
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('../InstallProgress')
    })
    listener!(undefined, {
      appName: '262060',
      runner: 'steam',
      progress: { percent: 6, bytes: '10.00MB', eta: '1:00' }
    })
    expect(mod!.getInstallProgress('262060', 'steam')?.percent).toBe(6)
    listener!(undefined, {
      appName: '262060',
      runner: 'steam',
      progress: { percent: 0, bytes: '0.00MB', eta: '' }
    })
    expect(mod!.getInstallProgress('262060', 'steam')?.percent).toBe(0)
  })
})
