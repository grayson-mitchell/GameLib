/**
 * Quick 260822-bp4: regression + security tests for the `linktarget`
 * decrypt defect — `depot.ts:627` previously passed `f.linktarget` through
 * as raw base64 AES ciphertext instead of decrypting it the way `:623`
 * already decrypts `filename`. `downloadSingleFile` then wrote that
 * ciphertext verbatim as the symlink target, so every symlink in a manifest
 * (all six in Wasteland 1, 259130) dangled and `codesign --verify --deep`
 * reported `bundle format unrecognized, invalid, or unsuitable`.
 *
 * Mock strategy mirrors depot.test.ts's header (backend/logger factory form,
 * jest.mock('../user'), backend/utils, ../depot/select, ../depot/fileAttributes,
 * steam-user/components/content_manifest.js, ../depot/decompress, ../../../ipc,
 * i18next) with ONE deliberate omission: `../depot/crypto` is NOT mocked here.
 * `decryptFilename` is the primitive under test for `linktarget`, so it must
 * run for real.
 *
 * Keeping the `content_manifest.parse` mock IS correct and is not the fixture
 * shortcut this file's own ledger warns about (this area has been burned
 * twice today by fixtures that omitted real structure — a zero-filled ZIP
 * compression-method byte, and a Stored-chunk fixture with no central
 * directory/EOCD). The decoder under test here is `decryptFilename` applied
 * to `linktarget`; the structure that must be real is the AES/IV/NUL/PKCS#7
 * string layout, which `fixtures/steamEncryptedString.ts` reproduces
 * genuinely and cross-checks against Steam's own hardware-measured byte
 * counts. The protobuf framing belongs to steam-user, is exercised nowhere
 * in this code path's own logic, and is mocked by every existing depot test
 * — so mocking `parse()` here changes nothing about what this file proves.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readlinkSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { logWarning, logInfo } from 'backend/logger'
import {
  buildDepotPlan,
  downloadDepotFiles,
  DIRECTORY_FLAG,
  SYMLINK_FLAG
} from '../depot'
import { SteamUser } from '../user'
import { selectAllDepots } from '../depot/select'
import { decryptFilename } from '../depot/crypto'
import { fetchChunk } from '../depot/decompress'
import { steamEncryptString } from './fixtures/steamEncryptedString'

// ── Logger mock (factory form) ────────────────────────────────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── SteamUser mock — controls ensureConnected()/getClient() return values ──
jest.mock('../user')

// ── backend/utils mock — see depot.test.ts's identical header for why this
//    is a wholesale factory (avoids pulling the heavy gog/library.ts chain).
jest.mock('backend/utils', () => ({
  getFileSize: jest.fn(),
  sendProgressUpdate: jest.fn()
}))

// ── depot/select mock — selectAllDepots is a jest.fn(); dlcAppIds stays real
jest.mock('../depot/select', () => ({
  ...jest.requireActual('../depot/select'),
  selectAllDepots: jest.fn()
}))

// ── depot/fileAttributes mock — not exercised by these tests (no ReadOnly/
//    Hidden/Executable-flagged files here), but mocked to match every other
//    depot test file's convention and keep this suite decoupled from real
//    chmod/attrib.exe behaviour.
jest.mock('../depot/fileAttributes', () => ({
  applyDepotFileFlags: jest.fn()
}))

// ── steam-user's undocumented raw-manifest parser ──────────────────────────
// Deliberately still mocked — see the file header comment above.
jest.mock('steam-user/components/content_manifest.js', () => ({
  parse: jest.fn()
}))

// ── depot/decompress mock — fetchChunk is the only network-dependent piece
//    of downloadDepotFiles; real fs/crypto run against a tmpdir, matching
//    depot.test.ts's established real-fs discipline.
jest.mock('../depot/decompress', () => ({
  fetchChunk: jest.fn(),
  isDecodeStageError: () => false
}))

// ── backend/ipc mock ────────────────────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── i18next mock ─────────────────────────────────────────────────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

const APP_ID = '12345'
const BASE_OPTS = {
  targetSteamappsDir: '/tmp/steamapps',
  installdir: 'SomeGame',
  os: 'macos'
}

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    licenses: [] as Array<{ package_id: number }>,
    steamID: { getSteamID64: jest.fn().mockReturnValue('76561198012345678') },
    getProductInfo: jest.fn().mockResolvedValue({
      apps: { 12345: { appinfo: { depots: {}, extended: {} } } },
      packages: {},
      unknownApps: [],
      unknownPackages: []
    }),
    getDepotDecryptionKey: jest.fn(),
    getRawManifest: jest.fn(),
    getContentServers: jest
      .fn()
      .mockImplementation(
        (
          _appId: number,
          cb: (err: Error | null, servers: Array<{ Host?: string }>) => void
        ) => cb(null, [{ Host: 'cdn1.example.com' }])
      ),
    ...overrides
  }
}

const KEY = createHash('sha256').update('fixture-depot-key').digest()

/** Wires SteamUser + selectAllDepots + getDepotDecryptionKey/getRawManifest
 *  so buildDepotPlan reaches a single depot whose parsed files are exactly
 *  `files` (as returned by the mocked content_manifest `parse()`). */
function wireSingleDepot(files: Array<Record<string, unknown>>): void {
  const fakeClient = makeFakeClient()
  jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
  jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as never)
  jest.mocked(selectAllDepots).mockReturnValue([
    {
      id: '259130',
      manifest: '9007199254740993',
      size: 0,
      ownerAppId: '12345'
    }
  ])
  jest
    .mocked(fakeClient.getDepotDecryptionKey)
    .mockImplementation(
      (
        _appId: number,
        _depotId: number,
        cb: (err: Error | null, key: Buffer) => void
      ) => cb(null, KEY)
    )
  jest
    .mocked(fakeClient.getRawManifest)
    .mockImplementation(
      (
        _appId: number,
        _depotId: number,
        _gid: string,
        _branch: string,
        cb: (err: Error | null, raw: Buffer) => void
      ) => cb(null, Buffer.from('raw-manifest'))
    )
  const contentManifest = jest.requireMock(
    'steam-user/components/content_manifest.js'
  )
  jest.mocked(contentManifest.parse).mockReturnValue({ files })
}

describe('linktarget decryption (37-09)', () => {
  // ── Test 1: fixture self-check ──────────────────────────────────────────
  // Green both before and after the fix — this is what stops the fixture
  // itself from drifting into a convenient approximation.
  describe('steamEncryptString fixture self-check', () => {
    const table: Array<{
      plaintext: string
      base64Chars: number
      rawBytes: number
    }> = [
      { plaintext: 'A', base64Chars: 44, rawBytes: 32 },
      {
        plaintext: 'Versions/Current/Resources',
        base64Chars: 64,
        rawBytes: 48
      },
      { plaintext: 'Versions/Current/SDL2', base64Chars: 64, rawBytes: 48 }
    ]

    it.each(table)(
      'reproduces the hardware-measured wire size for "$plaintext" and round-trips through the real decryptFilename',
      ({ plaintext, base64Chars, rawBytes }) => {
        const key = randomKey()
        const b64 = steamEncryptString(plaintext, key)
        expect(b64.length).toBe(base64Chars)
        expect(Buffer.from(b64, 'base64').length).toBe(rawBytes)
        expect(decryptFilename(b64, key)).toBe(plaintext)
      }
    )
  })

  // ── Tests 2-4: driven through buildDepotPlan/downloadDepotFiles ─────────
  describe('plan + disk level (real decryptFilename, real fs)', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'gamelib-linktarget-test-'))
    })

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('T-37-09-02 (MUST BE RED AT HEAD): plan.linktarget is the decrypted plaintext, not the base64 ciphertext', async () => {
      const encTarget = steamEncryptString('Versions/A/Resources', KEY)
      wireSingleDepot([
        {
          filename: steamEncryptString('SDL2.framework/Resources', KEY),
          size: 0,
          sha_content: '',
          flags: SYMLINK_FLAG,
          linktarget: encTarget,
          chunks: []
        }
      ])

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(plan.depots[0].files[0].linktarget).toBe('Versions/A/Resources')
    })

    it('T-37-09-03 (MUST BE RED AT HEAD): the written symlink RESOLVES to the real target directory', async () => {
      const encTarget = steamEncryptString('Versions/A/Resources', KEY)
      wireSingleDepot([
        {
          filename: steamEncryptString(
            'SDL2.framework/Versions/A/Resources',
            KEY
          ),
          size: 0,
          sha_content: '',
          flags: DIRECTORY_FLAG,
          chunks: []
        },
        {
          filename: steamEncryptString('SDL2.framework/Resources', KEY),
          size: 0,
          sha_content: '',
          flags: SYMLINK_FLAG,
          linktarget: encTarget,
          chunks: []
        }
      ])

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)
      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: ['cdn1.example.com']
      })

      expect(result.failures).toEqual([])
      const link = join(
        dir,
        'common',
        'SomeGame',
        'SDL2.framework',
        'Resources'
      )
      expect(lstatSync(link).isSymbolicLink()).toBe(true)
      const target = readlinkSync(link)
      expect(target).toBe('Versions/A/Resources')
      expect(existsSync(resolve(dirname(link), target))).toBe(true)
    })

    it('T-37-09-04 (MUST BE RED AT HEAD): a decrypted target that escapes the install root is rejected with PathTraversalError, and no symlink is created', async () => {
      const encTarget = steamEncryptString('../../evil', KEY)
      wireSingleDepot([
        {
          filename: steamEncryptString('evil.lnk', KEY),
          size: 0,
          sha_content: '',
          flags: SYMLINK_FLAG,
          linktarget: encTarget,
          chunks: []
        }
      ])

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)
      const result = await downloadDepotFiles(plan, {
        targetSteamappsDir: dir,
        installdir: 'SomeGame',
        hosts: ['cdn1.example.com']
      })

      expect(result.failures).toHaveLength(1)
      expect(result.failures[0].error).toMatch(/traversal|escapes/i)

      // TRAP: existsSync follows symlinks and returns false for a DANGLING
      // one too, so at HEAD (where the un-decrypted ciphertext link IS
      // created, dangling) existsSync(link) would also be false and this
      // assertion would pass against the defect. lstatSync distinguishes
      // "no entry at all" from "dangling symlink present".
      const link = join(dir, 'common', 'SomeGame', 'evil.lnk')
      let lstat
      try {
        lstat = lstatSync(link)
      } catch {
        lstat = undefined
      }
      expect(lstat).toBeUndefined()
    })

    it('T-37-09-05 (Q2 crash pin, green before and after): absent/empty linktarget passes through untouched and never reaches decryptFilename', async () => {
      wireSingleDepot([
        {
          filename: steamEncryptString('no-linktarget.txt', KEY),
          size: 0,
          sha_content: '',
          chunks: []
        },
        {
          filename: steamEncryptString('empty-linktarget.txt', KEY),
          size: 0,
          sha_content: '',
          linktarget: '',
          chunks: []
        }
      ])

      const plan = await buildDepotPlan(APP_ID, BASE_OPTS)

      expect(plan.depots[0].files[0].linktarget).toBeUndefined()
      expect(plan.depots[0].files[1].linktarget).toBe('')
    })
  })
})

function randomKey(): Buffer {
  return createHash('sha256').update(`fixture-key-${Math.random()}`).digest()
}

// Referenced only to keep the `fetchChunk` mock import used (no chunk fetch
// happens in these tests — every file here is a Directory/Symlink entry or
// has zero chunks — but the mock must still exist to satisfy the
// `../depot/decompress` factory contract downloadDepotFiles's dynamic
// `import('lzma')` and DecompressPool init rely on at module scope).
void fetchChunk
void logWarning
void logInfo
