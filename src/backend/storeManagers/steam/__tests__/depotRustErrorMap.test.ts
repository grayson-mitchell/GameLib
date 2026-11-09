// D-09: every Rust error kind in outcome.rs ERROR_KINDS must classify (key + action) the same
// as the legacy TS error for that failure.
import { readFileSync } from 'fs'
import { join } from 'path'
import { classifyDepotError } from '../depotErrors'
import { isDecodeStageError } from '../depotDecodeErrors'
import { isStallError } from 'backend/downloadmanager/installStallWatchdog'
import {
  rustFailureToError,
  rustOutcomeToDepotOutcome
} from '../depotRust/errorMap'
import {
  RUST_DEPOT_ERROR_KINDS,
  type RustErrorKind,
  type RustFailure,
  type RustOutcome
} from '../depotRust/types'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: new Proxy({}, { get: (_t, p) => String(p) })
}))

function failure(
  kind: RustErrorKind,
  over: Partial<RustFailure> = {}
): RustFailure {
  return {
    file: 'a/b.bin',
    kind,
    message: `rust says ${kind}`,
    code: null,
    eresult: null,
    httpStatus: null,
    scope: null,
    msSinceProgress: null,
    ...over
  }
}

function outcome(
  status: RustOutcome['status'],
  failures: RustFailure[] = []
): RustOutcome {
  return {
    jobId: 'j',
    status,
    failures,
    allFilesVerified: false,
    allModesApplied: false,
    attemptedDepots: [],
    acf: null,
    missing: null,
    files: null,
    stats: {
      bytesFetched: 0,
      chunksFetched: 0,
      containers: { vz: 0, vsza: 0, pk: 0 },
      machoExecApplied: 0,
      pathCollisions: 0,
      elapsedMs: 0
    }
  }
}

const withProps = (msg: string, props: object): Error =>
  Object.assign(new Error(msg), props)

// kind -> [rust failure, the legacy error the TS pipeline throws for the same failure]
const CASES: Record<RustErrorKind, [RustFailure, unknown]> = {
  // decompress.ts ChunkHttpError: `CDN 503`
  cdn_http: [failure('cdn_http', { httpStatus: 503 }), new Error('CDN 503')],
  // chunkDecode.ts ChunkDecodeError carries `.code`
  decode_failed: [
    failure('decode_failed', { code: 'unknown_container' }),
    withProps('chunk failed after 8 attempts', { code: 'unknown_container' })
  ],
  delta_unsupported: [
    failure('delta_unsupported'),
    new Error('delta updates unsupported')
  ],
  // Node fs error text
  disk_full: [
    failure('disk_full'),
    new Error('ENOSPC: no space left on device, write')
  ],
  io: [failure('io'), new Error('EACCES: permission denied')],
  manifest_decode: [
    failure('manifest_decode'),
    new Error('manifest payload could not be parsed')
  ],
  // plan.ts wrapDepotKeyError stamps `.eresult`
  manifest_unavailable: [
    failure('manifest_unavailable', { eresult: 9 }),
    withProps("couldn't get decryption key for depot 1", { eresult: 9 })
  ],
  network: [failure('network'), new Error('read ECONNRESET')],
  // contentServers.ts L121
  no_content_servers: [
    failure('no_content_servers'),
    new Error('downloadSteamDepots: no content servers available')
  ],
  // outcome.ts L192
  not_signed_in: [
    failure('not_signed_in'),
    new Error(
      'downloadSteamDepots: no authenticated Steam CM connection available for appId 1 (x)'
    )
  ],
  path_collision: [failure('path_collision'), new Error('path collision')],
  // download.ts PathTraversalError
  path_traversal: [
    failure('path_traversal'),
    new Error('path traversal rejected: ../x')
  ],
  // download.ts L873
  sha1_mismatch: [
    failure('sha1_mismatch'),
    new Error('downloadDepotFiles: whole-file SHA1 mismatch for x: a != b')
  ],
  size_mismatch: [
    failure('size_mismatch', { code: 'size_mismatch' }),
    withProps('chunk size mismatch', { code: 'size_mismatch' })
  ],
  // downloadFiles.ts run-scoped give-up
  stall: [
    failure('stall', { msSinceProgress: 480000, scope: 'run' }),
    withProps('download stalled: no forward progress', {
      isStall: true,
      msSinceProgress: 480000
    })
  ],
  symlink_failed: [failure('symlink_failed'), new Error('symlink failed')]
}

describe('D-09 Rust error kind map', () => {
  it('RUST_DEPOT_ERROR_KINDS equals outcome.rs ERROR_KINDS (anti-vacuity: >= 12)', () => {
    const src = readFileSync(
      join(
        __dirname,
        '../../../../../src-tauri/crates/gamelib-depot/src/outcome.rs'
      ),
      'utf-8'
    )
    const m = src.match(/pub const ERROR_KINDS: &\[&str\] = &\[([\s\S]*?)\];/)
    expect(m).not.toBeNull()
    const kinds = [...(m?.[1] ?? '').matchAll(/"([a-z0-9_]+)"/g)].map(
      (x) => x[1]
    )
    expect(kinds.length).toBeGreaterThanOrEqual(12)
    expect(kinds).toEqual([...RUST_DEPOT_ERROR_KINDS])
    expect(Object.keys(CASES).sort()).toEqual([...kinds].sort())
  })

  it.each(RUST_DEPOT_ERROR_KINDS)(
    '%s classifies like the legacy TS error',
    (kind) => {
      const [rust, legacy] = CASES[kind]
      const a = classifyDepotError(rustFailureToError(rust))
      const b = classifyDepotError(legacy)
      expect(a.key).toBe(b.key)
      expect(a.action).toBe(b.action)
    }
  )

  it('keeps the specific signals', () => {
    expect(rustFailureToError(failure('disk_full')).message).toContain('ENOSPC')
    expect(rustFailureToError(failure('path_traversal')).message).toContain(
      'traversal'
    )
    expect(rustFailureToError(failure('sha1_mismatch')).message).toContain(
      'sha1 mismatch'
    )
    const decode = rustFailureToError(failure('decode_failed'))
    expect(isDecodeStageError(decode)).toBe(true)
    const stall = rustFailureToError(
      failure('stall', { msSinceProgress: 1234 })
    )
    expect(isStallError(stall)).toBe(true)
    expect(isStallError(stall) && stall.msSinceProgress).toBe(1234)
    const blocked = classifyDepotError(
      rustFailureToError(failure('manifest_unavailable', { eresult: 40 }))
    )
    expect(blocked.key).toBe('steam.download.error.depotBlocked')
    expect(
      classifyDepotError(rustFailureToError(failure('not_signed_in'))).action
    ).toBe('signIn')
  })
})

describe('rustOutcomeToDepotOutcome', () => {
  it('maps completed and cancelled', () => {
    expect(rustOutcomeToDepotOutcome(outcome('completed'), ['5'])).toEqual({
      status: 'done',
      skippedDepots: ['5']
    })
    expect(rustOutcomeToDepotOutcome(outcome('cancelled'))).toEqual({
      status: 'cancelled',
      skippedDepots: undefined
    })
  })

  it('error: run-scoped failure beats a file-level one', () => {
    const o = rustOutcomeToDepotOutcome(
      outcome('error', [
        failure('sha1_mismatch'),
        failure('stall', { scope: 'run', msSinceProgress: 120000 })
      ])
    )
    expect(o.status).toBe('error')
    expect(o.errorAction).toBe('retry')
    expect(o.error).toBe(classifyDepotError(CASES.stall[1]).message)
    expect(o.error).not.toBe(classifyDepotError(CASES.sha1_mismatch[1]).message)
  })

  it('error: uses the classified message and action of the primary failure', () => {
    const o = rustOutcomeToDepotOutcome(
      outcome('error', [failure('not_signed_in')])
    )
    expect(o.errorAction).toBe('signIn')
    expect(o.error).toBeTruthy()
  })

  it('error with no failures still yields a generic error outcome', () => {
    const o = rustOutcomeToDepotOutcome(outcome('error'))
    expect(o.status).toBe('error')
    expect(o.errorAction).toBe('retry')
  })
})
