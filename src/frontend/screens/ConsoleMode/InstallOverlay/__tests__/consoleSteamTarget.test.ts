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
import type { SteamInstallLibraryTarget } from 'frontend/state/InstallGameModal'
import {
  probeSteamQuickInstallTarget,
  resolveConsoleActionIntent,
  steamBlockedMessageKey
} from '../consoleSteamTarget'

const OVERLAY_PATH = join(__dirname, '..', 'index.tsx')

function readStrippedOverlay(): string {
  return stripSourceComments(readFileSync(OVERLAY_PATH, 'utf8'))
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

function makeDisk(overrides: {
  free?: number
  validPath?: boolean
}): { free: number; diskSize: number; message: string; validPath: boolean; validFlatpakPath: boolean } {
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
      expect(
        resolveConsoleActionIntent({ runner: 'steam', focused })
      ).toBe('dismiss')
    }
  )

  it.each(NON_STEAM_RUNNERS)(
    "B3 DISCRIMINATOR: D-28 -- non-Steam runner (%s) keeps today's behavior exactly",
    (runner) => {
      expect(
        resolveConsoleActionIntent({ runner, focused: 'install' })
      ).toBe('install')
      expect(
        resolveConsoleActionIntent({ runner, focused: 'cancel' })
      ).toBe('dismiss')
      expect(
        resolveConsoleActionIntent({ runner, focused: 'platform' })
      ).toBe('none')
      expect(
        resolveConsoleActionIntent({ runner, focused: 'wine' })
      ).toBe('none')
    }
  )

  // B4: the function takes no "blocked" input. The answer is 'dismiss' for
  // Steam in BOTH the transient "Opening Steam…" state and the D-29 failure
  // state -- an input the result does not depend on would invite a future
  // reader to treat it as load-bearing when it never was.
  it('B4: the function signature carries no blocked/degrade parameter', () => {
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

  it('C3: the mapping is exhaustive over every union member', () => {
    const reasons: Array<'library-missing' | 'library-full'> = [
      'library-missing',
      'library-full'
    ]
    for (const reason of reasons) {
      expect(typeof steamBlockedMessageKey(reason)).toBe('string')
    }
  })
})

describe('InstallOverlay/index.tsx source gates (D-29, comment-stripped)', () => {
  it('D1: contains probeSteamQuickInstallTarget and resolveConsoleActionIntent', () => {
    const source = readStrippedOverlay()
    expect(source).toMatch(/probeSteamQuickInstallTarget/)
    expect(source).toMatch(/resolveConsoleActionIntent/)
  })

  it('D2: the D-29 "no options path" proof -- zero startSteamQuickInstall, zero openSteamInstallOptions', () => {
    const source = readStrippedOverlay()
    expect((source.match(/startSteamQuickInstall/g) ?? []).length).toBe(0)
    expect((source.match(/openSteamInstallOptions/g) ?? []).length).toBe(0)

    const knownBadSpecimen = 'onclick: () => openSteamInstallOptions(appName, gameInfo)'
    expect(/openSteamInstallOptions/.test(knownBadSpecimen)).toBe(true)
  })

  it('D3: no filesystem path may reach a TV screen -- zero occurrences of libraryPath', () => {
    const source = readStrippedOverlay()
    expect((source.match(/libraryPath/g) ?? []).length).toBe(0)

    const knownBadSpecimen = 'steamBlocked.libraryPath'
    expect(/libraryPath/.test(knownBadSpecimen)).toBe(true)
  })

  it('D4: the non-Steam path is untouched', () => {
    const source = readStrippedOverlay()
    expect(source).toContain("installPath: installPath || 'default'")
    expect(source).toContain("platformToInstall: 'Windows'")
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
    const source = readStrippedOverlay()
    expect(source).toContain('steamBlockedMessage(')
    expect(source).not.toContain("reason === 'library-missing'")
    expect(source).not.toContain("reason === 'library-full'")
  })

  it('D7-RED: the D7 gate trips against the pre-fix render site (the inlined ternary)', () => {
    // The known-bad input is the shape the reviewer actually found, not a
    // synthetic one: a render site that branches locally instead of looking
    // the pair up.
    const knownBad = [
      "{steamBlocked.reason === 'library-missing'",
      "  ? tGamelib('gamelib:consoleMode.steamInstallLibraryMissing', 'a')",
      "  : tGamelib('gamelib:consoleMode.steamInstallLibraryFull', 'b')}"
    ].join('\n')
    expect(knownBad).not.toContain('steamBlockedMessage(')
    expect(knownBad).toContain("reason === 'library-missing'")
  })

  it('D6: exactly TWO occurrences of install({ in the whole file -- the pre-existing non-Steam installGame() call (untouched) plus the single, now-gated Steam-branch call; no THIRD call introduced. DIVERGENCE FROM PLAN TEXT, recorded in the SUMMARY: the plan\'s own acceptance criteria states "returns 1", but the file has carried two install({ call sites (line 99 Steam branch, line 173 installGame()) since before this task -- verified via `grep -c "install({"` against HEAD before any edit in this task. The plan\'s own <objective> intends "no second install path on the Steam branch", which this count (unchanged at 2) proves; a literal "1" would be false even against the plan\'s own untouched-file baseline.', () => {
    const source = readStrippedOverlay()
    const count = (source.match(/install\(\{/g) ?? []).length
    expect(count).toBe(2)
  })
})
