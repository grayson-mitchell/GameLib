/**
 * Electron-untouched byte-comparison proof (Phase 28 Plan 05).
 *
 * ── STRICTLY READ-ONLY. DO NOT ADD `.set()`/`.delete()`/`.clear()` CALLS HERE. ──
 * A previous version of this suite snapshotted the real store in `beforeAll` and
 * restored it in `afterAll`, seeding a synthetic write when no token was present.
 * That restore never ran when the Jest worker was force-killed (this repo has a
 * known leaked-timer crash in `storeManagers/steam/library.ts` that does exactly
 * that), and it permanently destroyed a real developer's Steam session — their
 * refresh token was wiped and `config.json` was left as `{}`. This suite must
 * never write to the real store again, under any code path, for any reason.
 *
 * Covers REQ-28-02/REQ-28-04/D-04: the sidecar's `SidecarKeyringTokenStore` — and the
 * `TokenStore` seam that selects it in a sidecar build — must never write, mutate, or delete
 * anything in the shared Electron `configStore`. This suite drives the REAL (unmocked)
 * `configStore` from `../../storeManagers/steam/electronStores` — the exact module instance
 * `user.ts`/`tokenStore.ts` read/write in production — while faking `requestRustInvoke` (no
 * real Rust process exists in Jest) so every one of `SidecarKeyringTokenStore`'s four
 * operations, success and failure, actually runs.
 *
 * **Load-bearing real-config-directory convention** (mirrors `skeletonFlows.test.ts`'s module
 * docstring and Test 4): `pathShim.ts` has no `HOME`/`XDG_CONFIG_HOME`/`APPDATA` override for
 * darwin, so `configStore` reads/writes the developer's REAL
 * `~/Library/Application Support/GameLib/steam_store/config.json` — NOT `steamConfigStore.json`
 * (the store's `name` argument, `'steamConfigStore'`, is never forwarded into electron-store's
 * real `Store` options by `TypeCheckedStoreBackend`'s constructor — only `{ cwd: 'steam_store' }`
 * is, so electron-store falls back to its own default filename, `config.json`). Because this
 * suite may run against real user data, it only ever READS that file — never snapshots-and-
 * restores it. Safety is proven by comparing the file's raw bytes (`fs.readFileSync`) before and
 * after driving the sidecar; reading is inherently safe, so there is nothing to restore.
 *
 * The last two `it`s in the main describe below are a by-construction source gate
 * (T-28-01/T-28-09): they read the sidecar's own source files with comments stripped and
 * assert the forbidden identifiers/lie never reappear, so a regression fails this automated
 * suite rather than relying on code review.
 *
 * The Steam-token-surface gate (quick-260909-iz2) encodes D-04's BINDING-level constraint:
 * `keyringTokenStore.ts` and `bootstrap.ts` may not bind `configStore`, `TOKEN_STORE_KEY`,
 * `TOKEN_PREFIX` or `ElectronTokenStore` from the Steam token surface
 * (`storeManagers/steam/{electronStores,tokenStore,constants}`, and its sibling `./` form), and
 * may not name `TOKEN_STORE_KEY`/`TOKEN_PREFIX` at all, anywhere. It used to be a bare
 * `configStore` substring ban across the whole file, which was wrong: `bootstrap.ts:100`'s
 * unrelated Epic/GOG `import { configStore } from '../constants/key_value_stores'` -- used only
 * for `configStore.delete('userInfo')` at `:431`, an Epic user record and not a token --
 * convicted correct code and held the whole Backend suite red (landed by `204025b39`). The
 * narrowing is proven, not merely asserted: the separate `steam token surface binding gate
 * helper` describe below drives the same `findSteamTokenSurfaceViolations` helper against
 * synthetic sources and pins that a real Steam-surface `configStore` import -- direct, aliased,
 * via `require()`, or via dynamic `import()` -- still trips. Anyone narrowing this gate again
 * must extend that guard block, not just this one; a negative gate narrowed by region without a
 * proof leaves a widening blind spot.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments as stripComments,
  stripTrailingLineCommentTs
} from 'backend/testUtils/stripSourceComments'

// ── electron / electron-store — route Jest's own module resolution at the REAL
// sidecar shims (mirrors skeletonFlows.test.ts): without this, Jest's automatic
// backend-wide manual mock (`src/backend/__mocks__/electron.ts`, tmpdir-backed)
// would apply instead, and this suite would only prove a synthetic store is
// untouched, not the actual production `configStore` file path a compiled
// sidecar/Electron build shares (`~/Library/Application Support/GameLib/...`
// via `pathShim.ts` -- the whole point of D-04's proof). `jest.requireActual`
// resolves the SAME singleton module instance `configStore`/`tokenStore.ts`
// bind onto in production. ────────────────────────────────────────────────
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── sidecarRpc mock — fake Rust responder, in-memory program + call log ─────
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── logger mock — mirrors keyringTokenStore.test.ts's existing convention ──
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  // `SidecarKeyringSlotStore` logs cache-hit lines at DEBUG (F-34.5-G6-26); this suite drives
  // that class directly, so the mock must supply `logDebug` or a cached read throws.
  logDebug: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend',
    Gog: 'Gog',
    Legendary: 'Legendary',
    Nile: 'Nile',
    Sideload: 'Sideload',
    Zoom: 'Zoom'
  }
}))

// ── Imports (after mocks) — configStore is the REAL, unmocked module ───────
import { requestRustInvoke } from '../sidecarRpc'
import { SidecarKeyringTokenStore } from '../keyringTokenStore'
import { configStore as steamConfigStore } from '../../storeManagers/steam/electronStores'
import {
  setTokenStore,
  getTokenStore,
  ElectronTokenStore
} from '../../storeManagers/steam/tokenStore'
// Real (unmocked) pathShim — same module electronStub.ts / fileStore.ts resolve
// paths through in production, used here ONLY to compute the real store file's
// path for a read-only byte comparison. Never used to write.
import { getPath } from '../pathShim'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: Record<string, ProgrammedOutcome> = {}

function programChannel(channel: string, outcome: ProgrammedOutcome): void {
  program[channel] = outcome
}

function programAllReject(message: string): void {
  for (const channel of [
    'keyring_get',
    'keyring_set',
    'keyring_delete',
    'keyring_available'
  ]) {
    programChannel(channel, { type: 'reject', error: new Error(message) })
  }
}

function programAllResolve(): void {
  programChannel('keyring_get', {
    type: 'resolve',
    value: 'sidecar-only-token'
  })
  programChannel('keyring_set', { type: 'resolve', value: true })
  programChannel('keyring_delete', { type: 'resolve', value: true })
  programChannel('keyring_available', { type: 'resolve', value: true })
}

function fullSnapshot(): string {
  return JSON.stringify(steamConfigStore.raw_store)
}

function currentRefreshToken(): string | undefined {
  return steamConfigStore.get_nodefault('refreshToken')
}

// ── Real store file byte-comparison (read-only) ─────────────────────────────
// Mirrors fileStore.ts's own `resolveStorePath`: name is never forwarded by
// `TypeCheckedStoreBackend`, so electron-store's default filename applies.
const REAL_STORE_PATH = join(getPath('userData'), 'steam_store', 'config.json')

/**
 * Reads the real on-disk store file's raw bytes, or `null` if it does not
 * exist (the user's current state, and a fully valid "nothing to compare
 * against went wrong" state). NEVER creates, writes, or deletes the file.
 */
function readRealStoreFileBytes(): Buffer | null {
  if (!existsSync(REAL_STORE_PATH)) return null
  return readFileSync(REAL_STORE_PATH)
}

let storeBytesBeforeSuite: Buffer | null

beforeAll(() => {
  // Read-only snapshot for the whole-suite byte-identity proof below. No
  // `.set()`/`.delete()`/`.clear()` call exists anywhere in this file.
  storeBytesBeforeSuite = readRealStoreFileBytes()
})

beforeEach(() => {
  program = {}
  // resetMocks: true wipes even a factory-supplied implementation before every test (the
  // same gotcha keyringTokenStore.test.ts documents) — re-wire the fake responder here.
  mockRequestRustInvoke.mockImplementation(
    (channel: string, _args: unknown[]) => {
      const outcome = program[channel]
      if (!outcome) {
        return Promise.reject(
          new Error(`no outcome programmed for channel: ${channel}`)
        )
      }
      return outcome.type === 'resolve'
        ? Promise.resolve(outcome.value)
        : Promise.reject(outcome.error)
    }
  )
})

// ── D-04 binding-level gate helper (quick-260909-iz2) ───────────────────────
// D-04's actual wording is narrower than a bare `configStore` substring ban:
// "the sidecar must never write TOKEN_STORE_KEY into the shared configStore"
// — the STEAM store from `storeManagers/steam/electronStores`. A bare-substring
// ban also convicts `bootstrap.ts`'s unrelated Epic/GOG
// `import { configStore } from '../constants/key_value_stores'` (used only for
// `configStore.delete('userInfo')`, an Epic user record, not a token), which is
// why that ban held the whole Backend suite red. This helper instead bans
// BINDING one of these four names from a Steam-token-surface module specifier.
const BANNED_STEAM_TOKEN_BINDINGS = [
  // The Steam electronStores singleton itself -- the shared store D-04 forbids
  // the sidecar from writing into.
  'configStore',
  // Unique to the Steam token surface (src/backend/storeManagers/steam/constants.ts:15-16) --
  // a bare-anywhere ban on these two is exact, no binding-level reasoning needed.
  'TOKEN_STORE_KEY',
  'TOKEN_PREFIX',
  // `ElectronTokenStore` is the ACTUAL WRITER of TOKEN_STORE_KEY --
  // `storeManagers/steam/tokenStore.ts:188` does
  // `configStore.set(TOKEN_STORE_KEY, this.encryptToken(token))` inside its
  // `setToken()`. Installing this class inside the sidecar would violate D-04
  // directly, so binding it from the Steam token surface is banned too.
  'ElectronTokenStore'
]

// Steam token surface specifiers, and ONLY these -- everything else (in
// particular `../constants/key_value_stores` and any `storeManagers/<other-runner>/...`
// path such as GOG's `electronStores`) is deliberately out of scope.
const STEAM_TOKEN_SURFACE_SPECIFIER =
  /(?:^|\/)storeManagers\/steam\/(?:electronStores|tokenStore|constants)(?:\.(?:ts|js|mts|cts))?$|^\.\/(?:electronStores|tokenStore|constants)(?:\.(?:ts|js|mts|cts))?$/

// Matches: `import [type] <clause> from '<spec>'`, allowing the clause to span
// multiple lines (bootstrap.ts has multi-line brace imports).
const STATIC_IMPORT_RE =
  /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g
// Matches: `<decl> <lhs> = require('<spec>')`.
const REQUIRE_RE =
  /(?:const|let|var)\s+([\s\S]*?)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g
// Matches: `<decl> <lhs> = [await] import('<spec>')`.
const DYNAMIC_IMPORT_RE =
  /(?:const|let|var)\s+([\s\S]*?)\s*=\s*(?:await\s+)?import\(\s*['"]([^'"]+)['"]\s*\)/g

/**
 * Extracts the bindings a single import/require/dynamic-import clause
 * introduces. Matches on the imported name -- the identifier LEFT of `as` in
 * an import clause, and LEFT of `:` in a require/dynamic-import destructuring
 * -- so aliasing cannot evade the gate. A whole-module binding (`* as X`,
 * `import X from ...`, `const X = require(...)` with no destructuring) binds
 * every export, including the banned four, and is flagged as such.
 */
function extractBindings(clause: string): {
  wholeModule: boolean
  names: string[]
} {
  const trimmed = clause.trim()
  if (trimmed.startsWith('*')) {
    return { wholeModule: true, names: [] }
  }
  const braceMatch = trimmed.match(/\{([\s\S]*)\}/)
  if (!braceMatch) {
    // No destructuring at all -- a bare identifier binds the whole module.
    return { wholeModule: true, names: [] }
  }
  const names: string[] = []
  for (const rawSegment of braceMatch[1].split(',')) {
    const segment = rawSegment
      .trim()
      .replace(/^type\s+/, '')
      .trim()
    if (!segment) continue
    const asMatch = segment.match(/^(\S+)\s+as\s+\S+$/)
    const colonMatch = segment.match(/^(\S+)\s*:\s*\S+$/)
    if (asMatch) {
      names.push(asMatch[1])
    } else if (colonMatch) {
      names.push(colonMatch[1])
    } else {
      names.push(segment)
    }
  }
  // Anything before the opening brace (e.g. `Def, { a, b }`) is a default
  // import alongside the named ones -- that default binding is whole-module.
  const beforeBrace = trimmed
    .slice(0, trimmed.indexOf('{'))
    .replace(/,\s*$/, '')
    .trim()
  return { wholeModule: beforeBrace.length > 0, names }
}

/**
 * D-04's binding-level source gate (quick-260909-iz2). Takes source TEXT (not
 * a path) so guard tests can drive it against synthetic sources. Returns a
 * list of human-readable violation strings; an empty array means clean.
 *
 * Rule A -- bare identifier ban: after comment stripping, `TOKEN_STORE_KEY` or
 * `TOKEN_PREFIX` anywhere in the source is a violation. Both names are unique
 * to the Steam token surface, so a bare-anywhere ban is exact for them.
 * `configStore` is deliberately NOT part of this rule -- that is the whole
 * narrowing this gate exists to make.
 *
 * Rule B -- binding-level ban: no import / `require(...)` / dynamic
 * `import(...)` whose SPECIFIER names the Steam token surface may bind
 * `configStore`, `TOKEN_STORE_KEY`, `TOKEN_PREFIX` or `ElectronTokenStore`
 * (directly, aliased, or via a whole-module binding).
 */
function findSteamTokenSurfaceViolations(
  source: string,
  label: string
): string[] {
  const normalized = stripComments(source)
    .split('\n')
    .map((line) => stripTrailingLineCommentTs(line))
    .join('\n')

  const violations: string[] = []

  // Rule A.
  if (/\bTOKEN_STORE_KEY\b/.test(normalized)) {
    violations.push(
      `${label}: bare identifier TOKEN_STORE_KEY appears in source`
    )
  }
  if (/\bTOKEN_PREFIX\b/.test(normalized)) {
    violations.push(`${label}: bare identifier TOKEN_PREFIX appears in source`)
  }

  // Rule B.
  for (const re of [STATIC_IMPORT_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(normalized)) !== null) {
      const [, clause, specifier] = match
      if (!STEAM_TOKEN_SURFACE_SPECIFIER.test(specifier)) continue
      const { wholeModule, names } = extractBindings(clause)
      if (wholeModule) {
        violations.push(
          `${label}: whole-module binding of Steam token surface '${specifier}' (binds every export, including ${BANNED_STEAM_TOKEN_BINDINGS.join(', ')})`
        )
        continue
      }
      for (const name of names) {
        if (BANNED_STEAM_TOKEN_BINDINGS.includes(name)) {
          violations.push(
            `${label}: binds banned '${name}' from Steam token surface '${specifier}'`
          )
        }
      }
    }
  }

  return violations
}

describe('steam token surface binding gate helper', () => {
  it('trips on a real Steam electronStores configStore import (a)', () => {
    const src = `import { configStore } from '../storeManagers/steam/electronStores'\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).not.toEqual([])
  })

  it('trips on an ALIASED configStore import (aliasing does not evade) (b)', () => {
    const src = `import { configStore as steamStore } from './electronStores'\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).not.toEqual([])
  })

  it('trips on a synthetic configStore.set(TOKEN_STORE_KEY, x) body (c)', () => {
    const src = `configStore.set(TOKEN_STORE_KEY, x)\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).not.toEqual([])
  })

  it('does NOT trip on the real Epic/GOG constants/key_value_stores import (d)', () => {
    const src = `import { configStore } from '../constants/key_value_stores'\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).toEqual([])
  })

  it('trips on a require() destructure of configStore from the Steam surface (e)', () => {
    const src = `const { configStore } = require('../storeManagers/steam/electronStores')\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).not.toEqual([])
  })

  it('trips on a dynamic import() destructure of configStore from the Steam surface (f)', () => {
    const src = `const { configStore } = await import('./electronStores')\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).not.toEqual([])
  })

  it('does NOT trip on the real D-04 seam import of setTokenStore (g)', () => {
    const src = `import { setTokenStore as installTokenStore } from '../storeManagers/steam/tokenStore'\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).toEqual([])
  })

  it('does NOT trip on a real type-only TokenStore import (h)', () => {
    const src = `import type { TokenStore } from 'backend/storeManagers/steam/tokenStore'\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).toEqual([])
  })

  it('does NOT trip on a real GOG electronStores import (i)', () => {
    const src = `import { playtimeSyncQueue } from '../storeManagers/gog/electronStores'\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).toEqual([])
  })

  it('does NOT trip on a trailing-comment-only mention (proves the trailing-comment strip is wired) (j)', () => {
    const src = `const foo = 1 // import { configStore } from './electronStores'\n`
    expect(findSteamTokenSurfaceViolations(src, 'synthetic')).toEqual([])
  })
})

describe('Electron-untouched byte-comparison proof (D-04, REQ-28-02/REQ-28-04)', () => {
  it('setToken() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.setToken('sidecar-only-token')

    expect(currentRefreshToken()).toBe(before)
  })

  it('getToken() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    const result = await store.getToken()

    expect(result).toBe('sidecar-only-token')
    expect(currentRefreshToken()).toBe(before)
  })

  it('clearToken() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.clearToken()

    expect(currentRefreshToken()).toBe(before)
  })

  it('isAvailable() leaves configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.isAvailable()

    expect(currentRefreshToken()).toBe(before)
  })

  it('all four operations in sequence leave configStore.refreshToken byte-identical (===)', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.setToken('sidecar-only-token')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    expect(currentRefreshToken()).toBe(before)
  })

  it('every failure path (all four keyring channels rejecting) writes nothing to configStore', async () => {
    programAllReject('keyring:unavailable:PlatformFailure')
    const before = currentRefreshToken()
    const store = new SidecarKeyringTokenStore()

    await store.setToken('should-never-persist')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    expect(currentRefreshToken()).toBe(before)
  })

  it('the full serialized configStore snapshot is unchanged across success and failure sequences (no collateral key writes)', async () => {
    const beforeFull = fullSnapshot()

    programAllResolve()
    const store = new SidecarKeyringTokenStore()
    await store.setToken('sidecar-only-token')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    programAllReject('keyring:unavailable:NoStorageAccess')
    await store.setToken('should-never-persist')
    await store.getToken()
    await store.isAvailable()
    await store.clearToken()

    expect(fullSnapshot()).toBe(beforeFull)
  })

  it('the TokenStore seam (setTokenStore/getTokenStore), not just the class directly, leaves configStore byte-identical', async () => {
    programAllResolve()
    const before = currentRefreshToken()
    const beforeFull = fullSnapshot()

    try {
      setTokenStore(new SidecarKeyringTokenStore())
      // This is the exact call path user.ts's getCredentials()/finishAuth() use in
      // production — proving the SEAM is safe, not merely the class in isolation.
      await getTokenStore().setToken('sidecar-only-token')
      await getTokenStore().getToken()
      await getTokenStore().clearToken()
    } finally {
      setTokenStore(new ElectronTokenStore())
    }

    expect(currentRefreshToken()).toBe(before)
    expect(fullSnapshot()).toBe(beforeFull)
  })

  it('the real store file on disk is byte-identical before and after the whole suite (fs.readFileSync proof)', () => {
    // Stronger evidence than the in-memory `raw_store` projection above: reads
    // the actual bytes electron-store persisted to disk. Absence-before /
    // absence-after (the user's current state) is a valid pass; so is
    // identical-bytes-before / identical-bytes-after.
    const after = readRealStoreFileBytes()

    if (storeBytesBeforeSuite === null) {
      expect(after).toBeNull()
    } else {
      expect(after).not.toBeNull()
      expect((after as Buffer).equals(storeBytesBeforeSuite)).toBe(true)
    }
  })

  it('by-construction gate: keyringTokenStore.ts and bootstrap.ts never bind the Steam token surface -- D-04, comments stripped', () => {
    const files = [
      join(__dirname, '../keyringTokenStore.ts'),
      join(__dirname, '../bootstrap.ts')
    ]
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      const violations = findSteamTokenSurfaceViolations(source, file)
      expect(violations).toEqual([])
    }
  })

  it('by-construction gate: electronStub.ts safeStorage.isEncryptionAvailable never regresses to the "always true" lie (comments stripped)', () => {
    const src = readFileSync(
      join(__dirname, '../../platform/index.ts'),
      'utf-8'
    )
    const stripped = stripComments(src)
    expect(stripped).not.toMatch(
      /isEncryptionAvailable:\s*\(\):\s*boolean\s*=>\s*true/
    )
  })
})

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.
