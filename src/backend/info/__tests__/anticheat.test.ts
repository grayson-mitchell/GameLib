import {
  anticheatDownload,
  anticheatStatus,
  gameAnticheatInfo
} from '../anticheat'
import {
  RUST_INFO_ANTICHEAT_DOWNLOAD,
  RUST_INFO_ANTICHEAT_INFO,
  RUST_INFO_ANTICHEAT_STATUS
} from 'common/types/sidecarTransport'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/** A fake transport that records the channel and arguments and answers with `answer` or a rejection. */
function fakeDeps(answer: unknown = undefined): {
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

describe('anticheatStatus shim', () => {
  it('sends exactly RUST_INFO_ANTICHEAT_STATUS with the hash argument and resolves the answer', async () => {
    const { deps, calls } = fakeDeps({ needed: true })
    await expect(
      anticheatStatus(deps, { latestFileHash: 'abc' })
    ).resolves.toEqual({ needed: true })
    expect(calls).toEqual([
      [RUST_INFO_ANTICHEAT_STATUS, [{ latestFileHash: 'abc' }]]
    ])
  })

  it('sends an empty object when the releases file named no hash', async () => {
    const { deps, calls } = fakeDeps({ needed: true })
    await anticheatStatus(deps, {})
    expect(calls).toEqual([[RUST_INFO_ANTICHEAT_STATUS, [{}]]])
  })

  it('carries the Rust rejection to the caller, which the listener guards', async () => {
    const { deps } = fakeDeps(new Error('unreadable'))
    await expect(anticheatStatus(deps, {})).rejects.toThrow('unreadable')
  })
})

describe('anticheatDownload shim', () => {
  it('sends exactly RUST_INFO_ANTICHEAT_DOWNLOAD with one empty object and resolves the answer', async () => {
    const { deps, calls } = fakeDeps({ written: false, warning: 'offline' })
    await expect(anticheatDownload(deps)).resolves.toEqual({
      written: false,
      warning: 'offline'
    })
    expect(calls).toEqual([[RUST_INFO_ANTICHEAT_DOWNLOAD, [{}]]])
  })
})

describe('gameAnticheatInfo shim', () => {
  it('sends exactly RUST_INFO_ANTICHEAT_INFO with the namespace and resolves the answer', async () => {
    const entry = { title: 'Quail', status: 'Denied' }
    const { deps, calls } = fakeDeps(entry)
    await expect(gameAnticheatInfo(deps, 'quailns')).resolves.toEqual(entry)
    expect(calls).toEqual([
      [RUST_INFO_ANTICHEAT_INFO, [{ appNamespace: 'quailns' }]]
    ])
  })

  it('passes an undefined namespace through for Rust to answer null', async () => {
    const { deps, calls } = fakeDeps(null)
    await expect(gameAnticheatInfo(deps, undefined)).resolves.toBeNull()
    expect(calls).toEqual([
      [RUST_INFO_ANTICHEAT_INFO, [{ appNamespace: undefined }]]
    ])
  })
})

describe('the shim arguments satisfy the Rust invoke schemas', () => {
  it('accepts what each shim sends and rejects an unknown field', () => {
    expect(
      rustInvokeArgs[RUST_INFO_ANTICHEAT_STATUS].safeParse([
        { latestFileHash: 'abc' }
      ]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_INFO_ANTICHEAT_STATUS].safeParse([{}]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_INFO_ANTICHEAT_DOWNLOAD].safeParse([{}]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_INFO_ANTICHEAT_INFO].safeParse([
        { appNamespace: 'quailns' }
      ]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_INFO_ANTICHEAT_INFO].safeParse([{ other: 1 }]).success
    ).toBe(false)
  })
})
