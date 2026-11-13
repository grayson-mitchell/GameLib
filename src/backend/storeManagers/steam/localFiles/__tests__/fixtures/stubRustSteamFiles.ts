import type { RustSteamFilesChannel } from 'common/types/sidecarTransport'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type {
  AcfReadResult,
  AcfRecord,
  ScanResult,
  SteamFilesArgsFor,
  SteamFilesResultFor
} from '../../steamFilesTypes'

type Handlers = Partial<{
  [C in RustSteamFilesChannel]: (
    args: SteamFilesArgsFor<C>
  ) => SteamFilesResultFor<C>
}>

/**
 * Test double for the rustInvoke leaf used by steamfiles callers. It answers from programmed
 * results, never from a parser (README section 3.6): real parsing is proven by the crate tests
 * and the replay harness. An unhandled channel throws so a missed stub is loud.
 */
export function stubRustSteamFiles(handlers: Handlers) {
  const calls: { channel: string; args: unknown }[] = []
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

const KV = /^\s*"([^"]*)"\s+"([^"]*)"\s*$/

function flatValues(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = KV.exec(line)
    if (m) out.set(m[1]!.toLowerCase(), m[2]!)
  }
  return out
}

function depotsOf(text: string): AcfRecord['installedDepots'] {
  const depots: AcfRecord['installedDepots'] = []
  const block = /"(\d+)"\s*\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = block.exec(text))) {
    const v = flatValues(m[2]!)
    if (v.has('manifest') || v.has('size')) {
      depots.push({
        depotId: m[1]!,
        manifest: v.get('manifest') ?? '',
        size: v.get('size') ?? '',
        dlcAppId: v.get('dlcappid') ?? null
      })
    }
  }
  return depots
}

function acfRecordOf(text: string): AcfRecord {
  const v = flatValues(text)
  const raw = v.get('stateflags') ?? null
  const n = raw === null ? NaN : Number(raw)
  return {
    appid: v.get('appid') ?? null,
    name: v.get('name') ?? null,
    installdir: v.get('installdir') ?? null,
    stateFlags: Number.isFinite(n) ? n : null,
    stateFlagsRaw: raw,
    sizeOnDisk: v.get('sizeondisk') ?? null,
    buildid: v.get('buildid') ?? null,
    lastOwner: v.get('lastowner') ?? null,
    bytesDownloaded: v.get('bytesdownloaded') ?? null,
    bytesToDownload: v.get('bytestodownload') ?? null,
    bytesStaged: v.get('bytesstaged') ?? null,
    bytesToStage: v.get('bytestostage') ?? null,
    targetBuildId: v.get('targetbuildid') ?? null,
    scheduledAutoUpdate: v.get('scheduledautoupdate') ?? null,
    betaKey: v.get('betakey') ?? null,
    installedDepots: depotsOf(text)
  }
}

function readAcf(path: string): AcfReadResult {
  if (!existsSync(path)) {
    return { exists: false, parsed: false, readError: null, record: null }
  }
  const text = readFileSync(path, 'utf8')
  if (!/"AppState"/i.test(text)) {
    return { exists: true, parsed: false, readError: null, record: null }
  }
  return {
    exists: true,
    parsed: true,
    readError: null,
    record: acfRecordOf(text)
  }
}

function manifestNames(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^appmanifest_.*\.acf$/i.test(f))
    .sort()
}

/**
 * File-backed test double for the read-only steamfiles channels. It answers from the real temp
 * files a caller test already wrote, extracting flat `"Key" "Value"` pairs with one line regex.
 * It is a test double (README section 3.6), never a parser: parsing behaviour is tested in Rust
 * only. `overrides` handlers take precedence; any other channel throws like stubRustSteamFiles.
 */
export function fsBackedSteamFiles(overrides: Handlers = {}) {
  const handlers: Handlers = {
    steamfiles_read_acf: ({ path }) => readAcf(path),
    steamfiles_scan_acfs: ({ steamappsDirs }) => {
      const records: ScanResult['records'] = []
      const skipped: ScanResult['skipped'] = []
      const missingDirs: string[] = []
      for (const dir of steamappsDirs) {
        if (!existsSync(dir)) {
          missingDirs.push(dir)
          continue
        }
        for (const fileName of manifestNames(dir)) {
          const r = readAcf(join(dir, fileName))
          if (r.record) {
            records.push({ steamappsDir: dir, fileName, record: r.record })
          } else {
            skipped.push({ steamappsDir: dir, fileName, reason: 'unparsed' })
          }
        }
      }
      return { records, skipped, missingDirs }
    },
    steamfiles_find_acf: ({ steamappsDirs, appId }) => {
      for (const dir of steamappsDirs) {
        const r = readAcf(join(dir, `appmanifest_${appId}.acf`))
        if (r.record) {
          return { found: true, steamappsDir: dir, record: r.record }
        }
      }
      return { found: false, steamappsDir: null, record: null }
    },
    steamfiles_read_library_folders: ({ path }) => {
      if (!existsSync(path)) {
        return { exists: false, parsed: false, readError: null, paths: [] }
      }
      const paths: string[] = []
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const m = KV.exec(line)
        if (m && m[1]!.toLowerCase() === 'path') {
          paths.push(m[2]!.replace(/\\\\/g, '\\'))
        }
      }
      return { exists: true, parsed: true, readError: null, paths }
    },
    steamfiles_read_running_app_id: ({ path }) => {
      const v = existsSync(path)
        ? flatValues(readFileSync(path, 'utf8')).get('runningappid')
        : undefined
      return { runningAppId: Number(v ?? 0) || 0 }
    },
    ...overrides
  } as Handlers
  return stubRustSteamFiles(handlers)
}
