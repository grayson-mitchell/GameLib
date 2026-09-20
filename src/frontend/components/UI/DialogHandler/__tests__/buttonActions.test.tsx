/**
 * Quick task 260919-sch — regression test for DialogHandler's `resolveButtonAction`,
 * covering the three actions moved off the native dialog shim onto this in-app path:
 * `vcRuntimeDownload`, `vcRuntimeSkip`, `snapWarningSuppress`. Also pins the two
 * no-regression cases: a button with no `action` passes through with `onClick` still
 * `undefined`, and the pre-existing `steamSignIn` action still resolves.
 *
 * `DialogHandler/index.tsx` imports `./components/MessageBoxModal`, which imports
 * `./index.css` -- this project's `testEnvironment: 'node'` Frontend jest project has
 * no CSS transform (see `jest.config.js`'s header; `NavItem.test.tsx`'s
 * `jest.mock('../components/NavItem/index.scss', () => ({}))` is the in-repo precedent
 * for stubbing a colocated stylesheet side-effect import this same way). MessageBoxModal
 * is mocked to an inert stand-in below; it never actually renders in this file's
 * assertions -- `dialogModalOptions.showDialog` is held `false` throughout, and every
 * assertion here operates on the button objects passed into the `showDialogModal` mock,
 * not on any rendered tree -- so a stub component changes nothing this file checks.
 *
 * `useContext`/`useEffect` are mocked via `react` (mirrors
 * `removeEosOverlayConfirmation.test.tsx`'s approach): `useContext` dispatches on the
 * mocked `ContextProvider` default export's `__name` sentinel to a fixed context
 * object; `useEffect` invokes its callback synchronously (a single mount needs no
 * dep-array re-run tracking) so the `onMessage` handler passed to
 * `window.api.handleShowDialog` is captured for direct invocation.
 */
import type { ButtonOptions } from 'common/types'

interface CapturedDialogOptions {
  title: string
  message: string
  type: string
  buttons: ButtonOptions[]
}

// Typed with the two-generic `jest.fn<ReturnType, ArgsType>` form (mirrors
// `SteamSignOut.test.ts`) so `.mock.calls[0][0]` resolves to
// `CapturedDialogOptions` directly, with no `any` in the access chain --
// avoids the `no-unsafe-member-access` warnings the untyped
// `jest.fn().mock.calls[0][0] as X` cast pattern produces (see
// `removeEosOverlayConfirmation.test.tsx`, which already carries four).
const mockShowDialogModal = jest.fn<void, [CapturedDialogOptions]>()
const mockConfigStoreSet = jest.fn<void, [string, boolean]>()
const mockOpenExternalUrl = jest.fn<void, [string]>()
const mockNavigate = jest.fn<void, [string]>()

type OnMessage = (
  e: unknown,
  title: string,
  message: string,
  type: string,
  buttons?: ButtonOptions[]
) => void

let capturedOnMessage: OnMessage | undefined

  // `window.api` stubbed at `globalThis` -- this project's `testEnvironment: 'node'`
  // jest config provides no `window` global otherwise (mirrors
  // `removeEosOverlayConfirmation.test.tsx`'s convention). Only the two channels this
  // file's assertions actually reach are stubbed.
;(
  globalThis as unknown as {
    window: {
      api: {
        handleShowDialog: (cb: OnMessage) => () => void
        openExternalUrl: typeof mockOpenExternalUrl
      }
    }
  }
).window = {
  api: {
    handleShowDialog: (cb: OnMessage) => {
      capturedOnMessage = cb
      return () => {
        capturedOnMessage = undefined
      }
    },
    openExternalUrl: mockOpenExternalUrl
  }
}

jest.mock('../components/MessageBoxModal', () => ({
  __esModule: true,
  default: () => null
}))

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string): string => defaultValue ?? _key
  })
}))

jest.mock('frontend/helpers/electronStores', () => ({
  configStore: { set: mockConfigStoreSet }
}))

jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: { __name: 'ContextProvider' }
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  return {
    ...actualReact,
    useContext: (ctx: { __name?: string }) => {
      if (ctx?.__name === 'ContextProvider') {
        return {
          dialogModalOptions: { showDialog: false },
          showDialogModal: mockShowDialogModal
        }
      }
      return undefined
    },
    useEffect: (fn: () => void) => {
      fn()
    }
  }
})

// Imported after the mocks above (textual order, not hoisting -- ts-jest does not
// hoist jest.mock; see removeEosOverlayConfirmation.test.tsx for the same convention).
import DialogHandler from '../index'

function mount(): void {
  capturedOnMessage = undefined
  DialogHandler()
}

function emit(buttons: ButtonOptions[]): void {
  if (!capturedOnMessage) {
    throw new Error('onMessage was never captured -- did mount() run?')
  }
  capturedOnMessage(undefined, 'title', 'message', 'MESSAGE', buttons)
}

describe('DialogHandler: resolveButtonAction (260919-sch)', () => {
  beforeEach(() => {
    mockShowDialogModal.mockClear()
    mockConfigStoreSet.mockClear()
    mockOpenExternalUrl.mockClear()
    mockNavigate.mockClear()
  })

  it('vcRuntimeSkip calls configStore.set("skipVcRuntime", true) exactly once', () => {
    mount()
    emit([{ text: 'skip', action: 'vcRuntimeSkip' }])

    const options = mockShowDialogModal.mock.calls[0][0]
    options.buttons[0].onClick!()

    expect(mockConfigStoreSet).toHaveBeenCalledTimes(1)
    expect(mockConfigStoreSet).toHaveBeenCalledWith('skipVcRuntime', true)
  })

  it('snapWarningSuppress calls configStore.set("showSnapWarning", false) exactly once', () => {
    mount()
    emit([{ text: 'suppress', action: 'snapWarningSuppress' }])

    const options = mockShowDialogModal.mock.calls[0][0]
    options.buttons[0].onClick!()

    expect(mockConfigStoreSet).toHaveBeenCalledTimes(1)
    expect(mockConfigStoreSet).toHaveBeenCalledWith('showSnapWarning', false)
  })

  it('vcRuntimeDownload opens both aka.ms URLs exactly once each and raises a follow-up dialog', () => {
    mount()
    emit([{ text: 'download', action: 'vcRuntimeDownload' }])

    const firstCallOptions = mockShowDialogModal.mock.calls[0][0]
    firstCallOptions.buttons[0].onClick!()

    expect(mockOpenExternalUrl).toHaveBeenCalledTimes(2)
    expect(mockOpenExternalUrl).toHaveBeenNthCalledWith(
      1,
      'https://aka.ms/vs/17/release/vc_redist.x86.exe'
    )
    expect(mockOpenExternalUrl).toHaveBeenNthCalledWith(
      2,
      'https://aka.ms/vs/17/release/vc_redist.x64.exe'
    )

    // showDialogModal's first call rendered the original dialog carrying this
    // button; the second is the follow-up info box the onClick handler raises.
    expect(mockShowDialogModal).toHaveBeenCalledTimes(2)
    const followUp = mockShowDialogModal.mock.calls[1][0]
    expect(followUp.type).toBe('MESSAGE')
    expect(followUp.buttons).toHaveLength(1)
  })

  it('steamSignIn still resolves to a handler (no regression)', () => {
    mount()
    emit([{ text: 'sign in', action: 'steamSignIn' }])

    const options = mockShowDialogModal.mock.calls[0][0]
    expect(options.buttons[0].onClick).toBeDefined()
    options.buttons[0].onClick!()

    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('a button with no action passes through with onClick still undefined (no regression)', () => {
    mount()
    emit([{ text: 'plain' }])

    const options = mockShowDialogModal.mock.calls[0][0]
    expect(options.buttons[0].onClick).toBeUndefined()
  })
})
