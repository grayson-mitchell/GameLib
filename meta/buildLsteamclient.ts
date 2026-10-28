/**
 * Phase 56 plan 02 (D-01, D-02, D-15, D-16, D-19): build the Steamworks-licensed
 * `lsteamclient.dll` (PE x86_64) and `lsteamclient.so` (Mach-O x86_64) for the
 * `steamclient-layer-cx<build>` component.
 *
 * Inputs: Valve's Proton lsteamclient at a pinned commit (fetched, tree-digest
 * checked, never committed), NotProton's three overlay files plus GameLib's
 * D-15/D-16 `[drm-trace]` blocks (committed under
 * native/steam-bridge/steamclient-layer/lsteamclient/), and a Wine source base:
 * CrossOver's 26.3.0 source drop first, stock Wine 11.15 only if that fails (D-19).
 *
 * Operator-run on a build host, never on a user's machine. It is deliberately
 * unreachable from meta/buildSteamBridgeShims.ts and from release CI, because
 * release CI has zig but no mingw-w64 or bison. Prerequisites:
 * `brew install mingw-w64 bison`. Outputs are never committed, never signed, and
 * never placed under build/bin or public/bin. PINS.md beside the overlay files is
 * the human-readable copy of every pin below.
 *
 * Spawning: every child gets a fresh createFakeHomeProfile() env (two-profile
 * rule, isolated half). This build has no real-profile arm, because nothing in it
 * is profile-dependent.
 */
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { availableParallelism, homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'

// ts-prune-ignore-next
export const LSTEAMCLIENT_PINS = {
  protonCommit: '164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca',
  protonTarballUrl:
    'https://codeload.github.com/ValveSoftware/Proton/tar.gz/164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca',
  treeDigest:
    'b286df1df46a70d9e2cc674676afcc6e08b1a56ce472e5add0932b86940657bf',
  licenseSha256:
    '80fda9147f8ee707cd18d1d6d71b307063fa3a02057a7c789de47f7c003510f1',
  notProtonCommit: '8db22adb237e6ea640a5af148b69b93709daf50c',
  overlay: {
    'steamclient_main.c':
      '9c0762a90c3d32abf1a1f953da913913618acb138cabf1f4bca8628a0d3d4ab0',
    'unixlib.cpp':
      'e219bba2d8af9f0ac9cbdae60bf1bc176b446cd3d89d4322bc06f29e99c323a1',
    'unix_steam_input_manual.cpp':
      '3f9e3390a9c4b060a367a312d61f84fc3690141ef34811484b3c21481d7583a7'
  }
} as const

// ts-prune-ignore-next
export const LSTEAMCLIENT_BASES = {
  crossover: {
    '26.3.0.39832': {
      url: 'https://media.codeweavers.com/pub/crossover/source/crossover-sources-26.3.0.tar.gz',
      sha256:
        'ac99c8ca4b3848f3e81784135f023df266b61c2345726ea55a50b3e030dd6872',
      size: 149054023,
      wineDir: 'sources/wine'
    }
  },
  wine: {
    tag: 'wine-11.15',
    commit: '2df1ee28039cf84776eb1421ed90bd154cebb65f',
    url: 'https://gitlab.winehq.org/wine/wine.git'
  }
} as const

// ts-prune-ignore-next
export const DEFAULT_LSTEAMCLIENT_BASE: 'crossover' | 'wine' = 'crossover'

const DEFAULT_BUILD = '26.3.0.39832'
const PATH_PREPEND = '/opt/homebrew/opt/bison/bin:/opt/homebrew/bin'
const PREFIX_MAP_TARGET = '/gamelib-lsteamclient'
const OVERLAY_DIR = 'native/steam-bridge/steamclient-layer/lsteamclient'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function compareSegments(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return a.length - b.length
}

/**
 * NotProton fetch.sh tree digest: sha256 over files in Python
 * sorted(pathlib.Path) order (segment-wise), per file updating with
 * sha256(utf8 relpath).digest() then sha256(bytes).digest().
 */
// ts-prune-ignore-next
export function lsteamclientTreeDigest(
  files: { relPath: string; bytes: Uint8Array }[]
): string {
  const sorted = files
    .map((f) => ({ f, seg: f.relPath.split('/') }))
    .sort((x, y) => compareSegments(x.seg, y.seg))
  const h = createHash('sha256')
  for (const { f } of sorted) {
    h.update(createHash('sha256').update(f.relPath, 'utf8').digest())
    h.update(createHash('sha256').update(f.bytes).digest())
  }
  return h.digest('hex')
}

const TRACE_BEGIN = '/* GAMELIB-DRM-TRACE BEGIN (Phase 56 D-15/D-16) */'
const TRACE_END = '/* GAMELIB-DRM-TRACE END */'

/** Remove every GAMELIB-DRM-TRACE block, marker lines included. Null on any malformed marker. */
// ts-prune-ignore-next
export function stripGameLibTraceBlocks(text: string): string | null {
  const lines = text.split('\n')
  const out: string[] = []
  let inBlock = false
  for (const line of lines) {
    const t = line.trim()
    const mentionsBegin = line.includes('GAMELIB-DRM-TRACE BEGIN')
    const mentionsEnd = line.includes('GAMELIB-DRM-TRACE END')
    if (mentionsBegin || mentionsEnd) {
      if (t === TRACE_BEGIN) {
        if (inBlock) return null
        inBlock = true
        continue
      }
      if (t === TRACE_END) {
        if (!inBlock) return null
        inBlock = false
        continue
      }
      return null // marker sharing its line with other content
    }
    if (!inBlock) out.push(line)
  }
  return inBlock ? null : out.join('\n')
}

const ANCHOR_ENABLE = /^enable_localui$/m
const ANCHOR_MAKEFILE =
  /^wine_fn_config_makefile dlls\/localui\/tests enable_tests$/m

/** Register dlls/lsteamclient in Wine's generated configure. Null when an anchor is missing. */
// ts-prune-ignore-next
export function registerLsteamclientInConfigure(text: string): string | null {
  if (!ANCHOR_ENABLE.test(text) || !ANCHOR_MAKEFILE.test(text)) return null
  if (text.includes('enable_lsteamclient')) return text
  return text
    .replace(ANCHOR_ENABLE, 'enable_localui\nenable_lsteamclient')
    .replace(
      ANCHOR_MAKEFILE,
      'wine_fn_config_makefile dlls/localui/tests enable_tests\n' +
        'wine_fn_config_makefile dlls/lsteamclient enable_lsteamclient'
    )
}

/** The unix half's SOURCES: Makefile.in `*.cpp` lines, in file order. */
// ts-prune-ignore-next
export function unixSourcesFromMakefileIn(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Za-z0-9_]+\.cpp)\s*\\?\s*$/.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

interface Argv {
  command: string
  args: string[]
}

// ts-prune-ignore-next
export function buildUnixCompileArgv(opts: {
  src: string
  build: string
  cpp: string
  obj: string
  prefixMap: string
}): Argv {
  const { src, build, cpp, obj, prefixMap } = opts
  return {
    command: '/usr/bin/clang++',
    args: [
      '-arch',
      'x86_64',
      '-mmacosx-version-min=15.0',
      '-Werror=unguarded-availability-new',
      `-I${build}/dlls/lsteamclient`,
      `-I${src}/dlls/lsteamclient`,
      `-I${build}/include`,
      `-I${src}/include`,
      '-D__WINESRC__',
      '-DSTEAM_API_EXPORTS',
      '-Dprivate=public',
      '-Dprotected=public',
      '-DWINE_UNIX_LIB',
      '-fPIC',
      '-fasynchronous-unwind-tables',
      '-g',
      '-O2',
      `-ffile-prefix-map=${prefixMap}=${PREFIX_MAP_TARGET}`,
      '-c',
      cpp,
      '-o',
      obj
    ]
  }
}

// ts-prune-ignore-next
export function buildUnixLinkArgv(opts: {
  build: string
  objs: string[]
  out: string
}): Argv {
  return {
    command: '/usr/bin/clang',
    args: [
      '-std=gnu23',
      '-arch',
      'x86_64',
      '-mmacosx-version-min=15.0',
      '-dynamiclib',
      '-install_name',
      '@rpath/lsteamclient.so',
      '-Wl,-rpath,@loader_path/',
      '-o',
      opts.out,
      ...opts.objs,
      `${opts.build}/dlls/ntdll/ntdll.so`,
      '-lc++',
      '-Wl,-undefined,dynamic_lookup'
    ]
  }
}

// ts-prune-ignore-next
export function buildConfigureArgv(opts: {
  srcDir: string
  buildDir: string
  workRoot: string
}): Argv {
  const flags = `-g -O2 -ffile-prefix-map=${opts.workRoot}=${PREFIX_MAP_TARGET}`
  return {
    command: `${opts.srcDir}/configure`,
    args: [
      '--enable-archs=x86_64',
      '--without-freetype',
      '--without-x',
      '--host=x86_64-apple-darwin',
      'CC=clang -arch x86_64',
      'CXX=clang++ -arch x86_64',
      `CFLAGS=${flags}`,
      `CXXFLAGS=${flags}`,
      `CROSSCFLAGS=${flags}`
    ]
  }
}

/** PE machine field, or null on any bounds/magic failure. Never throws. */
// ts-prune-ignore-next
export function peMachine(bytes: Uint8Array): number | null {
  if (bytes.length < 0x40) return null
  const lfanew =
    bytes[0x3c] | (bytes[0x3d] << 8) | (bytes[0x3e] << 16) | (bytes[0x3f] << 24)
  if (lfanew < 0 || lfanew + 6 > bytes.length) return null
  if (
    bytes[lfanew] !== 0x50 ||
    bytes[lfanew + 1] !== 0x45 ||
    bytes[lfanew + 2] !== 0 ||
    bytes[lfanew + 3] !== 0
  )
    return null
  return bytes[lfanew + 4] | (bytes[lfanew + 5] << 8)
}

// ts-prune-ignore-next
export interface OutputFacts {
  peHead: Uint8Array
  peSize: number
  soSize: number
  soArchs: string
  codesignText: string
  objdumpExportsText: string
  otoolText: string
  workRoot: string
  homeDir: string
  containsBytes: (file: 'pe' | 'so', needle: string) => boolean
}

const MIN_BINARY_SIZE = 1_000_000

/** Every compile gate, over injected facts. Failures are named in a fixed order. */
// ts-prune-ignore-next
export function checkLsteamclientOutputs(
  f: OutputFacts
): { ok: true } | { ok: false; failures: string[] } {
  const failures: string[] = []
  if (!(f.peSize > MIN_BINARY_SIZE)) failures.push('pe size')
  if (peMachine(f.peHead) !== 0x8664) failures.push('pe machine')
  if (!(f.soSize > MIN_BINARY_SIZE)) failures.push('so size')
  if (f.soArchs.trim() !== 'x86_64') failures.push('so arch')
  if (!f.codesignText.includes('not signed at all')) failures.push('so signed')
  if (!/\bCreateInterface\b/.test(f.objdumpExportsText))
    failures.push('export CreateInterface')
  if (!/\bsteamclient_init_registry\b/.test(f.objdumpExportsText))
    failures.push('export steamclient_init_registry')
  if (!f.containsBytes('pe', '[drm-trace] appId='))
    failures.push('trace string')
  if (
    f.workRoot &&
    f.otoolText.split('\n').some((l) => l.trim().startsWith(f.workRoot))
  )
    failures.push('so work-dir dependency')
  if (f.homeDir.length > 1) {
    if (f.containsBytes('pe', f.homeDir)) failures.push('home path in pe')
    if (f.containsBytes('so', f.homeDir)) failures.push('home path in so')
  }
  return failures.length ? { ok: false, failures } : { ok: true }
}

const ALLOWED_HOSTS = new Set([
  'codeload.github.com',
  'media.codeweavers.com',
  'gitlab.winehq.org'
])

// ts-prune-ignore-next
export function isAllowedSourceUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return (
    u.protocol === 'https:' &&
    !u.username &&
    !u.password &&
    ALLOWED_HOSTS.has(u.hostname)
  )
}

const BUILD_RE = /^\d+\.\d+\.\d+(\.\d+)*$/

function assertBuild(build: string): void {
  if (!BUILD_RE.test(build)) throw new Error(`invalid --build "${build}"`)
}

// ts-prune-ignore-next
export function lsteamclientOutputDir(build: string): string {
  assertBuild(build)
  return join('build', 'steamclient-layer', `steamclient-layer-cx${build}`)
}

// ts-prune-ignore-next
export function buildRecordPath(build: string): string {
  assertBuild(build)
  return join(
    'build',
    'steamclient-layer',
    `lsteamclient-build-cx${build}.json`
  )
}

// ---------------------------------------------------------------------------
// Impure pipeline
// ---------------------------------------------------------------------------

function gateFail(id: string, msg: string): Error {
  return new Error(`COMPILE GATE FAILED (56-02, ${id}): ${msg}`)
}

interface SpawnOpts {
  cwd?: string
  logFile?: string
  pathPrepend?: string
  capture?: boolean
}

/** argv-form spawn under a fresh fake HOME, disposed in finally. */
function spawnLogged(
  command: string,
  args: string[],
  opts: SpawnOpts = {}
): Promise<{ code: number; out: string }> {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-lsteamclient-' })
  const basePath = process.env.PATH ?? ''
  const env = profile.childEnv({
    ...process.env,
    PATH: `${opts.pathPrepend ?? PATH_PREPEND}:${basePath}`
  })
  return new Promise((resolvePromise, reject) => {
    const log = opts.logFile
      ? createWriteStream(opts.logFile, { flags: 'a' })
      : null
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    const onData = (d: Buffer) => {
      if (log) log.write(d)
      if (opts.capture) out += d.toString('utf8')
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const done = () => {
      try {
        profile.dispose()
      } catch {
        /* best effort */
      }
    }
    child.on('error', (e) => {
      done()
      log?.end()
      reject(e)
    })
    child.on('close', (code) => {
      done()
      log?.end(() => resolvePromise({ code: code ?? 1, out }))
      if (!log) resolvePromise({ code: code ?? 1, out })
    })
  })
}

function logTail(file: string, n = 40): string {
  try {
    return readFileSync(file, 'utf8').split('\n').slice(-n).join('\n')
  } catch {
    return '(no log)'
  }
}

async function download(
  url: string,
  dest: string,
  expect?: { sha256: string; size: number }
): Promise<void> {
  if (!isAllowedSourceUrl(url)) throw new Error(`url not allowed: ${url}`)
  if (existsSync(dest) && expect) {
    const have = createHash('sha256').update(readFileSync(dest)).digest('hex')
    if (have === expect.sha256) return
    rmSync(dest)
  } else if (existsSync(dest)) {
    return
  }
  mkdirSync(dirname(dest), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body)
    throw new Error(`download failed ${res.status}: ${url}`)
  if (!isAllowedSourceUrl(res.url))
    throw new Error(`redirect not allowed: ${res.url}`)
  const part = `${dest}.part`
  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(part)
  )
  renameSync(part, dest)
  if (expect) {
    const hash = createHash('sha256')
    await pipeline(createReadStream(dest), async function (src) {
      for await (const chunk of src) hash.update(chunk as Buffer)
    })
    const size = statSync(dest).size
    if (hash.digest('hex') !== expect.sha256 || size !== expect.size) {
      rmSync(dest)
      throw gateFail('crossover-source sha', `${url} did not match its pin`)
    }
  }
}

function walkTree(root: string): { relPath: string; bytes: Buffer }[] {
  const out: { relPath: string; bytes: Buffer }[] = []
  const rec = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      const st = lstatSync(abs)
      const r = rel ? `${rel}/${name}` : name
      if (st.isSymbolicLink()) throw gateFail('proton digest', `symlink ${r}`)
      if (st.isDirectory()) rec(abs, r)
      else if (st.isFile()) out.push({ relPath: r, bytes: readFileSync(abs) })
      else throw gateFail('proton digest', `non-regular entry ${r}`)
    }
  }
  rec(root, '')
  return out
}

function now(): number {
  return Math.round(Date.now() / 1000)
}

// ts-prune-ignore-next
export async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const base = (arg('--base') ?? DEFAULT_LSTEAMCLIENT_BASE) as
    | 'crossover'
    | 'wine'
  if (base !== 'crossover' && base !== 'wine')
    throw new Error('--base must be crossover or wine')
  const build = arg('--build') ?? DEFAULT_BUILD
  assertBuild(build)
  const outDir = resolve(arg('--out') ?? lsteamclientOutputDir(build))
  const workRoot = resolve(arg('--work') ?? join('build', 'lsteamclient-work'))
  const check = argv.includes('--check')
  const logs = join(workRoot, 'logs')
  mkdirSync(logs, { recursive: true })
  const t0 = now()
  const steps: Record<string, number> = {}
  const step = (name: string) => {
    steps[name] = now() - t0
    console.log(
      `[lsteamclient] step=${name} base=${base} elapsed_s=${steps[name]}`
    )
  }

  const runStep = async (
    id: string,
    cmd: string,
    args: string[],
    cwd?: string
  ): Promise<void> => {
    const logFile = join(logs, `${id}.log`)
    const r = await spawnLogged(cmd, args, { cwd, logFile })
    if (r.code !== 0) throw gateFail(id, `exit ${r.code}\n${logTail(logFile)}`)
  }

  const gatesFor = async (dll: string, so: string): Promise<void> => {
    const peBuf = readFileSync(dll)
    const soBuf = readFileSync(so)
    const lipo = await spawnLogged('/usr/bin/lipo', ['-archs', so], {
      capture: true
    })
    const cs = await spawnLogged('/usr/bin/codesign', ['-dv', so], {
      capture: true
    })
    const od = await spawnLogged('x86_64-w64-mingw32-objdump', ['-p', dll], {
      capture: true
    })
    const ot = await spawnLogged('/usr/bin/otool', ['-L', so], {
      capture: true
    })
    const result = checkLsteamclientOutputs({
      peHead: peBuf.subarray(0, 4096),
      peSize: peBuf.length,
      soSize: soBuf.length,
      soArchs: lipo.out,
      codesignText: cs.out,
      objdumpExportsText: od.out,
      otoolText: ot.out,
      workRoot,
      homeDir: homedir(),
      containsBytes: (file, needle) =>
        (file === 'pe' ? peBuf : soBuf).includes(Buffer.from(needle, 'utf8'))
    })
    if (!result.ok) throw gateFail('outputs', result.failures.join('; '))
  }

  if (check) {
    await gatesFor(
      join(outDir, 'lsteamclient.dll'),
      join(outDir, 'lsteamclient.so')
    )
    console.log(`Output gate PASSED (56-02) -> ${outDir}`)
    return
  }

  // 3. prerequisites
  const missing: string[] = []
  for (const tool of [
    'x86_64-w64-mingw32-gcc',
    'x86_64-w64-mingw32-objdump',
    'bison',
    'flex',
    'make',
    'git',
    'tar',
    'lipo',
    'codesign',
    'otool'
  ]) {
    const r = await spawnLogged('/usr/bin/which', [tool], { capture: true })
    if (r.code !== 0) missing.push(tool)
  }
  let bisonVersion = ''
  if (!missing.includes('bison')) {
    const r = await spawnLogged('bison', ['--version'], { capture: true })
    bisonVersion = r.out.split('\n')[0] ?? ''
    const major = Number(/(\d+)\.\d+/.exec(bisonVersion)?.[1] ?? '0')
    if (major < 3) missing.push('bison>=3')
  }
  if (missing.length)
    throw gateFail(
      'prerequisites',
      `missing ${missing.join(', ')}; install with brew install mingw-w64 bison`
    )
  step('prerequisites')

  // 4. Proton
  const dl = join(workRoot, 'downloads')
  const protonTgz = join(dl, 'proton-164e0ccd.tar.gz')
  await download(LSTEAMCLIENT_PINS.protonTarballUrl, protonTgz)
  const protonDir = join(workRoot, 'proton-extract')
  rmSync(protonDir, { recursive: true, force: true })
  mkdirSync(protonDir, { recursive: true })
  await runStep('proton-extract', '/usr/bin/tar', [
    '-xzf',
    protonTgz,
    '-C',
    protonDir,
    '--strip-components=2',
    '*/lsteamclient/'
  ])
  const files = walkTree(protonDir)
  const digest = lsteamclientTreeDigest(files)
  if (digest !== LSTEAMCLIENT_PINS.treeDigest)
    throw gateFail(
      'proton digest',
      `expected ${LSTEAMCLIENT_PINS.treeDigest} got ${digest}`
    )
  const treeDir = join(workRoot, 'lsteamclient-tree')
  rmSync(treeDir, { recursive: true, force: true })
  await runStep('tree-copy', '/bin/cp', ['-R', protonDir, treeDir])
  const licenseBytes = readFileSync(join(protonDir, 'LICENSE'))
  if (sha256Hex(licenseBytes) !== LSTEAMCLIENT_PINS.licenseSha256)
    throw gateFail('license', 'LICENSE sha mismatch')
  for (const [name, pin] of Object.entries(LSTEAMCLIENT_PINS.overlay)) {
    if (!existsSync(join(treeDir, name)))
      throw gateFail('overlay', `${name} not in the Valve tree (replace-only)`)
    const mine = readFileSync(join(OVERLAY_DIR, name))
    if (name === 'steamclient_main.c') {
      const stripped = stripGameLibTraceBlocks(mine.toString('utf8'))
      if (stripped === null || sha256Hex(Buffer.from(stripped, 'utf8')) !== pin)
        throw gateFail(
          'overlay',
          `${name} does not strip back to the upstream pin`
        )
    } else if (sha256Hex(mine) !== pin) {
      throw gateFail('overlay', `${name} differs from its pin`)
    }
    copyFileSync(join(OVERLAY_DIR, name), join(treeDir, name))
  }
  step('proton')

  // 5. base tree
  let srcDir: string
  let basePin: string
  if (base === 'crossover') {
    const b = LSTEAMCLIENT_BASES.crossover['26.3.0.39832']
    const tgz = join(dl, 'crossover-sources-26.3.0.tar.gz')
    await download(b.url, tgz, { sha256: b.sha256, size: b.size })
    const xdir = join(workRoot, 'crossover-26.3.0')
    srcDir = join(xdir, 'wine')
    if (!existsSync(join(srcDir, 'configure'))) {
      rmSync(xdir, { recursive: true, force: true })
      mkdirSync(xdir, { recursive: true })
      await runStep('crossover-extract', '/usr/bin/tar', [
        '-xzf',
        tgz,
        '-C',
        xdir,
        '--strip-components=2',
        '*/sources/wine'
      ])
    }
    basePin = `crossover-sources-26.3.0 sha256 ${b.sha256}`
  } else {
    const w = LSTEAMCLIENT_BASES.wine
    srcDir = join(workRoot, 'wine-11.15', 'src')
    if (!existsSync(join(srcDir, '.git'))) {
      rmSync(srcDir, { recursive: true, force: true })
      mkdirSync(dirname(srcDir), { recursive: true })
      await runStep('wine-clone', 'git', [
        'clone',
        '--depth',
        '1',
        '--branch',
        w.tag,
        w.url,
        srcDir
      ])
    }
    const head = await spawnLogged('git', ['-C', srcDir, 'rev-parse', 'HEAD'], {
      capture: true
    })
    if (head.out.trim() !== w.commit)
      throw gateFail(
        'wine commit',
        `got ${head.out.trim()} expected ${w.commit}`
      )
    basePin = `wine ${w.tag} @ ${w.commit}`
  }
  const cfgPath = join(srcDir, 'configure')
  const registered = registerLsteamclientInConfigure(
    readFileSync(cfgPath, 'utf8')
  )
  if (registered === null) throw gateFail('configure anchors', 'anchor missing')
  writeFileSync(cfgPath, registered)
  const dllDir = join(srcDir, 'dlls', 'lsteamclient')
  rmSync(dllDir, { recursive: true, force: true })
  await runStep('lsteamclient-install', '/bin/cp', ['-R', treeDir, dllDir])
  step('base')

  // 6. configure
  const buildDir = join(workRoot, `${base}-build`)
  mkdirSync(buildDir, { recursive: true })
  if (!existsSync(join(buildDir, 'Makefile'))) {
    const c = buildConfigureArgv({ srcDir, buildDir, workRoot })
    await runStep('configure', c.command, c.args, buildDir)
  }
  if (
    !/^host_cpu = x86_64/m.test(
      readFileSync(join(buildDir, 'config.status'), 'utf8')
    ) &&
    !/host_cpu\s*=\s*x86_64/.test(
      readFileSync(join(buildDir, 'config.status'), 'utf8')
    )
  )
    throw gateFail('configure', 'config.status host_cpu is not x86_64')
  step('configure')

  // 7. make
  const j = String(availableParallelism())
  for (const target of [
    'dlls/ntdll/ntdll.so',
    'dlls/lsteamclient/x86_64-windows/lsteamclient.dll'
  ])
    await runStep(
      `make-${target.replace(/\//g, '_')}`,
      'make',
      ['-j' + j, target],
      buildDir
    )
  step('make')

  // 8. unix half
  const sources = unixSourcesFromMakefileIn(
    readFileSync(join(dllDir, 'Makefile.in'), 'utf8')
  )
  if (!sources.length) throw gateFail('unix sources', 'no .cpp in Makefile.in')
  const objDir = join(buildDir, 'unix-objs')
  mkdirSync(objDir, { recursive: true })
  const objs = sources.map((s) => join(objDir, s.replace(/\.cpp$/, '.o')))
  let next = 0
  const worker = async () => {
    while (next < sources.length) {
      const i = next++
      const cpp = join(dllDir, sources[i])
      if (
        existsSync(objs[i]) &&
        statSync(objs[i]).mtimeMs > statSync(cpp).mtimeMs
      )
        continue
      const a = buildUnixCompileArgv({
        src: srcDir,
        build: buildDir,
        cpp,
        obj: objs[i],
        prefixMap: workRoot
      })
      await runStep(`unix-cc-${sources[i]}`, a.command, a.args, buildDir)
    }
  }
  await Promise.all(Array.from({ length: Number(j) }, worker))
  const soOut = join(buildDir, 'lsteamclient.so')
  const link = buildUnixLinkArgv({ build: buildDir, objs, out: soOut })
  await runStep('unix-link', link.command, link.args, buildDir)
  const dllOut = join(
    buildDir,
    'dlls/lsteamclient/x86_64-windows/lsteamclient.dll'
  )
  step('unix')

  // 9. gates, 10. install
  await gatesFor(dllOut, soOut)
  step('gates')
  mkdirSync(outDir, { recursive: true })
  const dllDest = join(outDir, 'lsteamclient.dll')
  const soDest = join(outDir, 'lsteamclient.so')
  copyFileSync(dllOut, dllDest)
  copyFileSync(soOut, soDest)
  writeFileSync(join(outDir, 'LICENSE.lsteamclient'), licenseBytes)
  await gatesFor(dllDest, soDest)

  const first = async (cmd: string, args: string[]) =>
    (
      (await spawnLogged(cmd, args, { capture: true })).out.split('\n')[0] ?? ''
    ).trim()
  const record = {
    base,
    basePin,
    protonCommit: LSTEAMCLIENT_PINS.protonCommit,
    treeDigest: digest,
    overlay: LSTEAMCLIENT_PINS.overlay,
    outputs: {
      'lsteamclient.dll': {
        sha256: sha256Hex(readFileSync(dllDest)),
        size: statSync(dllDest).size
      },
      'lsteamclient.so': {
        sha256: sha256Hex(readFileSync(soDest)),
        size: statSync(soDest).size
      }
    },
    mingw: await first('x86_64-w64-mingw32-gcc', ['--version']),
    clang: await first('/usr/bin/clang', ['--version']),
    bison: bisonVersion,
    stepsElapsedS: steps
  }
  const recPath = resolve(buildRecordPath(build))
  mkdirSync(dirname(recPath), { recursive: true })
  writeFileSync(recPath, JSON.stringify(record, null, 2) + '\n')
  for (const [name, o] of Object.entries(record.outputs))
    console.log(
      `Compile gate PASSED (56-02) -> ${join(outDir, name)} size=${o.size} sha256=${o.sha256}`
    )
}

if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
