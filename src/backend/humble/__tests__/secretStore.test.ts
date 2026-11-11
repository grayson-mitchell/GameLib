/**
 * Structural guards for the Humble secret-store seam (Phase 34.4.1 Plan 12, gap-cycle closure
 * for F-1/S-10, REQ-34.4.1-02/REQ-34.4.1-GAP-02; reshaped by 66.3-17).
 *
 * 66.3-17 deleted the Electron implementation (the `safeStorage`-backed default, which under the
 * sidecar meant plaintext) and the `setHumbleSecretStore`/`getHumbleSecretStore` registry: the
 * store is chosen once at boot and required at `createHumbleServices()` construction. What
 * remains of this module is the interface, so what is pinned here is the absence of everything
 * that was removed.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const stripped = stripSourceComments(
  readFileSync(join(__dirname, '../secretStore.ts'), 'utf-8')
)

describe('secretStore', () => {
  it('source contains no reference to backend/sidecar', () => {
    expect(stripped).not.toMatch(/backend\/sidecar/)
  })

  it('source contains no reference to encryptionDegraded — the flag stays in user.ts', () => {
    expect(stripped).not.toMatch(/encryptionDegraded/)
  })

  it('has no Electron default store, no safeStorage import and no module-level registry', () => {
    expect(stripped).not.toMatch(/safeStorage/)
    expect(stripped).not.toMatch(/ElectronHumbleSecretStore/)
    expect(stripped).not.toMatch(/setHumbleSecretStore|getHumbleSecretStore/)
    expect(
      stripped.split('\n').filter((l) => /^(export\s+)?let\s/.test(l))
    ).toEqual([])
  })
})
