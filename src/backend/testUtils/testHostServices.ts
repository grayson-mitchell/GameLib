/**
 * createTestHostServices builds the real host services over a recording `requestRustInvoke`
 * (resolves undefined) and a fresh IPC registry. `invocations` lists every `[channel, args]`
 * call. Tests override any member, or pass a different `requestRustInvoke` behaviour via
 * `rustInvoke`.
 */

import {
  RUST_ENGINE_LAUNCH_SELECT,
  RUST_ENGINE_LAUNCH_SETTINGS_GET,
  RUST_STEAMPOLL_STATUS
} from 'common/types/sidecarTransport'
import { EMPTY_POLL_STATUS } from './steamPollStatusFake'
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
    if (rustInvoke) return rustInvoke(channel, args)
    // No scripted behaviour: the steampoll registry reads empty, as with no poll running; the engine layer with
    // no launch selected skips its step and hands the stored settings back (87-52), as Rust does.
    if (channel === RUST_STEAMPOLL_STATUS) {
      return Promise.resolve(EMPTY_POLL_STATUS)
    }
    if (channel === RUST_ENGINE_LAUNCH_SELECT) {
      return Promise.resolve({ kind: 'skip' })
    }
    if (channel === RUST_ENGINE_LAUNCH_SETTINGS_GET) {
      return Promise.resolve((args[0] as { stored: unknown }).stored)
    }
    return Promise.resolve(undefined)
  }) as unknown as RequestRustInvoke
  const base = createHostServices({
    platform: process.platform,
    ipc: createIpcRegistry(),
    requestRustInvoke,
    requestOpenExternal: () => {},
    pushFrontendMessage: () => {},
    openDetached: () => {},
    runSync: () => {
      throw new Error('createTestHostServices: runSync not scripted')
    }
  })
  return { ...base, ...serviceOverrides, invocations }
}
