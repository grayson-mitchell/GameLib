/**
 * Quick task 260917-uik. Signs every Mach-O under the macOS helper tree
 * (`build/bin/arm64/darwin`) with the Developer ID identity, the hardened
 * runtime and a secure timestamp, AT ITS SOURCE PATH in the runner
 * workspace -- before Tauri's bundler copies that tree into
 * `GameLib.app/Contents/Resources/` and before Tauri signs the outer `.app`.
 *
 * WHY THIS EXISTS. GitHub Actions run 35223308954 (the first tag push
 * `release-tauri.yml` has ever completed) built and signed the macOS leg and
 * then FAILED notarization: `"status": "Invalid"`, "Archive contains critical
 * validation errors", across 253 distinct paths, 100% of them under
 * `Contents/Resources/build/bin/arm64/darwin/`. Tauri's signing pass signs
 * exactly `Contents/MacOS/*` and the outer bundle; it does not recurse
 * `Contents/Resources`. Apple's four verbatim complaints were "the signature
 * does not include a secure timestamp" (506 instances), "not signed with a
 * valid Developer ID certificate" (500), "the executable does not have the
 * hardened runtime enabled" (10) and "the signature of the binary is
 * invalid" (6) -- which map 1:1 onto `--timestamp`, `--sign "$IDENTITY"`,
 * `--options runtime`, and signing the file at all.
 *
 * WHY RE-SIGNING IS SAFE HERE. Measured 2026-09-17 with
 * `codesign -dv --verbose=4`: every one of the 253 carries an AD-HOC
 * signature (`legendary` -> `flags=0x2(adhoc)`, `comet` ->
 * `flags=0x20002(adhoc,linker-signed)`). An ad-hoc signature carries no team
 * identity and no entitlements, so there is no third-party Developer ID seal
 * being destroyed. `--force` is REQUIRED (the files already bear a
 * signature; without it codesign refuses).
 *
 * WHY PER-FILE AND NEVER A BUNDLE SEAL. `find build/bin/arm64/darwin -name
 * _CodeSignature` returns EMPTY -- PyInstaller signed each Mach-O
 * individually and never sealed the three `Python.framework` bundles. A
 * bundle seal (`CodeResources`) hashes the bundle's file layout including
 * its symlinks, and there are 12 symlinks in this tree whose fate under
 * Tauri's `bundle.macOS.files` copy is unverified. An embedded per-file
 * signature lives inside the Mach-O's own `LC_CODE_SIGNATURE` load command
 * -- it is data IN the file -- so it survives any byte-preserving copy
 * regardless of how symlinks are handled.
 *
 * Run through `meta/runTs.cjs` via the `sign:macos-resources` package
 * script. See `.planning/quick/260917-uik-sign-every-mach-o-under-contents-resourc/`.
 *
 * HONESTY NOTE: nothing this file does is verified. A green local dry-run
 * proves the detector and the argv only. Whether the signature survives
 * Tauri's copy, whether the temp keychain the workflow step creates coexists
 * with Tauri's own keychain handling, and whether notarization returns
 * `Accepted` are all LIVE-ONLY questions. So is whether a helper crashes at
 * runtime under the hardened runtime with no entitlements -- a notarization
 * `Accepted` says nothing about that.
 */
import { spawn } from 'node:child_process'
import { lstat, open, readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * Bytes read per candidate file: 4 for the magic, plus 4 more so a fat
 * header's `nfat_arch` is available without a second read.
 */
export const MACHO_HEADER_BYTES = 8

// Read as a BIG-ENDIAN u32 over the first four bytes on disk, so all four
// thin-Mach-O spellings collapse to this one constant set:
//   bytes fe ed fa ce -> MH_MAGIC     (32-bit, big-endian file)
//   bytes fe ed fa cf -> MH_MAGIC_64  (64-bit, big-endian file)
//   bytes ce fa ed fe -> MH_CIGAM     (32-bit, little-endian file)
//   bytes cf fa ed fe -> MH_CIGAM_64  (64-bit, little-endian file -- this is
//                                      what every arm64/x86_64 helper is)
const MH_MAGIC = 0xfeedface
const MH_MAGIC_64 = 0xfeedfacf
const MH_CIGAM = 0xcefaedfe
const MH_CIGAM_64 = 0xcffaedfe

// Universal ("fat") binaries. FAT_MAGIC is big-endian on disk, FAT_CIGAM is
// the byte-swapped spelling; `nfat_arch` follows in the same byte order.
const FAT_MAGIC = 0xcafebabe
const FAT_CIGAM = 0xbebafeca

/**
 * `0xCAFEBABE` is BOTH FAT_MAGIC and the Java class-file magic. A `.class`
 * file's next u32 is `minor<<16 | major` -- e.g. `00 00 00 34` for major
 * version 52 (Java 8), which reads as `nfat_arch = 52`. Real universal
 * binaries hold a handful of architectures, never dozens, so an
 * implausible-`nfat_arch` check separates the two without ever looking at a
 * filename. Without it a stray `.class` would be handed to codesign.
 */
const MAX_PLAUSIBLE_FAT_ARCH = 32

/**
 * Per-path entitlements, keyed by path relative to the scanned directory.
 *
 * DELIBERATELY EMPTY, and shipping empty. Entitlements are not a
 * notarization input at all: none of Apple's four complaints above is about
 * an entitlement. `disable-library-validation` is unnecessary because all
 * 253 files get the SAME Team ID, so a helper loading its own
 * `libssl.3.dylib` / `Python.framework/Versions/3.12/Python` /
 * `*.cpython-312-darwin.so` is a same-team load. CPython 3.12 has no JIT
 * (the copy-and-patch JIT is 3.13+ and opt-in at build time).
 *
 * This map is the designated seam for the one case that WOULD justify an
 * entry: a live run showing a specific helper crashing under the hardened
 * runtime -- plausibly libffi/ctypes wanting `MAP_JIT`, which would need
 * `com.apple.security.cs.allow-jit` on that ONE helper. Adding an entry
 * requires an OBSERVED crash, not a hunch. This repo's own history is the
 * argument: the sidecar's `allow-jit` was added for a predicted failure that
 * turned out not to be the failure.
 */
export const HELPER_ENTITLEMENTS: Record<string, string> = {}

/**
 * Backoff schedule for Apple's timestamp authority. `--timestamp` makes a
 * network round-trip per file and this run makes ~253 of them back to back;
 * Apple rate-limits under exactly that pattern ("The timestamp service is
 * not available"). Bounded on purpose -- after the budget the whole run
 * fails, because an unsigned survivor recreates the defect verbatim.
 */
// Not exported (this and CliOptions, SignResult below): verified to have no
// importer anywhere -- not in meta/__tests__, not in src/**/__tests__,
// nowhere (`pnpm find-deadcode` / ts-prune flagged the previously-exported
// forms as over-broad `export` keywords).
const TIMESTAMP_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]

interface CliOptions {
  dir: string
  keychain: string
  identity: string
  dryRun: boolean
}

interface SignResult {
  /** Mach-O files selected by magic bytes. */
  detected: number
  /** Files actually signed (0 in a dry run). */
  signed: number
  /** The exact argv handed to (or, in a dry run, withheld from) codesign. */
  commands: string[][]
}

/**
 * Magic-byte test. No filesystem, no filename, no extension -- this repo
 * ships a text file named `legendary` alongside a Mach-O named
 * `cd.cpython-312-darwin.so`, and either heuristic would be wrong in both
 * directions.
 */
export function isMachO(headerBytes: Buffer): boolean {
  if (headerBytes.length < MACHO_HEADER_BYTES) {
    return false
  }

  const magic = headerBytes.readUInt32BE(0)

  if (
    magic === MH_MAGIC ||
    magic === MH_MAGIC_64 ||
    magic === MH_CIGAM ||
    magic === MH_CIGAM_64
  ) {
    return true
  }

  if (magic === FAT_MAGIC || magic === FAT_CIGAM) {
    const nfatArch =
      magic === FAT_MAGIC
        ? headerBytes.readUInt32BE(4)
        : headerBytes.readUInt32LE(4)
    return nfatArch > 0 && nfatArch < MAX_PLAUSIBLE_FAT_ARCH
  }

  return false
}

/**
 * Deepest path first; ties broken lexicographically so the order is
 * deterministic run to run.
 *
 * Ordering is belt-and-braces here rather than load-bearing: because we sign
 * at the SOURCE path, no bundle exists yet to invalidate. It matters only if
 * a future caller points this at an already-assembled tree.
 */
export function deepestFirst(a: string, b: string): number {
  const depthA = a.split(sep).length
  const depthB = b.split(sep).length
  if (depthA !== depthB) {
    return depthB - depthA
  }
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

async function readHeader(path: string): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(MACHO_HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, MACHO_HEADER_BYTES, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

/**
 * Walks `dir` and returns every Mach-O under it, deepest-first.
 *
 * SYMLINKS ARE SKIPPED, via `lstat` rather than any `-follow` equivalent.
 * The 12 symlinks in the helper tree (`_internal/Python`,
 * `Python.framework/Python`, `Python.framework/Resources`,
 * `Python.framework/Versions/Current`, x3 helpers) all point at targets that
 * are separately present as regular files inside the same tree, so skipping
 * the links signs every real byte exactly once instead of signing some files
 * twice through their aliases.
 */
export async function collectMachOFiles(dir: string): Promise<string[]> {
  const found: string[] = []

  async function walk(current: string): Promise<void> {
    const names = await readdir(current)
    for (const name of names) {
      const path = join(current, name)
      const stats = await lstat(path)

      if (stats.isSymbolicLink()) {
        continue
      }
      if (stats.isDirectory()) {
        await walk(path)
        continue
      }
      if (!stats.isFile()) {
        continue
      }

      const header = await readHeader(path)
      if (isMachO(header)) {
        found.push(path)
      }
    }
  }

  await walk(dir)
  return found.sort(deepestFirst)
}

/**
 * Builds the codesign argv. ONE builder, used by both the real path and the
 * dry-run print, so what a dry run shows is what a real run runs -- a
 * separate dry-run formatter would make the argv assertions prove nothing.
 *
 * NEVER `--deep`: Apple deprecates it for signing, it applies the OUTER
 * entitlements to nested content, and it would seal the `Python.framework`
 * bundles this tree deliberately leaves unsealed.
 *
 * NEVER `--entitlements` by default: entitlements are not a notarization
 * input, and `src-tauri/entitlements.plist` (the app/sidecar file whose
 * `allow-jit` the failed run vindicated) must never reach a helper -- passing
 * it here would be a silent grant of JIT to 253 binaries not shown to need
 * it. The optional parameter exists only for `HELPER_ENTITLEMENTS`, which is
 * empty.
 */
export function codesignArgs(
  file: string,
  identity: string,
  keychain: string,
  entitlements?: string
): string[] {
  const args = [
    '--force',
    '--sign',
    identity,
    '--options',
    'runtime',
    '--timestamp',
    '--keychain',
    keychain
  ]
  if (entitlements !== undefined) {
    args.push('--entitlements', entitlements)
  }
  args.push(file)
  return args
}

/**
 * True only for a timestamp-authority failure. Every other codesign failure
 * fails immediately -- retrying a bad identity or an unreadable file 4 times
 * just buys 15 seconds of the same error.
 */
export function isTimestampServiceFailure(stderr: string): boolean {
  return /timestamp/i.test(stderr)
}

interface CommandResult {
  status: number | null
  stderr: string
}

function runCodesign(args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // No `env` override: this must inherit the runner's environment as-is.
    const child = spawn('codesign', args, {
      stdio: ['ignore', 'inherit', 'pipe']
    })
    let stderr = ''
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    child.on('error', reject)
    child.on('close', (status) => {
      resolve({ status, stderr })
    })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function signOne(args: string[], file: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const result = await runCodesign(args)
    if (result.status === 0) {
      return
    }

    const retryable =
      isTimestampServiceFailure(result.stderr) &&
      attempt < TIMESTAMP_RETRY_DELAYS_MS.length

    if (!retryable) {
      throw new Error(
        `codesign exited ${String(result.status)} for ${file} after ` +
          `${String(attempt + 1)} attempt(s). No file may be skipped ` +
          'silently -- an unsigned survivor recreates the notarization ' +
          `defect verbatim.\n${result.stderr}`
      )
    }

    const wait = TIMESTAMP_RETRY_DELAYS_MS[attempt]
    console.log(
      `signMachOResources: timestamp service failure on ${file}; ` +
        `retrying in ${String(wait)}ms (attempt ${String(attempt + 2)} of ` +
        `${String(TIMESTAMP_RETRY_DELAYS_MS.length + 1)})`
    )
    await delay(wait)
  }
}

/**
 * The driver. Throws on every failure mode -- a zero-file run, a missing
 * directory, or a codesign failure that outlived the retry budget. A
 * zero-count success is FORBIDDEN: it is indistinguishable from a broken
 * walk, and it is exactly the shape of a green check proving nothing.
 */
export async function signMachOResources(
  options: CliOptions
): Promise<SignResult> {
  const files = await collectMachOFiles(options.dir)

  if (files.length === 0) {
    throw new Error(
      `signMachOResources: found ZERO Mach-O files under ${options.dir}. ` +
        'That is a hard failure, not a silent success -- either the helper ' +
        'tree was never populated or the detector is broken.'
    )
  }

  console.log(
    `signMachOResources: detected ${String(files.length)} Mach-O file(s) ` +
      `under ${options.dir}`
  )

  const commands: string[][] = []
  let signed = 0

  for (const file of files) {
    const rel = relative(options.dir, file)
    const entitlements: string | undefined = HELPER_ENTITLEMENTS[rel]
    const args = codesignArgs(
      file,
      options.identity,
      options.keychain,
      entitlements
    )
    commands.push(args)

    if (options.dryRun) {
      console.log(`codesign ${args.join(' ')}`)
      continue
    }

    await signOne(args, file)
    signed += 1
  }

  if (options.dryRun) {
    console.log(
      `signMachOResources: dry run -- would sign ${String(files.length)} ` +
        'file(s); nothing was signed'
    )
  } else {
    console.log(
      `signMachOResources: signed ${String(signed)}/${String(files.length)}`
    )
  }

  return { detected: files.length, signed, commands }
}

/**
 * `--flag value` and `--flag=value` are both accepted; `--dry-run` is a bare
 * boolean. The identity falls back to `$APPLE_SIGNING_IDENTITY`, which is
 * what the workflow step relies on.
 *
 * A bare `--` is SKIPPED, not treated as a flag. Measured while authoring
 * this file, not anticipated: `pnpm sign:macos-resources -- --dir X` forwards
 * the `--` separator VERBATIM into this script's argv (pnpm appends the extra
 * args to the end of the resolved script string, and `meta/runTs.cjs` passes
 * every token after the entry file through unchanged). Without this branch,
 * `--` matched `startsWith('--')`, swallowed `--dir` as its value, and the
 * run died with "--dir is required" while the caller's command line plainly
 * contained it.
 */
export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): CliOptions {
  const values: Record<string, string> = {}
  let dryRun = false

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--' || !token.startsWith('--')) {
      continue
    }
    if (token === '--dry-run') {
      dryRun = true
      continue
    }
    const eq = token.indexOf('=')
    if (eq !== -1) {
      values[token.slice(2, eq)] = token.slice(eq + 1)
      continue
    }
    // A following token that is itself a flag is never consumed as a value --
    // that would silently eat the next option on a typo'd command line.
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      values[token.slice(2)] = next
      i++
    }
  }

  const dir = values.dir
  if (dir === undefined || dir.length === 0) {
    throw new Error('signMachOResources: --dir is required')
  }

  const identity = values.identity ?? env.APPLE_SIGNING_IDENTITY
  if (identity === undefined || identity.length === 0) {
    throw new Error(
      'signMachOResources: no signing identity -- pass --identity or set ' +
        'APPLE_SIGNING_IDENTITY'
    )
  }

  const keychain = values.keychain
  if (keychain === undefined || keychain.length === 0) {
    throw new Error('signMachOResources: --keychain is required')
  }

  return { dir, keychain, identity, dryRun }
}

// Not exported: no file imports `main` from this module -- it is only ever
// self-invoked by this file's own bottom guard (`node meta/runTs.cjs` runs
// this script directly), which is why ts-prune reports it as "used in
// module" rather than unreachable.
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  await signMachOResources(options)
}

// See meta/buildSteamBridgeShims.ts for why this can't use the usual
// `require.main === module` idiom (run via `node meta/runTs.cjs`, which DOES
// set `require.main` -- but this module is also imported directly by its jest
// suite). `JEST_WORKER_ID` reliably distinguishes "imported under test" from
// "run as a CLI" (same guard as meta/gen_vtables.ts /
// meta/buildCrossoverIndex.ts).
//
// Load-bearing here specifically: this repo has already been bitten by
// importing a `meta/` script and having its `main()` run and rewrite an
// artifact. In THIS file, an unguarded `main()` would run codesign over a
// real tree during a test run.
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
