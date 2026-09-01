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
import {
  basename,
  dirname,
  join,
  relative,
  resolve as resolvePath
} from 'node:path'

import { isContainedSymlinkTarget } from './preserveRunnerSymlinks'

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
  versionsCurrentTargetContained: boolean
  topLevelStubExists: boolean
  topLevelStubIsSymlink: boolean
  topLevelStubTarget: string | null
  resolvedTopLevelTargetExists: boolean
  topLevelStubTargetContained: boolean
  // Resources alias (`Python.framework/Resources` -> `Versions/Current/Resources`).
  // Dropped ENTIRELY by the dereferencing `bundle.resources` copier -- absent from
  // the shipped tree today, not merely wrong-kind (measured on the OLD release
  // artifact, quick-260901-e7o).
  resourcesAliasExists: boolean
  resourcesAliasIsSymlink: boolean
  resourcesAliasTarget: string | null
  resolvedResourcesTargetExists: boolean
  resourcesAliasTargetContained: boolean
  // Sibling stub (`_internal/Python` -> `Python.framework/Versions/3.12/Python`).
  // Lives OUTSIDE the framework directory (one level up, next to it) -- scoped to
  // fire only when the framework's own parent is named `_internal`
  // (siblingStubApplicable), the PyInstaller onedir shape, so a differently-laid-out
  // future framework cannot false-fire this check.
  siblingStubApplicable: boolean
  siblingStubExists: boolean
  siblingStubIsSymlink: boolean
  siblingStubTarget: string | null
  resolvedSiblingStubTargetExists: boolean
  siblingStubTargetContained: boolean
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
 * Resolves `linkPath` (a symlink INSIDE `runnerTreeRoot`) and `target` (its
 * raw, un-followed `readlinkSync` string) against `isContainedSymlinkTarget`
 * (`./preserveRunnerSymlinks`), reusing the SAME proven, lexical (no
 * `realpathSync`), absolute-and-`..`-escape-refusing containment check that
 * module already applies when RE-CREATING these links (T-e7o-01/T-e7o-03).
 * Deliberately not a second implementation: today's
 * `resolvedTopLevelTargetExists` is a bare `existsSync(join(frameworkDir,
 * target))`, which a target of `../../../../../evil` would satisfy.
 */
function isLinkTargetContained(
  runnerTreeRoot: string,
  linkPath: string,
  target: string
): boolean {
  const relPath = relative(runnerTreeRoot, linkPath)
  return isContainedSymlinkTarget(runnerTreeRoot, relPath, target)
}

/**
 * Inspects a single `*.framework` directory's structural integrity, plus the
 * two links that live OUTSIDE the `.framework` directory proper (the
 * `Resources` alias sits inside it but was dropped independently of
 * `Versions/Current`; the sibling stub sits one level up in `_internal/`).
 * Every symlink determination uses `lstatSync` (never `statSync`), so a
 * dereferenced (real-directory) target is correctly reported as NOT a
 * symlink rather than silently resolved through. `runnerDir` is the runner's
 * own root (e.g. `.../darwin/gogdl`) -- containment is checked against it,
 * not against `frameworkDir`, because the sibling stub's link lives outside
 * `frameworkDir` entirely.
 */
function inspectFramework(
  frameworkDir: string,
  runnerDir: string
): FrameworkInspection {
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
  let versionsCurrentTargetContained = false
  if (versionsCurrentIsSymlink && versionsCurrentTarget) {
    resolvedVersionDirExists = existsSync(
      join(frameworkDir, 'Versions', versionsCurrentTarget)
    )
    versionsCurrentTargetContained = isLinkTargetContained(
      runnerDir,
      versionsCurrentPath,
      versionsCurrentTarget
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
  let topLevelStubTargetContained = false
  if (topLevelStubIsSymlink && topLevelStubTarget) {
    resolvedTopLevelTargetExists = existsSync(
      join(frameworkDir, topLevelStubTarget)
    )
    topLevelStubTargetContained = isLinkTargetContained(
      runnerDir,
      topLevelStubPath,
      topLevelStubTarget
    )
  }

  // Resources alias (`Python.framework/Resources` -> `Versions/Current/Resources`).
  // Resolved against frameworkDir, the same base as the top-level stub -- it lives
  // at the same depth.
  const resourcesAliasPath = join(frameworkDir, 'Resources')
  let resourcesAliasExists = false
  let resourcesAliasIsSymlink = false
  let resourcesAliasTarget: string | null = null
  try {
    const st = lstatSync(resourcesAliasPath)
    resourcesAliasExists = true
    resourcesAliasIsSymlink = st.isSymbolicLink()
    if (resourcesAliasIsSymlink) {
      resourcesAliasTarget = readlinkSync(resourcesAliasPath)
    }
  } catch {
    resourcesAliasExists = false
  }

  let resolvedResourcesTargetExists = false
  let resourcesAliasTargetContained = false
  if (resourcesAliasIsSymlink && resourcesAliasTarget) {
    resolvedResourcesTargetExists = existsSync(
      join(frameworkDir, resourcesAliasTarget)
    )
    resourcesAliasTargetContained = isLinkTargetContained(
      runnerDir,
      resourcesAliasPath,
      resourcesAliasTarget
    )
  }

  // Sibling stub (`_internal/Python` -> `Python.framework/Versions/3.12/Python`).
  // Scoped to the PyInstaller onedir shape: only applicable when this framework's
  // own parent directory is named `_internal` (findFrameworks can find a
  // `*.framework` anywhere, not only under `_internal/`), so a differently-laid-out
  // future framework cannot false-fire this check.
  const siblingStubApplicable = basename(dirname(frameworkDir)) === '_internal'
  const siblingStubPath = join(dirname(frameworkDir), stubName)
  let siblingStubExists = false
  let siblingStubIsSymlink = false
  let siblingStubTarget: string | null = null
  if (siblingStubApplicable) {
    try {
      const st = lstatSync(siblingStubPath)
      siblingStubExists = true
      siblingStubIsSymlink = st.isSymbolicLink()
      if (siblingStubIsSymlink) {
        siblingStubTarget = readlinkSync(siblingStubPath)
      }
    } catch {
      siblingStubExists = false
    }
  }

  let resolvedSiblingStubTargetExists = false
  let siblingStubTargetContained = false
  if (siblingStubIsSymlink && siblingStubTarget) {
    resolvedSiblingStubTargetExists = existsSync(
      join(dirname(frameworkDir), siblingStubTarget)
    )
    siblingStubTargetContained = isLinkTargetContained(
      runnerDir,
      siblingStubPath,
      siblingStubTarget
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
    versionsCurrentTargetContained,
    topLevelStubExists,
    topLevelStubIsSymlink,
    topLevelStubTarget,
    resolvedTopLevelTargetExists,
    topLevelStubTargetContained,
    resourcesAliasExists,
    resourcesAliasIsSymlink,
    resourcesAliasTarget,
    resolvedResourcesTargetExists,
    resourcesAliasTargetContained,
    siblingStubApplicable,
    siblingStubExists,
    siblingStubIsSymlink,
    siblingStubTarget,
    resolvedSiblingStubTargetExists,
    siblingStubTargetContained,
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

export function findDarwinBinRoot(root: string, arch: string): string {
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
// Exact tree census (--expect-files/--expect-symlinks/--expect-bytes).
// `readdirSync(dir, { withFileTypes: true })` Dirents are lstat-based, so a
// symlinked directory is `isSymbolicLink()`, never `isDirectory()` -- it is
// counted once as a symlink and never descended into, and a real file is
// never miscounted as a symlink. Bytes are `lstatSync(p).size` summed over
// regular files ONLY, matching this plan's `sum(stat -f %z)` discipline --
// `du` (block-allocation based) is never used anywhere in this module.
// ---------------------------------------------------------------------------

export interface TreeCensus {
  fileCount: number
  symlinkCount: number
  apparentBytes: number
}

export function censusTree(darwinRoot: string): TreeCensus {
  let fileCount = 0
  let symlinkCount = 0
  let apparentBytes = 0

  function walk(dir: string): void {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        symlinkCount++
      } else if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        fileCount++
        try {
          apparentBytes += lstatSync(full).size
        } catch {
          // A file that vanished between readdir and lstat contributes 0
          // bytes rather than throwing -- the exact-count comparison against
          // --expect-files will still catch the discrepancy.
        }
      }
    }
  }

  walk(darwinRoot)
  return { fileCount, symlinkCount, apparentBytes }
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
    inspectFramework(dir, runnerDir)
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
      } else if (!fw.topLevelStubTargetContained) {
        failures.push(
          `${r.runner}: framework ${fw.path} is UNSAFE -- top-level stub ` +
            `"${fw.name.replace(/\.framework$/, '')}" symlink target ` +
            `"${fw.topLevelStubTarget}" escapes the runner tree (T-e7o-01)`
        )
      }
      if (
        fw.versionsCurrentIsSymlink &&
        fw.resolvedVersionDirExists &&
        !fw.versionsCurrentTargetContained
      ) {
        failures.push(
          `${r.runner}: framework ${fw.path} is UNSAFE -- Versions/Current ` +
            `symlink target "${fw.versionsCurrentTarget}" escapes the ` +
            `runner tree (T-e7o-01)`
        )
      }

      // Resources alias (`Python.framework/Resources`, F-34.9-01/e7o). DROPPED
      // ENTIRELY by the dereferencing `bundle.resources` copier -- measured
      // absent (not merely wrong-kind) on the OLD release artifact. Same
      // both-direction discipline as the top-level stub above: absent,
      // wrong-kind and dangling are separate `if`s, not collapsed.
      if (!fw.resourcesAliasExists) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- ` +
            `Resources alias does not exist (F-34.9-01)`
        )
      } else if (!fw.resourcesAliasIsSymlink) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- ` +
            `Resources alias is a real directory, not a symlink into ` +
            `Versions/Current (F-34.9-01)`
        )
      } else if (!fw.resolvedResourcesTargetExists) {
        failures.push(
          `${r.runner}: framework ${fw.path} is malformed -- ` +
            `Resources alias symlink target "${fw.resourcesAliasTarget}" ` +
            `does not resolve to an existing path (F-34.9-01)`
        )
      } else if (!fw.resourcesAliasTargetContained) {
        failures.push(
          `${r.runner}: framework ${fw.path} is UNSAFE -- Resources alias ` +
            `symlink target "${fw.resourcesAliasTarget}" escapes the ` +
            `runner tree (T-e7o-01)`
        )
      }

      // Sibling stub (`_internal/Python`, F-34.9-01/e7o). Lives outside the
      // framework directory -- only checked when the framework's own parent
      // is `_internal` (siblingStubApplicable), so a framework laid out
      // differently never false-fires this check.
      if (fw.siblingStubApplicable) {
        if (!fw.siblingStubExists) {
          failures.push(
            `${r.runner}: _internal sibling stub for ${fw.path} does not ` +
              `exist (F-34.9-01)`
          )
        } else if (!fw.siblingStubIsSymlink) {
          failures.push(
            `${r.runner}: _internal sibling stub for ${fw.path} is a real ` +
              `file, not a symlink (F-34.9-01)`
          )
        } else if (!fw.resolvedSiblingStubTargetExists) {
          failures.push(
            `${r.runner}: _internal sibling stub for ${fw.path} symlink ` +
              `target "${fw.siblingStubTarget}" does not resolve to an ` +
              `existing path (F-34.9-01)`
          )
        } else if (!fw.siblingStubTargetContained) {
          failures.push(
            `${r.runner}: _internal sibling stub for ${fw.path} is UNSAFE ` +
              `-- symlink target "${fw.siblingStubTarget}" escapes the ` +
              `runner tree (T-e7o-01)`
          )
        }
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
  expectFiles: number | undefined
  expectSymlinks: number | undefined
  expectBytes: number | undefined
} {
  const positional = argv.find((a) => !a.startsWith('--'))
  if (!positional) {
    throw new Error(
      'Usage: verify-runner-bundle <root> [--arch=<x64|arm64>] [--json] ' +
        '[--expect-files=N --expect-symlinks=N --expect-bytes=N]'
    )
  }
  const archArg = argv.find((a) => a.startsWith('--arch='))
  const arch = archArg ? archArg.slice('--arch='.length) : process.arch
  const json = argv.includes('--json')

  const parseExpect = (flag: string): number | undefined => {
    const arg = argv.find((a) => a.startsWith(`${flag}=`))
    if (!arg) return undefined
    const raw = arg.slice(flag.length + 1)
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      throw new Error(`${flag}: "${raw}" is not a valid number`)
    }
    return n
  }

  const expectFiles = parseExpect('--expect-files')
  const expectSymlinks = parseExpect('--expect-symlinks')
  const expectBytes = parseExpect('--expect-bytes')

  return {
    root: positional,
    arch,
    json,
    expectFiles,
    expectSymlinks,
    expectBytes
  }
}

function printTable(results: RunnerInspection[], census?: TreeCensus): void {
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
          `${fw.versionsCurrentTarget ?? 'n/a'} Resources symlink=` +
          `${fw.resourcesAliasIsSymlink} target=` +
          `${fw.resourcesAliasTarget ?? 'n/a'} codesign=${fw.codesignDisplay}`
      )
    }
  }
  if (census) {
    console.log('')
    console.log(
      `Census: ${census.fileCount} files, ${census.symlinkCount} symlinks, ` +
        `${census.apparentBytes} apparent bytes (sum(stat -f %z), never du)`
    )
  }
}

export function main(argv: string[] = process.argv.slice(2)): number {
  let root: string
  let arch: string
  let json: boolean
  let expectFiles: number | undefined
  let expectSymlinks: number | undefined
  let expectBytes: number | undefined
  try {
    ;({ root, arch, json, expectFiles, expectSymlinks, expectBytes } =
      parseCliArgs(argv))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  // Partial --expect-* specification is an ERROR, not a silent skip -- a
  // forgotten flag must never read as clean. All three or none.
  const expectGiven = [expectFiles, expectSymlinks, expectBytes].filter(
    (v) => v !== undefined
  ).length
  if (expectGiven > 0 && expectGiven < 3) {
    const missing: string[] = []
    if (expectFiles === undefined) missing.push('--expect-files')
    if (expectSymlinks === undefined) missing.push('--expect-symlinks')
    if (expectBytes === undefined) missing.push('--expect-bytes')
    console.error(
      'verify-runner-bundle: partial --expect-* specification is an error ' +
        `-- all three of --expect-files/--expect-symlinks/--expect-bytes ` +
        `must be given together, or none at all. Missing: ${missing.join(', ')}`
    )
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

  let census: TreeCensus | undefined
  if (expectGiven === 3) {
    const darwinRoot = findDarwinBinRoot(root, arch)
    census = censusTree(darwinRoot)
    if (
      census.fileCount !== expectFiles ||
      census.symlinkCount !== expectSymlinks ||
      census.apparentBytes !== expectBytes
    ) {
      summary.ok = false
      summary.failures.push(
        `census mismatch at ${darwinRoot}: expected ${expectFiles} files / ` +
          `${expectSymlinks} symlinks / ${expectBytes} apparent bytes, got ` +
          `${census.fileCount} files / ${census.symlinkCount} symlinks / ` +
          `${census.apparentBytes} apparent bytes`
      )
    }
  }

  if (json) {
    console.log(
      JSON.stringify({ root, arch, results, summary, census }, null, 2)
    )
  } else {
    printTable(results, census)
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
// this script is run via `node meta/runTs.cjs` (package.json
// `verify:runner-bundle`), which DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite, so `JEST_WORKER_ID` still reliably distinguishes "imported under
// test" from "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  process.exit(main())
}
