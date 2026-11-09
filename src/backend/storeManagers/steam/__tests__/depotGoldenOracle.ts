/**
 * TS oracle for the Tier 1 depot parity goldens (phase 73, plan 08, D-14/D-15).
 *
 * Drives the REAL TS pipeline (fetchDepotPlanEntry -> resolveDepotPathCollisions
 * -> downloadDepotFiles -> finalizeToSteam) over one synthetic fixture case under
 * src-tauri/crates/gamelib-depot/tests/fixtures/cases, served from a local HTTP
 * server, and returns a normalised, machine-independent snapshot.
 *
 * Required mocks (declared by the importing test file so jest hoists them):
 * `backend/logger`, `../user` (automock), `backend/utils`, `../../../ipc`,
 * `i18next`, and `../depot/decompressPool` (inline decode, no worker threads).
 *
 * Plan inputs the Rust side must mirror: `ownerAppId` is the case appId and
 * `appinfoRank` is the depot's position in case.json, so a later depot wins a
 * same-path override. buildid and lastOwner come from the case's `finalize`.
 */
import { createCipheriv, createHash } from 'node:crypto'
import {
  mkdtemp,
  lstat,
  writeFile,
  readdir,
  readFile,
  readlink,
  rm
} from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SteamUser } from '../user'
import { downloadDepotFiles, finalizeToSteam, type DepotPlan } from '../depot'
import { fetchDepotPlanEntry, loadContentManifestParser } from '../depot/plan'
import { resolveDepotPathCollisions } from '../depot/pathCollisions'
import type { DepotPlanEntry, SteamUserDepotClient } from '../depot/planModel'

interface CaseDepot {
  depotId: string
  manifestId: string
  keyHex: string
  manifestFile: string
}

interface CaseJson {
  name: string
  appId: string
  installRoot: string
  depots: CaseDepot[]
  finalize: {
    steamappsDir: string
    installdir: string
    name: string
    buildid: string
    lastOwner: string
  } | null
}

export interface OracleTreeEntry {
  path: string
  kind: 'dir' | 'file' | 'symlink'
  size?: number
  sha1?: string
  /** POSIX `st_mode & 0o7777`; omitted for directories (umask-dependent) and on win32. */
  mode?: number
  target?: string
}

export interface OracleCaseResult {
  tree: OracleTreeEntry[]
  /** ACF text with the LastUpdated value replaced; null when the case does not finalize. */
  acf: string | null
  stateFlags?: string
  outcome: string
  allFilesVerified: boolean
  allModesApplied: boolean
  failures: string[]
}

// steam-user's own manifest unwrapper (the one cdn.getManifest runs before
// handing bytes to the parser); undocumented, untyped module.
async function unzip(data: Buffer): Promise<Buffer> {
  // @ts-expect-error untyped steam-user internal module
  const mod = (await import('steam-user/components/cdn_compression.js')) as {
    default?: { unzip: (d: Buffer) => Promise<Buffer> }
    unzip?: (d: Buffer) => Promise<Buffer>
  }
  const fn = mod.default?.unzip ?? mod.unzip
  if (!fn) throw new Error('steam-user cdn_compression.unzip not found')
  return fn(data)
}

/**
 * The TS pipeline always decrypts manifest filenames (real Steam manifests
 * always carry them encrypted); the fixtures keep names in plaintext except in
 * `encrypted-names`, signalled by the manifest metadata `filenames_encrypted`.
 * To drive the real fetchDepotPlanEntry unchanged, plaintext names are
 * encrypted here in the Steam format (AES-256-ECB IV block + AES-256-CBC).
 */
function steamEncryptName(plain: string, key: Buffer): string {
  const iv = Buffer.alloc(16, 7)
  const ecb = createCipheriv('aes-256-ecb', key, null)
  ecb.setAutoPadding(false)
  const encIv = Buffer.concat([ecb.update(iv), ecb.final()])
  const cbc = createCipheriv('aes-256-cbc', key, iv)
  const body = Buffer.concat([
    cbc.update(Buffer.from(plain, 'utf8')),
    cbc.final()
  ])
  return Buffer.concat([encIv, body]).toString('base64')
}

/** Parent of the per-run install root. A case-sensitive volume (needed for the
 *  multi-depot-collision caseSensitive variant on macOS) is selected with
 *  GAMELIB_DEPOT_ORACLE_TMP; it defaults to the OS temp dir. */
function oracleTmpParent(): string {
  return process.env.GAMELIB_DEPOT_ORACLE_TMP || tmpdir()
}

/** True when the oracle's temp volume distinguishes letter case. */
export async function oracleVolumeIsCaseSensitive(): Promise<boolean> {
  const dir = await mkdtemp(join(oracleTmpParent(), 'gamelib-depot-probe-'))
  try {
    await writeFile(join(dir, 'a'), '')
    await writeFile(join(dir, 'A'), '')
    return (await readdir(dir)).length === 2
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const ACF_LAST_UPDATED = /("LastUpdated"\s+)"[^"]*"/

async function collectTree(
  root: string,
  skipContent: ReadonlySet<string>
): Promise<OracleTreeEntry[]> {
  const out: OracleTreeEntry[] = []
  const walk = async (dir: string, rel: string): Promise<void> => {
    const names = (await readdir(dir)).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    )
    for (const name of names) {
      const full = join(dir, name)
      const relPath = rel ? `${rel}/${name}` : name
      const st = await lstat(full)
      const mode = process.platform === 'win32' ? undefined : st.mode & 0o7777
      if (st.isSymbolicLink()) {
        out.push({
          path: relPath,
          kind: 'symlink',
          target: await readlink(full)
        })
      } else if (st.isDirectory()) {
        out.push({ path: relPath, kind: 'dir' })
        await walk(full, relPath)
      } else {
        const entry: OracleTreeEntry = { path: relPath, kind: 'file' }
        if (!skipContent.has(relPath)) {
          entry.size = st.size
          entry.sha1 = createHash('sha1')
            .update(await readFile(full))
            .digest('hex')
        }
        if (mode !== undefined) entry.mode = mode
        out.push(entry)
      }
    }
  }
  await walk(root, '')
  return out
}

function startChunkServer(chunksDir: string): Promise<Server> {
  const server = createServer((req, res) => {
    const m = /^\/depot\/\d+\/chunk\/([0-9a-f]{40})(?:\?.*)?$/.exec(
      req.url ?? ''
    )
    if (!m || !m[1]) {
      res.statusCode = 404
      res.end()
      return
    }
    readFile(join(chunksDir, `${m[1]}.bin`)).then(
      (body) => {
        res.statusCode = 200
        res.end(body)
      },
      () => {
        res.statusCode = 404
        res.end()
      }
    )
  })
  server.unref()
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

export async function runTsOracle(
  caseDir: string,
  opts: { caseInsensitive?: boolean } = {}
): Promise<OracleCaseResult> {
  const home = process.env.HOME ?? ''
  if (!home.includes('gamelib-jest-home-')) {
    throw new Error(
      `runTsOracle: HOME (${home}) is not the Jest containment HOME; refusing to write`
    )
  }

  const spec = JSON.parse(
    await readFile(join(caseDir, 'case.json'), 'utf8')
  ) as CaseJson

  const manifests = new Map<string, Buffer>()
  const keys = new Map<number, Buffer>()
  for (const d of spec.depots) {
    // Same unwrap steam-user's own getRawManifest applies (PK / VZa / VSZa).
    manifests.set(
      d.depotId,
      await unzip(await readFile(join(caseDir, d.manifestFile)))
    )
    keys.set(Number(d.depotId), Buffer.from(d.keyHex, 'hex'))
  }
  const client = {
    getDepotDecryptionKey: (
      _app: number,
      depot: number,
      cb: (err: Error | null, k: Buffer) => void
    ) => cb(null, keys.get(depot) as Buffer),
    getRawManifest: (
      _app: number,
      depot: number,
      _gid: string,
      _branch: string,
      cb: (err: Error | null, raw: Buffer) => void
    ) => cb(null, manifests.get(String(depot)) as Buffer)
  } as unknown as SteamUserDepotClient

  const realParser = await loadContentManifestParser()
  const keyOf = (raw: Buffer) =>
    [...manifests.entries()].find(([, b]) => b === raw)?.[0]
  const parser: typeof realParser = {
    parse: (raw) => {
      const parsed = realParser.parse(raw) as unknown as {
        files: { filename: string; linktarget?: string }[]
        filenames_encrypted?: boolean
      }
      if (!parsed.filenames_encrypted) {
        const depotId = keyOf(raw)
        const key = keys.get(Number(depotId)) as Buffer
        for (const f of parsed.files) {
          f.filename = steamEncryptName(f.filename, key)
          if (f.linktarget) f.linktarget = steamEncryptName(f.linktarget, key)
        }
      }
      return parsed as unknown as ReturnType<typeof realParser.parse>
    }
  }
  const depots: DepotPlanEntry[] = []
  for (const [rank, d] of spec.depots.entries()) {
    const entry = await fetchDepotPlanEntry(
      client,
      {
        id: d.depotId,
        manifest: d.manifestId,
        size: 0,
        ownerAppId: spec.appId
      },
      parser
    )
    entry.ownerAppId = spec.appId
    entry.appinfoRank = rank
    depots.push(entry)
  }

  const caseInsensitive = opts.caseInsensitive ?? false
  let totalBytes = depots.reduce(
    (s, d) => s + d.files.reduce((a, f) => a + Number(f.size), 0),
    0
  )
  totalBytes -= resolveDepotPathCollisions(
    { appId: spec.appId, depots },
    { caseInsensitive }
  ).droppedBytes
  const plan: DepotPlan = {
    appId: spec.appId,
    depots,
    totalBytes,
    name: spec.finalize?.name ?? spec.name,
    buildid: spec.finalize?.buildid,
    skippedDepots: [],
    caseInsensitivePaths: caseInsensitive
  }

  const server = await startChunkServer(join(caseDir, 'chunks'))
  const root = await mkdtemp(join(oracleTmpParent(), 'gamelib-depot-oracle-'))
  try {
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`
    const steamappsDir = join(root, 'steamapps')
    const installdir = spec.finalize?.installdir ?? spec.installRoot
    const result = await downloadDepotFiles(plan, {
      targetSteamappsDir: steamappsDir,
      installdir,
      hosts: [host],
      hostMeta: new Map([
        [host, { httpsSupport: 'unavailable', type: 'SteamCache' }]
      ])
    })

    let acfPath: string | undefined
    if (spec.finalize) {
      const persisted = jest.mocked(
        // eslint-disable-next-line @typescript-eslint/unbound-method
        SteamUser.getPersistedSteamId64
      )
      persisted.mockReturnValue(spec.finalize.lastOwner)
      await finalizeToSteam(spec.appId, {
        targetSteamappsDir: steamappsDir,
        installdir,
        name: spec.finalize.name,
        depots: depots.map((d) => ({
          depotId: d.depotId,
          gid: d.gid,
          size: d.files.reduce((a, f) => a + Number(f.size), 0)
        })),
        buildid: spec.finalize.buildid,
        outcome: result.outcome,
        failures: result.failures,
        allFilesVerified: result.allFilesVerifiedThisRun,
        allModesApplied: result.allModesApplied
      })
      acfPath = `steamapps/appmanifest_${spec.appId}.acf`
    }

    const tree = await collectTree(root, new Set(acfPath ? [acfPath] : []))
    let acf: string | null = null
    let stateFlags: string | undefined
    if (acfPath) {
      const text = await readFile(join(root, acfPath), 'utf8')
      acf = text.replace(ACF_LAST_UPDATED, '$1"<normalised>"')
      stateFlags = /"StateFlags"\s+"([^"]*)"/.exec(text)?.[1]
    }
    const out: OracleCaseResult = {
      tree,
      acf,
      outcome: result.outcome,
      allFilesVerified: result.allFilesVerifiedThisRun,
      allModesApplied: result.allModesApplied,
      failures: result.failures.map((f) => f.file).sort()
    }
    if (stateFlags !== undefined) out.stateFlags = stateFlags
    return out
  } finally {
    server.close()
    await rm(root, { recursive: true, force: true })
  }
}
