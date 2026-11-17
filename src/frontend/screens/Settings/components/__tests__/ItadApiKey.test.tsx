/**
 * ItadApiKey (Phase 47-13, D-05/D-06). No DOM is available under this
 * project's node jest environment, so 'react' is mocked with a minimal
 * useState/useEffect harness (as in StoreSearchRow.test.tsx) and the
 * component is invoked as a plain function; its element tree is inspected.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

// The real barrel pulls in CSS-importing components that cannot load here.
jest.mock('frontend/components/UI', () => ({
  TextInputField: () => null,
  InfoBox: () => null
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let effectDeps: (unknown[] | undefined)[] = []
  let cursor = 0
  let effectCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

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
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      if (depsChanged(effectDeps[idx], deps)) {
        effectDeps[idx] = deps
        effect()
      }
    },
    __beginRender: () => {
      cursor = 0
      effectCursor = 0
    },
    __resetMount: () => {
      slots = []
      effectDeps = []
      cursor = 0
      effectCursor = 0
    }
  }
})

const mockApi = {
  itad: {
    getKeyStatus: jest.fn(),
    setApiKey: jest.fn()
  }
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

import ItadApiKey from '../ItadApiKey'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }
const harness = (): HookHarness =>
  jest.requireMock('react') as unknown as HookHarness

type Props = Record<string, unknown> & { children?: ReactNode }
type El = ReactElement<Props>

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

function mount(): El {
  harness().__resetMount()
  harness().__beginRender()
  return ItadApiKey() as unknown as El
}
function rerender(): El {
  harness().__beginRender()
  return ItadApiKey() as unknown as El
}

function elements(node: ReactNode, out: El[] = []): El[] {
  if (node === null || node === undefined || typeof node === 'boolean')
    return out
  if (Array.isArray(node)) {
    node.forEach((n) => elements(n as ReactNode, out))
    return out
  }
  if (typeof node === 'object') {
    const el = node as El
    out.push(el)
    elements(el.props?.children, out)
  }
  return out
}

const field = (root: El): El =>
  elements(root).find((e) => e.props.htmlId === 'itad-api-key') as El
const statusLine = (root: El): El | undefined =>
  elements(root).find((e) => e.props.role === 'status')

describe('ItadApiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.itad.setApiKey.mockResolvedValue(undefined)
  })

  test('no key: optional placeholder, password field, no status line', async () => {
    mockApi.itad.getKeyStatus.mockResolvedValue({
      hasKey: false,
      rejected: false
    })
    mount()
    await flush()
    const root = rerender()
    const input = field(root)
    expect(input.props.htmlId).toBe('itad-api-key')
    expect(input.props.type).toBe('password')
    expect(input.props.disabled).toBe(false)
    expect(input.props.placeholder).toBe(
      'Enter your IsThereAnyDeal API key (optional)'
    )
    expect(statusLine(root)).toBeUndefined()
  })

  test('saved key: placeholder switches and the input value stays empty', async () => {
    mockApi.itad.getKeyStatus.mockResolvedValue({
      hasKey: true,
      rejected: false
    })
    mount()
    await flush()
    const input = field(rerender())
    expect(input.props.placeholder).toBe(
      'Key saved — type to replace, clear to remove'
    )
    expect(input.props.value).toBe('')
  })

  test('rejected key: role=status line with the built-in key copy', async () => {
    mockApi.itad.getKeyStatus.mockResolvedValue({
      hasKey: true,
      rejected: true
    })
    mount()
    await flush()
    const line = statusLine(rerender())
    expect(line).toBeDefined()
    expect(line?.props.children).toBe(
      'ITAD rejected this key, so Store Search is using the built-in key.'
    )
    expect((line?.props.style as { color: string }).color).toBe(
      'var(--status-danger)'
    )
  })

  test('typing saves the key and hides the status line; clearing saves empty', async () => {
    mockApi.itad.getKeyStatus.mockResolvedValue({
      hasKey: true,
      rejected: true
    })
    mount()
    await flush()
    const onChange = field(rerender()).props.onChange as (v: string) => void

    onChange('abc')
    expect(mockApi.itad.setApiKey).toHaveBeenLastCalledWith('abc')
    await flush()
    const typed = rerender()
    expect(statusLine(typed)).toBeUndefined()
    expect(field(typed).props.value).toBe('abc')

    const onChangeAgain = field(typed).props.onChange as (v: string) => void
    onChangeAgain('')
    expect(mockApi.itad.setApiKey).toHaveBeenLastCalledWith('')
    await flush()
    const cleared = rerender()
    expect(statusLine(cleared)).toBeUndefined()
    expect(field(cleared).props.placeholder).toBe(
      'Enter your IsThereAnyDeal API key (optional)'
    )
  })

  test('getKeyStatus failing disables the field and never saves', async () => {
    mockApi.itad.getKeyStatus.mockRejectedValue(new Error('no channel'))
    mount()
    await flush()
    const input = field(rerender())
    expect(input.props.disabled).toBe(true)
    expect(input.props.placeholder).toBe('Unavailable on this build')
    expect(mockApi.itad.setApiKey).not.toHaveBeenCalled()
  })

  test('setApiKey failing disables the field', async () => {
    mockApi.itad.getKeyStatus.mockResolvedValue({
      hasKey: false,
      rejected: false
    })
    mockApi.itad.setApiKey.mockRejectedValue(new Error('too long'))
    mount()
    await flush()
    ;(field(rerender()).props.onChange as (v: string) => void)('abc')
    await flush()
    expect(field(rerender()).props.disabled).toBe(true)
  })
})
