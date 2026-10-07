/**
 * BEHAVIOURAL test for `HumbleLoginSurface`'s login watch when it REJECTS
 * (todo 2026-10-05-login-and-i18n-minor-defects-from-phase-36-and-34-8-review,
 * item 1). `HumbleLoginWatchErrorHandling.test.ts` gates the resolved
 * `{ status }` arms by source text; this one drives the real component.
 *
 * THE BUG: `void runHumbleLoginWatch()` had no catch. When
 * `window.api.humbleStartLogin()` rejected (a sidecar disconnect -- this
 * channel is exempt from the 60s invoke timeout, so nothing else bounds it)
 * or `humble.login(result)` threw, the state stayed `idle`, neither `onDone`
 * nor `onCancelled` ran, and the Login screen's `HumbleLogin` overlay --
 * which renders NOTHING while idle -- left an inert, close-button-less
 * surface whose only way out was leaving the Login screen.
 *
 * No jsdom / react-test-renderer in this project, so 'react' is mocked the
 * same way `Humble/Keys/__tests__/index.test.tsx` does it: slot-based
 * `useState`, an effect runner, and the component called as a function.
 */
import type { ReactNode } from 'react'

import type { TauriOAuthLoginState } from '../useTauriOAuthLogin'

const mockHumble: {
  expired: boolean
  login: jest.Mock
} = { expired: false, login: jest.fn() }

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let cursor = 0
  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = cursor++
      if (idx >= slots.length) slots[idx] = initial
      const setState = (next: unknown) => {
        slots[idx] = next
      }
      return [slots[idx], setState]
    },
    useEffect: (effect: () => void | (() => void)) => {
      const idx = cursor++
      if (idx >= slots.length) {
        slots[idx] = effect() ?? null
      }
    },
    useContext: () => ({ humble: mockHumble }),
    __beginRender: () => {
      cursor = 0
    },
    __resetMount: () => {
      slots = []
      cursor = 0
    }
  }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string) => defaultValue
  })
}))

const mockApi = {
  humbleStartLogin: jest.fn(),
  humbleReconnect: jest.fn(),
  humbleStopLogin: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import HumbleLoginSurface from '../components/HumbleLoginSurface'

type Harness = { __beginRender: () => void; __resetMount: () => void }
const harness = () => jest.requireMock('react') as unknown as Harness

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function settle(): Promise<{
  states: TauriOAuthLoginState[]
  onDone: jest.Mock
  onCancelled: jest.Mock
}> {
  const states: TauriOAuthLoginState[] = []
  const onDone = jest.fn()
  const onCancelled = jest.fn()
  const render = () => {
    harness().__beginRender()
    HumbleLoginSurface({
      onDone,
      onCancelled,
      renderState: (state): ReactNode => {
        states.push(state)
        return null
      }
    })
  }
  harness().__resetMount()
  render()
  await flushPromises()
  await flushPromises()
  render()
  return { states, onDone, onCancelled }
}

describe('HumbleLoginSurface login watch -- rejection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHumble.expired = false
    mockHumble.login = jest.fn()
  })

  it('a rejected humbleStartLogin settles into phase "error" (so the overlay shows its closable Dialog)', async () => {
    mockApi.humbleStartLogin.mockRejectedValue(new Error('sidecar went away'))

    const { states, onDone, onCancelled } = await settle()

    expect(states.at(-1)).toEqual({
      phase: 'error',
      message: 'sidecar went away'
    })
    expect(onDone).not.toHaveBeenCalled()
    expect(onCancelled).not.toHaveBeenCalled()
  })

  it('a throwing humble.login after a "done" result settles into phase "error", not a silent idle', async () => {
    mockApi.humbleStartLogin.mockResolvedValue({ status: 'done' })
    mockHumble.login = jest.fn().mockRejectedValue(new Error('login failed'))

    const { states, onDone } = await settle()

    expect(states.at(-1)).toEqual({ phase: 'error', message: 'login failed' })
    expect(onDone).not.toHaveBeenCalled()
  })

  it('a rejected humbleReconnect (expired session) takes the same error path', async () => {
    mockHumble.expired = true
    mockApi.humbleReconnect.mockRejectedValue('not an Error')

    const { states } = await settle()

    expect(states.at(-1)).toEqual({ phase: 'error', message: 'not an Error' })
  })

  it('positive control: a resolved "done" still logs in and calls onDone with no error state', async () => {
    mockApi.humbleStartLogin.mockResolvedValue({ status: 'done' })
    mockHumble.login = jest.fn().mockResolvedValue(undefined)

    const { states, onDone } = await settle()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(states.at(-1)).toEqual({ phase: 'idle' })
  })
})
