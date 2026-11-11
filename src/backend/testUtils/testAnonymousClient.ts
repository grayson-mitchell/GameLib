/**
 * A fresh anonymous-client fake for consumer tests (D-66.3-14). `get` resolves null (no CM
 * connection) and `close` / `releaseForShutdown` are no-ops until a test scripts them; a test that
 * asserts on any passes its own member. Plain object, no jest APIs.
 */
import type { AnonymousClient } from '../storeManagers/steam/anonymousClient'

export function createTestAnonymousClient(
  overrides: Partial<AnonymousClient> = {}
): AnonymousClient {
  return {
    get: overrides.get ?? (() => Promise.resolve(null)),
    close: overrides.close ?? (() => undefined),
    releaseForShutdown: overrides.releaseForShutdown ?? (() => undefined)
  }
}
