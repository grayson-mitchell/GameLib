/**
 * Test double for the rustInvoke leaf, for caller tests that mock `graceful-fs` and drive file
 * state through `existsSync` / `readdirSync` / `readFileSync` mocks plus programmed "parsed file"
 * results (README section 3.6: a stub, never a parser). `vdf.parse` is a programmable jest.fn
 * whose return values are the object shapes the caller tests already feed (`{ AppState: {...} }`,
 * `{ Registry: ... }`); the handlers walk the same mocked filesystem the removed TS branches
 * walked and shape the programmed objects into the crate's result structs. No @node-steam/vdf.
 *
 * Importing this module from a test file that does not `jest.mock('graceful-fs')` reads the real
 * filesystem; use `fsBackedSteamFiles` there instead.
 */
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { join } from 'path'
import type {
  AcfReadResult,
  AcfRecord,
  ScanResult,
  SteamFilesArgsFor,
  SteamFilesResultFor
} from '../../steamFilesTypes'
import type { RustSteamFilesChannel } from 'common/types/sidecarTransport'

/** Programmed parse results; callers set `vdf.parse` return values exactly as before. */
export const vdf = { parse: jest.fn() }

type Obj = Record<string, unknown>
type Handlers = Partial<{
  [C in RustSteamFilesChannel]: (
    args: SteamFilesArgsFor<C>
  ) => SteamFilesResultFor<C>
}>

// ACF/VDF leaves are scalars; a block (object) is never a string value.
const str = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? String(v)
    : null

function depots(state: Obj): AcfRecord['installedDepots'] {
  const raw = state.InstalledDepots
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw as Record<string, Obj>).map(([depotId, d]) => ({
    depotId,
    manifest: str(d?.manifest) ?? '',
    size: str(d?.size) ?? '',
    dlcAppId: str(d?.dlcappid)
  }))
}

function recordOf(state: Obj): AcfRecord {
  const raw = str(state.StateFlags)
  const n = raw === null ? NaN : parseInt(raw, 10)
  return {
    appid: str(state.appid),
    name: str(state.name),
    installdir: str(state.installdir),
    stateFlags: Number.isNaN(n) ? null : n,
    stateFlagsRaw: raw,
    sizeOnDisk: str(state.SizeOnDisk),
    buildid: str(state.buildid),
    lastOwner: str(state.LastOwner),
    bytesDownloaded: str(state.BytesDownloaded),
    bytesToDownload: str(state.BytesToDownload),
    bytesStaged: str(state.BytesStaged),
    bytesToStage: str(state.BytesToStage),
    targetBuildId: str(state.TargetBuildID),
    scheduledAutoUpdate: str(state.ScheduledAutoUpdate),
    betaKey: str((state.UserConfig as Obj | undefined)?.BetaKey),
    installedDepots: depots(state)
  }
}

/** One read through the mocked filesystem: null when the file is missing or unreadable/unparsed. */
function readState(path: string, checkExists = true): AcfReadResult {
  if (checkExists && !existsSync(path)) {
    return { exists: false, parsed: false, readError: null, record: null }
  }
  try {
    const parsed = vdf.parse(readFileSync(path, 'utf-8')) as Obj
    const state = parsed?.AppState as Obj | undefined
    if (!state) {
      return { exists: true, parsed: false, readError: null, record: null }
    }
    return {
      exists: true,
      parsed: true,
      readError: null,
      record: recordOf(state)
    }
  } catch (e) {
    return {
      exists: true,
      parsed: false,
      readError: String((e as Error)?.message ?? e),
      record: null
    }
  }
}

function manifestNames(dir: string): string[] {
  return readdirSync(dir).filter(
    (f) => f.startsWith('appmanifest_') && f.endsWith('.acf')
  )
}

export function mockedFsSteamFiles(overrides: Handlers = {}) {
  const calls: { channel: string; args: unknown }[] = []
  const handlers: Handlers = {
    steamfiles_read_acf: ({ path }) => readState(path),
    steamfiles_find_acf: ({ steamappsDirs, appId }) => {
      for (const dir of steamappsDirs) {
        if (!existsSync(dir)) continue
        const r = readState(join(dir, `appmanifest_${appId}.acf`))
        if (r.parsed && r.record) {
          return { found: true, steamappsDir: dir, record: r.record }
        }
      }
      return { found: false, steamappsDir: null, record: null }
    },
    steamfiles_scan_acfs: ({ steamappsDirs }) => {
      const out: ScanResult = { records: [], skipped: [], missingDirs: [] }
      for (const dir of steamappsDirs) {
        if (!existsSync(dir)) {
          out.missingDirs.push(dir)
          continue
        }
        let names: string[]
        try {
          names = manifestNames(dir)
        } catch {
          continue
        }
        for (const fileName of names) {
          // The removed TS scan read each listed file without an existsSync gate.
          const r = readState(join(dir, fileName), false)
          if (r.parsed && r.record) {
            out.records.push({
              steamappsDir: dir,
              fileName,
              record: r.record
            })
          } else {
            out.skipped.push({
              steamappsDir: dir,
              fileName,
              reason: r.readError ?? 'unparsed'
            })
          }
        }
      }
      return out
    },
    steamfiles_read_running_app_id: ({ path }) => {
      if (!existsSync(path)) return { runningAppId: 0 }
      try {
        const parsed = vdf.parse(readFileSync(path, 'utf-8')) as Obj
        const reg = parsed?.Registry as Obj | undefined
        const hkcu = reg?.HKCU as Obj | undefined
        const sw = hkcu?.Software as Obj | undefined
        const valve = sw?.Valve as Obj | undefined
        const raw = (valve?.Steam as Obj | undefined)?.RunningAppID
        return {
          runningAppId:
            typeof raw === 'string' || typeof raw === 'number'
              ? parseInt(String(raw), 10) || 0
              : 0
        }
      } catch {
        return { runningAppId: 0 }
      }
    },
    ...overrides
  }
  const requestRustInvoke = (
    channel: string,
    argv: readonly unknown[]
  ): Promise<unknown> => {
    const args = argv[0]
    calls.push({ channel, args })
    const handler = (
      handlers as Record<string, ((a: unknown) => unknown) | undefined>
    )[channel]
    if (!handler) {
      return Promise.reject(
        new Error(`unstubbed steamfiles channel ${channel}`)
      )
    }
    try {
      return Promise.resolve(handler(args))
    } catch (e) {
      return Promise.reject(e as Error)
    }
  }
  return { requestRustInvoke, calls }
}
