/**
 * Unit tests for `queryLocalFontsSafe` (34.4.1 gap cycle 2, plan 27, Task 1).
 *
 * `index.tsx` itself is deliberately NOT imported here: it pulls in MUI plus
 * several `.css`-importing UI components (`ThemeSelector`, `ToggleSwitch`,
 * the `frontend/components/UI` barrel -> `PathSelectionBox` -> `electron`),
 * none of which are safe to `require()` under this project's jsdom-less
 * frontend jest project (see `jest.config.js`'s docstring -- no
 * jest-environment-jsdom installed). `queryLocalFontsSafe.ts` was extracted
 * from `index.tsx` specifically so the guard's actual behaviour -- including
 * unhandled-rejection tracking -- can be exercised directly, with zero DOM
 * and zero heavy dependencies. `index.tsx` remains the guard's only caller
 * and still literally references `queryLocalFontsSafe` (import + call site),
 * so it is still the single place a reader finds the guarded font lookup.
 */
import { queryLocalFontsSafe } from '../queryLocalFontsSafe'

const DEFAULT_FONTS = ['Default Secondary', 'Default Primary']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any

let logErrorMock: jest.Mock
let unhandledRejections: unknown[]

function onUnhandledRejection(reason: unknown) {
  unhandledRejections.push(reason)
}

beforeEach(() => {
  logErrorMock = jest.fn()
  g.window = { api: { logError: logErrorMock } }
  unhandledRejections = []
  process.on('unhandledRejection', onUnhandledRejection)
})

afterEach(() => {
  process.off('unhandledRejection', onUnhandledRejection)
  delete g.queryLocalFonts
  delete g.window
})

/** Lets any already-scheduled unhandled-rejection microtask/macrotask fire. */
async function flushRejectionTracking(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('queryLocalFontsSafe', () => {
  it('degrades to the two default fonts when queryLocalFonts is absent from window, without an unhandled rejection', async () => {
    expect(typeof g.queryLocalFonts).toBe('undefined')

    const result = await queryLocalFontsSafe(DEFAULT_FONTS)
    await flushRejectionTracking()

    expect(result).toEqual(DEFAULT_FONTS)
    expect(unhandledRejections).toEqual([])
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock.mock.calls[0][0]).toEqual(
      expect.stringContaining('queryLocalFonts')
    )
    expect(logErrorMock.mock.calls[0][0]).toEqual(
      expect.stringContaining('unavailable')
    )
  })

  it('degrades to the two default fonts when queryLocalFonts throws, without an unhandled rejection', async () => {
    g.queryLocalFonts = async () => {
      throw new Error('WKWebView: queryLocalFonts is not a function')
    }

    const result = await queryLocalFontsSafe(DEFAULT_FONTS)
    await flushRejectionTracking()

    expect(result).toEqual(DEFAULT_FONTS)
    expect(unhandledRejections).toEqual([])
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock.mock.calls[0][0]).toEqual(
      expect.stringContaining('queryLocalFonts')
    )
  })

  it('returns the two defaults plus deduplicated system families when queryLocalFonts resolves normally (adjacent-already-present verification)', async () => {
    g.queryLocalFonts = async () =>
      [
        { family: 'Arial' },
        { family: 'Arial' },
        { family: 'Times New Roman' }
      ] as FontData[]

    const result = await queryLocalFontsSafe(DEFAULT_FONTS)
    await flushRejectionTracking()

    expect(result).toEqual([
      ...DEFAULT_FONTS,
      'Arial',
      'Times New Roman'
    ])
    expect(unhandledRejections).toEqual([])
    expect(logErrorMock).not.toHaveBeenCalled()
  })
})
