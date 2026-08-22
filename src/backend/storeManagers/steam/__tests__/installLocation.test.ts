/**
 * Unit tests for resolveSteamInstallTarget / listSteamLibraryTargets
 * (Phase 21-09) — D-08 registered-folder-only targeting, D-09 default-primary
 * + multi-library override resolution, and installdir sanitization (T-21-01).
 *
 * Mock strategy follows depot.test.ts/games.test.ts conventions:
 *  - backend/logger uses factory form (prevents transitive fs-extra native crash)
 *  - backend/utils is a minimal factory mock — only getSteamLibraries is needed
 *    here, avoiding the heavy gog/library.ts transitive chain the real
 *    utils.ts module pulls in
 *  - ../user is auto-mocked (jest.mock('../user')) — SteamUser.getClient()
 *    becomes a jest.fn(), matching depot.test.ts's established pattern
 */
import { join, resolve } from 'node:path'
import { logWarning } from 'backend/logger'
import { getSteamLibraries } from 'backend/utils'
import {
  listSteamLibraryTargets,
  resolveSteamInstallTarget,
  sanitizeInstalldir,
  UnsafeInstalldirError
} from '../installLocation'
import { STEAM_PICS_TIMEOUT_MS } from '../withTimeout'
import { SteamUser } from '../user'
import { classifyDepotError } from '../depotErrors'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn()
}))

jest.mock('../user')

// ── i18next mock — returns the fallback string for classifyDepotError
//    assertions (depot.test.ts/library.test.ts's established pattern) ──────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    getProductInfo: jest.fn().mockResolvedValue({
      apps: {},
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    ...overrides
  }
}

function mockProductInfo(appId: number, installdir: string | undefined) {
  const appinfo = installdir === undefined ? {} : { config: { installdir } }
  return jest.fn().mockResolvedValue({
    apps: { [appId]: { appinfo } },
    packages: {},
    unknownApps: [],
    unknownPackages: []
  })
}

const APP_ID = '12345'

describe('listSteamLibraryTargets', () => {
  it('returns every registered library, primary first', async () => {
    jest
      .mocked(getSteamLibraries)
      .mockResolvedValue(['/lib/primary', '/lib/secondary'])

    const targets = await listSteamLibraryTargets()

    expect(targets).toEqual([
      {
        path: '/lib/primary',
        steamappsDir: join('/lib/primary', 'steamapps'),
        isPrimary: true
      },
      {
        path: '/lib/secondary',
        steamappsDir: join('/lib/secondary', 'steamapps'),
        isPrimary: false
      }
    ])
  })
})

describe('resolveSteamInstallTarget', () => {
  it('with one registered library, defaults to that library, no override needed', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'MyGame')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result).toEqual({
      targetSteamappsDir: join('/lib/only', 'steamapps'),
      installdir: 'MyGame'
    })
  })

  it('D-09: with multiple libraries and an override matching a registered library, uses it', async () => {
    jest
      .mocked(getSteamLibraries)
      .mockResolvedValue(['/lib/primary', '/lib/secondary'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'MyGame')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '/lib/secondary',
      platformToInstall: 'Windows'
    })

    expect(result.targetSteamappsDir).toBe(join('/lib/secondary', 'steamapps'))
  })

  it('D-08: an override NOT matching any registered library is rejected, defaults to primary', async () => {
    jest
      .mocked(getSteamLibraries)
      .mockResolvedValue(['/lib/primary', '/lib/secondary'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'MyGame')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '/some/unregistered/arbitrary/path',
      platformToInstall: 'Windows'
    })

    expect(result.targetSteamappsDir).toBe(join('/lib/primary', 'steamapps'))
    expect(jest.mocked(logWarning)).toHaveBeenCalled()
  })

  it('D-02/D-04: a hostile PICS installdir (traversal) ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion, which is wrong under D-04 (a containment violation is a security event, not a silent fallback)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, '../../etc/passwd')
      }) as never
    )

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toBeInstanceOf(UnsafeInstalldirError)
    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toThrow(/\.\.\/\.\.\/etc\/passwd/)
  })

  it('D-02/D-04: a hostile PICS installdir (path separator) ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'foo/bar')
      }) as never
    )

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toBeInstanceOf(UnsafeInstalldirError)
    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toThrow(/foo\/bar/)
  })

  it('falls back to a safe appId-derived installdir when PICS returns nothing', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, undefined)
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe(`app_${APP_ID}`)
    // D-04 (second half): the fallback flag must be surfaced on the
    // returned SteamInstallTarget so a caller can log/report the
    // non-portable layout instead of it silently disappearing here.
    expect(result.installdirFallbackUsed).toBe(true)
  })

  it('WR-01: a never-settling installdir getProductInfo does NOT hard-fail — fetchInstalldir bounds it, catches, and resolveSteamInstallTarget RESOLVES with a safe fallback dir (never rejects)', async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
      jest.mocked(SteamUser.getClient).mockReturnValue(
        makeFakeClient({
          // Simulates a stale-but-present CM socket: the installdir PICS
          // lookup never answers. fetchInstalldir's OWN withTimeout must bound
          // it and its catch must degrade to a benign undefined -> safe
          // fallback dir. This inner no-hard-fail contract is exactly what
          // WR-01's strictly-larger OUTER bound (games.ts) preserves: the
          // inner fallback must win its own race, not be pre-empted into a
          // fatal "pre-download timed out".
          getProductInfo: jest.fn().mockReturnValue(new Promise(() => {}))
        }) as never
      )

      const pending = resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })

      // Advance past the inner fetchInstalldir bound (STEAM_PICS_TIMEOUT_MS).
      await jest.advanceTimersByTimeAsync(STEAM_PICS_TIMEOUT_MS + 1000)

      const result = await pending
      // RESOLVED, not rejected: install proceeds with the safe fallback dir.
      expect(result.installdir).toBe(`app_${APP_ID}`)
      expect(result.targetSteamappsDir).toBe(join('/lib/only', 'steamapps'))
    } finally {
      jest.useRealTimers()
    }
  })

  it('T-21-05: rejects a non-numeric appId before any PICS lookup, still resolves via fallback installdir', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    const fakeClient = makeFakeClient()
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)

    const result = await resolveSteamInstallTarget('12345; rm -rf /', {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(fakeClient.getProductInfo).not.toHaveBeenCalled()
    expect(result.installdir.startsWith('app_')).toBe(true)
    expect(result.installdir).not.toMatch(/[/\\]/)
    expect(result.installdir.includes('..')).toBe(false)
  })

  it('WR-04/D-02/D-04: a quote-containing installdir ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion; quote stays denylisted as defense-in-depth against VDF injection even though downstream manifest.ts already escapes it', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'Foo"bar')
      }) as never
    )

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toBeInstanceOf(UnsafeInstalldirError)
  })

  it('WR-04/D-02/D-04: a control-char/newline-containing installdir ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion; control chars are part of D-02\'s literal denylist', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'Foo\nBar')
      }) as never
    )

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toBeInstanceOf(UnsafeInstalldirError)
  })

  it('WR-04/D-02/D-04: a Windows drive-relative installdir (colon, no separator) ABORTS resolveSteamInstallTarget — REWRITTEN from the old "sanitized to a safe fallback" assertion; colon stays denylisted as defense-in-depth against the Windows drive-relative escape (path.win32.resolve semantics), which the POSIX containment check alone cannot catch in this environment', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'C:foo')
      }) as never
    )

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toBeInstanceOf(UnsafeInstalldirError)
  })

  it('WR-04: a well-formed installdir with spaces/dots/dashes/underscores passes through unchanged', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, 'Half-Life 2')
      }) as never
    )

    const result = await resolveSteamInstallTarget(APP_ID, {
      path: '',
      platformToInstall: 'Windows'
    })

    expect(result.installdir).toBe('Half-Life 2')
    // A PICS-supplied name was used as-is — the fallback flag must be
    // omitted (not `true`), matching the well-formed happy path.
    expect(result.installdirFallbackUsed).toBeUndefined()
  })

  it('D-02/D-04/T-37-03: resolveSteamInstallTarget REJECTS with UnsafeInstalldirError for a traversal installdir, rather than resolving to a safe fallback', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/lib/only'])
    jest.mocked(SteamUser.getClient).mockReturnValue(
      makeFakeClient({
        getProductInfo: mockProductInfo(12345, '../../etc/passwd')
      }) as never
    )

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toBeInstanceOf(UnsafeInstalldirError)
  })

  it('throws when no Steam libraries are registered at all', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue([])

    await expect(
      resolveSteamInstallTarget(APP_ID, {
        path: '',
        platformToInstall: 'Windows'
      })
    ).rejects.toThrow(/no registered Steam libraries/i)
  })
})

describe('sanitizeInstalldir — REQ-37-06: containment, not character class', () => {
  const STEAMAPPS_DIR = join('/Steam', 'steamapps')

  // ── ACCEPT — apostrophes and ordinary filename punctuation pass unchanged
  //    (D-02: the defect this plan fixes). ──────────────────────────────────

  it("D-02: accepts \"Sid Meier's Civilization V\" unchanged — the live specimen, appId 8930", () => {
    expect(
      sanitizeInstalldir("Sid Meier's Civilization V", '8930', STEAMAPPS_DIR)
    ).toBe("Sid Meier's Civilization V")
  })

  it("D-02: accepts \"Len's Island\" unchanged — the ACF-measured specimen, currently installed via Steam", () => {
    expect(sanitizeInstalldir("Len's Island", '12345', STEAMAPPS_DIR)).toBe(
      "Len's Island"
    )
  })

  it('accepts "Half-Life 2" unchanged — restated against the new containment path to prove the rewrite did not lose ordinary punctuation', () => {
    expect(sanitizeInstalldir('Half-Life 2', '12345', STEAMAPPS_DIR)).toBe(
      'Half-Life 2'
    )
  })

  // ── ABORT — each throws UnsafeInstalldirError naming the rejected value
  //    verbatim (D-04: a containment/denylist violation is a security event).
  //    ────────────────────────────────────────────────────────────────────

  it('D-02 precondition: "../../etc" (the RED traversal case the todo explicitly demands) THROWS UnsafeInstalldirError naming the value', () => {
    expect(() =>
      sanitizeInstalldir('../../etc', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
    expect(() =>
      sanitizeInstalldir('../../etc', '12345', STEAMAPPS_DIR)
    ).toThrow(/\.\.\/\.\.\/etc/)
  })

  it('throws for an absolute-path candidate, naming it', () => {
    expect(() =>
      sanitizeInstalldir('/absolute/path', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
    expect(() =>
      sanitizeInstalldir('/absolute/path', '12345', STEAMAPPS_DIR)
    ).toThrow(/\/absolute\/path/)
  })

  it('throws for a forward-slash separator candidate ("foo/bar")', () => {
    expect(() =>
      sanitizeInstalldir('foo/bar', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
    expect(() =>
      sanitizeInstalldir('foo/bar', '12345', STEAMAPPS_DIR)
    ).toThrow(/foo\/bar/)
  })

  it('throws for a backslash separator candidate ("foo\\\\bar")', () => {
    expect(() =>
      sanitizeInstalldir('foo\\bar', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
  })

  it('throws for a bare ".." candidate', () => {
    expect(() => sanitizeInstalldir('..', '12345', STEAMAPPS_DIR)).toThrow(
      UnsafeInstalldirError
    )
  })

  it('throws for a leading-dot candidate (".hidden")', () => {
    expect(() =>
      sanitizeInstalldir('.hidden', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
  })

  it('throws for a trailing-dot candidate ("trailing.")', () => {
    expect(() =>
      sanitizeInstalldir('trailing.', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
  })

  it('throws for a newline control-character candidate ("Foo\\nbar")', () => {
    expect(() =>
      sanitizeInstalldir('Foo\nbar', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
  })

  it('throws for a NUL control-character candidate', () => {
    expect(() =>
      sanitizeInstalldir('Foo\u0000bar', '12345', STEAMAPPS_DIR)
    ).toThrow(UnsafeInstalldirError)
  })

  // Task 1 case (i), the belt-and-braces containment case: a candidate with
  // NO separator, no `..` segment, no leading/trailing dot and no control
  // character, that still resolves outside the root once resolved. On
  // POSIX (this platform), path.resolve(root, candidate) treats any single
  // path segment lacking a `/` as a literal child of root — there is no way
  // to construct such a candidate without ALSO tripping the separator/`..`
  // /dot/control-char denylist above. This is a STATED FINDING (see
  // 37-10-SUMMARY.md), not an assumption: the denylist already covers every
  // input that could reach the containment check with an escaping shape on
  // this platform, so no additional test case is added here.

  // ── FALLBACK — absent/whitespace candidate returns app_<id> WITHOUT
  //    throwing, and LOGS (D-04 second half — the branch that produced
  //    app_259130 with no log at all today). ──────────────────────────────

  it('D-04: undefined candidate falls back to app_<id> WITHOUT throwing, and LOGS a warning naming the appId and the fallback name', () => {
    jest.mocked(logWarning).mockClear()

    const result = sanitizeInstalldir(undefined, '259130', STEAMAPPS_DIR)

    expect(result).toBe('app_259130')
    expect(jest.mocked(logWarning)).toHaveBeenCalledWith(
      expect.stringContaining('259130'),
      expect.anything()
    )
    expect(jest.mocked(logWarning).mock.calls.at(-1)?.[0]).toEqual(
      expect.stringContaining('app_259130')
    )
  })

  it('D-04: whitespace-only candidate ("   ") falls back to app_<id> WITHOUT throwing, and LOGS a warning', () => {
    jest.mocked(logWarning).mockClear()

    const result = sanitizeInstalldir('   ', '259130', STEAMAPPS_DIR)

    expect(result).toBe('app_259130')
    expect(jest.mocked(logWarning)).toHaveBeenCalledWith(
      expect.stringContaining('259130'),
      expect.anything()
    )
  })
})

describe('classifyDepotError reachability — UnsafeInstalldirError (D-04, T-37-03)', () => {
  it('an UnsafeInstalldirError classifies as steam.download.error.unsafePath via the existing /traversal/i branch, with no change to depotErrors.ts', () => {
    let thrown: unknown
    try {
      sanitizeInstalldir('../../etc', '12345', join('/Steam', 'steamapps'))
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(UnsafeInstalldirError)
    expect(classifyDepotError(thrown).key).toBe(
      'steam.download.error.unsafePath'
    )
  })
})
