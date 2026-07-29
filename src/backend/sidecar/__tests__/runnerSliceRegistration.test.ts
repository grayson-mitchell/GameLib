/**
 * Wiring + curated-import guard for this slice's four declared-but-EMPTY registration modules
 * (Phase 34.5 Plan 04, REQ-34.5-13).
 *
 * Five describe blocks:
 *   1. Callable export — each of the four modules exports a callable `registerXFlows` function.
 *   2. "Imported but never called" guard (T-34.5-11) — asserts `handlers.ts` source text matches
 *      each `registerXFlows` name exactly TWICE (one import + one call). A module that is
 *      imported but never invoked would still type-check and would still pass a callable-export
 *      test, yet its channels would never reach the handler registry at runtime — this failure
 *      mode is invisible at runtime (no error, no log line), so it must be caught here.
 *   3. Idempotence — calling each `registerXFlows()` a second time must not throw and must not
 *      stack a duplicate listener, pinning the assumption every per-cluster test (which calls
 *      `registerXFlows()` once at file scope, per `humbleLoginFlows.test.ts`'s own convention)
 *      depends on. Today each module registers nothing, so this is a vacuous-but-real proof that
 *      calling twice is safe; it stays meaningful once each module's cluster plan fills it in.
 *   4. Curated-import guard (T-34.5-12) — none of the four module source files may import
 *      `ipc_handler` (any path) or `../main` — those double-register channels onto Electron's
 *      real `ipcMain` and would drag `backend/ipc` into the sidecar's curated import graph.
 *      Comment-stripped via the shared `stripSourceComments` util so a docblock merely NAMING
 *      an `ipc_handler.ts` file cannot trip the gate (mirrors `humbleLoginFlows.test.ts`'s own
 *      Describe 3 approach).
 *   5. Growth-tolerant containment pin (T-34.5-13) — each module's declared channel set (hard-
 *      coded here from this plan's own `<interfaces>` block, counts 11/9/7/11) is asserted as
 *      the ONLY set of channels that module may ever register: every channel it actually
 *      registers (via `listenerRegistry`/`handlerRegistry`) must be a member of its own set, and
 *      no channel belonging to another module's set (or outside the declared 38 entirely) may
 *      appear there.
 *   6. Completeness (Phase 34.5 Plan 13, REQ-34.5-10) — added once every cluster plan (34.5-05
 *      through 34.5-12) has landed. This is the FIRST point in the phase at which "all 38
 *      channels are registered" is a true statement: exactly 34 channels sit in `handlerRegistry`
 *      and exactly 4 in `listenerRegistry`, the send set is asserted by SET EQUALITY (not size —
 *      a size-only check would pass if two channels swapped kinds) against
 *      `['logoutGOG', 'addShortcut', 'processShortcut', 'removeShortcut']`, and per-module counts
 *      are pinned at 11/9/7/11.
 *   7. SEAM Invariant B (Phase 34.5 Plan 13) — the 3 DROPPED Zoom channels (`authZoom`,
 *      `getZoomUserInfo`, `logoutZoom`) and the 16 DEFERRED channels (EOS overlay 8, SteamGridDB
 *      5, winetricks 3) are proven absent from both registries after all four modules are
 *      registered, so they still reject with `UNPORTED_CHANNEL_MARKER` (`sidecarRpc.ts`'s
 *      `handlerRegistry.get()` miss path) rather than silently gaining an implementation. All 19
 *      names are listed explicitly — the whole point is that no new code exists for them.
 *
 * This suite is the phase's completeness gate: `34.5-PORTED-CHANNELS.md` (plan 34.5-14) declares
 * the same 38 rows, and the two must agree — plan 34.5-14's gate script cross-checks them.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

import { registerRunnerAuthFlows } from '../runnerAuthFlowRegistration'
import { registerWineToolsFlows } from '../wineToolsFlowRegistration'
import { registerShortcutsFlows } from '../shortcutsFlowRegistration'
import { registerRunnerMiscFlows } from '../runnerMiscFlowRegistration'
import {
  handlerRegistry,
  listenerRegistry,
  IpcHandler,
  IpcListener
} from '../electronStub'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// ── Canonical real-registration snapshot (Rule 1 fix, discovered building Phase 34.5 Plan
// 13's completeness/SEAM-Invariant-B describes below) ──────────────────────────────────────────
// `registerRunnerAuthFlows`/`registerShortcutsFlows` each carry a PERMANENT, module-scope
// `let registered = false` idempotence guard (mirroring production's own double-registration
// protection). Once flipped true by their first real call in this process, EVERY later call is
// a silent no-op — including a call made AFTER `handlerRegistry`/`listenerRegistry` have been
// cleared for an isolation test. Describe 5 below (`containment pin`) clears both registries
// per module iteration and its own `afterAll` previously called all four `registerXFlows()`
// functions again to "restore" state for later describes — but for these two guarded modules
// that restore call is a no-op once Describe 3's own `it.each` has already made their first real
// call, so the registries end up silently MISSING those two modules' channels. Confirmed by
// running the suite: `handlerRegistry.size` after Describe 5's `afterAll` measured 20 (only
// `wineTools`'s 9 + `runnerMisc`'s 11 — the two guard-free modules — survived), not 34.
//
// Fix: register all four ONCE here, at module scope, before any `describe`/`it` runs — this is
// guaranteed to be the true first invocation of every `registerXFlows()` in this file's process
// — then snapshot both registries into plain arrays. Every describe below that needs "all four
// modules genuinely registered" restores from this snapshot via `restoreCanonicalRegistrations()`
// rather than re-invoking the guarded functions, which cannot be trusted to do anything after
// the first call. Describe 3's own idempotence assertions are unaffected: they call `register()`
// then immediately capture `before`, so it does not matter whether that call is literally the
// first-ever or a later no-op — the property under test (two more calls change nothing) holds
// either way.
handlerRegistry.clear()
listenerRegistry.clear()
registerRunnerAuthFlows()
registerWineToolsFlows()
registerShortcutsFlows()
registerRunnerMiscFlows()

const CANONICAL_HANDLER_ENTRIES: ReadonlyArray<[string, IpcHandler]> = [
  ...handlerRegistry.entries()
]
const CANONICAL_LISTENER_ENTRIES: ReadonlyArray<[string, IpcListener[]]> = [
  ...listenerRegistry.entries()
].map(([channel, listeners]) => [channel, [...listeners]] as [string, IpcListener[]])

/** Restores both registries to the canonical, fully-registered snapshot captured above —
 * the only reliable way to get "all four modules genuinely registered" back after a test has
 * cleared the registries, since two of the four modules' own `registerXFlows()` are permanent
 * no-ops past their first call. */
function restoreCanonicalRegistrations(): void {
  handlerRegistry.clear()
  listenerRegistry.clear()
  for (const [channel, handler] of CANONICAL_HANDLER_ENTRIES) {
    handlerRegistry.set(channel, handler)
  }
  for (const [channel, listeners] of CANONICAL_LISTENER_ENTRIES) {
    listenerRegistry.set(channel, [...listeners])
  }
}

// ── Declared channel sets (this plan's own <interfaces> block — 11/9/7/11) ─────────────────────
const RUNNER_AUTH_CHANNELS = [
  'login',
  'getUserInfo',
  'isLoggedIn',
  'getEpicGamesStatus',
  'logoutLegendary',
  'authGOG',
  'logoutGOG',
  'getAmazonLoginData',
  'authAmazon',
  'getAmazonUserInfo',
  'logoutAmazon'
]

const WINE_TOOLS_CHANNELS = [
  'runWineCommand',
  'getAlternativeWine',
  'wine.isValidVersion',
  'toggleDXVK',
  'toggleDXVKNVAPI',
  'toggleVKD3D',
  'installWineVersion',
  'refreshWineVersionInfo',
  'removeWineVersion'
]

const SHORTCUTS_CHANNELS = [
  'addShortcut',
  'removeShortcut',
  'shortcutsExists',
  'addToSteam',
  'removeFromSteam',
  'isAddedToSteam',
  'processShortcut'
]

const RUNNER_MISC_CHANNELS = [
  'getLegendaryVersion',
  'getGogdlVersion',
  'getCometVersion',
  'getNileVersion',
  'callTool',
  'egsSync',
  'getGOGLinuxInstallersLangs',
  'syncSaves',
  'syncGOGSaves',
  'downloadRuntime',
  'isRuntimeInstalled'
]

const ALL_38_CHANNELS = [
  ...RUNNER_AUTH_CHANNELS,
  ...WINE_TOOLS_CHANNELS,
  ...SHORTCUTS_CHANNELS,
  ...RUNNER_MISC_CHANNELS
]

const MODULES: ReadonlyArray<{
  name: string
  register: () => void
  file: string
  declaredChannels: readonly string[]
}> = [
  {
    name: 'registerRunnerAuthFlows',
    register: registerRunnerAuthFlows,
    file: 'runnerAuthFlowRegistration.ts',
    declaredChannels: RUNNER_AUTH_CHANNELS
  },
  {
    name: 'registerWineToolsFlows',
    register: registerWineToolsFlows,
    file: 'wineToolsFlowRegistration.ts',
    declaredChannels: WINE_TOOLS_CHANNELS
  },
  {
    name: 'registerShortcutsFlows',
    register: registerShortcutsFlows,
    file: 'shortcutsFlowRegistration.ts',
    declaredChannels: SHORTCUTS_CHANNELS
  },
  {
    name: 'registerRunnerMiscFlows',
    register: registerRunnerMiscFlows,
    file: 'runnerMiscFlowRegistration.ts',
    declaredChannels: RUNNER_MISC_CHANNELS
  }
]

// ── Describe 1: Callable export ────────────────────────────────────────────────────────────────
describe('callable export — each of the four modules exports a callable registerXFlows function', () => {
  it.each(MODULES.map((m) => [m.name, m.register] as const))(
    'REQ-34.5-13 %s is a function',
    (_name, register) => {
      expect(typeof register).toBe('function')
    }
  )
})

// ── Describe 2: "imported but never called" guard (T-34.5-11) ─────────────────────────────────
describe('handlers.ts wiring — imported but never called guard', () => {
  const handlersSource = readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf-8')

  it.each(MODULES.map((m) => m.name))(
    'T-34.5-11 %s appears exactly twice in handlers.ts (one import + one call) — an import-only wiring must fail this test',
    (name) => {
      const occurrences = handlersSource.split(name).length - 1
      expect(occurrences).toBe(2)
    }
  )

  it.each(MODULES.map((m) => m.name))(
    'T-34.5-11 %s is both imported and called in handlers.ts',
    (name) => {
      const importPattern = new RegExp(`import\\s*{\\s*${name}\\s*}\\s*from`)
      const callPattern = new RegExp(`^${name}\\(\\)`, 'm')
      expect(importPattern.test(handlersSource)).toBe(true)
      expect(callPattern.test(handlersSource)).toBe(true)
    }
  )
})

// ── Describe 3: Idempotence (T-34.5-13's own precondition) ────────────────────────────────────
describe('idempotence — calling registerXFlows() twice does not throw or stack duplicate listeners', () => {
  it.each(MODULES.map((m) => [m.name, m.register, m.declaredChannels] as const))(
    '%s can be called twice without throwing, and listenerRegistry counts stay stable',
    (_name, register, declaredChannels) => {
      // Plan 34.5-06 fix (Rule 1 — pre-existing bug, invisible until a real send-kind channel
      // existed to expose it): the ORIGINAL baseline was captured BEFORE any call to register()
      // at all, then compared against the count after TWO calls. That comparison can only ever
      // hold if the module registers zero send-kind listeners — true for every module while all
      // four were declared-but-empty (34.5-04), but mathematically incompatible with a real
      // `ipcMain.on` registration (`electronStub.ts`'s listener array is appended to, so ANY
      // genuine first registration makes the post-call count > 0, permanently unequal to a
      // pre-any-call baseline of 0). This is exactly the case `registerRunnerAuthFlows` now
      // triggers once it registers `logoutGOG` for real (34.5-06 Task 2). The fix: call
      // register() ONCE to establish the real baseline this describe block's own docstring
      // describes ("must not stack a DUPLICATE listener" — i.e. a second call must not add
      // beyond what the first established), THEN capture `before`, THEN call once more and
      // compare. This is the same assertion the test always intended to make.
      register()

      const before = declaredChannels.map(
        (channel) => (listenerRegistry.get(channel) ?? []).length
      )

      expect(() => register()).not.toThrow()
      expect(() => register()).not.toThrow()

      const after = declaredChannels.map(
        (channel) => (listenerRegistry.get(channel) ?? []).length
      )

      expect(after).toEqual(before)
    }
  )
})

// ── Describe 4: Curated-import guard (T-34.5-12) ───────────────────────────────────────────────
describe('curated-import guard — none of the four modules imports ipc_handler or ../main', () => {
  /** True iff comment-stripped `source` contains an import/require referencing any
   * `ipc_handler` path or `../main` — mirrors `humbleLoginFlows.test.ts`'s own
   * `importsIpcHandler` gate, generalized to any `ipc_handler` path (not just `humble/`) plus
   * `../main`. */
  function importsForbiddenModule(source: string): boolean {
    const stripped = stripSourceComments(source)
    return (
      /import\s+['"][^'"]*ipc_handler['"]/.test(stripped) ||
      /from\s+['"][^'"]*ipc_handler['"]/.test(stripped) ||
      /require\(\s*['"][^'"]*ipc_handler['"]\s*\)/.test(stripped) ||
      /import\s+['"](?:\.\.\/)*main['"]/.test(stripped) ||
      /from\s+['"](?:\.\.\/)*main['"]/.test(stripped) ||
      /require\(\s*['"](?:\.\.\/)*main['"]\s*\)/.test(stripped)
    )
  }

  it.each(MODULES.map((m) => m.file))(
    'REQ-34.5-13 %s contains no import statement referencing ipc_handler or ../main',
    (file) => {
      const source = readFileSync(join(__dirname, '..', file), 'utf-8')
      expect(importsForbiddenModule(source)).toBe(false)
    }
  )

  it('gate self-test: a synthetic source with a named import of an ipc_handler path is detected', () => {
    const synthetic = [
      "import { registerFoo } from '../shortcuts/ipc_handler'",
      'export function registerShortcutsFlows(): void {}'
    ].join('\n')
    expect(importsForbiddenModule(synthetic)).toBe(true)
  })

  it('gate self-test: a synthetic source with a bare side-effect import of ../main is detected', () => {
    const synthetic = [
      "import '../main'",
      'export function registerRunnerAuthFlows(): void {}'
    ].join('\n')
    expect(importsForbiddenModule(synthetic)).toBe(true)
  })

  it('gate self-test (anti-vacuity): a docblock-only mention of ipc_handler.ts is NOT detected as an import', () => {
    const synthetic = [
      '/**',
      ' * Never side-effect-import tools/ipc_handler.ts — it registers',
      ' * these same channels a second time, plus the deferred winetricks trio.',
      ' */',
      'export function registerWineToolsFlows(): void {}'
    ].join('\n')
    expect(importsForbiddenModule(synthetic)).toBe(false)
  })
})

// ── Describe 5: Growth-tolerant containment pin (T-34.5-13) ───────────────────────────────────
describe("containment pin — each module registers only its own declared channels (never another module's, never outside the 38)", () => {
  /** Every channel name across BOTH registries, regardless of kind — used only to inspect what
   * a single, ISOLATED `registerXFlows()` call actually touched. */
  function allRegisteredChannelNames(): string[] {
    const names = new Set<string>()
    for (const channel of handlerRegistry.keys()) names.add(channel)
    for (const [channel, listeners] of listenerRegistry.entries()) {
      if (listeners.length > 0) names.add(channel)
    }
    return [...names]
  }

  // Each module is tested against a FRESH, CLEARED pair of registries — calling the OTHER three
  // modules' register() functions is deliberately skipped for each iteration, so whatever shows
  // up afterward is attributable to THIS module alone. Without this isolation, checking a
  // module's "foreign channel" set against the shared global registry would wrongly flag a
  // SIBLING module's own legitimate registrations as a leak the moment any cluster plan lands
  // (e.g. wineTools's real `runWineCommand` registration would look like a "leak" when checked
  // from runnerAuth's perspective, even though runnerAuth registered nothing at all).
  it.each(MODULES.map((m) => [m.name, m.register, m.declaredChannels] as const))(
    'T-34.5-13 %s, called in isolation, registers only a subset of its own declared channel set and nothing outside the 38',
    (_name, register, declaredChannels) => {
      handlerRegistry.clear()
      listenerRegistry.clear()

      register()

      const registered = allRegisteredChannelNames()
      const foreignChannels = ALL_38_CHANNELS.filter(
        (channel) => !declaredChannels.includes(channel)
      )

      // Every channel this module actually registered must be a MEMBER of its own declared set
      // (tautological today at 0 registered — this plan registers nothing yet — and becomes a
      // real assertion once the corresponding cluster plan lands).
      for (const channel of registered) {
        expect(declaredChannels).toContain(channel)
      }
      // ...and it must never register anything belonging to a SIBLING module's set or entirely
      // outside the declared 38.
      const leakedIntoForeignSet = registered.filter((channel) =>
        foreignChannels.includes(channel)
      )
      expect(leakedIntoForeignSet).toEqual([])

      handlerRegistry.clear()
      listenerRegistry.clear()
    }
  )

  afterAll(() => {
    // Leave the shared registries in a known state for any test file that runs after this one in
    // the same worker (electronStub's maps are module-scope singletons within a worker's module
    // registry), and for Describes 6/7 below in THIS file. Rule 1 fix: re-invoking the four
    // `registerXFlows()` functions here is NOT safe for `registerRunnerAuthFlows`/
    // `registerShortcutsFlows` — their permanent idempotence guards make it a no-op after the
    // canonical registration above, so it would silently leave the registries missing those two
    // modules' channels. Restore from the canonical snapshot instead.
    restoreCanonicalRegistrations()
  })
})

// ── Describe 6: Completeness (Phase 34.5 Plan 13, REQ-34.5-10) ────────────────────────────────
// The first point in the phase at which "all 38 channels are registered" is a true statement —
// every cluster plan (34.5-05 through 34.5-12) has now landed. Unlike Describe 5 above, this
// block registers all four modules TOGETHER against a single cleared pair of registries, because
// the property under test here is the union across all four, not any one module in isolation.
const SEND_CHANNELS = ['logoutGOG', 'addShortcut', 'processShortcut', 'removeShortcut']

describe('completeness — all 38 channels are registered with the right kind, across all four modules together (Phase 34.5 Plan 13, REQ-34.5-10)', () => {
  beforeAll(() => {
    // Restore from the canonical snapshot (see the module-scope comment near the top of this
    // file) rather than re-invoking the four `registerXFlows()` functions — two of them are
    // permanent no-ops past their first call.
    restoreCanonicalRegistrations()
  })

  it('exactly 34 channels are handle-kind and exactly 4 are listen-kind', () => {
    const handleChannels = [...handlerRegistry.keys()]
    const listenChannels = [...listenerRegistry.entries()]
      .filter(([, listeners]) => listeners.length > 0)
      .map(([channel]) => channel)

    expect(handleChannels.length).toBe(34)
    expect(listenChannels.length).toBe(4)
  })

  it('the send set is precisely the 4 named channels — set equality, not a size-only check (a size-only check would pass if two channels swapped kinds)', () => {
    const listenChannels = new Set(
      [...listenerRegistry.entries()]
        .filter(([, listeners]) => listeners.length > 0)
        .map(([channel]) => channel)
    )

    expect(listenChannels).toEqual(new Set(SEND_CHANNELS))
  })

  it.each(MODULES.map((m) => [m.name, m.declaredChannels] as const))(
    'per-module completeness: every one of %s declared channels is registered with the correct kind',
    (_name, declaredChannels) => {
      for (const channel of declaredChannels) {
        if (SEND_CHANNELS.includes(channel)) {
          expect((listenerRegistry.get(channel) ?? []).length).toBeGreaterThan(0)
          expect(handlerRegistry.has(channel)).toBe(false)
        } else {
          expect(handlerRegistry.has(channel)).toBe(true)
          expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
        }
      }
    }
  )

  it('per-module declared counts are exactly 11 / 9 / 7 / 11, totalling 38', () => {
    const counts = MODULES.map((m) => m.declaredChannels.length)
    expect(counts).toEqual([11, 9, 7, 11])
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(38)
  })

  afterAll(() => {
    // Leave the registries in the known-registered state Describe 7 below (and any test file
    // that runs after this one in the same worker) expects.
    restoreCanonicalRegistrations()
  })
})

// ── Describe 7: SEAM Invariant B — dropped/deferred channels still reject (Phase 34.5 Plan 13) ─
// The 3 DROPPED Zoom channels (34.5-CONTEXT.md D-02) and the 16 DEFERRED channels (D-03/D-05 —
// EOS overlay 8, SteamGridDB artwork 5, winetricks 3, all moved to the new Phase 34.6 per
// `.planning/IPC-PORT-INVENTORY.md` § "Phase 34.6") must NOT be registered by any of this
// slice's four modules. Absence from `handlerRegistry` is what makes `sidecarRpc.ts`'s dispatch
// (`const handler = handlerRegistry.get(request.channel); if (!handler) { ... reject with
// UNPORTED_CHANNEL_MARKER ... }`) reject these channels honestly rather than silently — "drop"
// and "defer" mean let it reject and say so, not build a degradation path.
describe('SEAM Invariant B — the 3 dropped and 16 deferred channels are NOT registered by any of the four modules (Phase 34.5 Plan 13)', () => {
  const DROPPED_ZOOM = ['authZoom', 'getZoomUserInfo', 'logoutZoom']

  const DEFERRED_EOS_OVERLAY = [
    'disableEosOverlay',
    'enableEosOverlay',
    'getEosOverlayStatus',
    'getLatestEosOverlayVersion',
    'installEosOverlay',
    'isEosOverlayEnabled',
    'removeEosOverlay',
    'updateEosOverlayInfo'
  ]

  const DEFERRED_STEAMGRIDDB = [
    'steamgriddb.getGrids',
    'steamgriddb.getHeroes',
    'steamgriddb.hasApiKey',
    'steamgriddb.searchGame',
    'steamgriddb.setApiKey'
  ]

  const DEFERRED_WINETRICKS = [
    'winetricksAvailable',
    'winetricksInstall',
    'winetricksInstalled'
  ]

  const DROPPED_OR_DEFERRED = [
    ...DROPPED_ZOOM,
    ...DEFERRED_EOS_OVERLAY,
    ...DEFERRED_STEAMGRIDDB,
    ...DEFERRED_WINETRICKS
  ]

  beforeAll(() => {
    // Self-contained: does not rely on Describe 6's afterAll ordering. Restores from the
    // canonical snapshot so this describe's assertions hold regardless of file execution order.
    restoreCanonicalRegistrations()
  })

  it('lists exactly 19 dropped-or-deferred channel names (3 dropped + 16 deferred)', () => {
    expect(DROPPED_OR_DEFERRED.length).toBe(19)
  })

  it('none of the 19 dropped-or-deferred names appears in the declared 38', () => {
    for (const channel of DROPPED_OR_DEFERRED) {
      expect(ALL_38_CHANNELS).not.toContain(channel)
    }
  })

  it.each(DROPPED_OR_DEFERRED)(
    '%s is registered by none of the four modules — absent from handlerRegistry, and listenerRegistry has no active listener — so it still rejects with UNPORTED_CHANNEL_MARKER',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  afterAll(() => {
    // Leave the shared registries in a known state for any test file that runs after this one
    // in the same worker.
    restoreCanonicalRegistrations()
  })
})
