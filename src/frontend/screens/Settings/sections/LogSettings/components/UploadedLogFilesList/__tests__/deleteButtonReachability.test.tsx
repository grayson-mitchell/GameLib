/**
 * Reachability gate for the uploaded-log DELETE control (todo
 * `uploaded-log-delete-button-lies`).
 *
 * The premise this file guards: `logger/uploader.ts` hardcodes `const token
 * = '1'` because dpaste.com has no delete API, so `deleteUploadedLogFile`
 * cannot delete anything **in either build** — it POSTs a bogus token and
 * either errors or reports success while the paste stays public. The correct
 * state, and the one upstream shipped in `6ec27795c`, is that no UI reaches
 * that channel. This suite proves that is still true, and fails the moment
 * someone un-hides the control without also fixing the backend.
 *
 * Why a RENDER walk and not a grep. A text gate over this file would key on
 * the JSX comment markers that currently hide the button, so it would be
 * satisfied by a live delete button written any other way — a raw `<button>`,
 * a renamed component, a different icon. The todo that produced this gate was
 * itself created by reading `index.tsx:60` as a live call site when that line
 * sits inside a JSX comment block, so a reader-level check is exactly what is
 * NOT wanted here. Instead the row component is invoked and its returned
 * element graph is searched for ANY control carrying an `onClick`, and each
 * one found is fired against a stubbed `window.api` — the assertion is about
 * which channel a click can reach, which is the property that matters.
 *
 * No jsdom in this jest project (see `src/frontend/jest.config.js`), so
 * `react`'s `useMemo` is stubbed to call through and the component is invoked
 * directly, per the `HumbleOriginInfo.test.tsx` pattern. Nothing below the
 * component is replaced with a double: `SvgButton` and `Dialog` are never
 * rendered, only observed as elements, so the walk sees the real props the
 * real component passes.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement, ReactNode } from 'react'

import type { UploadedLogData } from 'common/types'

const mockUploadedLogFiles: Record<string, UploadedLogData> = {}

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useMemo: (factory: () => unknown) => factory()
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string) => defaultValue
  })
}))

jest.mock('../index.css', () => ({}))
jest.mock('frontend/components/UI/Dialog/index.css', () => ({}))
jest.mock('frontend/components/UI/SvgButton/index.css', () => ({}))

jest.mock('frontend/state/UploadedLogFiles', () => ({
  __esModule: true,
  default: () => mockUploadedLogFiles
}))

jest.mock('frontend/state/GlobalStateV2', () => ({
  __esModule: true,
  default: {
    keys: () => ({ showUploadedLogFileList: true }),
    setState: jest.fn()
  }
}))

import UploadedLogFilesList from '../index'

const UPLOADER_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'backend',
  'logger',
  'uploader.ts'
)

const TEST_URL = 'https://dpaste.com/ABC123'

function seedOneUploadedLog() {
  for (const key of Object.keys(mockUploadedLogFiles)) {
    delete mockUploadedLogFiles[key]
  }
  mockUploadedLogFiles[TEST_URL] = {
    name: 'GameLib',
    token: '1',
    uploadedAt: Date.now() - 5 * 60 * 1000
  }
}

const MEMO_TYPE = Symbol.for('react.memo')

function isElement(node: unknown): node is ReactElement {
  return (
    typeof node === 'object' &&
    node !== null &&
    '$$typeof' in node &&
    'props' in node
  )
}

/** Depth-first walk over `children`, visiting every React element in the tree. */
function walkElements(node: ReactNode, visit: (el: ReactElement) => void) {
  if (Array.isArray(node)) {
    node.forEach((child) => walkElements(child as ReactNode, visit))
    return
  }
  if (!isElement(node)) return

  visit(node)
  walkElements((node.props as { children?: ReactNode }).children, visit)
}

/**
 * Renders the memo-wrapped row component found in the list's element graph.
 * Only the row is expanded — `Dialog`/`DialogContent` are left as elements,
 * so no component that expects a real renderer is ever invoked.
 */
function renderTheRow(): ReactElement {
  const list = UploadedLogFilesList() as ReactElement
  const rows: ReactElement[] = []

  walkElements(list, (el) => {
    const type = el.type as unknown as {
      $$typeof?: symbol
      type?: (props: unknown) => ReactElement
    }
    if (type?.$$typeof === MEMO_TYPE && typeof type.type === 'function') {
      rows.push(type.type(el.props))
    }
  })

  expect(rows).toHaveLength(1)
  return rows[0]
}

/** Every element in `tree` carrying an onClick handler, in document order. */
function collectClickHandlers(tree: ReactNode): Array<() => unknown> {
  const handlers: Array<() => unknown> = []
  walkElements(tree, (el) => {
    const onClick = (el.props as { onClick?: () => unknown }).onClick
    if (typeof onClick === 'function') handlers.push(onClick)
  })
  return handlers
}

/** Fires every handler against a stubbed api and reports which channels ran. */
function channelsReachedBy(handlers: Array<() => unknown>): string[] {
  const reached: string[] = []
  const api = new Proxy(
    {},
    {
      get:
        (_target, prop: string) =>
        (...args: unknown[]) => {
          reached.push(prop)
          void args
          return Promise.resolve(true)
        }
    }
  )
  const previousApi = (globalThis as { window?: { api?: unknown } }).window?.api
  ;(globalThis as unknown as { window: { api: unknown } }).window = { api }
  try {
    handlers.forEach((handler) => handler())
  } finally {
    ;(globalThis as unknown as { window: { api: unknown } }).window = {
      api: previousApi
    }
  }
  return reached
}

describe('uploaded-log delete control reachability (todo uploaded-log-delete-button-lies)', () => {
  beforeEach(seedOneUploadedLog)

  it('no control in an uploaded-log row can reach deleteUploadedLogFile', () => {
    const reached = channelsReachedBy(collectClickHandlers(renderTheRow()))

    expect(reached).not.toContain('deleteUploadedLogFile')
  })

  it("NON-VACUITY: the same walk does find the row's real control, and it opens the paste URL", () => {
    // Without this, the assertion above would pass just as happily against an
    // empty tree, a broken walk, or a row that renders no actions at all.
    const handlers = collectClickHandlers(renderTheRow())

    expect(handlers).toHaveLength(1)
    expect(channelsReachedBy(handlers)).toEqual(['openExternalUrl'])
  })

  it('SELF-TEST: the same predicate DOES flag a row that wires a live delete button', () => {
    // The exact shape the todo described -- a second SvgButton whose onClick
    // hits the channel. Proves the gate can go RED, rather than only proving
    // that the current tree happens to be quiet.
    const liveDeleteRow = {
      $$typeof: Symbol.for('react.element'),
      type: 'tr',
      props: {
        children: [
          {
            $$typeof: Symbol.for('react.element'),
            type: 'button',
            props: {
              onClick: () =>
                (
                  window as unknown as {
                    api: { openExternalUrl: (u: string) => void }
                  }
                ).api.openExternalUrl(TEST_URL)
            }
          },
          {
            $$typeof: Symbol.for('react.element'),
            type: 'button',
            props: {
              onClick: async () =>
                (
                  window as unknown as {
                    api: { deleteUploadedLogFile: (u: string) => void }
                  }
                ).api.deleteUploadedLogFile(TEST_URL)
            }
          }
        ]
      }
    } as unknown as ReactElement

    const reached = channelsReachedBy(collectClickHandlers(liveDeleteRow))

    expect(reached).toContain('deleteUploadedLogFile')
  })

  it('the backend premise still holds: uploader.ts cannot delete, so hiding the control is still correct', () => {
    // Keyed on the FACT (a hardcoded token literal), not on the rationale
    // comment beside it -- a comment can be reworded while the defect stays.
    // If a host with a real delete API ever replaces dpaste, this fails and
    // the UI decision above should be revisited rather than this line edited.
    const uploaderSource = readFileSync(UPLOADER_PATH, 'utf-8')

    expect(uploaderSource).toMatch(/const token = '1'/)
  })
})
