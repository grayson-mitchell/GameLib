/**
 * Unit tests for the unified Humble Keys screen (Phase 43 plan 07).
 *
 * This suite carries forward all 22 behavioural assertions that used to live
 * in the two retired tab suites -- `Waiting/__tests__/index.test.tsx` (13
 * tests) and `All/__tests__/index.test.tsx` (9 tests) -- plus the new
 * controls behaviour this plan adds (search, sort, the "Redeemable keys
 * only" checkbox, the two empty states, generic-platform inclusion). The
 * full PORT/REWRITE disposition table for all 22 ported assertions is
 * recorded in `43-07-SUMMARY.md`; every `it(...)` below that ports a
 * pre-existing assertion says so in its own name or an inline comment so the
 * mapping is auditable from this file alone too.
 *
 * No jsdom / react-test-renderer installed in this project (see
 * `src/frontend/jest.config.js`'s own docstring) -- 'react'
 * (useState/useEffect/useMemo/useContext) and 'react-i18next'
 * (useTranslation) are mocked at module level, mirroring
 * `Waiting/__tests__/index.test.tsx`'s harness exactly: slot-based `useState`
 * plus a **dependency-aware** `useEffect` that invokes cleanups before a
 * re-run. Both properties are load-bearing for the SAME reasons recorded in
 * that file: a dep-ignoring mock makes the 260823-n5b key-set-refetch tests
 * vacuous, and a cleanup-skipping mock makes the mountedRef-latching test
 * vacuous. Neither is simplified here.
 *
 * ADAPTATIONS beyond Waiting's harness, all forced by this component being
 * strictly larger than either retired tab (confirmed empirically -- a
 * scratch probe importing `../index` with only Waiting's original mock set
 * failed with `SyntaxError: Unexpected token '.'` against
 * `WarningMessage/index.css`, i.e. this is a Rule 3 blocking-issue fix, not
 * a style choice):
 *   - `../index.css` and `../components/HumbleClaimWizard/index.css` are
 *     stubbed (the second exactly as Waiting's suite already does).
 *   - `frontend/components/UI/{WarningMessage,SearchBar,SelectField,
 *     ToggleSwitch}` are replaced with hookless stubs that render nothing,
 *     purely to avoid importing their own CSS/SCSS (none of them are ever
 *     invoked as functions -- like `HumbleClaimWizard` in Waiting's suite,
 *     they only ever appear as JSX element `type`s, so their props are
 *     inspected straight off the tree, never their rendered output).
 *   - `react-router-dom` is stubbed (`Navigate`/`useNavigate`) -- this
 *     component calls `useNavigate()` directly (Waiting/index.tsx never
 *     did), and the real hook reaches for router context that does not
 *     exist in this no-DOM harness.
 *   - `frontend/screens/Login` is stubbed to its four exported path
 *     constants only -- importing the real module pulls in the full Login
 *     screen (and its `.scss`), for four string literals.
 *
 * SOURCE-TEXT SCANNING for the App.tsx routing assertion (REQ-43-16): a
 * scratch probe confirmed `App.tsx` cannot be imported under this jest
 * project even via its now-exported `routes` array -- `import './App.css'`
 * at module scope throws the same `SyntaxError` before any mock in this
 * file could intercept it, and mocking out App.tsx's entire transitive
 * import graph (NavShell, ContextProvider, half a dozen dialog components)
 * is out of proportion for one routing assertion. This follows the
 * established convention in
 * `src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx`
 * (its own "SOURCE GATES, NOT RENDER TESTS" docblock explains the same
 * constraint): read the file, strip comments, match text.
 */
import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'

import { ClaimAnnotation, HumbleKey } from 'common/types/humble'
import { GENERIC_KEY_PLATFORM } from 'common/humble/genericKeyPlatform'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import HumbleKeyRow from '../components/HumbleKeyRow'

// ── Module stubs (see docblock above for why each exists) ──────────────────

jest.mock('../index.css', () => ({}))
jest.mock('../components/HumbleClaimWizard/index.css', () => ({}))

// `mockNavigate` is a SHARED spy, not the per-call `jest.fn()` this mock used
// to return. REQ-43-24's claim destination is a NAVIGATION now (quick
// `260925-gnp`), so a test has to be able to assert where it went; a factory
// handing out a fresh spy per `useNavigate()` call makes that unobservable.
// The `mock` name prefix is what lets the hoisted `jest.mock` factory close
// over it.
const mockNavigate = jest.fn()

jest.mock('react-router-dom', () => ({
  Navigate: function MockNavigate() {
    return null
  },
  useNavigate: () => mockNavigate
}))

jest.mock('frontend/screens/Login', () => ({
  humbleLoginPath: '/loginweb/humble',
  steamLoginPath: '/loginweb/steam',
  gogLoginPath: '/loginweb/gog',
  epicLoginPath: '/loginweb/legendary'
}))

jest.mock('frontend/components/UI/WarningMessage', () => ({
  __esModule: true,
  default: function WarningMessageStub() {
    return null
  }
}))
jest.mock('frontend/components/UI/SearchBar', () => ({
  __esModule: true,
  default: function SearchBarStub() {
    return null
  }
}))
jest.mock('frontend/components/UI/SelectField', () => ({
  __esModule: true,
  default: function SelectFieldStub() {
    return null
  }
}))
jest.mock('frontend/components/UI/ToggleSwitch', () => ({
  __esModule: true,
  default: function ToggleSwitchStub() {
    return null
  }
}))

// Supports both call shapes used by this screen: the plain
// `t(key, 'literal default', params)` form, and the i18next v4 plural-group
// form `t(key, { count, defaultValue, defaultValue_one, ...interp })` that
// `humbleKeys.cooldown`/`humbleKeys.syncing` now use (260925-88h) -- picks
// `defaultValue_one` when `count === 1`, else `defaultValue`.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValueOrOptions?: string | Record<string, unknown>,
      maybeParams?: Record<string, unknown>
    ): string => {
      const usingOptionsForm = typeof defaultValueOrOptions !== 'string'
      const params = usingOptionsForm ? defaultValueOrOptions : maybeParams

      const defaultValue = usingOptionsForm
        ? String(
            (params?.count === 1 ? params?.defaultValue_one : undefined) ??
              params?.defaultValue
          )
        : defaultValueOrOptions

      return Object.entries(params ?? {}).reduce(
        (str: string, [k, v]) => str.replace(`{{${k}}}`, String(v)),
        defaultValue
      )
    }
  })
}))

type MockContextValue = {
  humble: {
    keys: HumbleKey[]
    isLoggedIn?: boolean
    syncing?: boolean
    syncError?: string
    syncedAt?: number
  }
  steam: { username?: string }
  gog: { username?: string }
  epic: { username?: string }
  showDialogModal: jest.Mock
}

let contextValue: MockContextValue = {
  humble: { keys: [], isLoggedIn: true },
  steam: {},
  gog: {},
  epic: {},
  showDialogModal: jest.fn()
}

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let slots: unknown[] = []
  let cursor = 0

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = cursor++
      if (idx >= slots.length) {
        slots[idx] =
          typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const setState = (updater: unknown) => {
        slots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(slots[idx])
            : updater
      }
      return [slots[idx], setState]
    },
    // Quick task 260823-n5b (see Waiting/__tests__/index.test.tsx's own
    // comment, carried forward verbatim): dependency-aware, cleanup-before-
    // rerun semantics. Load-bearing for the ported 260823-n5b tests and the
    // mountedRef-latching test below.
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = cursor++
      const prev = slots[idx] as
        | { deps?: unknown[]; cleanup?: () => void }
        | undefined
      const changed =
        deps === undefined ||
        prev === undefined ||
        prev.deps === undefined ||
        prev.deps.length !== deps.length ||
        deps.some((d, i) => !Object.is(d, (prev.deps as unknown[])[i]))
      if (changed) {
        if (prev?.cleanup) prev.cleanup()
        const cleanup = effect()
        slots[idx] = {
          deps,
          cleanup: typeof cleanup === 'function' ? cleanup : undefined
        }
      } else {
        slots[idx] = { deps, cleanup: prev?.cleanup }
      }
    },
    useMemo: (factory: () => unknown, deps?: unknown[]) => {
      const idx = cursor++
      const prev = slots[idx] as
        | { deps?: unknown[]; value: unknown }
        | undefined
      const changed =
        deps === undefined ||
        prev === undefined ||
        prev.deps === undefined ||
        prev.deps.length !== deps.length ||
        deps.some((d, i) => !Object.is(d, (prev.deps as unknown[])[i]))
      if (changed) {
        const value = factory()
        slots[idx] = { deps, value }
        return value
      }
      return prev.value
    },
    useContext: () => contextValue,
    __beginRender: () => {
      cursor = 0
    },
    __resetMount: () => {
      slots = []
      cursor = 0
    }
  }
})

const mockApi = {
  humbleGetClaimAnnotations: jest.fn(),
  humbleGetOwnershipOverrides: jest.fn(),
  humbleGetGiftedAt: jest.fn(),
  humbleGetSyncState: jest.fn(),
  handleHumbleSyncProgress: jest.fn(),
  humbleUndoRedeemed: jest.fn(),
  humbleSync: jest.fn(),
  humbleRecordGiftLinkOpened: jest.fn(),
  openExternalUrl: jest.fn(),
  clipboardWriteText: jest.fn()
}

;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import HumbleKeys from '../index'
// Imported UNMOCKED and deliberately: the REQ-43-24 block below asserts the
// real origin table answers for Humble's keys URL. Stubbing it would let the
// deep link pass this suite while resolving to `null` in the app.
import {
  isEmbeddableOrigin,
  resolveStoreForUrl
} from 'frontend/screens/WebView/storeEmbedOrigins'
import SearchBarStub from 'frontend/components/UI/SearchBar'
import SelectFieldStub from 'frontend/components/UI/SelectField'
import ToggleSwitchStub from 'frontend/components/UI/ToggleSwitch'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return HumbleKeys() as unknown as ReactElement
}

function rerender(): ReactElement {
  harness().__beginRender()
  return HumbleKeys() as unknown as ReactElement
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function makeHumbleKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk-1',
    machineName: 'mn-1',
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Humble RPG Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

type PropsWithChildren = { children?: ReactNode }

function collectElements(
  node: ReactNode,
  out: ReactElement<PropsWithChildren>[] = []
): ReactElement<PropsWithChildren>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<PropsWithChildren>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map((child) => textContent(child as ReactNode)).join('')
  }
  if (typeof node === 'object' && 'props' in node) {
    return textContent(
      (node as ReactElement<PropsWithChildren>).props?.children
    )
  }
  return ''
}

function findByClassName(
  tree: ReactElement,
  className: string
): ReactElement<PropsWithChildren> | undefined {
  return collectElements(tree).find((el) => {
    const cls = (el.props as { className?: string }).className
    return typeof cls === 'string' && cls.split(' ').includes(className)
  })
}

type ClaimAction = {
  revealedAt: number | null
  redeemedAt: number | null
  keyindexResolved: boolean
  onClaim: () => void
  onFinish: () => void
  onUndoRedeem: () => void
}

type SettleAction = { settledAt: number; onUndoSettle: () => void }
type GiftAction = { giftedAt: number | null; onGift: () => void }

type RowProps = {
  humbleKey: HumbleKey
  claimAction?: ClaimAction
  settleAction?: SettleAction
  giftAction?: GiftAction
  undoOverride?: boolean
  storeLoginConnected?: boolean
}

function findAllHumbleKeyRowProps(tree: ReactElement): RowProps[] {
  return collectElements(tree)
    .filter((el) => el.type === HumbleKeyRow)
    .map((el) => (el as ReactElement<RowProps>).props)
}

function findHumbleKeyRowProps(
  tree: ReactElement,
  gamekey: string,
  machineName: string
): RowProps | undefined {
  return findAllHumbleKeyRowProps(tree).find(
    (p) =>
      p.humbleKey.gamekey === gamekey && p.humbleKey.machineName === machineName
  )
}

// The "Redeemable keys only" checkbox defaults to true and filters on
// REDEEMABLE_ONLY_STATES (`{UNPICKED, UNREVEALED}` as of 260911-t0p,
// formerly WAITING_STATES -- see index.tsx's filteredKeys), which excludes
// REDEEMED keys (both sets) AND, as of 260911-t0p, REVEALED keys too (only
// REDEEMABLE_ONLY_STATES) from `filteredKeys` (and therefore from the
// rendered row list) unless it is turned off. Every ported D-42-01
// settle-undo assertion below operates on a REDEEMED key, and several
// REVEALED-key assertions elsewhere in this file also need this, so each
// needs this before it can find its row at all -- this was NOT a concern
// in the retired `All` tab (it had no "waiting only" concept), which is
// exactly the "adapted only for the unified list's shape" adjustment the
// plan calls for.
function turnOffRedeemableOnly(tree: ReactElement): ReactElement {
  const toggle = collectElements(tree).find(
    (el) => el.type === ToggleSwitchStub
  )
  ;(
    toggle!.props as {
      handleChange: (e: { target: { checked: boolean } }) => void
    }
  ).handleChange({ target: { checked: false } })
  return rerender()
}

function defaultContext(keys: HumbleKey[] = []): MockContextValue {
  return {
    humble: { keys, isLoggedIn: true },
    steam: {},
    gog: {},
    epic: {},
    showDialogModal: jest.fn()
  }
}

describe('HumbleKeys (unified list, Phase 43 plan 07)', () => {
  beforeEach(() => {
    contextValue = defaultContext()
    mockApi.humbleGetClaimAnnotations.mockResolvedValue({})
    mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})
    mockApi.humbleGetGiftedAt.mockResolvedValue({})
    mockApi.humbleGetSyncState.mockResolvedValue({ cooldownUntil: undefined })
    mockApi.handleHumbleSyncProgress.mockReturnValue(() => {})
  })

  // ── Ported from Waiting/__tests__/index.test.tsx (13 tests) ──────────────
  describe('ported from Waiting/__tests__ (annotation lifecycle)', () => {
    it('PORT: fetches claim annotations once on mount', () => {
      contextValue = defaultContext([makeHumbleKey()])
      mount()

      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)
    })

    it('PORT: refetches claim annotations after the claim wizard closes (round-7 fix)', async () => {
      const key = makeHumbleKey()
      const showDialogModal = jest.fn<
        void,
        [{ message?: ReactElement<{ onDone: () => void }> }]
      >()
      contextValue = { ...defaultContext([key]), showDialogModal }

      mockApi.humbleGetClaimAnnotations.mockResolvedValue({})
      const initial = mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(initial, 'gk-1', 'mn-1')
      expect(props).toBeDefined()
      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

      props!.claimAction!.onClaim()
      expect(showDialogModal).toHaveBeenCalledTimes(1)
      const dialogOptions = showDialogModal.mock.calls[0][0]
      const onDone = dialogOptions.message?.props.onDone

      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { revealedAt: 12345, keyindexResolved: true }
      })
      onDone?.()

      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
      await flushPromises()

      const updatedProps = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      expect(updatedProps).toBeDefined()
    })

    it('PORT: refetches claim annotations after an undo-redeem action resolves', async () => {
      const key = makeHumbleKey({ state: 'REDEEMED' })
      contextValue = defaultContext([key])
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { redeemedAt: 999, keyindexResolved: true }
      })
      mockApi.humbleUndoRedeemed.mockResolvedValue(undefined)

      const initial = mount()
      await flushPromises()
      const visible = turnOffRedeemableOnly(initial)

      const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
      expect(props).toBeDefined()
      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

      props!.claimAction!.onUndoRedeem()
      expect(mockApi.humbleUndoRedeemed).toHaveBeenCalledWith({
        gamekey: 'gk-1',
        machineName: 'mn-1'
      })

      await flushPromises()
      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
    })

    it('PORT (WR-04): passes undoOverride=true when an override record exists for its machineName', async () => {
      const key = makeHumbleKey()
      contextValue = defaultContext([key])
      mockApi.humbleGetOwnershipOverrides.mockResolvedValue({
        'mn-1': 1720000000000
      })

      mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      expect(props).toBeDefined()
      expect(props?.undoOverride).toBe(true)
    })

    it('PORT (WR-04): passes undoOverride=false when no override record exists', async () => {
      contextValue = defaultContext([makeHumbleKey()])
      mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})

      mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      expect(props).toBeDefined()
      expect(props?.undoOverride).toBe(false)
    })

    describe('PORT (WR-02): IPC rejection handling', () => {
      it('rejected mount-time annotation fetches do not escape and the screen still renders', async () => {
        contextValue = defaultContext([makeHumbleKey()])
        mockApi.humbleGetClaimAnnotations.mockRejectedValue(
          new Error('ipc channel gone')
        )
        mockApi.humbleGetOwnershipOverrides.mockRejectedValue(
          new Error('ipc channel gone')
        )

        const tree = mount()
        await flushPromises()

        const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
        expect(props).toBeDefined()
        expect(props?.claimAction?.revealedAt).toBeNull()
        expect(props?.claimAction?.keyindexResolved).toBe(false)
        expect(tree).toBeDefined()
      })

      it('a rejected humbleUndoRedeemed still refreshes annotations (row re-reads backend truth, never stays silently stale)', async () => {
        const key = makeHumbleKey({ state: 'REDEEMED' })
        contextValue = defaultContext([key])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({
          'gk-1:mn-1': { redeemedAt: 999, keyindexResolved: true }
        })
        mockApi.humbleUndoRedeemed.mockRejectedValue(
          new Error('ipc channel gone')
        )

        const initial = mount()
        await flushPromises()
        const visible = turnOffRedeemableOnly(initial)

        const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
        expect(props).toBeDefined()
        expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

        props!.claimAction!.onUndoRedeem()
        await flushPromises()

        expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
      })
    })

    describe('PORT (CR-01): server-revealed key with no local annotation', () => {
      it('renders onFinish (not onClaim) as the row action, without a "Revealed {date}" annotation', async () => {
        const key = makeHumbleKey({ state: 'REVEALED' })
        contextValue = defaultContext([key])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

        const tree = mount()
        await flushPromises()
        // 260911-t0p: "Redeemable keys only" now filters on
        // REDEEMABLE_ONLY_STATES, which excludes REVEALED (defect 3's
        // fix) -- this test's subject is the row's claimAction CONTENT
        // (onFinish vs onClaim, the "Revealed" annotation), not whether
        // the row is visible under the checkbox, so turning the checkbox
        // off to reach the row is the correct fix, not a workaround.
        const visible = turnOffRedeemableOnly(tree)

        const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
        expect(props).toBeDefined()
        expect(props!.claimAction!.revealedAt).toBeNull()

        const rowTree = HumbleKeyRow({
          humbleKey: key,
          claimAction: props!.claimAction
        }) as unknown as ReactElement
        const buttons = collectElements(rowTree).filter(
          (el) => el.type === 'button'
        ) as ReactElement<PropsWithChildren & { onClick?: () => void }>[]

        const finishButton = buttons.find(
          (b) => b.props.onClick === props!.claimAction!.onFinish
        )
        expect(finishButton).toBeDefined()
        expect(textContent(finishButton)).toContain('Activate')
        expect(
          buttons.find((b) => b.props.onClick === props!.claimAction!.onClaim)
        ).toBeUndefined()
        expect(textContent(rowTree)).not.toContain('Revealed ')
      })

      it('onFinish opens the wizard in finish mode (fetches the stored value on demand, never re-reveals)', async () => {
        const key = makeHumbleKey({ state: 'REVEALED' })
        const showDialogModal = jest.fn<
          void,
          [{ message?: ReactElement<{ entryMode: 'claim' | 'finish' }> }]
        >()
        contextValue = { ...defaultContext([key]), showDialogModal }
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

        const tree = mount()
        await flushPromises()
        // 260911-t0p: see the sibling test above -- this test's subject is
        // the dialog opened by claimAction.onFinish (CONTENT), not the
        // row's visibility under the checkbox.
        const visible = turnOffRedeemableOnly(tree)

        const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
        props!.claimAction!.onFinish()

        expect(showDialogModal).toHaveBeenCalledTimes(1)
        const dialogOptions = showDialogModal.mock.calls[0][0]
        expect(dialogOptions.message?.props.entryMode).toBe('finish')
      })
    })

    describe('PORT (260823-n5b): annotations refresh when the key set changes', () => {
      it('refetches annotations when a key is ADDED after mount, so the new row becomes claimable', async () => {
        const first = makeHumbleKey({ gamekey: 'gk-1', machineName: 'mn-1' })
        const second = makeHumbleKey({ gamekey: 'gk-2', machineName: 'mn-2' })

        contextValue = defaultContext([first])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({
          'gk-1:mn-1': { keyindexResolved: true }
        })

        mount()
        await flushPromises()
        const callsAfterMount =
          mockApi.humbleGetClaimAnnotations.mock.calls.length

        mockApi.humbleGetClaimAnnotations.mockResolvedValue({
          'gk-1:mn-1': { keyindexResolved: true },
          'gk-2:mn-2': { keyindexResolved: true }
        })
        contextValue = defaultContext([first, second])

        rerender()
        await flushPromises()

        expect(
          mockApi.humbleGetClaimAnnotations.mock.calls.length
        ).toBeGreaterThan(callsAfterMount)

        const rows = findAllHumbleKeyRowProps(rerender())
        expect(rows).toHaveLength(2)
        expect(rows.every((r) => r.claimAction?.keyindexResolved)).toBe(true)
      })

      it('does NOT refetch when the key set is unchanged (no refetch loop)', async () => {
        const key = makeHumbleKey()
        contextValue = defaultContext([key])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({
          'gk-1:mn-1': { keyindexResolved: true }
        })

        mount()
        await flushPromises()
        const callsAfterMount =
          mockApi.humbleGetClaimAnnotations.mock.calls.length

        rerender()
        await flushPromises()
        rerender()
        await flushPromises()

        expect(mockApi.humbleGetClaimAnnotations.mock.calls.length).toBe(
          callsAfterMount
        )
      })

      it('a same-SIZE key-set swap still refetches (identity is the key ids, not the count)', async () => {
        contextValue = defaultContext([makeHumbleKey({ gamekey: 'gk-1' })])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

        mount()
        await flushPromises()
        const callsAfterMount =
          mockApi.humbleGetClaimAnnotations.mock.calls.length

        contextValue = defaultContext([makeHumbleKey({ gamekey: 'gk-9' })])
        rerender()
        await flushPromises()

        expect(
          mockApi.humbleGetClaimAnnotations.mock.calls.length
        ).toBeGreaterThan(callsAfterMount)
      })

      it('a key-set change does not latch mountedRef, so later fetches still apply', async () => {
        const first = makeHumbleKey({ gamekey: 'gk-1', machineName: 'mn-1' })
        const second = makeHumbleKey({ gamekey: 'gk-2', machineName: 'mn-2' })

        contextValue = defaultContext([first])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

        mount()
        await flushPromises()

        contextValue = defaultContext([first, second])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({
          'gk-1:mn-1': { keyindexResolved: true },
          'gk-2:mn-2': { keyindexResolved: true }
        })
        rerender()
        await flushPromises()

        const rows = findAllHumbleKeyRowProps(rerender())
        expect(rows.every((r) => r.claimAction?.keyindexResolved)).toBe(true)
      })
    })
  })

  // ── Ported/rewritten from All/__tests__/index.test.tsx (9 tests) ─────────
  describe('ported/rewritten from All/__tests__ (settle-undo reachability, D-42-01)', () => {
    function annotationsFor(
      key: HumbleKey,
      annotation: ClaimAnnotation
    ): Record<string, ClaimAnnotation> {
      return { [`${key.gamekey}:${key.machineName}`]: annotation }
    }

    describe('PORT: REACHABILITY', () => {
      it('an ownership-exact-settled REDEEMED key receives a defined settleAction with the annotation timestamp', async () => {
        const key = makeHumbleKey({
          state: 'REDEEMED',
          ownedElsewhere: true,
          matchConfidence: 'exact'
        })
        contextValue = defaultContext([key])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue(
          annotationsFor(key, {
            redeemedAt: 1700000000000,
            redeemedSource: 'ownership-exact',
            keyindexResolved: true
          })
        )

        const initial = mount()
        await flushPromises()
        const visible = turnOffRedeemableOnly(initial)

        const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
        expect(props).toBeDefined()
        expect(props?.settleAction).toBeDefined()
        expect(props?.settleAction?.settledAt).toBe(1700000000000)
      })

      it('invoking settleAction.onUndoSettle calls humbleUndoRedeemed with {gamekey, machineName} and refreshes annotations', async () => {
        const key = makeHumbleKey({
          state: 'REDEEMED',
          ownedElsewhere: true,
          matchConfidence: 'exact'
        })
        contextValue = defaultContext([key])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue(
          annotationsFor(key, {
            redeemedAt: 1700000000000,
            redeemedSource: 'ownership-exact',
            keyindexResolved: true
          })
        )
        mockApi.humbleUndoRedeemed.mockResolvedValue(undefined)

        const initial = mount()
        await flushPromises()
        const visible = turnOffRedeemableOnly(initial)
        const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
        expect(props?.settleAction).toBeDefined()
        expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

        props!.settleAction!.onUndoSettle()
        expect(mockApi.humbleUndoRedeemed).toHaveBeenCalledWith({
          gamekey: 'gk-1',
          machineName: 'mn-1'
        })

        await flushPromises()
        expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
      })

      it('WR-02: a rejected humbleUndoRedeemed still refreshes annotations and produces no unhandled rejection', async () => {
        const key = makeHumbleKey({
          state: 'REDEEMED',
          ownedElsewhere: true,
          matchConfidence: 'exact'
        })
        contextValue = defaultContext([key])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue(
          annotationsFor(key, {
            redeemedAt: 1700000000000,
            redeemedSource: 'ownership-exact',
            keyindexResolved: true
          })
        )
        mockApi.humbleUndoRedeemed.mockRejectedValue(
          new Error('ipc channel gone')
        )

        const initial = mount()
        await flushPromises()
        const visible = turnOffRedeemableOnly(initial)
        const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
        expect(props?.settleAction).toBeDefined()
        expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

        props!.settleAction!.onUndoSettle()
        await flushPromises()

        expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
      })
    })

    describe('PORT: SCOPING -- settleAction must be undefined unless redeemedSource === "ownership-exact" AND redeemedAt is defined', () => {
      type ScopeCase = { name: string; annotation: ClaimAnnotation | undefined }

      const SCOPE_CASES: ScopeCase[] = [
        {
          name: 'redeemedSource is the explicit "user" value',
          annotation: {
            redeemedAt: 1700000000000,
            redeemedSource: 'user',
            keyindexResolved: true
          }
        },
        {
          name: 'redeemedSource is absent (the legacy on-disk shape -- the inversion trap)',
          annotation: { redeemedAt: 1700000000000, keyindexResolved: true }
        },
        {
          name: 'no annotation entry exists for the key at all',
          annotation: undefined
        },
        {
          name: 'redeemedSource is "ownership-exact" but redeemedAt is absent',
          annotation: {
            redeemedSource: 'ownership-exact',
            keyindexResolved: true
          }
        }
      ]

      it.each(SCOPE_CASES)(
        '$name -> settleAction is undefined',
        async ({ annotation }) => {
          const key = makeHumbleKey({
            state: 'REDEEMED',
            ownedElsewhere: true,
            matchConfidence: 'exact'
          })
          contextValue = defaultContext([key])
          mockApi.humbleGetClaimAnnotations.mockResolvedValue(
            annotation ? annotationsFor(key, annotation) : {}
          )

          const initial = mount()
          await flushPromises()
          const visible = turnOffRedeemableOnly(initial)

          const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
          expect(props).toBeDefined()
          expect(props?.settleAction).toBeUndefined()
        }
      )
    })

    // REWRITE: the deleted grouped-presentation test suite called this
    // "GROUP SCOPING" because settleAction was gated on which collapsible
    // group (REVEALED/REDEEMED/...) a key sat in, rendered through its own
    // group-heading component. The unified list has no groups at
    // all -- every key is a flat sibling -- so the only thing left to prove
    // is the substance the name always meant: settleAction is keyed strictly
    // on the annotation, never on any positional/structural property of
    // where the key renders. Kept as a named regression pin rather than
    // dropped, per this plan's correction to 43-RESEARCH.md's prediction.
    describe('REWRITE (was "GROUP SCOPING"): the gate is on the annotation, never on structural position', () => {
      it('a REVEALED key with an ownership-exact annotation still gets settleAction (not just REDEEMED keys)', async () => {
        const key = makeHumbleKey({
          state: 'REVEALED',
          ownedElsewhere: true,
          matchConfidence: 'exact'
        })
        contextValue = defaultContext([key])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue(
          annotationsFor(key, {
            redeemedAt: 1700000000000,
            redeemedSource: 'ownership-exact',
            keyindexResolved: true
          })
        )

        const initial = mount()
        await flushPromises()
        // 260911-t0p: this test's subject is settleAction CONTENT (defined
        // regardless of structural position), not the row's visibility --
        // REVEALED is now excluded by "Redeemable keys only" (defect 3's
        // fix), so the checkbox must be turned off to reach the row at
        // all; capture mount()'s return so it can be passed through.
        const visible = turnOffRedeemableOnly(initial)

        const props = findHumbleKeyRowProps(visible, 'gk-1', 'mn-1')
        expect(props).toBeDefined()
        expect(props?.settleAction).toBeDefined()
      })

      it('a key with no annotation, sitting next to an unrelated settled key, still gets settleAction === undefined', async () => {
        const plain = makeHumbleKey({ state: 'UNREVEALED' })
        const settled = makeHumbleKey({
          gamekey: 'gk-2',
          machineName: 'mn-2',
          state: 'REDEEMED',
          ownedElsewhere: true,
          matchConfidence: 'exact',
          title: 'Other Game'
        })
        contextValue = defaultContext([plain, settled])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue(
          annotationsFor(settled, {
            redeemedAt: 1700000000000,
            redeemedSource: 'ownership-exact',
            keyindexResolved: true
          })
        )

        const initial = mount()
        await flushPromises()

        const tree = turnOffRedeemableOnly(initial)
        const plainProps = findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')
        const settledProps = findHumbleKeyRowProps(tree, 'gk-2', 'mn-2')
        expect(plainProps).toBeDefined()
        expect(plainProps?.settleAction).toBeUndefined()
        expect(settledProps?.settleAction).toBeDefined()
      })
    })
  })

  // ── New controls behaviour (Phase 43 plan 07) ─────────────────────────────
  describe('new: controls behaviour', () => {
    it('REQ-43-08: the "Redeemable keys only" checkbox is checked (true) on first render', () => {
      contextValue = defaultContext([makeHumbleKey()])
      const tree = mount()

      const toggle = collectElements(tree).find(
        (el) => el.type === ToggleSwitchStub
      )
      expect(toggle).toBeDefined()
      expect((toggle!.props as { value?: boolean }).value).toBe(true)
    })

    it("260911-t0p defect 3: a REVEALED key is absent from the list at the checkbox's default (true) state, and appears once the checkbox is turned off", () => {
      // This is the discriminating case the rest of the file's REVEALED-key
      // tests do not cover: every other REVEALED-state test in this file
      // calls `turnOffRedeemableOnly` up front to reach the row and then
      // asserts on its CONTENT (claimAction shape, dialog mode, etc.) --
      // none of them assert on VISIBILITY at the unmodified default. Before
      // 260911-t0p, `WAITING_STATES` (which includes REVEALED) backed this
      // checkbox, so a REVEALED key was wrongly still shown when
      // "Redeemable keys only" was checked -- this test pins that the fix
      // (`REDEEMABLE_ONLY_STATES`, which excludes REVEALED) actually holds
      // at the component level, not just in the pure `viewFilters.ts`
      // predicate unit tests.
      const key = makeHumbleKey({ state: 'REVEALED' })
      contextValue = defaultContext([key])
      let tree = mount()

      expect(findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')).toBeUndefined()

      const toggle = collectElements(tree).find(
        (el) => el.type === ToggleSwitchStub
      )
      ;(
        toggle!.props as {
          handleChange: (e: { target: { checked: boolean } }) => void
        }
      ).handleChange({ target: { checked: false } })
      tree = rerender()

      expect(findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')).toBeDefined()
    })

    it("REQ-43-06: a fresh mount always starts at query '', sort 'expiring' and checkbox true -- and nothing in the component reads localStorage/sessionStorage", () => {
      contextValue = defaultContext([makeHumbleKey()])
      const tree = mount()

      const search = collectElements(tree).find(
        (el) => el.type === SearchBarStub
      )
      const select = collectElements(tree).find(
        (el) => el.type === SelectFieldStub
      )
      const toggle = collectElements(tree).find(
        (el) => el.type === ToggleSwitchStub
      )

      // Drive every control away from its default via the mocked React
      // useState setters, exactly as a user interacting with the real
      // controls would.
      ;(
        search!.props as { onInputChanged: (v: string) => void }
      ).onInputChanged('zzz')
      ;(
        select!.props as {
          onChange: (e: { target: { value: string } }) => void
        }
      ).onChange({ target: { value: 'alphabetical' } })
      ;(
        toggle!.props as {
          handleChange: (e: { target: { checked: boolean } }) => void
        }
      ).handleChange({ target: { checked: false } })

      const changedTree = rerender()
      const changedSearch = collectElements(changedTree).find(
        (el) => el.type === SearchBarStub
      )
      expect((changedSearch!.props as { value: string }).value).toBe('zzz')

      // A FRESH component invocation (fresh slots -- `mount()` calls
      // `__resetMount()`) must land back on the defaults. If any of this
      // state were read from localStorage/sessionStorage on init, this
      // fresh mount would instead reflect the value set above.
      const freshTree = mount()
      const freshSearch = collectElements(freshTree).find(
        (el) => el.type === SearchBarStub
      )
      const freshSelect = collectElements(freshTree).find(
        (el) => el.type === SelectFieldStub
      )
      const freshToggle = collectElements(freshTree).find(
        (el) => el.type === ToggleSwitchStub
      )
      expect((freshSearch!.props as { value: string }).value).toBe('')
      expect((freshSelect!.props as { value: string }).value).toBe('expiring')
      expect((freshToggle!.props as { value: boolean }).value).toBe(true)

      // Source-text corroboration (belt and suspenders): the component
      // itself contains no persistence API token at all (D-43-06).
      const source = stripSourceComments(
        readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
      )
      expect(source).not.toMatch(/localStorage|sessionStorage|useSearchParams/)
    })

    it('REQ-43-21: a REDEEMED key whose title matches the search query is absent when the checkbox is on, and present when it is off (AND combination)', () => {
      const key = makeHumbleKey({ state: 'REDEEMED', title: 'Redeemed Game' })
      contextValue = defaultContext([key])
      let tree = mount()

      const search = collectElements(tree).find(
        (el) => el.type === SearchBarStub
      )
      ;(
        search!.props as { onInputChanged: (v: string) => void }
      ).onInputChanged('Redeemed')
      tree = rerender()
      expect(findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')).toBeUndefined()

      const toggle = collectElements(tree).find(
        (el) => el.type === ToggleSwitchStub
      )
      ;(
        toggle!.props as {
          handleChange: (e: { target: { checked: boolean } }) => void
        }
      ).handleChange({ target: { checked: false } })
      tree = rerender()
      expect(findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')).toBeDefined()
    })

    it('REQ-43-09: a key whose origin contains the query but whose title does not is absent (search matches title only)', () => {
      const key = makeHumbleKey({
        title: 'Nondescript Title',
        origin: 'The Special Springtime Bundle'
      })
      contextValue = defaultContext([key])
      let tree = mount()

      const search = collectElements(tree).find(
        (el) => el.type === SearchBarStub
      )
      ;(
        search!.props as { onInputChanged: (v: string) => void }
      ).onInputChanged('Springtime')
      tree = rerender()

      expect(findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')).toBeUndefined()
    })

    it('REQ-43-01: a generic-platform key in a live state is an ordinary list member, in comparator order -- never partitioned or sorted last', () => {
      const alpha = makeHumbleKey({
        gamekey: 'gk-a',
        machineName: 'mn-a',
        title: 'Alpha Game',
        platform: 'steam'
      })
      const generic = makeHumbleKey({
        gamekey: 'gk-g',
        machineName: 'mn-g',
        title: 'Middle Ebook',
        platform: GENERIC_KEY_PLATFORM
      })
      const zeta = makeHumbleKey({
        gamekey: 'gk-z',
        machineName: 'mn-z',
        title: 'Zeta Game',
        platform: 'steam'
      })
      // Deliberately out-of-order input -- the alphabetical tiebreak
      // (all three undated) is what proves the output order, not input order.
      contextValue = defaultContext([zeta, generic, alpha])

      const tree = mount()
      const rows = findAllHumbleKeyRowProps(tree)
      expect(rows.map((r) => r.humbleKey.title)).toEqual([
        'Alpha Game',
        'Middle Ebook',
        'Zeta Game'
      ])
    })

    it('REQ-43-04: no rendered text is a bare parenthesised count, and no element carries a group-count-style class', () => {
      contextValue = defaultContext([
        makeHumbleKey(),
        makeHumbleKey({ gamekey: 'gk-2', machineName: 'mn-2', title: 'Second' })
      ])
      const tree = mount()

      expect(textContent(tree)).not.toMatch(/\(\d+\)/)
      expect(
        collectElements(tree).some((el) => {
          const cls = (el.props as { className?: string }).className
          return (
            typeof cls === 'string' &&
            /GroupCount|humbleKeyGroupCount/.test(cls)
          )
        })
      ).toBe(false)
    })

    it('REQ-43-17: no pinned-section element or standalone "Expiring soon" heading text renders anywhere', () => {
      contextValue = defaultContext([
        makeHumbleKey({
          expiration: new Date(Date.now() + 86400000).toISOString()
        })
      ])
      const tree = mount()

      expect(findByClassName(tree, 'humbleKeysPinnedSection')).toBeUndefined()
      // Deliberately NOT a plain `.toContain('Expiring soon')` -- the sort
      // control's own default option label is "Expiring soonest" (D-43-06),
      // a legitimate substring match that would make a naive version of
      // this assertion fail against CORRECT output. The negative lookahead
      // excludes that legitimate control-copy occurrence while still
      // catching a reintroduced retired-tab pinned-section heading, which
      // was always the standalone phrase "Expiring soon" with no suffix.
      expect(textContent(tree)).not.toMatch(/Expiring soon(?!est)/)
    })

    it('REQ-43-20a: a genuinely-empty library renders the empty state, not the filtered-empty state', () => {
      contextValue = defaultContext([])
      const tree = mount()

      expect(findByClassName(tree, 'humbleKeysEmptyState')).toBeDefined()
      expect(
        findByClassName(tree, 'humbleKeysFilteredEmptyState')
      ).toBeUndefined()
    })

    it('REQ-43-20b: a non-empty library filtered to zero renders the filtered-empty state, and its clear button resets the query and the checkbox to false', () => {
      // Checkbox defaults to true (REDEEMABLE_ONLY_STATES as of 260911-t0p,
      // formerly WAITING_STATES); a REDEEMED-only library is non-empty but
      // produces zero filtered rows on first render -- exactly the
      // "checkbox default hits an all-terminal library" case D-43-20/
      // D-43-09 name. REDEEMED is excluded from both sets, so this case is
      // unaffected by the 260911-t0p predicate change.
      contextValue = defaultContext([makeHumbleKey({ state: 'REDEEMED' })])
      let tree = mount()

      expect(findByClassName(tree, 'humbleKeysEmptyState')).toBeUndefined()
      const filteredEmpty = findByClassName(
        tree,
        'humbleKeysFilteredEmptyState'
      )
      expect(filteredEmpty).toBeDefined()

      const clearButton = collectElements(filteredEmpty).find(
        (el) => el.type === 'button'
      ) as ReactElement<{ onClick: () => void }> | undefined
      expect(clearButton).toBeDefined()
      clearButton!.props.onClick()

      tree = rerender()
      const search = collectElements(tree).find(
        (el) => el.type === SearchBarStub
      )
      const toggle = collectElements(tree).find(
        (el) => el.type === ToggleSwitchStub
      )
      expect((search!.props as { value: string }).value).toBe('')
      // Resets to false, NOT back to the true default -- re-applying the
      // default is what produced the filtered-empty state in the first place.
      expect((toggle!.props as { value: boolean }).value).toBe(false)

      // And the recovery actually shows the row now.
      const recovered = rerender()
      expect(findHumbleKeyRowProps(recovered, 'gk-1', 'mn-1')).toBeDefined()
    })

    it('REQ-43-05: three keys (two undated out-of-order, one dated) render dated-first, then the two undated alphabetically -- end to end through the rendered list', () => {
      const zeta = makeHumbleKey({
        gamekey: 'gk-z',
        machineName: 'mn-z',
        title: 'Zeta Undated'
      })
      const alpha = makeHumbleKey({
        gamekey: 'gk-a',
        machineName: 'mn-a',
        title: 'Alpha Undated'
      })
      const dated = makeHumbleKey({
        gamekey: 'gk-d',
        machineName: 'mn-d',
        title: 'Middle Dated',
        expiration: new Date(Date.now() + 5 * 86400000).toISOString()
      })
      contextValue = defaultContext([zeta, alpha, dated])

      const tree = mount()
      const rows = findAllHumbleKeyRowProps(tree)
      expect(rows.map((r) => r.humbleKey.title)).toEqual([
        'Middle Dated',
        'Alpha Undated',
        'Zeta Undated'
      ])
    })

    it('REQ-43-16: the three retired tab paths redirect to /humble-keys, and the leaf route carries no children', () => {
      const APP_TSX = join(__dirname, '..', '..', '..', '..', 'App.tsx')
      const source = stripSourceComments(readFileSync(APP_TSX, 'utf8'))

      for (const oldPath of [
        'humble-keys/waiting',
        'humble-keys/spares',
        'humble-keys/all'
      ]) {
        const pathIndex = source.indexOf(`path: '${oldPath}'`)
        expect(pathIndex).toBeGreaterThan(-1)
        const blockEnd = source.indexOf('}', pathIndex)
        const block = source.slice(pathIndex, blockEnd)
        expect(block).toContain(
          'element: <Navigate to="/humble-keys" replace />'
        )
      }

      const leafIndex = source.indexOf("path: 'humble-keys'")
      expect(leafIndex).toBeGreaterThan(-1)
      const leafBlockEnd = source.indexOf('}', leafIndex)
      const leafBlock = source.slice(leafIndex, leafBlockEnd)
      expect(leafBlock).not.toContain('children:')
      expect(leafBlock).toContain('lazy:')
    })
  })

  // REQ-43-24, quick `260925-gnp`. These tests exist because of a specific
  // and expensive hole: plan 43-09 shipped EIGHT tests for this button and
  // every one of them pinned its LABEL. Nothing invoked its handler, so a
  // completely dead button passed the suite, passed a live gate that never
  // scored it, and was found only when a human clicked it (`43-UAT.md` item
  // 8, `major`). Every test below exercises the CLICK.
  describe('keyless claim destination (REQ-43-24, D-43-11, widened 260925-kt4)', () => {
    const KEYS_DEEP_LINK =
      '/store-page?store-url=https%3A%2F%2Fwww.humblebundle.com%2Fhome%2Fkeys'

    beforeEach(() => {
      mockNavigate.mockClear()
    })

    it('navigates to the store-page deep link instead of opening the reveal wizard', async () => {
      const showDialogModal = jest.fn()
      contextValue = {
        ...defaultContext([
          makeHumbleKey({ platform: 'gog_keyless', title: 'Racine' })
        ]),
        showDialogModal
      }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { keyindexResolved: true }
      })

      const tree = mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      expect(props?.claimAction).toBeDefined()

      props!.claimAction!.onClaim()

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith(KEYS_DEEP_LINK)
      // The other half of the assertion, and the one that would have caught
      // the original defect's SIBLING failure mode: a keyless entitlement has
      // no code, so the reveal wizard must never open for it.
      expect(showDialogModal).not.toHaveBeenCalled()
      expect(tree).toBeDefined()
    })

    it.each(['epic_keyless', 'origin_keyless'])(
      'navigates to the store-page deep link for %s too, instead of opening the reveal wizard (260925-kt4)',
      async (platform) => {
        const showDialogModal = jest.fn()
        contextValue = {
          ...defaultContext([makeHumbleKey({ platform, title: 'Racine' })]),
          showDialogModal
        }
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({
          'gk-1:mn-1': { keyindexResolved: true }
        })

        mount()
        await flushPromises()

        const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
        expect(props?.claimAction).toBeDefined()

        props!.claimAction!.onClaim()

        expect(mockNavigate).toHaveBeenCalledTimes(1)
        expect(mockNavigate).toHaveBeenCalledWith(KEYS_DEEP_LINK)
        expect(showDialogModal).not.toHaveBeenCalled()
      }
    )

    it.each(['gog', 'steam'])(
      'leaves keyed platform %s on the reveal wizard — the widened fork is still keyless-only, never a suffix match',
      async (platform) => {
        const showDialogModal = jest.fn()
        contextValue = {
          ...defaultContext([makeHumbleKey({ platform })]),
          showDialogModal
        }
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({
          'gk-1:mn-1': { keyindexResolved: true }
        })

        mount()
        await flushPromises()

        const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
        props!.claimAction!.onClaim()

        expect(showDialogModal).toHaveBeenCalledTimes(1)
        expect(mockNavigate).not.toHaveBeenCalled()
      }
    )

    // D3 closed-set proof: an unrecognised `foo_keyless` is NOT a suffix
    // match against `isKeylessKeyType` -- it must fall through to the
    // reveal wizard, the SAFE direction, exactly like `gog`/`steam` above.
    it('an unrecognised foo_keyless opens the reveal wizard and does not navigate (D3)', async () => {
      const showDialogModal = jest.fn()
      contextValue = {
        ...defaultContext([makeHumbleKey({ platform: 'foo_keyless' })]),
        showDialogModal
      }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { keyindexResolved: true }
      })

      mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      props!.claimAction!.onClaim()

      expect(showDialogModal).toHaveBeenCalledTimes(1)
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    // D2 caller half: `isGiftable` (Task 1) now excludes every keyless
    // key_type, so `giftAction` must be undefined for all three on this
    // screen too -- not just resolved correctly inside HumbleKeyRow.
    // UNREVEALED is in REDEEMABLE_ONLY_STATES, so no visibility toggle is
    // needed to find these rows.
    it.each(['gog_keyless', 'epic_keyless', 'origin_keyless'])(
      '%s: an owned, UNREVEALED, exact-match row gets no giftAction (D2)',
      (platform) => {
        contextValue = defaultContext([
          makeHumbleKey({
            platform,
            state: 'UNREVEALED',
            ownedElsewhere: true,
            matchConfidence: 'exact'
          })
        ])
        mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

        const tree = mount()
        const props = findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')

        expect(props?.giftAction).toBeUndefined()
      }
    )

    it('gog: the identical owned/UNREVEALED/exact-match shape still gets a defined giftAction -- the widen must not sweep in keyed siblings', () => {
      contextValue = defaultContext([
        makeHumbleKey({
          platform: 'gog',
          state: 'UNREVEALED',
          ownedElsewhere: true,
          matchConfidence: 'exact'
        })
      ])
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

      const tree = mount()
      const props = findHumbleKeyRowProps(tree, 'gk-1', 'mn-1')

      expect(props?.giftAction).toBeDefined()
    })

    it('percent-encodes the target URL so the query string survives', () => {
      // Not cosmetic: `store-url=https://...` unencoded would still parse, but
      // any Humble URL carrying its own `?` or `&` would silently truncate at
      // `URLSearchParams.get('store-url')`. Pinning the encoded form keeps the
      // builder honest for the next URL someone points it at.
      expect(KEYS_DEEP_LINK).not.toContain('store-url=https://')
      expect(
        decodeURIComponent(
          new URLSearchParams(KEYS_DEEP_LINK.split('?')[1]).get(
            'store-url'
          ) as string
        )
      ).toBe('https://www.humblebundle.com/home/keys')
    })

    it('the destination resolves as an EMBEDDABLE origin — without this the navigation silently opens the system browser', () => {
      // The load-bearing test, and the one that ties the two files this fix
      // touches together. `WebView/index.tsx`'s deep-link gate asks exactly
      // one question of `store-url`: does it resolve to a known, embeddable
      // store? A Humble URL that answers `null` takes the
      // `deepLinkShouldOpenExternally` arm — the button would "work", leave
      // the app, and look like a regression to nobody until a human noticed.
      // Deleting Humble from `STORE_EMBED_ORIGINS` must fail HERE, loudly.
      const url = decodeURIComponent(
        new URLSearchParams(KEYS_DEEP_LINK.split('?')[1]).get(
          'store-url'
        ) as string
      )
      expect(resolveStoreForUrl(url)?.key).toBe('humble')
      expect(isEmbeddableOrigin(url)).toBe(true)
    })
  })
})
