/**
 * Source-text structural gate for quick task 260819-r4r ("cache Steam
 * library on startup").
 *
 * What regressed: the Steam library cache (`store_cache/steam_library.json`,
 * key `games`) is written by `SteamLibraryManager.refresh()` and is
 * byte-for-byte the same `CacheStore` shape GOG/Epic/Amazon/Zoom already
 * use, but the renderer had NO WAY to read it. `BOOT_SET_CACHE_STORE_NAMES`
 * (storePolicy.ts) only listed `legendary_library` / `gog_library` /
 * `nile_library` / `zoom_library`; `steam_library` was absent from that
 * list, from the sidecar's `CACHE_BACKED_STORE_NAMES` read path
 * (handlers.ts), and from `src/frontend/helpers/electronStores.ts`
 * entirely. `GlobalState.tsx` hardcoded `steam: { library: [] }` in its
 * `state` field initialiser, so Steam was the only runner absent from the
 * synchronous pre-mount boot snapshot — its library stayed empty until the
 * async `pushGameToLibrary` event stream refilled it after a live CM sync.
 *
 * What this gate proves:
 *   Test 1 — the real `GlobalState.tsx` source seeds `steam.library` from
 *            `this.loadSteamLibrary()`, not `[]`.
 *   Test 2 — SELF-TEST (REQUIRED, anti-vacuity): the same matcher run
 *            against a synthetic OLD-shape source (`library: []`) MUST
 *            fail. A matcher that cannot fail against known-bad input is a
 *            vacuous gate — the exact lesson this project's own process
 *            history (Phase 34.2's four gap cycles) paid for.
 *   Test 3 — `loadSteamLibrary` is a PLAIN read: `steamLibraryStore.get(
 *            'games', [])` through `applyGameOverrides`, no filtering, no
 *            platform-verdict normalisation, no merge of a separate
 *            installed-games store (Steam has none — install state already
 *            lives inside the cached `GameInfo.install`).
 *   Test 4 — anti-drift: `steam_library` is present in all three mirrored
 *            registrations (`BOOT_SET_STORES`, `RECOGNIZED_CACHE_STORE_NAMES`,
 *            and the sidecar's unexported `CACHE_BACKED_STORE_NAMES` in
 *            `handlers.ts`, read from source since it is module-local) so
 *            the three copies cannot silently drift apart again.
 *   Test 5 — no credentials cross the boundary: `steam_library` is NOT in
 *            `STORE_ALLOWLIST`, and the renderer's `steamLibraryStore` is
 *            typed `CacheStore<GameInfo[], 'games'>` — the renderer-visible
 *            Steam surface is a `GameInfo` list, never `steamConfigStore`
 *            (which holds session/refresh-token state).
 *
 * `GlobalState.tsx` cannot be imported directly under this project's
 * `node`-environment frontend jest project: the module reads
 * `window.localStorage` at MODULE SCOPE, so a bare `import` throws `window
 * is not defined` before a single test could run. See the sibling
 * `GlobalStateSteamLogout.test.ts` for the established precedent of this
 * exact constraint and the source-text structural-gate idiom copied here
 * (readFileSync + stripSourceComments + a local balanced-brace
 * `extractBlock` helper, per that file's own local-helper convention).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  BOOT_SET_STORES,
  RECOGNIZED_CACHE_STORE_NAMES,
  STORE_ALLOWLIST
} from 'common/types/storePolicy'

const globalStatePath = join(__dirname, '..', 'GlobalState.tsx')
const electronStoresPath = join(__dirname, '..', '..', 'helpers', 'electronStores.ts')
const handlersPath = join(
  __dirname,
  '..',
  '..',
  '..',
  'backend',
  'sidecar',
  'handlers.ts'
)

/** Extracts the balanced-brace block body starting at the first `{` after `marker`. */
function extractBlock(source: string, marker: string): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(`marker not found: ${marker}`)
  }
  const braceStart = source.indexOf('{', markerIdx)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(braceStart, i + 1)
}

/**
 * Extracts the balanced-bracket array literal body starting at the first
 * `[` AFTER the full `marker` text (not from its start) — `marker` here is
 * `'NAME: readonly string[] = '`, which itself contains a `[` as part of
 * the `string[]` type annotation. Searching from `markerIdx` (rather than
 * `markerIdx + marker.length`) would match THAT bracket and immediately
 * close on the very next `]`, silently extracting the 2-character type
 * annotation instead of the array literal.
 */
function extractArrayBlock(source: string, marker: string): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(`marker not found: ${marker}`)
  }
  const bracketStart = source.indexOf('[', markerIdx + marker.length)
  let depth = 0
  let i = bracketStart
  for (; i < source.length; i++) {
    if (source[i] === '[') depth++
    else if (source[i] === ']') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(bracketStart, i + 1)
}

/**
 * The gate under test: the `steam:` state-field-initialiser slice's
 * `library` value must be a `this.loadSteamLibrary(` call, not a hardcoded
 * `[]`. Scoped to the `state: StateProps = {...}` block first (rather than
 * matching the first `steam: ` anywhere in the file) because `steam: ` also
 * appears in the `StateProps` TYPE definition above it — a plain
 * `extractBlock(source, 'steam: ')` would silently match that interface's
 * `steam: { library: GameInfo[]; ... }` shape instead of the runtime
 * initialiser, which is a structurally invalid gate.
 */
function steamSliceSeedsFromLoader(strippedSource: string): boolean {
  let stateBlock: string
  try {
    stateBlock = extractBlock(strippedSource, 'state: StateProps = ')
  } catch {
    return false
  }

  let steamBlock: string
  try {
    steamBlock = extractBlock(stateBlock, 'steam: ')
  } catch {
    return false
  }

  return /library:\s*this\.loadSteamLibrary\(/.test(steamBlock)
}

describe('GlobalState.tsx steam.library — seeded synchronously from the persisted cache (quick-260819-r4r)', () => {
  const rawGlobalState = readFileSync(globalStatePath, 'utf-8')
  const strippedGlobalState = stripSourceComments(rawGlobalState)

  it('Test 1: the real source seeds steam.library from this.loadSteamLibrary(), not []', () => {
    expect(steamSliceSeedsFromLoader(strippedGlobalState)).toBe(true)
  })

  it('Test 2 (SELF-TEST / anti-vacuity, REQUIRED): the matcher REJECTS the old regressed shape (library: [])', () => {
    const regressedShape = [
      'interface StateProps {',
      '  steam: {',
      '    library: GameInfo[]',
      '    username?: string | null',
      '  }',
      '}',
      'class GlobalState {',
      '  state: StateProps = {',
      '    steam: {',
      '      library: [],',
      "      username: steamConfigStore.get_nodefault('userData')?.username",
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(steamSliceSeedsFromLoader(regressedShape)).toBe(false)
  })

  it('Test 2b (positive control): the matcher ACCEPTS the exact shape the fix produces, ignoring the earlier interface steam: shape', () => {
    const fixedShape = [
      'interface StateProps {',
      '  steam: {',
      '    library: GameInfo[]',
      '    username?: string | null',
      '  }',
      '}',
      'class GlobalState {',
      '  state: StateProps = {',
      '    steam: {',
      '      library: this.loadSteamLibrary(),',
      "      username: steamConfigStore.get_nodefault('userData')?.username",
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(steamSliceSeedsFromLoader(fixedShape)).toBe(true)
  })

  it('Test 3: loadSteamLibrary is a plain read through steamLibraryStore.get(games, []) + applyGameOverrides', () => {
    const block = extractBlock(strippedGlobalState, 'loadSteamLibrary = (')

    expect(/steamLibraryStore\.get\(\s*'games',\s*\[\]\s*\)/.test(block)).toBe(
      true
    )
    expect(/applyGameOverrides\(/.test(block)).toBe(true)
    // Must NOT normalise/derive a platform verdict or merge a separate
    // installed-games store — Steam has no analogue of
    // gogInstalledGamesStore; install state already lives on the cached
    // GameInfo.
    expect(/InstalledGamesStore/.test(block)).toBe(false)
    expect(/readonly-macos/.test(block)).toBe(false)
  })

  it('Test 4: steam_library is registered in all three mirrored lists (anti-drift)', () => {
    expect(BOOT_SET_STORES).toContain('steam_library')
    expect(RECOGNIZED_CACHE_STORE_NAMES).toContain('steam_library')

    const rawHandlers = readFileSync(handlersPath, 'utf-8')
    const strippedHandlers = stripSourceComments(rawHandlers)
    const cacheBackedBlock = extractArrayBlock(
      strippedHandlers,
      'CACHE_BACKED_STORE_NAMES: readonly string[] = '
    )
    expect(/'steam_library'/.test(cacheBackedBlock)).toBe(true)
  })

  it('Test 5: steam_library carries no credential surface — absent from STORE_ALLOWLIST, and the renderer store is a GameInfo CacheStore', () => {
    expect(Object.keys(STORE_ALLOWLIST)).not.toContain('steam_library')

    const rawElectronStores = readFileSync(electronStoresPath, 'utf-8')
    const strippedElectronStores = stripSourceComments(rawElectronStores)

    expect(
      /steamLibraryStore\s*=\s*new CacheStore<GameInfo\[\],\s*'games'>\(\s*'steam_library'/.test(
        strippedElectronStores
      )
    ).toBe(true)
  })
})
