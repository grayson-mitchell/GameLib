/**
 * Task 2 (34.13-15) — D-29: Console Mode gets D-24's local check, no options
 * path.
 *
 * `InstallOverlay/index.tsx` imports `./index.scss` at line 5 and there is
 * no jsdom in this jest project (`src/frontend/jest.config.js` docstring,
 * `testEnvironment: 'node'`), so the component cannot be rendered or
 * imported here — Group D below is a source-text gate by necessity, not by
 * preference, following `framelessWindowCopy.test.ts`'s idiom over
 * `stripSourceComments`-stripped text.
 *
 * VACUITY BOUNDARY: a green run here proves `consoleSteamTarget.ts`'s three
 * decision functions and the overlay's wiring SHAPE (which identifiers
 * appear, in what textual order). It proves NOTHING about whether the
 * failure card is legible on a TV, is announced correctly, or is reachable
 * with a real controller — that is 34.13-13's manual gate.
 *
 * D-29's failure shape is an in-place terminal message BY DECISION (see this
 * plan's `<d29_resolution>`) — a future reader finding no dialog/options
 * surface here is looking at the design, not an omission.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { Runner } from 'common/types'
import type {
  SteamInstallLibraryTarget,
  SteamQuickInstallDegrade
} from 'frontend/state/InstallGameModal'
import {
  probeSteamQuickInstallTarget,
  resolveConsoleActionIntent,
  steamBlockedMessageKey
} from '../consoleSteamTarget'

const OVERLAY_PATH = join(__dirname, '..', 'index.tsx')

const TARGET_MODULE_PATH = join(__dirname, '..', 'consoleSteamTarget.ts')

function readStrippedOverlay(): string {
  return stripSourceComments(readFileSync(OVERLAY_PATH, 'utf8'))
}

function readStrippedTargetModule(): string {
  return stripSourceComments(readFileSync(TARGET_MODULE_PATH, 'utf8'))
}

// --- Throwing gate helpers (34.13 review C-08) ----------------------------
//
// Every source gate below is a plain THROWING function, so the SAME code
// path can be driven against the real source (expected not to throw) and
// against a known-bad specimen (expected to throw). The previous shape --
// an inline `expect(source).toContain(...)` in the gate spec, plus a
// separate "RED" spec asserting that a hand-written string literal contains
// a substring -- proved only that `String.prototype.includes` works. It
// never invoked the gate, so nothing demonstrated the gate could trip.
// This is the identical treatment commit 8d2a84839 applied to
// `steamDialogSource.test.ts`'s `assertSingleEligibilityDisabledTerm`.

function assertNoOptionsPath(source: string) {
  for (const forbidden of [
    'startSteamQuickInstall',
    'openSteamInstallOptions'
  ]) {
    if (source.includes(forbidden)) {
      throw new Error(
        `assertNoOptionsPath: D-29 forbids an options path in Console Mode, found "${forbidden}"`
      )
    }
  }
}

function assertNoFilesystemPathOnScreen(source: string) {
  if (source.includes('libraryPath')) {
    throw new Error(
      'assertNoFilesystemPathOnScreen: libraryPath reaches the Console Mode overlay -- no filesystem path may render on a TV'
    )
  }
}

function assertCopyResolvedThroughTable(source: string) {
  if (!source.includes('steamBlockedMessage(')) {
    throw new Error(
      'assertCopyResolvedThroughTable: the render site does not call steamBlockedMessage('
    )
  }
  for (const localBranch of [
    "reason === 'library-missing'",
    "reason === 'library-full'"
  ]) {
    if (source.includes(localBranch)) {
      throw new Error(
        `assertCopyResolvedThroughTable: the render site re-branches locally on "${localBranch}" -- a third reason would fall into the wrong copy`
      )
    }
  }
}

function assertSteamBranchMarshalsThroughInstallSteamGame(source: string) {
  if (!source.includes('installSteamGame(game.app_name, game)')) {
    throw new Error(
      'assertSteamBranchMarshalsThroughInstallSteamGame: the Steam branch does not marshal through installSteamGame( with no path'
    )
  }
  if (source.includes("installPath: 'default'")) {
    throw new Error(
      'assertSteamBranchMarshalsThroughInstallSteamGame: the Steam branch still passes installPath: \'default\' -- a second renderer-side definition of "primary" (D-23)'
    )
  }
}

function stubWindowApi(overrides: {
  listSteamLibraryTargets?: jest.Mock
  checkDiskSpace?: jest.Mock
}) {
  ;(global as unknown as { window: unknown }).window = {
    api: {
      listSteamLibraryTargets:
        overrides.listSteamLibraryTargets ?? jest.fn().mockResolvedValue([]),
      checkDiskSpace:
        overrides.checkDiskSpace ?? jest.fn().mockResolvedValue(undefined)
    }
  }
}

function teardownWindowApi() {
  delete (global as unknown as { window?: unknown }).window
}

function makeTargets(n: number): SteamInstallLibraryTarget[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `/steam/library-${i}`,
    steamappsDir: `/steam/library-${i}/steamapps`,
    isPrimary: i === 0
  })) as SteamInstallLibraryTarget[]
}

function makeDisk(overrides: { free?: number; validPath?: boolean }): {
  free: number
  diskSize: number
  message: string
  validPath: boolean
  validFlatpakPath: boolean
} {
  return {
    free: overrides.free ?? 2 * 1024 ** 3,
    diskSize: 100 * 1024 ** 3,
    message: '',
    validPath: overrides.validPath ?? true,
    validFlatpakPath: true
  }
}

const LOW_SPACE_FLOOR_BYTES = 1024 ** 3

beforeEach(() => {
  teardownWindowApi()
})

afterAll(() => {
  teardownWindowApi()
})

describe('probeSteamQuickInstallTarget (D-29 inheriting D-24)', () => {
  it('A1: 0 libraries -> ok, and checkDiskSpace was NOT called', async () => {
    const checkDiskSpace = jest.fn().mockResolvedValue(undefined)
    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue([]),
      checkDiskSpace
    })
    const verdict = await probeSteamQuickInstallTarget()
    expect(verdict).toEqual({ ok: true })
    expect(checkDiskSpace).not.toHaveBeenCalled()
  })

  it('A2: 1 valid library -> ok', async () => {
    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(makeTargets(1)),
      checkDiskSpace: jest.fn().mockResolvedValue(makeDisk({}))
    })
    const verdict = await probeSteamQuickInstallTarget()
    expect(verdict).toEqual({ ok: true })
  })

  it("A3: validPath false -> not ok, 'library-missing', degrade.libraryPath equals the resolved primary's path", async () => {
    const targets = makeTargets(1)
    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(targets),
      checkDiskSpace: jest
        .fn()
        .mockResolvedValue(makeDisk({ validPath: false }))
    })
    const verdict = await probeSteamQuickInstallTarget()
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.degrade.reason).toBe('library-missing')
      expect(verdict.degrade.libraryPath).toBe(targets[0].path)
    }
  })

  it('A4: free space boundary asserted on both sides', async () => {
    const targets = makeTargets(1)
    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(targets),
      checkDiskSpace: jest
        .fn()
        .mockResolvedValue(makeDisk({ free: LOW_SPACE_FLOOR_BYTES - 1 }))
    })
    const belowFloor = await probeSteamQuickInstallTarget()
    expect(belowFloor.ok).toBe(false)
    if (!belowFloor.ok) {
      expect(belowFloor.degrade.reason).toBe('library-full')
    }

    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(targets),
      checkDiskSpace: jest
        .fn()
        .mockResolvedValue(makeDisk({ free: LOW_SPACE_FLOOR_BYTES }))
    })
    const atFloor = await probeSteamQuickInstallTarget()
    expect(atFloor).toEqual({ ok: true })
  })

  it("A5: probes the RESOLVED primary's steamappsDir, never .path, exactly once", async () => {
    const targets = makeTargets(2)
    // Make index 1 primary so a naive targets[0] read would be caught.
    targets[0].isPrimary = false
    targets[1].isPrimary = true
    const checkDiskSpace = jest.fn().mockResolvedValue(makeDisk({}))
    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(targets),
      checkDiskSpace
    })
    await probeSteamQuickInstallTarget()
    expect(checkDiskSpace).toHaveBeenCalledTimes(1)
    expect(checkDiskSpace).toHaveBeenCalledWith(targets[1].steamappsDir)
    expect(checkDiskSpace).not.toHaveBeenCalledWith(targets[1].path)
  })

  it('A6: onlyLibrary is carried through -- true with one library, false with two', async () => {
    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(makeTargets(1)),
      checkDiskSpace: jest
        .fn()
        .mockResolvedValue(makeDisk({ validPath: false }))
    })
    const oneLib = await probeSteamQuickInstallTarget()
    expect(oneLib.ok).toBe(false)
    if (!oneLib.ok) expect(oneLib.degrade.onlyLibrary).toBe(true)

    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(makeTargets(2)),
      checkDiskSpace: jest
        .fn()
        .mockResolvedValue(makeDisk({ validPath: false }))
    })
    const twoLibs = await probeSteamQuickInstallTarget()
    expect(twoLibs.ok).toBe(false)
    if (!twoLibs.ok) expect(twoLibs.degrade.onlyLibrary).toBe(false)
  })

  it('A7 DISCRIMINATOR: an UNKNOWN disk verdict is not a failed one -- a rejected checkDiskSpace yields ok', async () => {
    stubWindowApi({
      listSteamLibraryTargets: jest.fn().mockResolvedValue(makeTargets(1)),
      checkDiskSpace: jest.fn().mockRejectedValue(new Error('probe failed'))
    })
    const verdict = await probeSteamQuickInstallTarget()
    expect(verdict).toEqual({ ok: true })
  })

  it('A8: a rejected listSteamLibraryTargets yields ok (the A1 shape, reached by failure)', async () => {
    const checkDiskSpace = jest.fn().mockResolvedValue(undefined)
    stubWindowApi({
      listSteamLibraryTargets: jest
        .fn()
        .mockRejectedValue(new Error('ipc failed')),
      checkDiskSpace
    })
    const verdict = await probeSteamQuickInstallTarget()
    expect(verdict).toEqual({ ok: true })
    expect(checkDiskSpace).not.toHaveBeenCalled()
  })

  it('A9: probeSteamQuickInstallTarget never rejects, even when both channels reject', async () => {
    stubWindowApi({
      listSteamLibraryTargets: jest
        .fn()
        .mockRejectedValue(new Error('ipc failed')),
      checkDiskSpace: jest.fn().mockRejectedValue(new Error('probe failed'))
    })
    await expect(probeSteamQuickInstallTarget()).resolves.toBeDefined()
  })
})

type ConsoleFocusKeyLike = 'platform' | 'wine' | 'cancel' | 'install'
const ALL_FOCUS_KEYS: ConsoleFocusKeyLike[] = [
  'platform',
  'wine',
  'cancel',
  'install'
]
const NON_STEAM_RUNNERS: Runner[] = ['gog', 'legendary', 'nile', 'sideload']

describe('resolveConsoleActionIntent (the A-button bypass gate)', () => {
  it("B1: { runner: 'steam', focused: 'install' } -> 'dismiss'", () => {
    expect(
      resolveConsoleActionIntent({ runner: 'steam', focused: 'install' })
    ).toBe('dismiss')
  })

  it.each(ALL_FOCUS_KEYS)(
    "B2: runner 'steam' with focused '%s' -> 'dismiss' for every FocusKey (no focus row survives the Steam branch)",
    (focused) => {
      expect(resolveConsoleActionIntent({ runner: 'steam', focused })).toBe(
        'dismiss'
      )
    }
  )

  it.each(NON_STEAM_RUNNERS)(
    "B3 DISCRIMINATOR: D-28 -- non-Steam runner (%s) keeps today's behavior exactly",
    (runner) => {
      expect(resolveConsoleActionIntent({ runner, focused: 'install' })).toBe(
        'install'
      )
      expect(resolveConsoleActionIntent({ runner, focused: 'cancel' })).toBe(
        'dismiss'
      )
      expect(resolveConsoleActionIntent({ runner, focused: 'platform' })).toBe(
        'none'
      )
      expect(resolveConsoleActionIntent({ runner, focused: 'wine' })).toBe(
        'none'
      )
    }
  )

  // B4: the function takes no "blocked" input. The answer is 'dismiss' for
  // Steam in BOTH the transient "Opening Steam…" state and the D-29 failure
  // state -- an input the result does not depend on would invite a future
  // reader to treat it as load-bearing when it never was.
  //
  // 34.13 review C-07: this used to assert
  // `resolveConsoleActionIntent.length <= 1`. The function takes a SINGLE
  // DESTRUCTURED OBJECT, so `Function.prototype.length` is 1 no matter how
  // many properties that object grows -- adding `blocked:
  // SteamQuickInstallDegrade` to the parameter, the exact drift the spec is
  // named for, left `.length` at 1 and the spec green. It could not fail for
  // the reason its name gave. Measure the destructured SHAPE instead.
  it('B4: the parameter object carries no blocked/degrade key', () => {
    const signature =
      readStrippedTargetModule().match(
        /resolveConsoleActionIntent\(\{[^}]*\}/
      )?.[0] ?? ''
    expect(signature).toContain('runner')
    expect(signature).toContain('focused')
    expect(signature).not.toMatch(/blocked|degrade/)
  })

  it('B4-RED: the reworked gate trips against a signature DERIVED FROM THE REAL SOURCE with a blocked key added', () => {
    const knownBad = readStrippedTargetModule().replace(
      'resolveConsoleActionIntent({\n  runner,\n  focused\n}',
      'resolveConsoleActionIntent({\n  runner,\n  focused,\n  blocked\n}'
    )
    const signature =
      knownBad.match(/resolveConsoleActionIntent\(\{[^}]*\}/)?.[0] ?? ''
    expect(signature).toMatch(/blocked/)
    // ...and the OLD assertion would still have passed on that same input,
    // which is the whole finding.
    expect(resolveConsoleActionIntent.length).toBeLessThanOrEqual(1)
  })
})

describe('steamBlockedMessageKey', () => {
  it("C1: 'library-missing' -> 'consoleMode.steamInstallLibraryMissing'", () => {
    expect(steamBlockedMessageKey('library-missing')).toBe(
      'consoleMode.steamInstallLibraryMissing'
    )
  })

  it("C2: 'library-full' -> 'consoleMode.steamInstallLibraryFull'", () => {
    expect(steamBlockedMessageKey('library-full')).toBe(
      'consoleMode.steamInstallLibraryFull'
    )
  })

  // 34.13 review C-07: this used to build a hand-written array typed with a
  // hand-written union (`Array<'library-missing' | 'library-full'>`) and loop
  // over it. A third reason added to `SteamQuickInstallDegrade` upstream left
  // that literal untouched and the spec green -- it could not observe the
  // exhaustiveness it was named for. Two independent replacements, because
  // ts-jest here is TRANSPILE-ONLY and only one of them is visible to jest:
  //
  //  (1) a compile-time bidirectional-assignability pin, which `tsc --noEmit`
  //      (the ONLY real type gate in this repo) must satisfy, and
  //  (2) a runtime gate on the source, which jest can actually fail.
  const ALL_REASONS = ['library-missing', 'library-full'] as const

  // (1) Both directions: a NEW union member makes `_ForwardExhaustive` fail
  // (the union no longer extends the literal tuple), and a member DELETED
  // from ALL_REASONS makes `_BackwardExhaustive` fail. Invisible to jest; a
  // `pnpm codecheck` obligation.
  type _ForwardExhaustive =
    SteamQuickInstallDegrade['reason'] extends (typeof ALL_REASONS)[number]
      ? true
      : never
  type _BackwardExhaustive =
    (typeof ALL_REASONS)[number] extends SteamQuickInstallDegrade['reason']
      ? true
      : never
  const _forward: _ForwardExhaustive = true
  const _backward: _BackwardExhaustive = true

  it('C3: every member of the real union resolves to a real key (compile-pinned above)', () => {
    expect(_forward).toBe(true)
    expect(_backward).toBe(true)
    for (const reason of ALL_REASONS) {
      expect(typeof steamBlockedMessageKey(reason)).toBe('string')
      expect(steamBlockedMessageKey(reason).length).toBeGreaterThan(0)
    }
  })

  it('C3b: the source-level exhaustiveness mechanism is the Record<union, ...> type, not a hand-listed object', () => {
    // This is the half jest CAN fail. If someone widens the table's type to
    // `Partial<Record<...>>` or to a plain object literal type, the compile
    // error a third reason would have produced disappears silently -- and
    // ts-jest's transpile-only mode means no test would notice.
    const source = readStrippedTargetModule()
    expect(source).toMatch(
      /Record<\s*SteamQuickInstallDegrade\['reason'\],\s*\[string, string\]\s*>/
    )
    expect(source).not.toMatch(/Partial<\s*Record<\s*SteamQuickInstallDegrade/)
  })

  it('C3b-RED: the C3b gate trips against a widening DERIVED FROM THE REAL SOURCE', () => {
    const knownBad = readStrippedTargetModule().replace(
      'Record<',
      'Partial<Record<'
    )
    expect(knownBad).not.toMatch(
      /(?<!Partial<)Record<\s*SteamQuickInstallDegrade\['reason'\],\s*\[string, string\]\s*>/
    )
  })
})

describe('InstallOverlay/index.tsx source gates (D-29, comment-stripped)', () => {
  it('D1: contains probeSteamQuickInstallTarget and resolveConsoleActionIntent', () => {
    const source = readStrippedOverlay()
    expect(source).toMatch(/probeSteamQuickInstallTarget/)
    expect(source).toMatch(/resolveConsoleActionIntent/)
  })

  it('D2: the D-29 "no options path" proof -- zero startSteamQuickInstall, zero openSteamInstallOptions', () => {
    expect(() => assertNoOptionsPath(readStrippedOverlay())).not.toThrow()
  })

  it('D2-RED: the gate itself trips on a known-bad input DERIVED FROM THE REAL SOURCE', () => {
    // Derived: the real overlay with its `installSteamGame(` call swapped for
    // the D-29-forbidden options door, i.e. the regression this guards.
    const knownBad = readStrippedOverlay().replace(
      'installSteamGame(game.app_name, game)',
      'openSteamInstallOptions(game.app_name, game)'
    )
    expect(knownBad).not.toBe(readStrippedOverlay())
    expect(() => assertNoOptionsPath(knownBad)).toThrow(
      /openSteamInstallOptions/
    )
  })

  it('D3: no filesystem path may reach a TV screen -- zero occurrences of libraryPath', () => {
    expect(() =>
      assertNoFilesystemPathOnScreen(readStrippedOverlay())
    ).not.toThrow()
  })

  it('D3-RED: the gate itself trips on a known-bad input DERIVED FROM THE REAL SOURCE', () => {
    // Derived: the real overlay with the degrade record's path interpolated
    // into the failure card, which is exactly how this leaks in practice.
    const knownBad = readStrippedOverlay().replace(
      'steamBlockedMessage(',
      '(steamBlocked.libraryPath, steamBlockedMessage)('
    )
    expect(knownBad).not.toBe(readStrippedOverlay())
    expect(() => assertNoFilesystemPathOnScreen(knownBad)).toThrow(
      /libraryPath/
    )
  })

  it('D4: the non-Steam path is untouched', () => {
    const source = readStrippedOverlay()
    expect(source).toContain("installPath: installPath || 'default'")
    // CORRECTED by 34.13 review WR-02: this assertion used to read
    // `toContain("platformToInstall: 'Windows'")` and was described as
    // proving "the non-Steam path is untouched" -- but the non-Steam
    // call passes the `platformToInstall` VARIABLE (line 225), never the
    // literal. The only literal `platformToInstall: 'Windows'` in this
    // file lived in the STEAM branch, so this assertion was measuring the
    // opposite of the property it named, and WR-02's removal of that
    // Steam-branch call is what exposed it. The non-Steam call's real
    // shape is the variable pass-through.
    expect(source).toContain('platformToInstall,')
  })

  it('D5: the timer is armed inside the ok branch, not at effect top level -- setTimeout( comes after probeSteamQuickInstallTarget( textually', () => {
    const source = readStrippedOverlay()
    const probeIdx = source.indexOf('probeSteamQuickInstallTarget(')
    const timerIdx = source.indexOf('setTimeout(')
    expect(probeIdx).toBeGreaterThanOrEqual(0)
    expect(timerIdx).toBeGreaterThan(probeIdx)
  })

  // WR-01 (34.13 review): the exhaustive mapping is only worth anything if
  // the RENDER SITE uses it. Before this gate, `steamBlockedMessageKey` was
  // imported nowhere outside this test file and the overlay inlined its own
  // `reason === 'library-missing' ? ... : ...` ternary -- which routes any
  // future third reason into the library-full copy, i.e. exactly the defect
  // the exhaustive mapping advertises that it prevents.
  it('D7: the overlay RESOLVES the copy through steamBlockedMessage( and carries no local reason ternary', () => {
    expect(() =>
      assertCopyResolvedThroughTable(readStrippedOverlay())
    ).not.toThrow()
  })

  it('D7-RED: the D7 gate itself trips against the pre-fix render site, DERIVED FROM THE REAL SOURCE', () => {
    // 34.13 review C-08: the previous version of this spec asserted that a
    // hand-written string literal three lines above it contained a
    // substring. It never invoked the gate, so nothing proved the gate could
    // trip. Now the real source is mutated back into the pre-fix shape and
    // driven through the identical helper the real gate uses.
    const knownBad = readStrippedOverlay().replace(
      'steamBlockedMessage(',
      "steamBlocked.reason === 'library-missing' ? a : b; noSuchLookup("
    )
    expect(knownBad).not.toBe(readStrippedOverlay())
    expect(() => assertCopyResolvedThroughTable(knownBad)).toThrow(
      /does not call steamBlockedMessage/
    )
  })

  it('D7-RED-b: a render site that keeps the lookup but ALSO re-branches locally is rejected', () => {
    const knownBad =
      readStrippedOverlay() +
      "\nconst x = steamBlocked.reason === 'library-full'"
    expect(() => assertCopyResolvedThroughTable(knownBad)).toThrow(
      /re-branches locally/
    )
  })

  // NARROWED BY 34.13 review WR-02 (was: `toBe(2)`). The Steam branch's
  // generic `install({ ... installPath: 'default' ... })` call is GONE --
  // it resolved to `AppSettings.defaultInstallPath` (GameLib's generic
  // install dir), not the Steam library the free-space check above had just
  // validated, contradicting D-23. The Steam branch now calls
  // `installSteamGame(...)` with no path, so exactly ONE `install({`
  // remains: the pre-existing, untouched non-Steam `installGame()` call.
  // The plan's original intent ("no second install path on the Steam
  // branch") is now proven more directly by D8 below.
  it('D6: exactly ONE occurrence of install({ -- only the pre-existing non-Steam installGame() call survives', () => {
    const source = readStrippedOverlay()
    const count = (source.match(/install\(\{/g) ?? []).length
    expect(count).toBe(1)
  })

  it('D8: the Steam branch marshals through installSteamGame( with no path argument (D-23) and never the generic helper', () => {
    expect(() =>
      assertSteamBranchMarshalsThroughInstallSteamGame(readStrippedOverlay())
    ).not.toThrow()
  })

  it('D8-RED: the D8 gate itself trips against the pre-fix Steam-branch call, DERIVED FROM THE REAL SOURCE', () => {
    const knownBad = readStrippedOverlay().replace(
      'installSteamGame(game.app_name, game)',
      "install({ gameInfo: game, installPath: 'default' })"
    )
    expect(knownBad).not.toBe(readStrippedOverlay())
    expect(() =>
      assertSteamBranchMarshalsThroughInstallSteamGame(knownBad)
    ).toThrow(/does not marshal through installSteamGame/)
  })

  it("D8-RED-b: a Steam branch that keeps the call but re-adds installPath: 'default' is rejected", () => {
    const knownBad =
      readStrippedOverlay() + "\nconst y = { installPath: 'default' }"
    expect(() =>
      assertSteamBranchMarshalsThroughInstallSteamGame(knownBad)
    ).toThrow(/installPath/)
  })
})
