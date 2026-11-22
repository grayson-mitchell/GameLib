import {
  attachOverrides,
  getAllGameOverrides,
  getGameOverrides,
  setGameOverrides
} from '../gameOverrides'
import {
  RUST_INFO_OVERRIDES_ATTACH,
  RUST_INFO_OVERRIDES_GET,
  RUST_INFO_OVERRIDES_GET_ALL,
  RUST_INFO_OVERRIDES_SET
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/** A fake transport that records the channel and arguments and answers with `answer`, or rejects. */
function fakeDeps(answer: unknown, error?: Error) {
  const calls: unknown[][] = []
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return error ? Promise.reject(error) : Promise.resolve(answer)
  }) as unknown as RustInvokeDeps['requestRustInvoke']
  return { deps: { requestRustInvoke } as RustInvokeDeps, calls }
}

describe('getGameOverrides shim', () => {
  it('sends exactly RUST_INFO_OVERRIDES_GET with the appName and resolves what Rust answers', async () => {
    const { deps, calls } = fakeDeps({ title: 'T' })
    await expect(getGameOverrides(deps, 'Quail')).resolves.toEqual({
      title: 'T'
    })
    expect(calls).toEqual([[RUST_INFO_OVERRIDES_GET, [{ appName: 'Quail' }]]])
  })
})

describe('getAllGameOverrides shim', () => {
  it('sends exactly RUST_INFO_OVERRIDES_GET_ALL with an empty argument list (the crate rejects any argument)', async () => {
    const map = { Quail: { title: 'T' } }
    const { deps, calls } = fakeDeps(map)
    await expect(getAllGameOverrides(deps)).resolves.toBe(map)
    expect(calls).toEqual([[RUST_INFO_OVERRIDES_GET_ALL, []]])
  })
})

describe('setGameOverrides shim', () => {
  it('sends exactly RUST_INFO_OVERRIDES_SET with the appName and the override under overrideData', async () => {
    const { deps, calls } = fakeDeps(true)
    await expect(
      setGameOverrides(deps, 'Quail', { title: 'T', art_cover: 'c.png' })
    ).resolves.toBe(true)
    expect(calls).toEqual([
      [
        RUST_INFO_OVERRIDES_SET,
        [{ appName: 'Quail', overrideData: { title: 'T', art_cover: 'c.png' } }]
      ]
    ])
  })

  it('carries the Rust rejection to the caller', async () => {
    const { deps } = fakeDeps(undefined, new Error('rust said no'))
    await expect(setGameOverrides(deps, 'Quail', {})).rejects.toThrow(
      'rust said no'
    )
  })
})

describe('attachOverrides shim', () => {
  it('sends exactly RUST_INFO_OVERRIDES_ATTACH with the game object and resolves what Rust answers', async () => {
    const game = { app_name: 'Quail', title: 'Quail Quest' }
    const answered = { ...game, overrides: { title: 'T' } }
    const { deps, calls } = fakeDeps(answered)
    await expect(attachOverrides(deps, game as never)).resolves.toBe(answered)
    expect(calls).toEqual([[RUST_INFO_OVERRIDES_ATTACH, [{ gameInfo: game }]]])
  })
})
