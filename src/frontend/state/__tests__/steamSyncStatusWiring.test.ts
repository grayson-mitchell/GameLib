/**
 * RED-proven source-shape gate for the `steamSyncStatus` channel (Phase
 * 34.15 Plan 02, D-06/D-07).
 *
 * WHY A SOURCE GATE. None of the five touchpoints this file proves can be
 * imported directly under this project's frontend jest project (no jsdom, no
 * CSS transform -- `GlobalState.tsx` reads `window.localStorage` at MODULE
 * SCOPE and dies at import with "window is not defined"; `Library/index.tsx`
 * / `InstallModal/index.tsx` open with a stylesheet import). This mirrors
 * `GlobalStateScopedRefresh.test.ts` and `filterChipRowPlacement.test.ts`'s
 * own documented DOM-less constraint: read the real source, strip comments,
 * and assert on the exact text shape.
 *
 * What this proves, one gate per obligation:
 *
 *   W1: `common/types/ipc.ts` declares the `steamSyncStatus` channel.
 *   W2: `preload/api/steam.ts` exports the `handleSteamSyncStatus` listener
 *       slot -- THE HIGHEST-RISK OMISSION IN THE PHASE. For a
 *       backend->renderer push, the sidecar's `electronStub.ts`
 *       `pushFrontendMessage` forwarder is channel-agnostic (any string
 *       works, no allowlist on the emit side); if this export is missing,
 *       the backend emits fine, Rust forwards fine, and the renderer simply
 *       has nobody listening -- no compile error, no runtime error, nothing
 *       arrives. Ledgered: `sidecar-send-channels-fail-silently`.
 *   W3: `GlobalState.tsx` both registers the `handleSteamSyncStatus`
 *       listener AND its body actually writes `steamSyncStatus` into state
 *       (not merely registered and dropped).
 *   W4: `frontend/types.ts` and `state/ContextProvider.tsx` both declare the
 *       lockstep `steamSyncStatus` pair -- a type without a default (or vice
 *       versa) drifts silently.
 *   W5 (D-06 negative gate): the `handleSteamSyncStatus` handler body does
 *       NOT reference `refreshingInTheBackground` -- the new tri-state must
 *       not be derived from, or reset alongside, the flag it replaces (that
 *       flag defaults `true` and resets to `true` after every unscoped
 *       refresh, so it never actually meant "a refresh is running").
 *
 * Self-tested against synthetic specimens DERIVED from the real source text
 * by string manipulation (never hand-authored) per this project's own
 * anti-vacuity requirement -- a source-text gate without a self-test is a
 * vacuous gate (the exact lesson Phase 34.2's gap cycles paid for; see
 * `grep-assertion-must-fail-against-known-bad-input`).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'

const IPC_PATH = join(__dirname, '..', '..', '..', 'common', 'types', 'ipc.ts')
const PRELOAD_STEAM_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'preload',
  'api',
  'steam.ts'
)
const GLOBAL_STATE_PATH = join(__dirname, '..', 'GlobalState.tsx')
const CONTEXT_PROVIDER_PATH = join(__dirname, '..', 'ContextProvider.tsx')
const FRONTEND_TYPES_PATH = join(__dirname, '..', '..', 'types.ts')

function gateSource(source: string): string {
  return stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

function readGated(path: string): string {
  return gateSource(readFileSync(path, 'utf8'))
}

// ---------------------------------------------------------------------------
// The plain throwing helpers -- the SAME functions drive the real gate
// assertions below AND the RED-proof self-tests, so a specimen cannot be
// checked by a hand-rebuilt replica of the assertion.
// ---------------------------------------------------------------------------

function expectPresent(source: string, token: string, decisionNote: string) {
  if (!source.includes(token)) {
    throw new Error(
      `expectPresent: required token "${token}" is missing from stripped source (${decisionNote})`
    )
  }
}

/**
 * Asserts `nearToken` appears within `windowChars` characters after the
 * FIRST occurrence of `anchorToken` -- proving a handler registration is
 * actually wired to the state write it claims to make, not merely present
 * somewhere unrelated in the file.
 */
function expectPresentWithin(
  source: string,
  anchorToken: string,
  nearToken: string,
  windowChars: number,
  decisionNote: string
) {
  const anchorIdx = source.indexOf(anchorToken)
  if (anchorIdx === -1) {
    throw new Error(
      `expectPresentWithin: anchor token "${anchorToken}" not found in stripped source (${decisionNote})`
    )
  }
  const window = source.slice(
    anchorIdx,
    anchorIdx + anchorToken.length + windowChars
  )
  if (!window.includes(nearToken)) {
    throw new Error(
      `expectPresentWithin: "${nearToken}" not found within ${windowChars} chars after "${anchorToken}" (${decisionNote})`
    )
  }
}

/**
 * The D-06 negative-gate counterpart to `expectPresentWithin` -- asserts
 * `forbiddenToken` does NOT appear within `windowChars` characters after the
 * FIRST occurrence of `anchorToken`.
 */
function expectAbsentWithin(
  source: string,
  anchorToken: string,
  forbiddenToken: string,
  windowChars: number,
  decisionNote: string
) {
  const anchorIdx = source.indexOf(anchorToken)
  if (anchorIdx === -1) {
    throw new Error(
      `expectAbsentWithin: anchor token "${anchorToken}" not found in stripped source (${decisionNote})`
    )
  }
  const window = source.slice(
    anchorIdx,
    anchorIdx + anchorToken.length + windowChars
  )
  if (window.includes(forbiddenToken)) {
    throw new Error(
      `expectAbsentWithin: forbidden token "${forbiddenToken}" found within ${windowChars} chars after "${anchorToken}" (${decisionNote})`
    )
  }
}

// ---------------------------------------------------------------------------
// The five gates, each named after the obligation it protects.
// ---------------------------------------------------------------------------

function gateW1_ipcDeclaresChannel(source: string): void {
  expectPresent(
    source,
    'steamSyncStatus: (payload',
    'W1: common/types/ipc.ts must declare the steamSyncStatus FrontendMessages entry'
  )
}

function gateW2_preloadExportsListenerSlot(source: string): void {
  expectPresent(
    source,
    "frontendListenerSlot('steamSyncStatus')",
    'W2: the preload allowlist entry -- omitting it fails SILENTLY on the Tauri sidecar (sidecar-send-channels-fail-silently); this is the highest-risk omission in the phase'
  )
}

function gateW3_globalStateSubscribesAndWritesState(source: string): void {
  expectPresent(
    source,
    'handleSteamSyncStatus',
    'W3: GlobalState must register a handleSteamSyncStatus listener'
  )
  expectPresentWithin(
    source,
    'handleSteamSyncStatus',
    'steamSyncStatus:',
    200,
    'W3: the registered handler must actually write steamSyncStatus into state, not merely be registered and dropped'
  )
}

function gateW4_typesAndProviderDeclareLockstepPair(
  typesSource: string,
  contextProviderSource: string
): void {
  expectPresent(
    typesSource,
    'steamSyncStatus',
    'W4: frontend/types.ts must declare the steamSyncStatus field on ContextType'
  )
  expectPresent(
    contextProviderSource,
    'steamSyncStatus',
    'W4: ContextProvider.tsx must declare the steamSyncStatus default -- a type without a default (or vice versa) drifts'
  )
}

function gateW5_handlerDoesNotReadReplacedFlag(source: string): void {
  expectAbsentWithin(
    source,
    'handleSteamSyncStatus',
    'refreshingInTheBackground',
    200,
    'D-06: the new tri-state must not be derived from, or reset alongside, the flag it replaces'
  )
}

// ---------------------------------------------------------------------------
// Real-source assertions.
// ---------------------------------------------------------------------------

describe('steamSyncStatus wiring -- the five-touchpoint chain (34.15-02, D-06/D-07)', () => {
  const ipcSource = readGated(IPC_PATH)
  const preloadSteamSource = readGated(PRELOAD_STEAM_PATH)
  const globalStateSource = readGated(GLOBAL_STATE_PATH)
  const frontendTypesSource = readGated(FRONTEND_TYPES_PATH)
  const contextProviderSource = readGated(CONTEXT_PROVIDER_PATH)

  it('W1: common/types/ipc.ts declares the steamSyncStatus FrontendMessages channel', () => {
    expect(() => gateW1_ipcDeclaresChannel(ipcSource)).not.toThrow()
  })

  it('W2 (silent-failure risk): preload/api/steam.ts exports the handleSteamSyncStatus allowlist entry -- a missing entry fails SILENTLY on the Tauri sidecar with no compile or runtime error', () => {
    expect(() =>
      gateW2_preloadExportsListenerSlot(preloadSteamSource)
    ).not.toThrow()
  })

  it('W3: GlobalState.tsx registers handleSteamSyncStatus and its body writes steamSyncStatus into state', () => {
    expect(() =>
      gateW3_globalStateSubscribesAndWritesState(globalStateSource)
    ).not.toThrow()
  })

  it('W4: frontend/types.ts and ContextProvider.tsx both declare the lockstep steamSyncStatus pair', () => {
    expect(() =>
      gateW4_typesAndProviderDeclareLockstepPair(
        frontendTypesSource,
        contextProviderSource
      )
    ).not.toThrow()
  })

  it('W5 (D-06 negative gate): the handleSteamSyncStatus handler body does not read or reset refreshingInTheBackground, the flag it replaces', () => {
    expect(() =>
      gateW5_handlerDoesNotReadReplacedFlag(globalStateSource)
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// RED proofs -- every specimen below is DERIVED from the real source text by
// string manipulation (removal or insertion), never hand-authored, so it
// cannot drift out of sync with the file it targets.
// ---------------------------------------------------------------------------

describe('RED proofs -- each gate demonstrably trips against a source-derived known-bad specimen', () => {
  it('W2 trips when the frontendListenerSlot(\'steamSyncStatus\') line is deleted from preload/api/steam.ts (derived by line-removal from the real source)', () => {
    const realSource = readGated(PRELOAD_STEAM_PATH)
    expect(realSource).toContain("frontendListenerSlot('steamSyncStatus')")

    const missingSlotSpecimen = realSource
      .split('\n')
      .filter((line) => !line.includes("frontendListenerSlot('steamSyncStatus')"))
      .join('\n')

    expect(() =>
      gateW2_preloadExportsListenerSlot(missingSlotSpecimen)
    ).toThrow()
  })

  it('W3 trips when steamSyncStatus: is removed from inside the handler body in GlobalState.tsx (derived by string-removal from the real source)', () => {
    const realSource = readGated(GLOBAL_STATE_PATH)
    const realHandlerBody = 'this.setState({ steamSyncStatus: status })'
    expect(realSource).toContain(realHandlerBody)

    const droppedWriteSpecimen = realSource.replace(
      realHandlerBody,
      'this.setState({})'
    )

    expect(() =>
      gateW3_globalStateSubscribesAndWritesState(droppedWriteSpecimen)
    ).toThrow()
  })

  it('W5 trips when refreshingInTheBackground is inserted into the handler body in GlobalState.tsx (derived by string-insertion from the real source, proving W5 actually discriminates)', () => {
    const realSource = readGated(GLOBAL_STATE_PATH)
    const realHandlerOpen =
      'window.api.handleSteamSyncStatus((e, { status }) => {'
    expect(realSource).toContain(realHandlerOpen)

    const reintroducedFlagSpecimen = realSource.replace(
      realHandlerOpen,
      `${realHandlerOpen}\n      this.setState({ refreshingInTheBackground: true })`
    )

    expect(() =>
      gateW5_handlerDoesNotReadReplacedFlag(reintroducedFlagSpecimen)
    ).toThrow()
  })

  it('W1 trips against a specimen with the steamSyncStatus declaration deleted (derived by string-removal from the real source)', () => {
    const realSource = readGated(IPC_PATH)
    const declarationToken = 'steamSyncStatus: (payload'
    expect(realSource).toContain(declarationToken)

    const missingDeclarationSpecimen = realSource.replace(
      declarationToken,
      'REMOVED_DECLARATION'
    )

    expect(() => gateW1_ipcDeclaresChannel(missingDeclarationSpecimen)).toThrow()
  })

  it('W4 trips when steamSyncStatus is removed from ContextProvider.tsx while frontend/types.ts still declares it (derived by string-removal, proving the lockstep pair is checked, not just one side)', () => {
    const realTypesSource = readGated(FRONTEND_TYPES_PATH)
    const realContextProviderSource = readGated(CONTEXT_PROVIDER_PATH)
    const defaultLine = "steamSyncStatus: 'idle',"
    expect(realContextProviderSource).toContain(defaultLine)

    const missingDefaultSpecimen = realContextProviderSource.replace(
      defaultLine,
      ''
    )

    expect(() =>
      gateW4_typesAndProviderDeclareLockstepPair(
        realTypesSource,
        missingDefaultSpecimen
      )
    ).toThrow()
  })
})
