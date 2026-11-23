/**
 * 86-27 (WR-41): the umu id lookup behind a Linux GOG, Epic or Amazon launch is best-effort. The Rust
 * round trip can reject (`:store-unavailable`, `:store-write`, `:not-ready`, the 60 s rustInvoke
 * timeout), and the TS lookup never blocked a launch on a failed fetch. `resolveLaunchUmuId` keeps the
 * shim one typed call (D-06) and puts the isolation at the caller.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as logger from 'backend/logger'
import { REPO_ROOT } from 'backend/testUtils/infoPortGate'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_INFO_UMU_GET } from 'common/types/sidecarTransport'
import { resolveLaunchUmuId } from '../umuGameId'

function fakeDeps(answer: unknown = null): {
  deps: RustInvokeDeps
  calls: unknown[][]
} {
  const calls: unknown[][] = []
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  return { deps: { requestRustInvoke }, calls }
}

describe('resolveLaunchUmuId (WR-41)', () => {
  let warn: jest.SpyInstance
  beforeEach(() => {
    warn = jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('WR-41: resolves what Rust answered, with exactly one RUST_INFO_UMU_GET call', async () => {
    const { deps, calls } = fakeDeps('umu-1234')
    await expect(resolveLaunchUmuId(deps, 'Quail', 'legendary')).resolves.toBe(
      'umu-1234'
    )
    expect(calls).toEqual([
      [RUST_INFO_UMU_GET, [{ appName: 'Quail', runner: 'legendary' }]]
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('WR-41: resolves null when Rust answers null', async () => {
    await expect(
      resolveLaunchUmuId(fakeDeps(null).deps, 'Quail', 'gog')
    ).resolves.toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('WR-41: resolves null, never rejects, and logs one warning when the call rejects', async () => {
    const failure = new Error('info_umu_get:store-unavailable')
    await expect(
      resolveLaunchUmuId(fakeDeps(failure).deps, 'Quail', 'nile')
    ).resolves.toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    const [parts] = warn.mock.calls[0] as [unknown[]]
    expect(parts).toContain(failure)
  })

  it('WR-41: resolves null when the call rejects with the transport timeout', async () => {
    const timeout = new Error('rustInvoke timed out after 60000ms')
    await expect(
      resolveLaunchUmuId(fakeDeps(timeout).deps, 'Quail', 'legendary')
    ).resolves.toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

// WR-41 source gate: the three launch() bodies reach the umu id only through the best-effort helper.
const MANAGERS = [
  'src/backend/storeManagers/gog/games.ts',
  'src/backend/storeManagers/legendary/games.ts',
  'src/backend/storeManagers/nile/games.ts'
] as const

const DIRECT_SHIM_CALL = /\bgetUmuId\s*\(/
const WIKI_IMPORT =
  /from\s+['"](?:backend|\.{1,2})\/(?:[\w./-]*\/)?info\/wiki['"]/
const HELPER_CALL = /\bresolveLaunchUmuId\s*\(/

function violations(source: string): string[] {
  const code = stripSourceComments(source)
  const found: string[] = []
  if (DIRECT_SHIM_CALL.test(code)) found.push('direct getUmuId call')
  if (WIKI_IMPORT.test(code)) found.push('info/wiki import')
  if (!HELPER_CALL.test(code)) found.push('no resolveLaunchUmuId call')
  return found
}

describe('launch() umu id source gate (WR-41)', () => {
  it('WR-41: the detector flags a planted direct shim call and a planted import, not the helper', () => {
    expect(
      violations(
        `const x = await getUmuId(d, 'a', 'gog')\nresolveLaunchUmuId(d)`
      )
    ).toEqual(['direct getUmuId call'])
    expect(
      violations(
        `import { getUmuId } from 'backend/info/wiki'\nresolveLaunchUmuId(d)`
      )
    ).toEqual(['info/wiki import'])
    expect(
      violations(`const x = await resolveLaunchUmuId(d, 'a', 'gog')`)
    ).toEqual([])
    expect(violations(`// getUmuId(d)\nresolveLaunchUmuId(d)`)).toEqual([])
  })

  it('WR-41: the gate reads all three store managers', () => {
    expect(MANAGERS).toHaveLength(3)
  })

  it.each(MANAGERS)(
    'WR-41: %s imports and calls resolveLaunchUmuId, never the shim',
    (path) => {
      const source = readFileSync(join(REPO_ROOT, path), 'utf8')
      expect(violations(source)).toEqual([])
      expect(
        stripSourceComments(source).includes(
          'storeManagers/storeManagerCommon/umuGameId'
        )
      ).toBe(true)
    }
  )
})
