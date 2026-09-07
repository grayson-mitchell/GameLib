/**
 * Quick task 260908-e64 — unit coverage for BOTH proximate causes of the
 * 2026-09-07 macOS shortcut/icon-generation todo, against the REAL `getIcon`
 * and REAL `downloadImage` in `../utils`. Only the boundaries are mocked:
 * the network edge (`backend/utils`'s `downloadFile`), the GOG product API
 * lookup (`backend/storeManagers`'s `libraryManagerMap`), `backend/logger`,
 * and `backend/utils/aborthandler/aborthandler`'s `createAbortController`.
 *
 * Mirrors `shortcutsExistsFallback.test.ts`'s mock-block-then-imports layout.
 * This lands in the Backend jest project, so `jest.setupContainment.ts`
 * (registered via `setupFiles`) redirects HOME before this file's own
 * imports run — `heroicIconFolder` (imported transitively by `../utils`)
 * therefore resolves under the per-run containment root, never the
 * developer's real `~/Library/Application Support/GameLib/icons`.
 *
 * `resetMocks: true` (this project's jest config) wipes every jest mock's
 * recorded calls AND any `mockImplementation`/`mockResolvedValue` before
 * EACH test — so every test below re-establishes its own mock behavior
 * rather than relying on a shared `beforeEach` default.
 */

jest.mock('backend/utils', () => ({
  downloadFile: jest.fn()
}))
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    gog: {
      getProductApi: jest.fn()
    }
  }
}))
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('backend/utils/aborthandler/aborthandler', () => ({
  createAbortController: jest.fn(() => new AbortController())
}))

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync
} from 'graceful-fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getIcon } from '../utils'
import { downloadFile } from 'backend/utils'
import { libraryManagerMap } from 'backend/storeManagers'
import { logWarning } from 'backend/logger'
import { createAbortController } from 'backend/utils/aborthandler/aborthandler'
import { appFolder } from 'backend/constants/paths'
import type { GameInfo } from 'common/types'

// getIcon's own `mkdirSync(iconsFolder)` (a direct child of `appFolder`) is
// non-recursive, so `appFolder` itself must already exist under the
// containment root before any test below runs it for the first time.
beforeAll(() => {
  mkdirSync(appFolder, { recursive: true })
})

const mockedDownloadFile = downloadFile as jest.Mock
const mockedGetProductApi = libraryManagerMap.gog.getProductApi as jest.Mock
const mockedLogWarning = logWarning as jest.Mock
const mockedCreateAbortController = createAbortController as jest.Mock

// `resetMocks: true` strips even a jest.fn(impl) constructor-supplied
// implementation before every test (not just ones set later via
// mockImplementation), so the abort-controller stub must be re-applied per
// test rather than relying on the jest.mock(...) factory's inline arrow.
// Without this, the real (unmocked) downloadImage's
// `createAbortController(imageURL).signal` dereferences undefined on every
// test after the first, and its own try/catch quietly reports that as a
// download failure -- masking the exact behavior these tests exist to prove.
beforeEach(() => {
  mockedCreateAbortController.mockReturnValue(new AbortController())
})

function makeGameInfo(overrides: Partial<GameInfo>): GameInfo {
  return {
    runner: 'legendary',
    app_name: 'default-app',
    art_cover: 'https://example.com/cover.jpg',
    art_square: 'https://example.com/square.jpg',
    install: { is_dlc: false },
    is_installed: true,
    title: 'Default Game',
    canRunOffline: true,
    ...overrides
  } as GameInfo
}

describe('backend/shortcuts/utils.ts getIcon (quick task 260908-e64)', () => {
  // (a) DEFECT 1: a runner:'gog' GameInfo with install: { is_dlc: false } and
  // no install_path does NOT reject out of getIcon, AND getProductApi WAS
  // called — proving the guard fell through rather than merely swallowing.
  // Pre-fix this rejects with TypeError [ERR_INVALID_ARG_TYPE] (join()
  // dereferencing `install.install_path!`), and getProductApi is never
  // reached because the throw happens first.
  it('(a) DEFECT 1: an absent install_path on a gog GameInfo falls through to getProductApi instead of throwing', async () => {
    mockedGetProductApi.mockResolvedValue(null)
    mockedDownloadFile.mockResolvedValue(undefined)

    const info = makeGameInfo({
      runner: 'gog',
      app_name: 'defect1-app',
      install: { is_dlc: false }
    })

    await expect(getIcon('defect1-app', info)).resolves.not.toThrow()
    expect(mockedGetProductApi).toHaveBeenCalledWith('defect1-app')
  })

  // (b) DEFECT 2: when downloadFile writes its dest only after a real ~10ms
  // delay, the path getIcon resolves to already exists on disk. Pre-fix,
  // getIcon returns before the write lands (downloadImage is fire-and-forget),
  // so existsSync is false at the moment getIcon resolves — this is the
  // ENOENT that killed Phoenix Point, reproduced here as a unit test.
  it('(b) DEFECT 2: getIcon awaits the download, so its returned path already exists on disk', async () => {
    mockedDownloadFile.mockImplementation(
      ({ dest }: { dest: string }) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            writeFileSync(dest, Buffer.from('fake-icon-bytes'))
            resolve()
          }, 10)
        })
    )

    const info = makeGameInfo({
      runner: 'legendary',
      app_name: 'defect2-app'
    })

    const result = await getIcon('defect2-app', info)

    expect(typeof result).toBe('string')
    expect(existsSync(result as string)).toBe(true)
  })

  // (c) NO-ICON RESULT: when downloadFile rejects, getIcon resolves
  // undefined (never a path to a nonexistent file) and logWarning fired.
  // This also covers downloadImage's previously-unreachable catch — it can
  // only return its error string once the call is awaited. Pre-fix, getIcon
  // ignores downloadImage's return value entirely and unconditionally
  // returns the (nonexistent) icon path, which is why this proves non-
  // vacuous: pre-fix the resolved value is a truthy string, not undefined.
  // A temporary unhandledRejection listener guards this RED run: pre-fix,
  // downloadImage calls downloadFile without awaiting it, so the rejection
  // this test manufactures is never attached to a .catch anywhere in the
  // unfixed source and would otherwise surface as a real Node
  // unhandledRejection event.
  it('(c) NO-ICON RESULT: a rejecting download resolves getIcon to undefined and warns, never a path to a nonexistent file', async () => {
    const swallowed: unknown[] = []
    const onUnhandled = (reason: unknown) => swallowed.push(reason)
    process.on('unhandledRejection', onUnhandled)

    try {
      mockedDownloadFile.mockRejectedValue(new Error('network error'))

      const info = makeGameInfo({
        runner: 'legendary',
        app_name: 'defect3-app'
      })

      const result = await getIcon('defect3-app', info)

      expect(result).toBeUndefined()
      expect(mockedLogWarning).toHaveBeenCalled()
    } finally {
      // Give any fire-and-forget rejection (pre-fix source) a microtask/timer
      // turn to surface before the listener is removed.
      await new Promise((resolve) => setTimeout(resolve, 20))
      process.off('unhandledRejection', onUnhandled)
    }
  })

  // (d) POSITIVE CONTROL: a gog GameInfo WITH an install_path containing a
  // real goggame-{appName}.ico still returns that exact path, and
  // getProductApi was NOT called. Green both before and after the fix — this
  // is the counter-failure guard proving the guard did not break the primary
  // use case.
  it('(d) POSITIVE CONTROL: a populated install_path with a real .ico short-circuits getProductApi', async () => {
    const installDir = mkdtempSync(join(tmpdir(), 'gamelib-geticon-control-'))
    const appName = 'defect-control-app'
    const icoPath = join(installDir, `goggame-${appName}.ico`)
    writeFileSync(icoPath, Buffer.from('fake-ico-bytes'))

    try {
      const info = makeGameInfo({
        runner: 'gog',
        app_name: appName,
        install: { is_dlc: false, install_path: installDir }
      })

      const result = await getIcon(appName, info)

      expect(result).toBe(icoPath)
      expect(mockedGetProductApi).not.toHaveBeenCalled()
    } finally {
      rmSync(installDir, { recursive: true, force: true })
    }
  })
})
