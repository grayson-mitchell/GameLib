/**
 * A fresh, isolated stdio transport for transport-level tests (66.4-15): its own pending-id map,
 * output stream and pre-start buffer, with a validator whose throttle clock and sink a test can
 * drive. Plain object, no jest APIs.
 */
import { createSidecarRpc, type SidecarRpc } from '../sidecar/sidecarRpc'
import { createIpcValidator, type IpcValidator } from '../sidecar/ipcValidation'

export function createTestIpcValidator(
  overrides: Partial<Parameters<typeof createIpcValidator>[0]> = {}
): IpcValidator {
  return createIpcValidator({
    now: overrides.now ?? Date.now,
    sink: overrides.sink ?? (() => {})
  })
}

export function createTestSidecarRpc(
  overrides: { validator?: IpcValidator } = {}
): SidecarRpc {
  return createSidecarRpc({
    validator: overrides.validator ?? createTestIpcValidator()
  })
}
