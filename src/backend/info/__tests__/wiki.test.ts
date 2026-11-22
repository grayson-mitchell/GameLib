import { getUmuId } from '../wiki'
import { RUST_INFO_UMU_GET } from 'common/types/sidecarTransport'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

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

describe('getUmuId shim', () => {
  it('makes one RUST_INFO_UMU_GET call carrying { appName, runner }', async () => {
    const { deps, calls } = fakeDeps('umu-1234')
    await getUmuId(deps, 'Quail', 'legendary')
    expect(calls).toEqual([
      [RUST_INFO_UMU_GET, [{ appName: 'Quail', runner: 'legendary' }]]
    ])
  })

  it('sends arguments the channel schema accepts, for every runner', async () => {
    for (const runner of [
      'gog',
      'legendary',
      'nile',
      'sideload',
      'steam'
    ] as const) {
      const { deps, calls } = fakeDeps()
      await getUmuId(deps, 'x', runner)
      const [, args] = calls[0] ?? []
      expect(rustInvokeArgs[RUST_INFO_UMU_GET].safeParse(args).success).toBe(
        true
      )
    }
  })

  it('resolves what Rust answered, an id or null, and rejects with its failure', async () => {
    await expect(getUmuId(fakeDeps('umu-9').deps, 'a', 'gog')).resolves.toBe(
      'umu-9'
    )
    await expect(getUmuId(fakeDeps(null).deps, 'a', 'gog')).resolves.toBeNull()
    await expect(
      getUmuId(fakeDeps(new Error('boom')).deps, 'a', 'gog')
    ).rejects.toThrow('boom')
  })
})
