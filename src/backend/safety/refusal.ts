/**
 * Phase 82 (FND-02, D-13): tell the user a guarded removal was refused or failed. Pushes the
 * closed-set `removalRefusedNotice` FrontendMessage (rendered as an error toast in the bottom-right
 * stack) and writes one log line naming the op and the check that refused. The log line carries
 * neither a path nor a game title; the payload carries a title (the toast names the game) but
 * never a path or raw error text.
 *
 * Exit contract: no timers, no handles, no work at import, no module-level mutable state.
 */
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import { LogPrefix, logWarning } from 'backend/logger'
import type { RemovalRefusalPayload } from 'common/types/removalRefusal'

export interface RefusalDeps {
  sendFrontendMessage: SendFrontendMessage
  /** The log sink; defaults to the sidecar logger. Injected by tests so no module is mocked. */
  log?: (line: string) => void
}

/** The log line for a refusal: the op, the outcome and the check, nothing identifying. */
function refusalLogLine(payload: RemovalRefusalPayload): string {
  return `[safety] ${payload.kind} ${payload.outcome}: ${payload.reason}`
}

/**
 * Best effort and never throws: the removal it reports on has already been stopped or has failed,
 * so a notice that cannot be delivered must not turn that into a second failure.
 */
export function pushRemovalRefusal(
  deps: RefusalDeps,
  payload: RemovalRefusalPayload
): void {
  const log = deps.log ?? ((line) => logWarning(line, LogPrefix.Backend))
  try {
    log(refusalLogLine(payload))
    deps.sendFrontendMessage('removalRefusedNotice', payload)
  } catch {
    // Nothing safe to add: the payload is already on its way to the log line above, and the
    // caller's own refusal result is what stops the delete.
  }
}
