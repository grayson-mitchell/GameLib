/**
 * Unit tests for HumbleKeysWaiting (D-53/D-67, debug session
 * humble-reveal-key-fails round 7).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring) — 'react' (useState/useEffect/
 * useContext) and 'react-i18next' (useTranslation) are mocked at the module
 * level, mirroring HumbleClaimWizard's test harness (slot-based useState +
 * synchronous useEffect) combined with HumbleOriginInfo's useContext-mock
 * pattern, so the component can be invoked directly as a plain function.
 *
 * This suite exists specifically to lock in the round-7 fix: previously the
 * `annotations` map (revealedAt/redeemedAt per key) was fetched ONLY once at
 * mount and never refreshed, so after a successful reveal (which DOES update
 * `humble.keys` live via the backend's humbleKeysUpdated push) the row kept
 * reading a stale `revealedAt: null` from this component's own local state
 * and rendered the original "Claim" button instead of "Finish activation".
 */
import type { ReactElement, ReactNode } from 'react'

import { HumbleKey } from 'common/types/humble'
import HumbleKeyRow from '../../components/HumbleKeyRow'

// HumbleClaimWizard (rendered via JSX only, never invoked, by this
// component) side-effect-imports its colocated CSS — stub it the same way
// its own test suite does (no CSS transform is configured for this jest
// project).
jest.mock('../../components/HumbleClaimWizard/index.css', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      params?: Record<string, unknown>
    ): string =>
      Object.entries(params ?? {}).reduce(
        (str: string, [k, v]) => str.replace(`{{${k}}}`, String(v)),
        defaultValue
      )
  })
}))

type MockContextValue = {
  humble: { keys: HumbleKey[] }
  showDialogModal: jest.Mock
}

let contextValue: MockContextValue = {
  humble: { keys: [] },
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
    // Quick task 260823-n5b: this mock previously ran EVERY effect on EVERY
    // render, ignoring the dependency array outright. That made it structurally
    // impossible to test the 260823-n5b defect: against the BROKEN code (a
    // `[]`-keyed fetch effect) a rerender still refetched, so a "refetches when
    // the key set changes" test would have passed against the very bug it
    // exists to catch -- a vacuous gate.
    //
    // Now dep-aware, with the same slot discipline useState uses: re-run only
    // when the dependency array is absent (every render, React's own semantics)
    // or shallow-differs from the previous render.
    //
    // CLEANUP IS INVOKED BEFORE A RE-RUN, and that is load-bearing, not
    // completeness for its own sake. An earlier version of this mock skipped
    // cleanups, which made the "a key-set change does not latch mountedRef"
    // test VACUOUS: the naive fix it exists to reject (adding deps to the
    // mount effect while leaving its `mountedRef.current = false` cleanup in
    // place) passed all 13 tests, because the latch can only fire from a
    // cleanup the harness never called. Caught by red-proofing the naive fix
    // rather than only the reverted one.
    //
    // Unmount cleanup is still not modelled -- nothing in this suite unmounts.
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
    // Real useMemo semantics, for the same reason: 260823-n5b's key-set
    // identity is a useMemo, and recomputing it unconditionally would mask a
    // dependency mistake in the component.
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
  // WR-04 (14-REVIEW): overrides map fetched alongside annotations so the
  // undo-override affordance can render on the overridden key's row here.
  humbleGetOwnershipOverrides: jest.fn(),
  humbleUndoRedeemed: jest.fn(),
  humbleSync: jest.fn(),
  openExternalUrl: jest.fn(),
  clipboardWriteText: jest.fn()
}

;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import HumbleKeysWaiting from '../index'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return HumbleKeysWaiting() as unknown as ReactElement
}

function rerender(): ReactElement {
  harness().__beginRender()
  return HumbleKeysWaiting() as unknown as ReactElement
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

// HumbleKeyRow is rendered via JSX (never invoked directly), so its element
// props (in particular `claimAction`) are inspected straight off the tree —
// mirroring HumbleClaimWizard test's own collectElements/findByClassNamePart
// recursive-descent pattern, but keyed on element `type` instead of
// className since HumbleKeyRow itself (not one of its own DOM nodes) is the
// target here.
type ClaimAction = {
  revealedAt: number | null
  redeemedAt: number | null
  keyindexResolved: boolean
  onClaim: () => void
  onFinish: () => void
  onUndoRedeem: () => void
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

function findHumbleKeyRowProps(
  tree: ReactElement
): { claimAction: ClaimAction; undoOverride?: boolean } | undefined {
  const row = collectElements(tree).find((el) => el.type === HumbleKeyRow) as
    | ReactElement<{ claimAction: ClaimAction; undoOverride?: boolean }>
    | undefined
  return row?.props
}

// Quick task 260823-n5b: the plural form. The singular helper above returns
// only the FIRST row, which cannot express "every row is claimable" -- the
// assertion that distinguishes a refreshed annotations map from a stale one
// when the key set has grown.
function findAllHumbleKeyRowProps(
  tree: ReactElement
): { claimAction: ClaimAction; undoOverride?: boolean }[] {
  return collectElements(tree)
    .filter((el) => el.type === HumbleKeyRow)
    .map(
      (el) =>
        (el as ReactElement<{ claimAction: ClaimAction; undoOverride?: boolean }>)
          .props
    )
}

describe('HumbleKeysWaiting', () => {
  beforeEach(() => {
    contextValue = {
      humble: { keys: [] },
      showDialogModal: jest.fn()
    }
    mockApi.humbleGetClaimAnnotations.mockResolvedValue({})
    mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})
  })

  it('fetches claim annotations once on mount', () => {
    contextValue = {
      humble: { keys: [makeHumbleKey()] },
      showDialogModal: jest.fn()
    }
    mount()

    expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)
  })

  it('refetches claim annotations after the claim wizard closes (round-7 fix)', async () => {
    const key = makeHumbleKey()
    const showDialogModal = jest.fn<
      void,
      [{ message?: ReactElement<{ onDone: () => void }> }]
    >()
    contextValue = { humble: { keys: [key] }, showDialogModal }

    // Mount-time fetch resolves with the key still un-annotated (never
    // revealed) — matches the state right before a reveal attempt. This is
    // the ONLY call expected to come through the mount-time useEffect —
    // every subsequent `mount()`/`rerender()` in this harness re-runs
    // useEffect unconditionally (it has no dependency-array semantics), so
    // the call count is asserted BEFORE any further render, and the
    // post-refresh render is inspected afterward without re-asserting count.
    mockApi.humbleGetClaimAnnotations.mockResolvedValue({})
    const initial = mount()
    await flushPromises()

    const props = findHumbleKeyRowProps(initial)
    expect(props).toBeDefined()
    expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

    // Simulate clicking "Claim" — opens the wizard via showDialogModal.
    props!.claimAction.onClaim()
    expect(showDialogModal).toHaveBeenCalledTimes(1)
    const dialogOptions = showDialogModal.mock.calls[0][0]
    const onDone = dialogOptions.message?.props.onDone

    // By the time the wizard's onDone fires, the reveal already succeeded
    // server-side (patchCachedState + humbleKeysUpdated) — the NEXT
    // annotations fetch reflects it.
    mockApi.humbleGetClaimAnnotations.mockResolvedValue({
      'gk-1:mn-1': { revealedAt: 12345, keyindexResolved: true }
    })
    onDone?.()

    // closeWizard's refreshAnnotations() is a plain function call, not an
    // effect — it fires exactly once per onDone(), independent of renders.
    expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
    await flushPromises()

    const updatedProps = findHumbleKeyRowProps(rerender())
    expect(updatedProps).toBeDefined()
  })

  it('refetches claim annotations after an undo-redeem action resolves', async () => {
    // 14-07 gap closure: REDEEMED is now always a local, undoable overlay —
    // selectKeysWaiting includes every REDEEMED key unconditionally, so this
    // row is reachable with no special flag.
    const key = makeHumbleKey({ state: 'REDEEMED' })
    contextValue = {
      humble: { keys: [key] },
      showDialogModal: jest.fn()
    }
    mockApi.humbleGetClaimAnnotations.mockResolvedValue({
      'gk-1:mn-1': { redeemedAt: 999, keyindexResolved: true }
    })
    mockApi.humbleUndoRedeemed.mockResolvedValue(undefined)

    const initial = mount()
    await flushPromises()

    const props = findHumbleKeyRowProps(initial)
    expect(props).toBeDefined()
    expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

    props!.claimAction.onUndoRedeem()
    expect(mockApi.humbleUndoRedeemed).toHaveBeenCalledWith({
      gamekey: 'gk-1',
      machineName: 'mn-1'
    })

    await flushPromises()
    expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
  })

  // WR-04 (14-REVIEW): an overridden key (D-42 "Not the same game")
  // recomputes to unowned and appears on THIS tab — the reversal affordance
  // must render on its row, keyed off the override record.
  it('WR-04: passes undoOverride=true to the row when an override record exists for its machineName', async () => {
    const key = makeHumbleKey()
    contextValue = {
      humble: { keys: [key] },
      showDialogModal: jest.fn()
    }
    mockApi.humbleGetOwnershipOverrides.mockResolvedValue({
      'mn-1': 1720000000000
    })

    mount()
    await flushPromises()

    const props = findHumbleKeyRowProps(rerender())
    expect(props).toBeDefined()
    expect(props?.undoOverride).toBe(true)
  })

  it('WR-04: passes undoOverride=false when no override record exists', async () => {
    contextValue = {
      humble: { keys: [makeHumbleKey()] },
      showDialogModal: jest.fn()
    }
    mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})

    mount()
    await flushPromises()

    const props = findHumbleKeyRowProps(rerender())
    expect(props).toBeDefined()
    expect(props?.undoOverride).toBe(false)
  })

  // WR-02 (14-REVIEW re-review): refreshAnnotations/onUndoRedeem previously
  // had no rejection handling — an IPC rejection escaped as an unhandled
  // promise rejection and (for undo) left the row silently stale. Same
  // failure class HumbleClaimWizard's WR-05 fix covered.
  describe('WR-02: IPC rejection handling', () => {
    it('rejected mount-time annotation fetches do not escape and the tab still renders', async () => {
      contextValue = {
        humble: { keys: [makeHumbleKey()] },
        showDialogModal: jest.fn()
      }
      mockApi.humbleGetClaimAnnotations.mockRejectedValue(
        new Error('ipc channel gone')
      )
      mockApi.humbleGetOwnershipOverrides.mockRejectedValue(
        new Error('ipc channel gone')
      )

      const tree = mount()
      // If either rejection escaped .catch, this flush would surface it as
      // an unhandled rejection and fail the test run.
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender())
      expect(props).toBeDefined()
      // Last-known (initial) maps kept: no annotation data, Pitfall-C
      // default stands.
      expect(props?.claimAction.revealedAt).toBeNull()
      expect(props?.claimAction.keyindexResolved).toBe(false)
      expect(tree).toBeDefined()
    })

    it('a rejected humbleUndoRedeemed still refreshes annotations (row re-reads backend truth, never stays silently stale)', async () => {
      const key = makeHumbleKey({ state: 'REDEEMED' })
      contextValue = {
        humble: { keys: [key] },
        showDialogModal: jest.fn()
      }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { redeemedAt: 999, keyindexResolved: true }
      })
      mockApi.humbleUndoRedeemed.mockRejectedValue(
        new Error('ipc channel gone')
      )

      const initial = mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(initial)
      expect(props).toBeDefined()
      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

      props!.claimAction.onUndoRedeem()
      await flushPromises()

      // The .catch path refreshes too — the annotations map is re-read so
      // the row reflects whatever actually happened backend-side.
      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
    })
  })

  // CR-01 (14-REVIEW re-review): a key that is REVEALED by SERVER truth alone
  // (revealed on Humble's website — no local reveal annotation) must render
  // "Finish activation", never a dead-end "Claim": the backend refuses to
  // reveal any non-UNREVEALED key (D-66 never-re-reveal), so a Claim button
  // on this row could only ever fail.
  describe('CR-01: server-revealed key with no local annotation', () => {
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

    it('renders onFinish (not onClaim) as the row action, without a "Revealed {date}" annotation', async () => {
      const key = makeHumbleKey({ state: 'REVEALED' })
      contextValue = {
        humble: { keys: [key] },
        showDialogModal: jest.fn()
      }
      // Empty annotations map: this key was never revealed THROUGH GameLib —
      // exactly the website-revealed population the v5 classifier surfaces.
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

      const tree = mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(tree)
      expect(props).toBeDefined()
      expect(props!.claimAction.revealedAt).toBeNull()

      // Render the row itself (plain function invocation — HumbleKeyRow has
      // no hooks beyond the module-mocked useTranslation) and inspect the
      // actual claim affordance it picks.
      const rowTree = HumbleKeyRow({
        humbleKey: key,
        claimAction: props!.claimAction
      }) as unknown as ReactElement
      const buttons = collectElements(rowTree).filter(
        (el) => el.type === 'button'
      ) as ReactElement<PropsWithChildren & { onClick?: () => void }>[]

      const finishButton = buttons.find(
        (b) => b.props.onClick === props!.claimAction.onFinish
      )
      expect(finishButton).toBeDefined()
      expect(textContent(finishButton)).toContain('Finish activation')

      // No button is wired to onClaim — the dead-end Claim path is gone.
      expect(
        buttons.find((b) => b.props.onClick === props!.claimAction.onClaim)
      ).toBeUndefined()

      // The local "Revealed {date}" annotation only renders when the local
      // timestamp exists — never fabricated from server truth alone.
      expect(textContent(rowTree)).not.toContain('Revealed ')
    })

    it('onFinish opens the wizard in finish mode (fetches the stored value on demand, never re-reveals)', async () => {
      const key = makeHumbleKey({ state: 'REVEALED' })
      const showDialogModal = jest.fn<
        void,
        [{ message?: ReactElement<{ entryMode: 'claim' | 'finish' }> }]
      >()
      contextValue = { humble: { keys: [key] }, showDialogModal }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

      const tree = mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(tree)
      props!.claimAction.onFinish()

      expect(showDialogModal).toHaveBeenCalledTimes(1)
      const dialogOptions = showDialogModal.mock.calls[0][0]
      expect(dialogOptions.message?.props.entryMode).toBe('finish')
    })
  })

  // ── Quick task 260823-n5b ────────────────────────────────────────────────
  // A newly-synced key could not be claimed until the user navigated away and
  // back. `refreshAnnotations` had three call sites -- a `[]`-keyed mount
  // effect, the claim-wizard close, and the undo action -- and NONE fired on a
  // library sync. A sync updates `humble.keys` via the `humbleKeysUpdated`
  // push, so the new row rendered while this map stayed at its mount-time
  // snapshot; `keyindexResolved ?? false` then disabled Claim.
  //
  // Operator-observed live 2026-08-23 during Phase 34.4.1 gate run 4, with the
  // backend measured CORRECT throughout (gamekeys 31 -> 32, keysCached 32).
  describe('260823-n5b: annotations refresh when the key set changes', () => {
    it('refetches annotations when a key is ADDED after mount, so the new row becomes claimable', async () => {
      const first = makeHumbleKey({ gamekey: 'gk-1', machineName: 'mn-1' })
      const second = makeHumbleKey({ gamekey: 'gk-2', machineName: 'mn-2' })

      contextValue = { humble: { keys: [first] }, showDialogModal: jest.fn() }
      // Mount-time fetch knows only about the first key.
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { keyindexResolved: true }
      })
      mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})

      mount()
      await flushPromises()
      const callsAfterMount =
        mockApi.humbleGetClaimAnnotations.mock.calls.length

      // A sync lands: `humble.keys` gains a key, and the backend now has an
      // annotation for it. This is the exact moment the defect occurred.
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { keyindexResolved: true },
        'gk-2:mn-2': { keyindexResolved: true }
      })
      contextValue = {
        humble: { keys: [first, second] },
        showDialogModal: jest.fn()
      }

      const tree = rerender()
      await flushPromises()

      // THE ASSERTION THAT FAILS AGAINST THE BROKEN CODE.
      expect(
        mockApi.humbleGetClaimAnnotations.mock.calls.length
      ).toBeGreaterThan(callsAfterMount)

      // And the observable consequence: the new row is claimable, rather than
      // rendering "Sync to enable claiming".
      const rows = findAllHumbleKeyRowProps(rerender())
      expect(rows).toHaveLength(2)
      expect(rows.every((r) => r.claimAction.keyindexResolved)).toBe(true)
      void tree
    })

    it('does NOT refetch when the key set is unchanged (no refetch loop)', async () => {
      const key = makeHumbleKey()
      contextValue = { humble: { keys: [key] }, showDialogModal: jest.fn() }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { keyindexResolved: true }
      })
      mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})

      mount()
      await flushPromises()
      const callsAfterMount =
        mockApi.humbleGetClaimAnnotations.mock.calls.length

      // Several unrelated rerenders. `refreshAnnotations` writes `annotations`
      // AND `overrides`, so a fetch effect keyed on either would spin forever.
      rerender()
      await flushPromises()
      rerender()
      await flushPromises()

      expect(mockApi.humbleGetClaimAnnotations.mock.calls.length).toBe(
        callsAfterMount
      )
    })

    it('a same-SIZE key-set swap still refetches (identity is the key ids, not the count)', async () => {
      contextValue = {
        humble: { keys: [makeHumbleKey({ gamekey: 'gk-1' })] },
        showDialogModal: jest.fn()
      }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({})
      mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})

      mount()
      await flushPromises()
      const callsAfterMount =
        mockApi.humbleGetClaimAnnotations.mock.calls.length

      contextValue = {
        humble: { keys: [makeHumbleKey({ gamekey: 'gk-9' })] },
        showDialogModal: jest.fn()
      }
      rerender()
      await flushPromises()

      expect(
        mockApi.humbleGetClaimAnnotations.mock.calls.length
      ).toBeGreaterThan(callsAfterMount)
    })

    // THE HAZARD. The obvious fix -- adding dependencies to the existing mount
    // effect -- also moves its cleanup, which latches the component-lifetime
    // `mountedRef` (WR-02) to false on the FIRST key-set change and silently
    // kills every later annotation write. That is a worse, less visible version
    // of this same defect, so it gets its own test.
    it('a key-set change does not latch mountedRef, so later fetches still apply', async () => {
      const first = makeHumbleKey({ gamekey: 'gk-1', machineName: 'mn-1' })
      const second = makeHumbleKey({ gamekey: 'gk-2', machineName: 'mn-2' })

      contextValue = { humble: { keys: [first] }, showDialogModal: jest.fn() }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({})
      mockApi.humbleGetOwnershipOverrides.mockResolvedValue({})

      mount()
      await flushPromises()

      // First key-set change -- this is where a moved cleanup would fire.
      contextValue = {
        humble: { keys: [first, second] },
        showDialogModal: jest.fn()
      }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({
        'gk-1:mn-1': { keyindexResolved: true },
        'gk-2:mn-2': { keyindexResolved: true }
      })
      rerender()
      await flushPromises()

      // If mountedRef had been latched false, setAnnotations would have been
      // skipped and both rows would still read `keyindexResolved: false`.
      const rows = findAllHumbleKeyRowProps(rerender())
      expect(rows.every((r) => r.claimAction.keyindexResolved)).toBe(true)
    })
  })
})
