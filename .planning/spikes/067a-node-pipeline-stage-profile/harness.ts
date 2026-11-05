/**
 * Spike 067a: profile today's Node depot pipeline on a real Civ V install.
 *
 * Runs production's own `downloadSteamDepots` UNCHANGED. The harness only:
 *   1. signs in with a Steam QR code (token held in memory, never written),
 *   2. swaps its signed-in steam-user client into GameLib's `SteamUser`
 *      singleton (the app normally gets it from the keyring-backed session),
 *   3. samples CPU, RSS, decode-pool and CDN-fetch state once a second,
 *   4. saves a sample of DECRYPTED, still-COMPRESSED chunks for 067b. The
 *      depot key is used in memory to decrypt them and is never written.
 *
 * Mac Steam must be quit first (a second signed-in session signs its Friends
 * list out; Phase 54). The harness refuses to run while it is up.
 *
 * Build + run: see README.md "How to Run".
 */
import { execFileSync, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import SteamUserLib from 'steam-user'
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import qrcode from 'qrcode-generator'
import { initHeadless } from '../../../src/backend/logger'
import { SteamUser } from '../../../src/backend/storeManagers/steam/user'
import { downloadSteamDepots } from '../../../src/backend/storeManagers/steam/depot'
import { DecompressPool } from '../../../src/backend/storeManagers/steam/depot/decompressPool'
import { steamDecrypt } from '../../../src/backend/storeManagers/steam/depot/crypto'
import { InflightLimiter } from '../../../src/backend/storeManagers/steam/depot/inflightLimiter'

// Arm B: raise production's run-wide in-flight chunk budget
// (TARGET_INFLIGHT_CHUNKS = 32, a module constant) without editing src/.
const INFLIGHT_OVERRIDE = Number(process.env.SPIKE_INFLIGHT ?? 0)
if (INFLIGHT_OVERRIDE > 0) {
  const origAcquire = InflightLimiter.prototype.acquire
  InflightLimiter.prototype.acquire = function (this: InflightLimiter) {
    ;(this as unknown as { max: number }).max = INFLIGHT_OVERRIDE
    return origAcquire.call(this)
  }
}

const APP_ID = process.env.SPIKE_APP_ID ?? '8930'
const OS = process.env.SPIKE_OS ?? 'macos'
const LABEL = process.env.SPIKE_LABEL ?? 'run'
const CORPUS_MAX_BYTES = Number(process.env.SPIKE_CORPUS_MB ?? 300) * 1024 * 1024
const CORPUS_EVERY_N = Number(process.env.SPIKE_CORPUS_EVERY ?? 7)

// The bundle runs from <spike>/state/build, so the spike dir is two up.
const SPIKE_DIR = resolve(__dirname, '..', '..')
const RUN_DIR = join(SPIKE_DIR, 'runs', LABEL)
const STATE = join(SPIKE_DIR, 'state')
const STEAMAPPS = join(STATE, 'steamapps')
const CORPUS = join(STATE, 'corpus')
mkdirSync(RUN_DIR, { recursive: true })
mkdirSync(STEAMAPPS, { recursive: true })
mkdirSync(CORPUS, { recursive: true })

const EVENTS = join(RUN_DIR, 'events.jsonl')
const t0 = Date.now()
function ev(cat: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ iso: new Date().toISOString(), t: Date.now() - t0, cat, ...data })
  appendFileSync(EVENTS, line + '\n')
  if (cat !== 'sample') console.log(line)
}

function macSteamRunning(): boolean {
  try {
    execFileSync('pgrep', ['-x', 'steam_osx'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function qrLogin(): Promise<string> {
  const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
  // steam-session's default is 30 s; production's startQRLogin also raises it.
  session.loginTimeout = 300_000
  const start = await session.startWithQR()
  const qr = qrcode(0, 'M')
  qr.addData(start.qrChallengeUrl as string)
  qr.make()
  const svgPath = join(STATE, 'login-qr.html')
  writeFileSync(
    svgPath,
    `<!doctype html><title>Spike 067 Steam QR</title><body style="display:grid;place-items:center;height:100vh;margin:0;font-family:sans-serif">` +
      `<div style="text-align:center"><p>Scan with the Steam Mobile app (Steam Guard → scan QR)</p>${qr.createSvgTag({ cellSize: 8, margin: 4 })}</div></body>`
  )
  execFile('open', [svgPath])
  ev('auth', { step: 'qr-shown' })
  const token = await new Promise<string>((res, rej) => {
    process.once('exit', () => rmSync(svgPath, { force: true }))
    const timer = setTimeout(() => rej(new Error('QR login timed out after 5 min')), 300_000)
    session.on('authenticated', () => {
      clearTimeout(timer)
      res(session.refreshToken)
    })
    session.on('timeout', () => rej(new Error('QR session timed out')))
    session.on('error', rej)
  })
  rmSync(svgPath, { force: true })
  ev('auth', { step: 'authenticated' })
  return token
}

async function logOn(refreshToken: string): Promise<InstanceType<typeof SteamUserLib>> {
  // Same options as production (user.ts): with enablePicsCache on, steam-user
  // fetches PICS for the whole library at logon and the plan's DLC lookup
  // times out behind it (node-run2).
  const client = new SteamUserLib({ enablePicsCache: false, autoRelogin: false } as never)
  await new Promise<void>((res, rej) => {
    client.once('loggedOn', () => res())
    client.once('error', rej)
    client.logOn({ refreshToken } as never)
  })
  ev('auth', { step: 'cm-logged-on' })
  // getOwnedSets reads client.licenses, which arrives in its own event after logon.
  const lic = () => (client as unknown as { licenses?: unknown[] }).licenses?.length ?? 0
  if (!lic()) {
    await new Promise<void>((res) => {
      const timer = setTimeout(res, 30_000)
      client.once('licenses' as never, () => {
        clearTimeout(timer)
        res()
      })
    })
  }
  ev('auth', { step: 'licenses', count: lic() })
  if (!lic()) throw new Error('no licenses arrived within 30 s of logon')
  return client
}

function patchSteamUser(client: InstanceType<typeof SteamUserLib>): void {
  const S = SteamUser as unknown as Record<string, unknown>
  S.client = client
  S.getClient = () => client
  S.isLoggedIn = () => true
  S.acquireAuthenticated = async () => ({ ok: true, client, release: () => {} })
  S.acquireOpenAuthenticated = () => ({ client, release: () => {} })
  S.getPersistedSteamId64 = () => client.steamID?.getSteamID64()
}

// --- instrumentation -------------------------------------------------------
const stats = {
  decodeCalls: 0,
  decodeInBytes: 0,
  decodeOutBytes: 0,
  decodeMsSum: 0,
  decodeInflight: 0,
  fetchCalls: 0,
  fetchInflight: 0,
  fetchBytes: 0,
  fetchMsSum: 0,
  fetchErrors: 0,
  corpusBytes: 0,
  corpusChunks: 0,
  formats: {} as Record<string, number>
}
let pool: DecompressPool | null = null

function containerOf(dec: Buffer): string {
  const m4 = dec.subarray(0, 4).toString('latin1')
  if (m4 === 'VSZa') return 'zstd'
  if (dec.subarray(0, 2).toString('latin1') === 'VZ') return 'lzma'
  if (dec.subarray(0, 2).toString('latin1') === 'PK') return 'zip'
  return 'other'
}

const origInit = DecompressPool.prototype.init
DecompressPool.prototype.init = async function (this: DecompressPool) {
  await origInit.call(this)
  pool = this
  const inner = this.decode
  ;(this as unknown as { decode: typeof inner }).decode = async (encrypted, key, expectedSha, cbOriginal) => {
    stats.decodeCalls++
    stats.decodeInflight++
    stats.decodeInBytes += encrypted.length
    if (stats.decodeCalls % CORPUS_EVERY_N === 0 && stats.corpusBytes < CORPUS_MAX_BYTES) {
      try {
        const dec = steamDecrypt(encrypted, key)
        const kind = containerOf(dec)
        stats.formats[kind] = (stats.formats[kind] ?? 0) + 1
        const name = `${String(stats.corpusChunks).padStart(5, '0')}-${kind}`
        writeFileSync(join(CORPUS, `${name}.bin`), dec)
        writeFileSync(
          join(CORPUS, `${name}.json`),
          JSON.stringify({ expectedSha: String(expectedSha), cbOriginal: Number(cbOriginal), kind, compressed: dec.length })
        )
        stats.corpusBytes += dec.length
        stats.corpusChunks++
      } catch (err) {
        ev('corpus-error', { error: String(err) })
      }
    }
    const s = performance.now()
    try {
      const out = await inner(encrypted, key, expectedSha, cbOriginal)
      stats.decodeOutBytes += out.length
      return out
    } finally {
      stats.decodeMsSum += performance.now() - s
      stats.decodeInflight--
    }
  }
}

const origFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  const isChunk = url.includes('/chunk/')
  if (!isChunk) return origFetch(input, init)
  stats.fetchCalls++
  stats.fetchInflight++
  const s = performance.now()
  try {
    const res = await origFetch(input, init)
    const body = Buffer.from(await res.arrayBuffer())
    stats.fetchBytes += body.length
    stats.fetchMsSum += performance.now() - s
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
  } catch (err) {
    stats.fetchErrors++
    throw err
  } finally {
    stats.fetchInflight--
  }
}) as typeof fetch

// --- sampler ---------------------------------------------------------------
let lastCpu = process.cpuUsage()
let lastT = performance.now()
let last = { decodeOutBytes: 0, fetchBytes: 0 }
let peakRss = 0
const series: Array<Record<string, number | boolean>> = []
function sample(): void {
  const now = performance.now()
  const cpu = process.cpuUsage(lastCpu)
  const dt = (now - lastT) / 1000
  lastCpu = process.cpuUsage()
  lastT = now
  const rss = process.memoryUsage().rss
  peakRss = Math.max(peakRss, rss)
  const p = pool?.stats()
  const row = {
    t: Math.round((Date.now() - t0) / 1000),
    cores: +((cpu.user + cpu.system) / 1e6 / dt).toFixed(2),
    rssMiB: Math.round(rss / 1048576),
    netMiBs: +((stats.fetchBytes - last.fetchBytes) / 1048576 / dt).toFixed(2),
    outMiBs: +((stats.decodeOutBytes - last.decodeOutBytes) / 1048576 / dt).toFixed(2),
    fetchInflight: stats.fetchInflight,
    decodeInflight: stats.decodeInflight,
    poolSize: p?.size ?? 0,
    poolBusy: p?.busy ?? 0,
    poolQueued: p?.queued ?? 0,
    nativeWorkers: p?.nativeWorkers ?? 0,
    inlineFallback: p?.inlineFallback ?? false
  }
  last = { decodeOutBytes: stats.decodeOutBytes, fetchBytes: stats.fetchBytes }
  series.push(row)
  ev('sample', row)
}

async function main(): Promise<void> {
  // The real sidecar does this at boot; true = don't archive the app's existing log.
  initHeadless(true)
  if (process.env.SPIKE_SMOKE === '2') {
    const fake = { steamID: { getSteamID64: () => '0' }, getProductInfo: () => Promise.reject(new Error('fake client: no PICS')) }
    patchSteamUser(fake as never)
    try {
      console.log(JSON.stringify(await downloadSteamDepots(APP_ID, { targetSteamappsDir: STEAMAPPS, installdir: 'civ5-spike', os: OS, language: 'english' })))
    } catch (err) {
      console.log(String((err as Error)?.stack ?? err))
    }
    return
  }
  if (process.env.SPIKE_SMOKE === '1') {
    const p = new DecompressPool()
    await p.init()
    console.log(JSON.stringify({ smoke: 'pool', ...p.stats() }))
    await p.shutdown()
    return
  }
  if (macSteamRunning()) {
    console.error('Mac Steam is running. Quit it first (Steam ▸ Quit Steam), then re-run.')
    process.exit(2)
  }
  ev('start', { inflightOverride: INFLIGHT_OVERRIDE || null, appId: APP_ID, os: OS, label: LABEL, cpus: (await import('node:os')).cpus().length })
  const token = await qrLogin()
  const client = await logOn(token)
  patchSteamUser(client)

  const timer = setInterval(sample, 1000)
  timer.unref()
  const dlStart = Date.now()
  let outcome: unknown
  try {
    outcome = await downloadSteamDepots(APP_ID, {
      targetSteamappsDir: STEAMAPPS,
      installdir: 'civ5-spike',
      os: OS,
      language: 'english'
    })
  } catch (err) {
    ev('download-error', { error: String((err as Error)?.stack ?? err) })
  }
  clearInterval(timer)
  sample()
  const wallS = (Date.now() - dlStart) / 1000

  // Steady state = samples where bytes are flowing (drop plan build + tail).
  const flowing = series.filter((r) => (r.netMiBs as number) > 0.5)
  const avg = (k: string) => flowing.reduce((s, r) => s + (r[k] as number), 0) / Math.max(1, flowing.length)
  const share = (pred: (r: Record<string, number | boolean>) => boolean) =>
    flowing.filter(pred).length / Math.max(1, flowing.length)
  const summary = {
    label: LABEL,
    appId: APP_ID,
    outcome: outcome && typeof outcome === 'object' ? (outcome as { outcome?: string }).outcome ?? outcome : outcome,
    wallSeconds: Math.round(wallS),
    downloadedMiB: Math.round(stats.fetchBytes / 1048576),
    writtenMiB: Math.round(stats.decodeOutBytes / 1048576),
    avgNetMiBsWholeRun: +(stats.fetchBytes / 1048576 / wallS).toFixed(2),
    steadyNetMiBs: +avg('netMiBs').toFixed(2),
    steadyOutMiBs: +avg('outMiBs').toFixed(2),
    steadyCores: +avg('cores').toFixed(2),
    peakRssMiB: Math.round(peakRss / 1048576),
    poolSize: pool?.stats().size,
    nativeWorkers: pool?.stats().nativeWorkers,
    inlineFallback: pool?.stats().inlineFallback,
    shareOfSecondsPoolSaturated: +share((r) => (r.poolBusy as number) >= (r.poolSize as number) && (r.poolQueued as number) > 0).toFixed(3),
    avgPoolQueued: +avg('poolQueued').toFixed(1),
    avgFetchInflight: +avg('fetchInflight').toFixed(1),
    avgFetchMsPerChunk: Math.round(stats.fetchMsSum / Math.max(1, stats.fetchCalls)),
    avgDecodeMsPerChunk: Math.round(stats.decodeMsSum / Math.max(1, stats.decodeCalls)),
    chunks: stats.decodeCalls,
    fetchErrors: stats.fetchErrors,
    corpus: { chunks: stats.corpusChunks, MiB: Math.round(stats.corpusBytes / 1048576), formats: stats.formats }
  }
  writeFileSync(join(RUN_DIR, 'summary.json'), JSON.stringify(summary, null, 2))
  ev('summary', summary)
  client.logOff()
  // Tree hash of what landed, for 067c's byte-identical comparison.
  const root = join(STEAMAPPS, 'common', 'civ5-spike')
  if (existsSync(root)) {
    const out = execFileSync('/bin/sh', ['-c', `cd "${root}" && find . -type f -print0 | sort -z | xargs -0 shasum -a 1`], { maxBuffer: 1 << 28 })
    writeFileSync(join(RUN_DIR, 'tree.sha1'), out)
    ev('tree-hash', { files: out.toString().split('\n').filter(Boolean).length, digest: createHash('sha1').update(out).digest('hex') })
  }
}

// Give the backend logger time to flush before exiting (node-run2 lost its tail).
const flush = () => new Promise((r) => setTimeout(r, 3000))
main().then(
  () => flush().then(() => process.exit(0)),
  (err) => {
    ev('fatal', { error: String(err?.stack ?? err) })
    void flush().then(() => process.exit(1))
  }
)
