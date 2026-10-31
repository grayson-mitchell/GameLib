/**
 * Tests for the ReportProblem form. No jsdom is installed (see
 * src/frontend/jest.config.js), so 'react' hooks are replaced by a tiny
 * slot-based harness and the component is called as a plain function; the
 * returned element tree (host elements only) is inspected and handlers are
 * invoked directly.
 */
import type { ReactElement } from 'react'

type Slot = { value: unknown; deps?: unknown[] }
const h = {
  slots: [] as Slot[],
  index: 0,
  effects: [] as Array<() => void>,
  dirty: false
}

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useState: (init: unknown) => {
    const i = h.index++
    if (!h.slots[i]) {
      h.slots[i] = { value: typeof init === 'function' ? init() : init }
    }
    const set = (v: unknown) => {
      const next =
        typeof v === 'function'
          ? (v as (p: unknown) => unknown)(h.slots[i].value)
          : v
      if (next !== h.slots[i].value) {
        h.slots[i].value = next
        h.dirty = true
      }
    }
    return [h.slots[i].value, set]
  },
  useEffect: (fn: () => void, deps?: unknown[]) => {
    const i = h.index++
    const prev = h.slots[i]
    const changed =
      !prev ||
      !deps ||
      !prev.deps ||
      deps.some((d, k) => !Object.is(d, prev.deps?.[k]))
    h.slots[i] = { value: undefined, deps }
    if (changed) h.effects.push(fn)
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useContext: () => mockContext
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, d: string) => d
  })
}))

jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: {}
}))

const mockCollect = jest.fn()
const mockSubmit = jest.fn()
const mockEnv = jest.fn()
const mockConfigured = jest.fn()
jest.mock('frontend/helpers/reportProblem', () => ({
  collectDiagnostics: (...a: unknown[]) => mockCollect(...a),
  submitReport: (...a: unknown[]) => mockSubmit(...a),
  getReportEnv: (...a: unknown[]) => mockEnv(...a),
  isReportingConfigured: (...a: unknown[]) => mockConfigured(...a)
}))

const mockContext = {
  epic: { library: [], username: 'epicUser' },
  gog: { library: [], username: 'gogUser' },
  amazon: { library: [], user_id: 'amz1', username: 'amzUser' },
  steam: {
    library: [
      {
        runner: 'steam',
        app_name: '70',
        title: 'Half-Life',
        is_installed: true
      }
    ],
    username: 'steamUser'
  },
  humble: { username: 'humbleUser' },
  sideloadedLibrary: []
}

import ReportProblem from '../index'

type El = ReactElement<Record<string, unknown>>

const flush = () => new Promise((r) => setTimeout(r, 0))

function render(): El {
  for (let pass = 0; pass < 10; pass++) {
    h.index = 0
    h.effects = []
    h.dirty = false
    const tree = (ReportProblem as unknown as () => El)()
    const effects = h.effects
    effects.forEach((e) => e())
    if (!h.dirty) return tree
  }
  throw new Error('render did not settle')
}

function walk(node: unknown, visit: (el: El) => void) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit))
  const el = node as El
  if (!el.props) return
  visit(el)
  walk(el.props.children, visit)
}

function find(tree: El, pred: (el: El) => boolean): El | undefined {
  let found: El | undefined
  walk(tree, (el) => {
    if (!found && pred(el)) found = el
  })
  return found
}

const byTestId = (tree: El, id: string) =>
  find(tree, (el) => el.props['data-testid'] === id)

function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object') {
    return textOf((node as El).props?.children)
  }
  return ''
}

const typeMessage = (tree: El, v: string) =>
  (byTestId(tree, 'report-message')?.props.onChange as (e: unknown) => void)({
    target: { value: v }
  })

beforeEach(() => {
  h.slots = []
  mockCollect.mockReset().mockResolvedValue('DIAG')
  mockSubmit.mockReset().mockResolvedValue({ ok: true })
  mockEnv
    .mockReset()
    .mockResolvedValue({ appVersion: '2.20.0', osLabel: 'macOS 15' })
  mockConfigured.mockReset().mockReturnValue(true)
})

describe('ReportProblem', () => {
  it('unconfigured: shows the notice, disables Send and never submits', async () => {
    mockConfigured.mockReturnValue(false)
    let tree = render()
    expect(textOf(byTestId(tree, 'report-unconfigured'))).toContain(
      "isn't set up in this build"
    )
    typeMessage(tree, 'it broke')
    tree = render()
    const send = byTestId(tree, 'report-send')
    expect(send?.props.disabled).toBe(true)
    ;(send?.props.onClick as () => void)?.()
    await flush()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('configured: Send stays disabled until the message has non-whitespace text', () => {
    let tree = render()
    expect(byTestId(tree, 'report-unconfigured')).toBeUndefined()
    expect(byTestId(tree, 'report-send')?.props.disabled).toBe(true)
    typeMessage(tree, '   ')
    tree = render()
    expect(byTestId(tree, 'report-send')?.props.disabled).toBe(true)
    typeMessage(tree, 'it broke')
    tree = render()
    expect(byTestId(tree, 'report-send')?.props.disabled).toBe(false)
  })

  it('sends collected diagnostics by default, with env and identifiers', async () => {
    let tree = render()
    typeMessage(tree, 'it broke')
    tree = render()
    ;(byTestId(tree, 'report-send')?.props.onClick as () => void)()
    await flush()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit.mock.calls[0][0]).toMatchObject({
      message: 'it broke',
      diagnostics: 'DIAG',
      appVersion: '2.20.0',
      osLabel: 'macOS 15'
    })
    const ids = mockCollect.mock.calls[0][0].knownIdentifiers as string[]
    expect(ids).toEqual(
      expect.arrayContaining(['epicUser', 'gogUser', 'amz1', 'steamUser'])
    )
  })

  it('sends diagnostics: undefined and skips collecting when unchecked', async () => {
    let tree = render()
    ;(
      byTestId(tree, 'report-include-diagnostics')?.props.onChange as (
        e: unknown
      ) => void
    )({ target: { checked: false } })
    tree = render()
    typeMessage(tree, 'it broke')
    tree = render()
    ;(byTestId(tree, 'report-send')?.props.onClick as () => void)()
    await flush()
    expect(mockCollect).not.toHaveBeenCalled()
    expect(mockSubmit.mock.calls[0][0].diagnostics).toBeUndefined()
  })

  it('a failed submit shows an error and keeps the typed message', async () => {
    mockSubmit.mockResolvedValue({ ok: false, reason: 'network' })
    let tree = render()
    typeMessage(tree, 'it broke')
    tree = render()
    ;(byTestId(tree, 'report-send')?.props.onClick as () => void)()
    await flush()
    tree = render()
    expect(textOf(byTestId(tree, 'report-error'))).toMatch(/connect|internet/i)
    expect(byTestId(tree, 'report-message')?.props.value).toBe('it broke')
    expect(byTestId(tree, 'report-send')?.props.disabled).toBe(false)
  })

  it('success shows the thank-you and clears the form', async () => {
    let tree = render()
    typeMessage(tree, 'it broke')
    tree = render()
    ;(byTestId(tree, 'report-send')?.props.onClick as () => void)()
    await flush()
    tree = render()
    expect(byTestId(tree, 'report-thanks')).toBeDefined()
    expect(byTestId(tree, 'report-message')?.props.value).toBe('')
  })

  it('the preview shows the collected redacted diagnostics when opened', async () => {
    let tree = render()
    ;(byTestId(tree, 'report-preview')?.props.onToggle as (e: unknown) => void)(
      { currentTarget: { open: true } }
    )
    render()
    await flush()
    tree = render()
    expect(textOf(byTestId(tree, 'report-preview-text'))).toBe('DIAG')
  })
})
