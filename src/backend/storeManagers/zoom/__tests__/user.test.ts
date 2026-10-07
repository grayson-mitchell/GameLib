/**
 * The Zoom login token is a credential, so `.zoom.token` must be written
 * owner-only (0600) like the sidecar's `fileStore.ts` stores — including when
 * an older build already left a 0644 file behind, because `writeFileSync`'s
 * `mode` only applies when the file is created (todo 2026-10-05-security-
 * hardening-minors-from-trust-boundary-review, item 1).
 */
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDir = mkdtempSync(join(tmpdir(), 'gamelib-zoom-token-'))
const mockTokenPath = join(mockDir, '.zoom.token')

jest.mock('backend/logger')
jest.mock('../constants', () => ({
  tokenPath: mockTokenPath,
  embedUrl: 'https://zoom.invalid',
  apiUrl: 'https://zoom.invalid'
}))
jest.mock('../electronStores', () => ({
  configStore: { set: jest.fn(), get: jest.fn(), clear: jest.fn() }
}))
jest.mock('../../../online_monitor', () => ({ isOnline: () => true }))
jest.mock('backend/utils', () => ({ clearCache: jest.fn() }))

import { ZoomUser } from '../user'

const posixIt = process.platform !== 'win32' ? it : it.skip

describe('ZoomUser.login token file mode', () => {
  afterEach(() => rmSync(mockTokenPath, { force: true }))
  afterAll(() => rmSync(mockDir, { recursive: true, force: true }))

  posixIt('creates .zoom.token as 0600', async () => {
    await expect(
      ZoomUser.login('https://zoom.invalid/cb?li_token=secret')
    ).resolves.toEqual({ status: 'done' })
    expect(statSync(mockTokenPath).mode & 0o777).toBe(0o600)
  })

  posixIt('tightens a pre-existing 0644 .zoom.token to 0600', async () => {
    writeFileSync(mockTokenPath, 'old')
    chmodSync(mockTokenPath, 0o644)
    await expect(
      ZoomUser.login('https://zoom.invalid/cb?li_token=secret')
    ).resolves.toEqual({ status: 'done' })
    expect(statSync(mockTokenPath).mode & 0o777).toBe(0o600)
  })
})
