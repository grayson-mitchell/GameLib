/**
 * Phase 94 Plan 04 (D-03): moved here with `userAgent.ts` from `src/backend/humble/`. These are the
 * vectors the Rust user agent port (94-17) is pinned to; `standardBrowserUserAgent` is a `twin` row
 * of `humbleShortcutsShimSchedule.test.ts`, deletedBy 92.
 *
 * Pins `standardBrowserUserAgent(deps)`'s behavior when running against the REAL sidecar
 * `platform/index.ts` (Phase 34.4.1 Plan 02, Task 4, DEFECT 3).
 *
 * `standardBrowserUserAgent(deps)` (declared in `../userAgent.ts`) reads `app.userAgentFallback`
 * unconditionally. Real Electron populates that property at startup; `platform/index.ts` (the
 * sidecar's `require('electron')` replacement, installed by `bootstrap.ts`'s `Module._load`
 * hook) previously left it `undefined`, so this function threw
 * `Cannot read properties of undefined (reading 'replace')` the first time anything in the
 * sidecar called it -- silently aborting the Assumption-A4 smoke hook
 * (`sidecar/loginSeamRegistration.ts`) before `WebviewWindowBuilder::build()` was ever
 * reached. `humbleLoginFlows.test.ts` factory-mocks `standardBrowserUserAgent` entirely and so
 * never exercised the real implementation against the real stub -- this file closes that gap
 * directly.
 *
 * Unlike `humbleFlows.test.ts`/`humbleLoginFlows.test.ts` (which `jest.mock('electron', () =>
 * jest.requireActual('../../platform'))` to get a REAL ipcMain/app pair alongside a
 * lot of other sidecar wiring this file has no need for), this suite imports `platform/index.ts`
 * directly and mocks only the bare `'electron'` specifier to point at it -- `userAgent.ts`'s
 * only touchpoint is `app.userAgentFallback`.
 *
 * Phase 94 Plan 09: the last describe replays `golden/user_agent/*.json` (`{input, output}`), the
 * vectors `secretsAlerts.oracle.test.ts` records from this very function, so this file is the
 * TypeScript twin of the Rust port's vectors test (94-17) and the two cannot drift apart.
 */

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { standardBrowserUserAgent } from '../userAgent'
import { resolveAppInfo } from '../../host/appInfo'
import { assertAtOrAboveFloor } from '../../testUtils/censusFloor'

const deps = {
  appInfo: resolveAppInfo({
    platform: process.platform,
    osRelease: '',
    isPackaged: false
  })
}

describe('standardBrowserUserAgent(deps) against the real sidecar platformApi', () => {
  it('returns a Chrome-shaped UA string with no Electron/x.y.z token', () => {
    const ua = standardBrowserUserAgent(deps)

    // Happy-path shape produced by the UA template string in userAgent.ts -- proves
    // platformApi's `app.userAgentFallback` matched the platform-extraction regex in
    // userAgent.ts directly, rather than falling through to the defensive
    // `fallback.replace(...)` branch on line 33 (which is what threw before this fix).
    expect(ua).toMatch(
      /^Mozilla\/5\.0 \([^)]+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\S+ Safari\/537\.36$/
    )
    expect(ua).not.toMatch(/Electron\/\S+/)
  })

  it('does not throw (the DEFECT 3 regression: app.userAgentFallback was undefined)', () => {
    expect(() => standardBrowserUserAgent(deps)).not.toThrow()
  })

  it('carries a platform token matching the current process.platform, not a hardcoded macOS value', () => {
    const ua = standardBrowserUserAgent(deps)
    if (process.platform === 'darwin') {
      expect(ua).toContain('Macintosh')
    } else if (process.platform === 'win32') {
      expect(ua).toContain('Windows NT')
    } else {
      expect(ua).toContain('X11; Linux')
    }
  })
})

// -- the vectors the Rust port replays (94-09) ------------------------------------------------

const VECTORS_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-humble',
  'tests',
  'fixtures',
  'golden',
  'user_agent'
)
const VECTOR_FLOOR = 5

interface Vector {
  about: string
  input: { userAgentFallback: string }
  output: string
}

function readVectors(dir: string): { id: string; vector: Vector }[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name !== 'MANIFEST.json')
    .sort()
    .map((name) => ({
      id: name.slice(0, -'.json'.length),
      vector: JSON.parse(readFileSync(join(dir, name), 'utf8')) as Vector
    }))
}

describe('standardBrowserUserAgent(deps) against the recorded vectors', () => {
  const vectors = readVectors(VECTORS_DIR)

  it('scans at least the floor and agrees with the committed manifest', () => {
    assertAtOrAboveFloor('user-agent vectors', vectors.length, VECTOR_FLOOR)
    const manifest = JSON.parse(
      readFileSync(join(VECTORS_DIR, 'MANIFEST.json'), 'utf8')
    ) as { count: number; floor: number }
    expect(manifest.count).toBe(vectors.length)
    expect(manifest.floor).toBeGreaterThanOrEqual(VECTOR_FLOOR)
  })

  it('an empty vector list fails the floor', () => {
    expect(() =>
      assertAtOrAboveFloor('user-agent vectors', 0, VECTOR_FLOOR)
    ).toThrow(/below the floor/)
  })

  it.each(vectors.map(({ id, vector }) => [id, vector] as const))(
    '%s',
    (_id, vector) => {
      expect(
        standardBrowserUserAgent({
          appInfo: { userAgentFallback: vector.input.userAgentFallback }
        })
      ).toBe(vector.output)
    }
  )

  it('the vectors are not vacuous: some strip a token and some pass through unchanged', () => {
    const changed = vectors.filter(
      ({ vector }) => vector.output !== vector.input.userAgentFallback
    )
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.length).toBeLessThan(vectors.length)
  })
})
