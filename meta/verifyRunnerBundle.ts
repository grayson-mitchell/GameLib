/**
 * Phase 34.9 Plan 08: artifact-level verification for the three onedir
 * macOS runners (legendary/gogdl/nile) inside a BUILT bundle.
 *
 * Why this exists (34.9-RESEARCH.md Pitfall 2): electron-builder issue #3940
 * records that binaries inside `app.asar.unpacked` have not always been
 * signed correctly -- a `codesign --verify` on the outer `.app` can pass
 * while an individual nested binary is unsigned, with the rejection only
 * surfacing at `notarytool submit` time. tauri-apps/tauri#11992 documents the
 * same silent-partial-success shape for `bundle.resources` staging. A
 * packaging step that emits no error is not evidence that every file
 * arrived -- this repo has an established lesson of exactly this shape (a
 * green suite has beaten a live gate three times; a mutating call's own
 * report is never accepted as proof of its effect). This tool inspects the
 * BUILT artifact directly instead of inferring success from the absence of a
 * packaging error.
 *
 * Signing reality (34.9-RESEARCH.md Pitfall 4): every real macOS CI run this
 * repo has ever executed shipped UNSIGNED -- D-03/D-04 defer paid Apple
 * Developer enrolment. Signature state is therefore REPORTED as data
 * (`unsigned` / `adhoc` / `signed:<identity>` / `unknown:<stderr excerpt>`),
 * never asserted as a pass condition. Presence, executability, Mach-O-ness
 * and a minimum file count ARE enforced, because those are true regardless
 * of certificates.
 *
 * Every external invocation (`codesign`, `file`) is argv-form `spawnSync`
 * with an argument array and no shell option (T-34.9-03, mirroring
 * meta/downloadZig.ts's T-24-06 control) -- a discovered path is passed as a
 * single argv element, so a filename containing shell metacharacters cannot
 * become a command.
 *
 * Scope: exactly the three onedir runners. comet, win32, linux and the
 * sidecar are never inspected by this tool.
 *
 * Run with `pnpm verify:runner-bundle <root> [--arch=<x64|arm64>] [--json]`.
 */

import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readlinkSync,
  readSync,
  statSync,
  type Dirent
} from 'node:fs'
import { basename, join, resolve as resolvePath } from 'node:path'

// ---------------------------------------------------------------------------
// The three onedir runners -- never comet, never win32/linux, never the
// sidecar (T-34.9-SC / scope).
// ---------------------------------------------------------------------------

export const RUNNERS = ['legendary', 'gogdl', 'nile'] as const
export type RunnerName = (typeof RUNNERS)[number]

// A onedir tree holds ~100+ files (measured reference: 108 files / 103
// Mach-O for a nile bundle, 34.9-CONTEXT.md). A directory containing only a
// repackaged onefile executable would hold a handful of files -- this floor
// catches that smuggled shape (T-34.9-26).
const FILE_COUNT_FLOOR = 20

export interface MachOSignature {
  path: string
  signature: string
}

export interface RunnerInspection {
  runner: RunnerName
  binaryPath: string
  exists: boolean
  executable: boolean
  isMachO: boolean
  fileCount: number
  machoCount: number
  machoFiles: MachOSignature[]
  frameworks: FrameworkInspection[]
}

// ---------------------------------------------------------------------------
// Framework structural integrity (F-34.9-01, plan 34.9-13). vite's copyDir
// dereferenced every `Python.framework/Versions/Current` symlink into a real
// directory, and `codesign` rejected the resulting bundle as "ambiguous"
// (could be app or framework). Plan 34.9-12 fixed the mechanism
// (meta/preserveRunnerSymlinks.ts); this enforces the structural property
// codesign actually cares about so a regression cannot go silent again.
//
// This is a STRUCTURE check, a different category from the signature-IDENTITY
// checks in getSignatureState() above -- it is credential-free and verifiable
// on any machine (no Apple Developer enrolment, D-03/D-04), so it is
// legitimate to enforce here where signature state is intentionally left as
// data only.
// ---------------------------------------------------------------------------

export interface FrameworkInspection {
  path: string
  name: string
  versionsCurrentExists: boolean
  versionsCurrentIsSymlink: boolean
  versionsCurrentTarget: string | null
  resolvedVersionDirExists: boolean
  topLevelStubExists: boolean
  topLevelStubIsSymlink: boolean
  topLevelStubTarget: string | null
  resolvedTopLevelTargetExists: boolean
  codesignDisplay: string
}

/**
 * Recursively finds every directory named `*.framework` under `runnerDir`.
 * Recursion is guarded on `dirent.isDirectory()` from
 * `readdirSync(..., { withFileTypes: true })`, which reflects the directory
 * ENTRY's own type (lstat-based) rather than resolving symlinks -- so a
 * symlinked directory (e.g. `Versions/Current` -> `3.14`) is never walked
 * into, and a framework is never double-counted through its own
 * `Versions/Current` alias (T-34.9G-05).
 */
function findFrameworks(runnerDir: string): string[] {
  const out: string[] = []
  let entries: Dirent[]
  try {
    entries = readdirSync(runnerDir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = join(runnerDir, entry.name)
    if (entry.name.endsWith('.framework')) {
      out.push(full)
    }
    out.push(...findFrameworks(full))
  }
  return out
}

/**
 * Inspects a single `*.framework` directory's structural integrity. Every
 * symlink determination uses `lstatSync` (never `statSync`), so a
 * dereferenced (real-directory) `Versions/Current` is correctly reported as
 * NOT a symlink rather than silently resolved through. The top-level stub
 * (`Python.framework/Python`) receives the same three-part check as
 * `Versions/Current`: it exists, it is a symlink, and its target resolves
 * to a real path -- a stub that is a symlink to nowhere is caught here, not
 * silently passed through as healthy.
 */
function inspectFramework(frameworkDir: string): FrameworkInspection {
  const name = basename(frameworkDir)
  const stubName = name.endsWith('.framework')
    ? name.slice(0, -'.framework'.length)
    : name

  const versionsCurrentPath = join(frameworkDir, 'Versions', 'Current')
  let versionsCurrentExists = false
  let versionsCurrentIsSymlink = false
  let versionsCurrentTarget: string | null = null
  try {
    const st = lstatSync(versionsCurrentPath)
    versionsCurrentExists = true
    versionsCurrentIsSymlink = st.isSymbolicLink()
    if (versionsCurrentIsSymlink) {
      versionsCurrentTarget = readlinkSync(versionsCurrentPath)
    }
  } catch {
    versionsCurrentExists = false
  }

  let resolvedVersionDirExists = false
  if (versionsCurrentIsSymlink && versionsCurrentTarget) {
    resolvedVersionDirExists = existsSync(
      join(frameworkDir, 'Versions', versionsCurrentTarget)
    )
  }

  const topLevelStubPath = join(frameworkDir, stubName)
  let topLevelStubExists = false
  let topLevelStubIsSymlink = false
  let topLevelStubTarget: string | null = null
  try {
    const st = lstatSync(topLevelStubPath)
    topLevelStubExists = true
    topLevelStubIsSymlink = st.isSymbolicLink()
    if (topLevelStubIsSymlink) {
      topLevelStubTarget = readlinkSync(topLevelStubPath)
    }
  } catch {
    topLevelStubExists = false
  }

  // Resolved against the stub's OWN parent directory (frameworkDir), not
  // against Versions/ -- the top-level stub lives one level shallower than
  // Versions/Current, so it must not reuse that check's resolution base.
  let resolvedTopLevelTargetExists = false
  if (topLevelStubIsSymlink && topLevelStubTarget) {
    resolvedTopLevelTargetExists = existsSync(
      join(frameworkDir, topLevelStubTarget)
    )
  }

  // The artifact `codesign` actually classifies is the framework BUNDLE
  // itself, not an inner binary -- the 2026-08-11 live gate's
  // `codesign --verify --deep` on `.../gogdl/gogdl` exited 0 while the
  // framework was already malformed (34.9-LIVE-GATE.md item 4).
  const codesignDisplay = getSignatureState(frameworkDir)

  return {
    path: frameworkDir,
    name,
    versionsCurrentExists,
    versionsCurrentIsSymlink,
    versionsCurrentTarget,
    resolvedVersionDirExists,
    topLevelStubExists,
    topLevelStubIsSymlink,
    topLevelStubTarget,
    resolvedTopLevelTargetExists,
    codesignDisplay
  }
}

export interface Summary {
  ok: boolean
  failures: string[]
}

// ---------------------------------------------------------------------------
// Locating the tree -- SEARCHED for, never assumed at a fixed prefix
// (T-34.9-27). Inside a packaged Electron `.app` it sits under
// `Contents/Resources/app.asar.unpacked/build/bin/${arch}/darwin`.
// ---------------------------------------------------------------------------

function findDarwinBinRoot(root: string, arch: string): string {
  const absoluteRoot = resolvePath(root)
  const suffix = join('build', 'bin', arch, 'darwin')

  const stack: string[] = [absoluteRoot]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    if (dir.endsWith(suffix)) {
      return dir
    }

    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(join(dir, entry.name))
      }
    }
  }

  throw new Error(
    `verifyRunnerBundle: could not find a "build/bin/${arch}/darwin" ` +
      `directory under root "${absoluteRoot}" (arch="${arch}") -- wrong ` +
      `root or wrong --arch?`
  )
}

function walkFiles(dir: string): string[] {
  const out: string[] = []
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkFiles(full))
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Mach-O detection -- magic-byte sniff first (fast over a ~300-file scan),
// falling back to argv-form `file -b` only when the read itself is
// inconclusive (permission denied, zero-length, etc).
// ---------------------------------------------------------------------------

const MACHO_MAGICS = new Set([
  0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca
])

function magicSniff(filePath: string): boolean | undefined {
  let fd: number
  try {
    fd = openSync(filePath, 'r')
  } catch {
    return undefined
  }
  try {
    const buf = Buffer.alloc(4)
    const bytesRead = readSync(fd, buf, 0, 4, 0)
    if (bytesRead < 4) return undefined
    return (
      MACHO_MAGICS.has(buf.readUInt32BE(0)) ||
      MACHO_MAGICS.has(buf.readUInt32LE(0))
    )
  } catch {
    return undefined
  } finally {
    closeSync(fd)
  }
}

function fileCommandSaysMachO(filePath: string): boolean {
  const result = spawnSync('file', ['-b', filePath], { encoding: 'utf-8' })
  const out = (result.stdout ?? '').toLowerCase()
  return out.includes('mach-o')
}

function isMachO(filePath: string): boolean {
  const sniffed = magicSniff(filePath)
  if (sniffed !== undefined) return sniffed
  return fileCommandSaysMachO(filePath)
}

// ---------------------------------------------------------------------------
// Signature state -- REPORTED, never enforced (T-34.9-23). Parses `codesign
// -dv`'s stderr: absence of a signature -> "unsigned", an adhoc flag ->
// "adhoc", an Authority= line -> "signed:<first authority>", anything else
// -> "unknown:<stderr excerpt>".
// ---------------------------------------------------------------------------

function getSignatureState(filePath: string): string {
  const result = spawnSync('codesign', ['-dv', filePath], {
    encoding: 'utf-8'
  })

  if (result.error) {
    return `unknown:${result.error.message.slice(0, 200)}`
  }

  const stderr = result.stderr ?? ''

  if (/is not signed at all/i.test(stderr)) {
    return 'unsigned'
  }

  const authorityMatch = stderr.match(/Authority=([^\r\n]+)/)
  if (authorityMatch) {
    return `signed:${authorityMatch[1].trim()}`
  }

  if (/\(adhoc\)/i.test(stderr) || /^Signature=adhoc/m.test(stderr)) {
    return 'adhoc'
  }

  return `unknown:${stderr.trim().slice(0, 200)}`
}

// ---------------------------------------------------------------------------
// inspectRunnerTree / summarise
// ---------------------------------------------------------------------------

function inspectRunner(
  darwinRoot: string,
  runner: RunnerName
): RunnerInspection {
  const runnerDir = join(darwinRoot, runner)
  const binaryPath = join(runnerDir, runner)
  const exists = existsSync(binaryPath)

  let executable = false
  if (exists) {
    try {
      executable = (statSync(binaryPath).mode & 0o111) !== 0
    } catch {
      executable = false
    }
  }

  const binaryIsMachO = exists ? isMachO(binaryPath) : false

  const files = walkFiles(runnerDir)
  const machoFiles: MachOSignature[] = files
    .filter((f) => isMachO(f))
    .map((f) => ({ path: f, signature: getSignatureState(f) }))

  const frameworks = findFrameworks(runnerDir).map((dir) =>
    inspectFramework(dir)
  )

  return {
    runner,
    binaryPath,
    exists,
    executable,
    isMachO: binaryIsMachO,
    fileCount: files.length,
    machoCount: machoFiles.length,
    machoFiles,
    frameworks
  }
}

/**
 * Inspects `{runner}/{runner}` for each of the three onedir runners under
 * `root`'s `build/bin/${arch}/darwin` directory (searched for, never
 * assumed). Throws, naming `root` and `arch`, when no such directory is
 * found anywhere under `root`.
 */
export function inspectRunnerTree(
  root: string,
  arch: string = process.arch
): RunnerInspection[] {
  const darwinRoot = findDarwinBinRoot(root, arch)
  return RUNNERS.map((runner) => inspectRunner(darwinRoot, runner))
}

/**
 * Enforces ONLY: each runner exists, has an exec bit, is Mach-O, and its
 * tree holds more than FILE_COUNT_FLOOR files. Signature state is never
 * part of this verdict.
 */
export function summarise(results: RunnerInspection[]): Summary {
  const failures: string[] = []

  for (const r of results) {
    if (!r.exists) {
      failures.push(`${r.runner}: runner binary missing at ${r.binaryPath}`)
      continue
    }
    if (!r.executable) {
      failures.push(
        `${r.runner}: runner binary at ${r.binaryPath} has no exec bit set`
      )
    }
    if (!r.isMachO) {
      failures.push(
        `${r.runner}: runner binary at ${r.binaryPath} is not a Mach-O executable`
      )
    }
    if (r.fileCount <= FILE_COUNT_FLOOR) {
      failures.push(
        `${r.runner}: tree at ${join(r.binaryPath, '..')} has only ` +
          `${r.fileCount} files (floor is >${FILE_COUNT_FLOOR}) -- looks ` +
          `like a smuggled onefile binary, not a onedir bundle`
      )
    }

    // Framework structural integrity (F-34.9-01). Each condition below is
    // independently enforced -- see FrameworkInspection's doc comment for
    // why this is credential-free and legitimate to enforce, unlike
    // signature IDENTITY (MachOSignature.signature), which stays data-only.
    // The top-level stub is enforced in BOTH directions -- absent entirely
    // (WR-02, the partial-copy shape a dereferencing/copy failure produces)
    // AND present as the wrong type -- so this pair must not be collapsed
    // back into a single `if` as a "simplification"; that would reopen
    // WR-02.
    for (const fw of r.frameworks) {
      if (!fw.versionsCurrentExists) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- ` +
            `Versions/Current does not exist (F-34.9-01)`
        )
      }
      if (fw.versionsCurrentExists && !fw.versionsCurrentIsSymlink) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- ` +
            `Versions/Current exists but is not a symlink (F-34.9-01) -- ` +
            `this is the exact dereferenced shape that made codesign reject ` +
            `the bundle as ambiguous`
        )
      }
      if (fw.versionsCurrentIsSymlink && !fw.resolvedVersionDirExists) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- ` +
            `Versions/Current symlink target "${fw.versionsCurrentTarget}" ` +
            `does not resolve to an existing Versions/ directory (F-34.9-01)`
        )
      }
      if (!fw.topLevelStubExists) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- top-level stub ` +
            `"${fw.name.replace(/\.framework$/, '')}" does not exist (F-34.9-01)`
        )
      } else if (!fw.topLevelStubIsSymlink) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- top-level stub ` +
            `"${fw.name.replace(/\.framework$/, '')}" is a real file, not a ` +
            `symlink into Versions/Current (F-34.9-01)`
        )
      } else if (!fw.resolvedTopLevelTargetExists) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- top-level stub ` +
            `"${fw.name.replace(/\.framework$/, '')}" symlink target ` +
            `"${fw.topLevelStubTarget}" does not resolve to an existing ` +
            `path (F-34.9-01)`
        )
      }
    }
  }

  return { ok: failures.length === 0, failures }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function parseCliArgs(argv: string[]): {
  root: string
  arch: string
  json: boolean
} {
  const positional = argv.find((a) => !a.startsWith('--'))
  if (!positional) {
    throw new Error(
      'Usage: verify-runner-bundle <root> [--arch=<x64|arm64>] [--json]'
    )
  }
  const archArg = argv.find((a) => a.startsWith('--arch='))
  const arch = archArg ? archArg.slice('--arch='.length) : process.arch
  const json = argv.includes('--json')
  return { root: positional, arch, json }
}

function printTable(results: RunnerInspection[]): void {
  console.log('Runner       Exists  Exec   Mach-O  Files  Mach-O files')
  for (const r of results) {
    console.log(
      `${r.runner.padEnd(13)}${String(r.exists).padEnd(8)}${String(
        r.executable
      ).padEnd(7)}${String(r.isMachO).padEnd(8)}${String(r.fileCount).padEnd(
        7
      )}${r.machoCount}`
    )
  }
  console.log('')
  console.log('Per-file signature state (REPORTED, never enforced):')
  for (const r of results) {
    for (const m of r.machoFiles) {
      console.log(`  ${r.runner}: ${m.path} -> ${m.signature}`)
    }
  }
  console.log('')
  console.log('Frameworks (structural integrity ENFORCED, F-34.9-01):')
  for (const r of results) {
    for (const fw of r.frameworks) {
      console.log(
        `  ${r.runner}: ${fw.name} Versions/Current symlink=` +
          `${fw.versionsCurrentIsSymlink} target=` +
          `${fw.versionsCurrentTarget ?? 'n/a'} codesign=${fw.codesignDisplay}`
      )
    }
  }
}

export function main(argv: string[] = process.argv.slice(2)): number {
  let root: string
  let arch: string
  let json: boolean
  try {
    ;({ root, arch, json } = parseCliArgs(argv))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  let results: RunnerInspection[]
  try {
    results = inspectRunnerTree(root, arch)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  const summary = summarise(results)

  if (json) {
    console.log(JSON.stringify({ root, arch, results, summary }, null, 2))
  } else {
    printTable(results)
    console.log('')
    if (summary.ok) {
      console.log(
        'PASS: all three onedir runners present, executable and Mach-O; ' +
          'tree sizes above the floor.'
      )
    } else {
      console.log('FAIL:')
      for (const failure of summary.failures) {
        console.log(`  - ${failure}`)
      }
    }
  }

  return summary.ok ? 0 : 1
}

// Guard idiom shared with meta/buildSteamBridgeShims.ts / meta/gen_vtables.ts:
// this script is bundled by esbuild and run as
// `node node_modules/.cache/verify-runner-bundle.cjs`, which DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite, so `JEST_WORKER_ID` still reliably distinguishes "imported under
// test" from "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  process.exit(main())
}
