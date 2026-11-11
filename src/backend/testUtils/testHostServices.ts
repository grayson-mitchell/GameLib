/**
 * createTestHostServices builds the real host services over a recording `requestRustInvoke`
 * (resolves undefined) and a fresh IPC registry. `invocations` lists every `[channel, args]`
 * call. Tests override any member, or pass a different `requestRustInvoke` behaviour via
 * `rustInvoke`.
 */

import { createHostServices, type HostServices } from '../host'
import { createIpcRegistry } from '../sidecar/ipcRegistry'
import type { RequestRustInvoke } from '../host'

export interface TestHostServices extends HostServices {
  invocations: Array<[string, unknown[]]>
}

export function createTestHostServices(
  overrides: Partial<HostServices> & {
    rustInvoke?: (channel: string, args: unknown[]) => Promise<unknown>
  } = {}
): TestHostServices {
  const { rustInvoke, ...serviceOverrides } = overrides
  const invocations: Array<[string, unknown[]]> = []
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    invocations.push([channel, args])
    return rustInvoke ? rustInvoke(channel, args) : Promise.resolve(undefined)
  }) as unknown as RequestRustInvoke
  const base = createHostServices({
    platform: process.platform,
    ipc: createIpcRegistry(),
    requestRustInvoke,
    requestOpenExternal: () => {},
    openDetached: () => {},
    runSync: () => {
      throw new Error('createTestHostServices: runSync not scripted')
    }
  })
  return { ...base, ...serviceOverrides, invocations }
}
