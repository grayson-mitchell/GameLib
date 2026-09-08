/**
 * Unit tests for HumbleKeysAll's settle-undo reachability (D-42-01 Exception
 * 4, Phase 42 plan 06).
 *
 * WHY THIS SUITE EXISTS: a key the app auto-settles to REDEEMED from an
 * exact-match Steam ownership signal (`ClaimAnnotation.redeemedSource ===
 * 'ownership-exact'`) is always `ownedElsewhere` — and `selectKeysWaiting`
 * (common/humble/viewFilters.ts:62) unconditionally excludes any
 * `ownedElsewhere` key from the Keys-waiting tab. That means the existing
 * Undo affordance (`claimAction` on `HumbleKeyRow`, supplied ONLY by
 * Waiting/index.tsx) can never reach such a key — before this plan, an
 * auto-settled key had NO Undo control anywhere in the app. The All tab is
 * the only place this key is ever rendered, so it is the only place the
 * reversal affordance (`settleAction`) can be wired. This suite is the
 * regression pin for that reachability, plus the refresh discipline and
 * strict `redeemedSource === 'ownership-exact'` scoping of the gate that
 * resolves it.
 *
 * Harness mirrors Waiting/__tests__/index.test.tsx exactly: no jsdom /
 * react-test-renderer in this project (src/frontend/jest.config.js), so
 * 'react' (useState/useEffect/useContext) and 'react-i18next' are mocked at
 * module level (slot-based useState + dependency-aware useEffect), and the
 * component is invoked directly as a plain function. The REAL HumbleKeyRow
 * is imported (not mocked) so it can be used as the element-type identity
 * for the props walker, exactly as Waiting's suite does at :22 — plan
 * 42-04's moduleNameMapper makes its SVG imports resolvable.
 *
 * ONE deliberate divergence from Waiting's harness: Waiting/index.tsx
 * renders HumbleKeyRow directly, but HumbleKeysAll renders it through an
 * intermediate HumbleKeyGroup (collapse/expand chrome, its own useState +
 * useId). Since 'react' is mocked at module scope, HumbleKeyGroup's hooks
 * would run against the SAME shared slot cursor as HumbleKeysAll's own
 * hooks if it were invoked for real mid-walk — corrupting slot state on
 * every subsequent render. HumbleKeyGroup is therefore replaced with a
 * hookless stub that performs the identical, load-bearing wiring the real
 * component does (`settleAction={settleActionFor?.(key)}` per key,
 * verbatim from HumbleKeyGroup/index.tsx:96) minus the collapse chrome this
 * suite has no stake in. The props walker below invokes the stub directly
 * (safe — it uses no hooks) to reach the real HumbleKeyRow underneath it.
 */
import type { ReactElement, ReactNode } from 'react'

import { ClaimAnnotation, HumbleKey } from 'common/types/humble'
import HumbleKeyRow from '../../components/HumbleKeyRow'

type SettleAction = { settledAt: number; onUndoSettle: () => void }

jest.mock('../../components/HumbleKeyGroup', () => {
  return {
    __esModule: true,
    default: function HumbleKeyGroupStub({
      keys,
      settleActionFor
    }: {
      keys: HumbleKey[]
      settleActionFor?: (key: HumbleKey) => SettleAction | undefined
    }) {
      return keys.map((key) => (
        <HumbleKeyRow
          key={`${key.gamekey}:${key.machineName}`}
          humbleKey={key}
          settleAction={settleActionFor?.(key)}
        />
      ))
    }
  }
})

// The mocked module's default export — same function object HumbleKeysAll's
// rendered tree references as an element `type`, used below to identify and
// directly invoke it mid-walk.
import HumbleKeyGroupStub from '../../components/HumbleKeyGroup'

jest.mock('react-i18next', () => ({
  // HumbleKeysAll itself only calls useTranslation() (default namespace);
  // HumbleKeyRow (rendered underneath it via JSX) calls BOTH
  // useTranslation() and useTranslation('gamelib') for `t`/`tGamelib`. One
  // namespace-agnostic implementation correctly serves both call sites,
  // mirroring HumbleKeyRow/__tests__/index.test.tsx:18-23.
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
}

let contextValue: MockContextValue = {
  humble: { keys: [] }
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
    // Dependency-aware, cleanup-before-rerun semantics — same discipline as
    // Waiting/__tests__/index.test.tsx (quick task 260823-n5b): a naive
    // "run every effect on every render" mock would make it structurally
    // impossible to prove the mount-only `[]`-keyed fetch effect here
    // behaves correctly, and would mask a dependency-array mistake.
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
  humbleUndoRedeemed: jest.fn()
}

;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

// Imported after the mocks above (textual order — this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import HumbleKeysAll from '../index'

type HookHarness = { __beginRender: () => void; __resetMount: () => void }

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

function mount(): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return HumbleKeysAll() as unknown as ReactElement
}

function rerender(): ReactElement {
  harness().__beginRender()
  return HumbleKeysAll() as unknown as ReactElement
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
    if (element.type === HumbleKeyGroupStub) {
      // The stub uses no hooks (see the docblock above) — invoking it
      // directly here is safe and does not disturb the shared 'react' mock
      // slot cursor used by HumbleKeysAll's own hooks.
      const rendered = (
        HumbleKeyGroupStub as unknown as (props: unknown) => ReactNode
      )(element.props)
      collectElements(rendered, out)
    } else if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

// Mirrors Waiting/__tests__/index.test.tsx:244-266's findHumbleKeyRowProps
// walker, extended to invoke the HumbleKeyGroup stub (above) mid-walk so it
// can still reach the real HumbleKeyRow underneath it — HumbleKeysAll never
// renders HumbleKeyRow directly, unlike HumbleKeysWaiting; React-element
// identity
// survives the intermediate component, so the same type-keyed walk finds
// the row regardless of nesting depth.
function findHumbleKeyRowProps(
  tree: ReactElement,
  gamekey: string,
  machineName: string
): { settleAction?: SettleAction } | undefined {
  const row = collectElements(tree).find(
    (el) =>
      el.type === HumbleKeyRow &&
      (el.props as { humbleKey?: HumbleKey }).humbleKey?.gamekey === gamekey &&
      (el.props as { humbleKey?: HumbleKey }).humbleKey?.machineName ===
        machineName
  ) as ReactElement<{ settleAction?: SettleAction }> | undefined
  return row?.props
}

function annotationsFor(
  key: HumbleKey,
  annotation: ClaimAnnotation
): Record<string, ClaimAnnotation> {
  return { [`${key.gamekey}:${key.machineName}`]: annotation }
}

describe('HumbleKeysAll settle-undo reachability (D-42-01 Exception 4, Phase 42 plan 06)', () => {
  beforeEach(() => {
    contextValue = { humble: { keys: [] } }
    mockApi.humbleGetClaimAnnotations.mockReset()
    mockApi.humbleUndoRedeemed.mockReset()
    mockApi.humbleGetClaimAnnotations.mockResolvedValue({})
  })

  describe('REACHABILITY', () => {
    it('an ownership-exact-settled REDEEMED key receives a defined settleAction with the annotation timestamp', async () => {
      const key = makeHumbleKey({
        state: 'REDEEMED',
        ownedElsewhere: true,
        matchConfidence: 'exact'
      })
      contextValue = { humble: { keys: [key] } }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue(
        annotationsFor(key, {
          redeemedAt: 1700000000000,
          redeemedSource: 'ownership-exact',
          keyindexResolved: true
        })
      )

      mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
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
      contextValue = { humble: { keys: [key] } }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue(
        annotationsFor(key, {
          redeemedAt: 1700000000000,
          redeemedSource: 'ownership-exact',
          keyindexResolved: true
        })
      )
      mockApi.humbleUndoRedeemed.mockResolvedValue(undefined)

      mount()
      await flushPromises()
      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
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
      contextValue = { humble: { keys: [key] } }
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

      mount()
      await flushPromises()
      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      expect(props?.settleAction).toBeDefined()
      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(1)

      props!.settleAction!.onUndoSettle()
      // If the rejection escaped .catch, this flush would surface it as an
      // unhandled rejection and fail the test run.
      await flushPromises()

      expect(mockApi.humbleGetClaimAnnotations).toHaveBeenCalledTimes(2)
    })
  })

  describe('SCOPING — settleAction must be undefined unless redeemedSource === "ownership-exact" AND redeemedAt is defined', () => {
    type ScopeCase = {
      name: string
      annotation: ClaimAnnotation | undefined
    }

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
        name: 'redeemedSource is absent (the legacy on-disk shape — the inversion trap)',
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
        contextValue = { humble: { keys: [key] } }
        mockApi.humbleGetClaimAnnotations.mockResolvedValue(
          annotation ? annotationsFor(key, annotation) : {}
        )

        mount()
        await flushPromises()

        const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
        expect(props).toBeDefined()
        expect(props?.settleAction).toBeUndefined()
      }
    )
  })

  describe('GROUP SCOPING — the gate is on the annotation, never on the group heading', () => {
    it('a key in the REVEALED group with an ownership-exact annotation still gets settleAction', async () => {
      const key = makeHumbleKey({
        state: 'REVEALED',
        ownedElsewhere: true,
        matchConfidence: 'exact'
      })
      contextValue = { humble: { keys: [key] } }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue(
        annotationsFor(key, {
          redeemedAt: 1700000000000,
          redeemedSource: 'ownership-exact',
          keyindexResolved: true
        })
      )

      mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      expect(props).toBeDefined()
      expect(props?.settleAction).toBeDefined()
    })

    it('a key with no annotation in a different group still gets settleAction === undefined', async () => {
      const key = makeHumbleKey({ state: 'UNREVEALED' })
      contextValue = { humble: { keys: [key] } }
      mockApi.humbleGetClaimAnnotations.mockResolvedValue({})

      mount()
      await flushPromises()

      const props = findHumbleKeyRowProps(rerender(), 'gk-1', 'mn-1')
      expect(props).toBeDefined()
      expect(props?.settleAction).toBeUndefined()
    })
  })
})
