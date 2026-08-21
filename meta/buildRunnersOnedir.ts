/**
 * Phase 34.9 Plan 01: builds `legendary`/`gogdl`/`nile` as PyInstaller
 * `--onedir` bundles on the host macOS arch, using each upstream repo's OWN
 * pyinstaller invocation with only `--onefile` swapped for `--onedir`.
 *
 * Why this exists (34.9-CONTEXT.md): onedir eliminates the ~20s cold-start
 * `amfid` Gatekeeper-assessment tax onefile pays on macOS (measured ~95x cold
 * speedup, see .planning/debug/evidence/onedir-vs-onefile-measurement-2026-08-06.txt).
 * Linux and Windows do NOT pay this tax and are NOT touched by this script.
 *
 * Sourcing strategy (LOCKED): build in GameLib CI now, in parallel with
 * upstream PRs proposing --onedir to each of the three repos. This script IS
 * the GameLib-CI half of that plan; the CI workflow (plan 34.9-04) is a thin
 * matrix wrapper around it, and the local arm64 measurement (plan 34.9-03)
 * runs this exact code path.
 *
 * PyInstaller cannot cross-compile (34.9-CONTEXT.md constraint 1) -- macOS
 * x64 and arm64 must each build on their own host. `buildRunner()` refuses to
 * run unless `process.platform === 'darwin'` AND `process.arch` matches the
 * requested target; there is no cross-arch fallback.
 *
 * Pinned tags are read from meta/releaseTags.ts -- the SAME module
 * meta/downloadHelperBinaries.ts imports -- so this script cannot restate (and
 * therefore cannot drift from) the versions it ships (constraint 7: this is a
 * REPACKAGING change, not a runner upgrade).
 *
 * `comet` is a Rust static binary (~0.01s cold, pays no tax) and never
 * appears as an ONEDIR_RUNNERS key -- this script cannot build it even by
 * mistake.
 *
 * Every external invocation (`git`, `python3`, `pip`, `pyinstaller`, `tar`)
 * uses argv-form spawn -- never a shell string, never string interpolation
 * into a command (T-34.9-03, mirroring meta/downloadZig.ts's T-24-06
 * control).
 *
 * `.build-tools/` is build-tooling only and MUST NOT be written into
 * `public/bin/**` -- that convention is reserved for BUNDLED runtime binaries
 * (meta/downloadHelperBinaries.ts is the only writer there; T-34.9-11).
 *
 * Run with `pnpm build-runners-onedir --arch=<x64|arm64> [--runner=<name>]`.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'

import { RELEASE_TAGS } from './releaseTags'

// ---------------------------------------------------------------------------
// Fixed layout -- build-tooling only, never public/bin/** (T-34.9-11).
// ---------------------------------------------------------------------------

const RUNNERS_ROOT_DIR = join('.build-tools', 'runners-onedir')
const RUNNERS_SRC_DIR = join(RUNNERS_ROOT_DIR, 'src')
const RUNNERS_OUT_DIR = join(RUNNERS_ROOT_DIR, 'out')

// ---------------------------------------------------------------------------
// ONEDIR_RUNNERS -- the three Python runners that pay the onefile tax.
// Tags are read from RELEASE_TAGS, never restated, so this script structurally
// cannot drift from meta/downloadHelperBinaries.ts's pinned versions.
// ---------------------------------------------------------------------------

export type OnedirRunnerName = 'legendary' | 'gogdl' | 'nile'

export interface OnedirRunnerSpec {
  repo: string
  tag: string
}

export const ONEDIR_RUNNERS: Record<OnedirRunnerName, OnedirRunnerSpec> = {
  legendary: {
    repo: 'Heroic-Games-Launcher/legendary',
    tag: RELEASE_TAGS.legendary
  },
  gogdl: {
    repo: 'Heroic-Games-Launcher/heroic-gogdl',
    tag: RELEASE_TAGS.gogdl
  },
  nile: {
    repo: 'imLinguin/nile',
    tag: RELEASE_TAGS.nile
  }
}

const isOnedirRunnerName = (value: string): value is OnedirRunnerName =>
  Object.prototype.hasOwnProperty.call(ONEDIR_RUNNERS, value)

// ---------------------------------------------------------------------------
// archiveName -- matches the existing upstream `_macOS_x86_64` / `_macOS_arm64`
// naming already used by meta/downloadHelperBinaries.ts.
// ---------------------------------------------------------------------------

export function archiveName(runner: string, arch: string): string {
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(
      `archiveName: unsupported arch "${arch}" (expected "x64" or "arm64")`
    )
  }
  const archSegment = arch === 'x64' ? 'x86_64' : 'arm64'
  return `${runner}_macOS_${archSegment}_onedir.tar.gz`
}

// ---------------------------------------------------------------------------
// extractUpstreamPyinstallerCommand -- reads the upstream repo's OWN
// pyinstaller invocation from its committed GitHub Actions workflow. Never
// guesses: throws naming the repoDir when zero matching invocations exist,
// and throws naming every match when more than one does.
//
// Rule 1 fix (found live against the real, cloned nile/legendary/heroic-gogdl
// workflows during this plan's execution): all three upstream repos write
// their build step as a `run:` key whose value is a PLAIN (unquoted,
// non-block-scalar) YAML scalar folded across several MORE-INDENTED physical
// lines, e.g.:
//
//   - name: Build
//     run: pyinstaller
//       --onefile
//       --name nile
//       ${{ steps.strip.outputs.option }}
//       nile/cli.py
//
// GitHub Actions folds that into one command line at execution time. A
// naive one-physical-line reading finds only "run: pyinstaller" -- missing
// every flag -- and ALSO matches unrelated lines that merely mention
// "pyinstaller" in prose (a step name) or as a `pip install` argument (not
// the invocation itself). This extractor instead (a) recognises `run:`
// keys and folds their continuation lines the same way GitHub Actions does,
// then (b) keeps only run values whose FIRST token is literally
// "pyinstaller" -- the actual invocation, not merely a mention of the name.
// ---------------------------------------------------------------------------

function indentOf(line: string): number {
  const match = line.match(/^( *)/)
  return match ? match[1].length : 0
}

interface RunValueMatch {
  command: string
  // The step's OWN `working-directory:` sibling key, if declared (e.g.
  // legendary's Build step runs with `working-directory: legendary`, so its
  // `cli.py` / `../assets/...` arguments resolve relative to `<repo>/legendary`,
  // not the repo root). Undefined means "repo root" (GitHub Actions' own
  // default when a step declares no working-directory).
  workingDirectory?: string
}

// Walks backward from a `run:` key's line to find a sibling key (e.g.
// `working-directory:`) declared earlier in the SAME step mapping. Stops as
// soon as indentation drops below the run: key's own indent -- that is the
// step-list-item boundary (`- name: ...`) and searching further would read a
// PRIOR, unrelated step's keys.
function findSiblingKey(
  lines: string[],
  runLineIndex: number,
  keyIndent: number,
  keyName: string
): string | undefined {
  for (let k = runLineIndex - 1; k >= 0; k--) {
    const line = lines[k]
    if (line.trim() === '') continue
    const lineIndent = indentOf(line)
    if (lineIndent < keyIndent) break // left this step's key block entirely

    if (lineIndent === keyIndent) {
      const dashMatch = line.match(/^\s*-\s+(.*)$/)
      const content = dashMatch ? dashMatch[1] : line.trim()
      const kv = content.match(
        new RegExp(
          `^${keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*)$`
        )
      )
      if (kv) return kv[1].trim()
      if (dashMatch) break // "- name: ..." start-of-step line -- stop here
    }
    // lineIndent > keyIndent is a continuation of some other folded value;
    // keep walking backward past it.
  }
  return undefined
}

function extractRunValues(text: string): RunValueMatch[] {
  const lines = text.split('\n')
  const values: RunValueMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)(?:-\s+)?run:\s?(.*)$/)
    if (!match) continue

    const [, keyIndentStr, remainder] = match
    const keyIndent = keyIndentStr.length
    const parts = [remainder]

    let j = i + 1
    while (j < lines.length) {
      const next = lines[j]
      if (next.trim() === '') break
      if (indentOf(next) <= keyIndent) break
      parts.push(next.trim())
      j++
    }

    const workingDirectory = findSiblingKey(
      lines,
      i,
      keyIndent,
      'working-directory'
    )

    values.push({
      command: parts
        .join(' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
      workingDirectory
    })
  }

  return values
}

export interface UpstreamPyinstallerCommand {
  command: string
  // Absolute path the command must run FROM, if the step declared its own
  // `working-directory:` (undefined means repo root).
  workingDirectory?: string
}

export function extractUpstreamPyinstallerCommand(
  repoDir: string
): UpstreamPyinstallerCommand {
  const workflowsDir = join(repoDir, '.github', 'workflows')

  let entries: string[]
  try {
    entries = readdirSync(workflowsDir).filter(
      (name) => name.endsWith('.yml') || name.endsWith('.yaml')
    )
  } catch {
    entries = []
  }

  const matches: {
    file: string
    command: string
    workingDirectory?: string
  }[] = []
  for (const file of entries) {
    const text = readFileSync(join(workflowsDir, file), 'utf-8')
    for (const value of extractRunValues(text)) {
      // Only a run: value that INVOKES pyinstaller (first token), not one
      // that merely mentions it (e.g. "pip3 install --upgrade pyinstaller").
      if (/^pyinstaller(\s|$)/.test(value.command)) {
        matches.push({
          file,
          command: value.command,
          workingDirectory: value.workingDirectory
        })
      }
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `No "run:" step invoking pyinstaller directly (as its first token) ` +
        `found in any *.yml/*.yaml workflow under ${workflowsDir}`
    )
  }

  // Rule 1 fix (found live during this plan's real legendary build): a repo
  // may commit more than one workflow file whose pyinstaller step is
  // byte-identical (e.g. legendary's python.yml CI check and release.yml
  // release job both build the exact same command, from the same
  // working-directory). That is NOT ambiguous -- there is only one candidate
  // command, just declared twice. Only throw when the DISTINCT (command,
  // workingDirectory) pairs number more than one; the error message still
  // names every matching file for auditability.
  const distinctPairs = new Set(
    matches.map((m) => JSON.stringify([m.command, m.workingDirectory ?? null]))
  )
  if (distinctPairs.size > 1) {
    throw new Error(
      `Expected exactly one DISTINCT pyinstaller invocation under ${workflowsDir}, ` +
        `found ${distinctPairs.size}: ` +
        matches.map((m) => `${m.file}: "${m.command}"`).join(' | ')
    )
  }

  return {
    command: matches[0].command,
    workingDirectory: matches[0].workingDirectory
  }
}

// ---------------------------------------------------------------------------
// toOnedirCommand -- swaps the ONE `--onefile` token for `--onedir` and
// removes every `${{ ... }}` GitHub-expression token, returning each removed
// token so the deviation from upstream's literal command is auditable rather
// than silent (must_haves truth #4).
// ---------------------------------------------------------------------------

export interface OnedirCommandResult {
  command: string
  droppedExpressions: string[]
}

export function toOnedirCommand(upstreamLine: string): OnedirCommandResult {
  const onefileOccurrences = upstreamLine.match(/--onefile/g) ?? []
  if (onefileOccurrences.length === 0) {
    throw new Error(
      `Upstream pyinstaller command does not contain "--onefile", refusing ` +
        `to guess how to derive an onedir build: "${upstreamLine}"`
    )
  }
  if (onefileOccurrences.length > 1) {
    throw new Error(
      `Upstream pyinstaller command contains "--onefile" more than once ` +
        `(ambiguous which to swap): "${upstreamLine}"`
    )
  }

  let command = upstreamLine.replace('--onefile', '--onedir')

  const droppedExpressions: string[] = []
  command = command.replace(/\$\{\{[^}]*\}\}/g, (match) => {
    droppedExpressions.push(match)
    return ''
  })
  command = command.replace(/\s{2,}/g, ' ').trim()

  if (!command.startsWith('pyinstaller')) {
    throw new Error(
      `Derived onedir command no longer starts with "pyinstaller": "${command}"`
    )
  }

  return { command, droppedExpressions }
}

// ---------------------------------------------------------------------------
// argv-form spawn helpers (T-34.9-03) -- never a shell string, never
// interpolation into a command. Mirrors meta/downloadZig.ts's T-24-06 control
// and meta/buildSteamBridgeShims.ts's spawnArgv() house pattern.
// ---------------------------------------------------------------------------

interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

function spawnArgv(
  command: string,
  args: string[],
  cwd?: string
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function runOrThrow(
  description: string,
  command: string,
  args: string[],
  cwd?: string
): Promise<SpawnResult> {
  const result = await spawnArgv(command, args, cwd)
  if (result.code !== 0) {
    throw new Error(
      `${description} failed (exit ${result.code}): ${command} ${args.join(' ')}\n${result.stderr}`
    )
  }
  return result
}

// ---------------------------------------------------------------------------
// Venv-relative binary paths.
// ---------------------------------------------------------------------------

function venvDir(repoDir: string): string {
  return join(repoDir, '.venv')
}

function pipPath(repoDir: string): string {
  return join(venvDir(repoDir), 'bin', 'pip')
}

function pythonPath(repoDir: string): string {
  return join(venvDir(repoDir), 'bin', 'python3')
}

function pyinstallerPath(repoDir: string): string {
  return join(venvDir(repoDir), 'bin', 'pyinstaller')
}

// ---------------------------------------------------------------------------
// Build steps.
// ---------------------------------------------------------------------------

async function cloneRepo(
  repo: string,
  tag: string,
  destDir: string
): Promise<void> {
  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(join(destDir, '..'), { recursive: true })
  // Rule 1 fix (found live during this plan's real gogdl build): heroic-gogdl
  // vendors its xdelta3 C dependency as a git submodule (.gitmodules ->
  // jmacd/xdelta.git @ a pinned commit), and its own CI checks it out with
  // actions/checkout's `submodules: 'true'`. Without --recurse-submodules the
  // clone leaves xdelta3/ empty, and pip's native-extension build fails with
  // "xdelta3/xdelta3.h file not found". Not shallow-submodules deliberately:
  // the pinned submodule commit is not guaranteed to be its branch tip, and a
  // shallow submodule clone can fail to reach an older pinned commit.
  await runOrThrow(`git clone of ${repo}@${tag}`, 'git', [
    'clone',
    '--branch',
    tag,
    '--depth',
    '1',
    '--recurse-submodules',
    `https://github.com/${repo}`,
    destDir
  ])
}

async function createVenv(repoDir: string): Promise<void> {
  await runOrThrow('venv creation', 'python3', ['-m', 'venv', venvDir(repoDir)])
}

// Uses the cloned repo's OWN declared dependencies -- never a second literal
// requirements list.
async function installDependencies(repoDir: string): Promise<void> {
  const reqPath = join(repoDir, 'requirements.txt')
  if (existsSync(reqPath)) {
    await runOrThrow(
      'pip install -r requirements.txt',
      pipPath(repoDir),
      ['install', '-r', reqPath],
      repoDir
    )
    return
  }
  // Rule 1 fix (found live during this plan's real gogdl build): an EDITABLE
  // install is not cosmetic here -- it is what heroic-gogdl's own CI does
  // ("Build C module: pip3 install -e .") and it is load-bearing for
  // PyInstaller's discovery of the compiled gogdl.xdelta3 C extension.
  // Empirically confirmed on this machine (both under python3.14 AND
  // python3.11, isolating out the interpreter as a variable): a regular
  // `pip install .` places the .so under the venv's site-packages and
  // PyInstaller's analysis reports "missing module named 'gogdl.xdelta3'"
  // in build/gogdl/warn-gogdl.txt even though the file is present on disk;
  // `pip install -e .` places the .so back in the source tree next to
  // cli.py's own package and PyInstaller's analysis finds it with no
  // warning. gogdl is the only ONEDIR_RUNNERS repo with no requirements.txt,
  // so this only ever exercises for gogdl -- legendary/nile both declare one
  // and use the -r branch above, unaffected.
  await runOrThrow(
    'pip install -e . (no requirements.txt; editable install matches ' +
      'upstream CI and is required for PyInstaller to find compiled ' +
      'C extensions such as gogdl.xdelta3)',
    pipPath(repoDir),
    ['install', '-e', '.'],
    repoDir
  )
}

// Repo's own pin if it declares one (a `pyinstaller` line in its own
// requirements.txt); else the literal fallback pin -- never "latest".
const PYINSTALLER_FALLBACK_PIN = 'pyinstaller==6.20.0'

function resolvePyinstallerRequirement(repoDir: string): string {
  const reqPath = join(repoDir, 'requirements.txt')
  if (existsSync(reqPath)) {
    const declared = readFileSync(reqPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^pyinstaller\s*(==|>=|~=|<=|>|<)/i.test(line))
    if (declared) return declared
  }
  return PYINSTALLER_FALLBACK_PIN
}

async function installPyinstaller(repoDir: string): Promise<void> {
  const requirement = resolvePyinstallerRequirement(repoDir)
  await runOrThrow(
    `pip install ${requirement}`,
    pipPath(repoDir),
    ['install', requirement],
    repoDir
  )
}

async function runOnedirBuild(
  repoDir: string,
  buildCwd: string,
  onedirCommand: string
): Promise<void> {
  const argv = onedirCommand.split(/\s+/).filter(Boolean)
  // pyinstaller itself always resolves from the venv at repoDir/.venv
  // (working-directory never moves the venv), but it must be SPAWNED with
  // buildCwd as its cwd -- upstream's own `working-directory:` step key
  // (e.g. legendary's `working-directory: legendary`) means its `cli.py` /
  // `../assets/...` arguments, and PyInstaller's own default --distpath
  // (`<cwd>/dist`), are resolved relative to that subdirectory, not the repo
  // root. Found live during this plan's real legendary build ("Script file
  // 'cli.py' does not exist" when spawned from repoDir instead).
  argv[0] = pyinstallerPath(repoDir)
  await runOrThrow(
    'pyinstaller --onedir build',
    argv[0],
    argv.slice(1),
    buildCwd
  )
}

function archiveDist(
  distParentDir: string,
  runnerDirName: string,
  outPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tar',
      ['-czf', outPath, '-C', distParentDir, runnerDirName],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar archive failed (exit ${code}): ${stderr}`))
    })
  })
}

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkFiles(full))
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

// Best-effort Mach-O detection (magic-number sniff, first 4 bytes) -- for the
// build-manifest's file-count/Mach-O-count audit trail only, not a security
// boundary.
const MACHO_MAGICS = new Set([
  0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca
])

function isMachO(filePath: string): boolean {
  let fd: number
  try {
    fd = openSync(filePath, 'r')
  } catch {
    return false
  }
  try {
    const buf = Buffer.alloc(4)
    const bytesRead = readSync(fd, buf, 0, 4, 0)
    if (bytesRead < 4) return false
    return (
      MACHO_MAGICS.has(buf.readUInt32BE(0)) ||
      MACHO_MAGICS.has(buf.readUInt32LE(0))
    )
  } catch {
    return false
  } finally {
    closeSync(fd)
  }
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

async function captureVersion(bin: string, args: string[]): Promise<string> {
  const result = await spawnArgv(bin, args)
  return (result.stdout || result.stderr).trim()
}

// ---------------------------------------------------------------------------
// buildRunner -- the full pipeline for one runner/arch pair.
// ---------------------------------------------------------------------------

export interface RunnerBuildResult {
  runner: OnedirRunnerName
  repo: string
  tag: string
  upstreamLine: string
  upstreamWorkingDirectory?: string
  onedirCommand: string
  droppedExpressions: string[]
  python3Version: string
  pyinstallerVersion: string
  archiveSha256: string
  archivePath: string
  fileCount: number
  machoCount: number
}

export async function buildRunner(
  runner: OnedirRunnerName,
  arch: string
): Promise<RunnerBuildResult> {
  if (process.platform !== 'darwin') {
    throw new Error(
      `buildRunner refuses to run off darwin (process.platform is ` +
        `"${process.platform}") -- PyInstaller cannot cross-compile ` +
        `(34.9-CONTEXT.md constraint 1)`
    )
  }
  if (process.arch !== arch) {
    throw new Error(
      `buildRunner refuses to build arch "${arch}" on a "${process.arch}" ` +
        `host -- PyInstaller cannot cross-compile (34.9-CONTEXT.md constraint 1)`
    )
  }

  const { repo, tag } = ONEDIR_RUNNERS[runner]
  // Resolved to an ABSOLUTE path deliberately: node's spawn(), when given a
  // relative `command` string alongside an `options.cwd`, resolves that
  // relative command against the CHILD's cwd (not this process's cwd) --
  // so a repo-root-relative venv binary path (e.g. pipPath(repoDir)) would
  // silently double-nest and ENOENT once cwd is also repoDir. Verified live
  // against a real venv during this plan's execution.
  const repoDir = resolvePath(RUNNERS_SRC_DIR, runner)

  await cloneRepo(repo, tag, repoDir)
  await createVenv(repoDir)
  await installDependencies(repoDir)
  await installPyinstaller(repoDir)

  const { command: upstreamLine, workingDirectory } =
    extractUpstreamPyinstallerCommand(repoDir)
  const { command, droppedExpressions } = toOnedirCommand(upstreamLine)
  const buildCwd = workingDirectory ? join(repoDir, workingDirectory) : repoDir
  await runOnedirBuild(repoDir, buildCwd, command)

  // PyInstaller's own default --distpath is "<cwd>/dist" -- i.e. relative to
  // wherever it was SPAWNED from, not the repo root. buildCwd (which folds in
  // any working-directory: step key) is therefore also the base for dist/.
  const distParentDir = join(buildCwd, 'dist')
  const distDir = join(distParentDir, runner)
  if (!existsSync(distDir)) {
    throw new Error(
      `Expected pyinstaller --onedir output at ${distDir}, none found`
    )
  }

  mkdirSync(RUNNERS_OUT_DIR, { recursive: true })
  const outPath = join(RUNNERS_OUT_DIR, archiveName(runner, arch))
  await archiveDist(distParentDir, runner, outPath)

  const files = walkFiles(distDir)
  const machoCount = files.filter(isMachO).length
  const archiveSha256 = sha256File(outPath)
  const python3Version = await captureVersion(pythonPath(repoDir), [
    '--version'
  ])
  const pyinstallerVersion = await captureVersion(pyinstallerPath(repoDir), [
    '--version'
  ])

  return {
    runner,
    repo,
    tag,
    upstreamLine,
    upstreamWorkingDirectory: workingDirectory,
    onedirCommand: command,
    droppedExpressions,
    python3Version,
    pyinstallerVersion,
    archiveSha256,
    archivePath: outPath,
    fileCount: files.length,
    machoCount
  }
}

// ---------------------------------------------------------------------------
// SHA256SUMS-${arch} + BUILD-MANIFEST-${arch}.json -- per-run audit trail.
// ---------------------------------------------------------------------------

function writeSha256Sums(arch: string, results: RunnerBuildResult[]): void {
  const lines = results.map(
    (r) => `${r.archiveSha256}  ${archiveName(r.runner, arch)}`
  )
  writeFileSync(
    join(RUNNERS_OUT_DIR, `SHA256SUMS-${arch}`),
    lines.join('\n') + '\n'
  )
}

function writeBuildManifest(arch: string, results: RunnerBuildResult[]): void {
  const manifest: Record<string, unknown> = {}
  for (const r of results) {
    manifest[r.runner] = {
      repo: r.repo,
      tag: r.tag,
      upstreamPyinstallerLine: r.upstreamLine,
      upstreamWorkingDirectory: r.upstreamWorkingDirectory ?? null,
      onedirCommand: r.onedirCommand,
      droppedExpressions: r.droppedExpressions,
      python3Version: r.python3Version,
      pyinstallerVersion: r.pyinstallerVersion,
      archiveSha256: r.archiveSha256,
      fileCount: r.fileCount,
      machoCount: r.machoCount
    }
  }
  writeFileSync(
    join(RUNNERS_OUT_DIR, `BUILD-MANIFEST-${arch}.json`),
    JSON.stringify(manifest, null, 2)
  )
}

// ---------------------------------------------------------------------------
// Entrypoint -- parses --arch=<x64|arm64> and an optional --runner=<name>.
// Only invokes a real build when the module is executed directly (guard
// idiom shared with meta/buildSteamBridgeShims.ts / meta/buildCrossoverIndex.ts:
// this script is bundled by esbuild and run as
// `node node_modules/.cache/build-runners-onedir.cjs`, which DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite, so `JEST_WORKER_ID` still reliably distinguishes "imported under
// test" from "run as a CLI").
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  arch: string
  runner?: OnedirRunnerName
} {
  const archArg = argv.find((a) => a.startsWith('--arch='))
  if (!archArg) {
    throw new Error('Missing required --arch=<x64|arm64> argument')
  }
  const arch = archArg.slice('--arch='.length)
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`--arch must be "x64" or "arm64", got "${arch}"`)
  }

  const runnerArg = argv.find((a) => a.startsWith('--runner='))
  if (!runnerArg) {
    return { arch }
  }
  const runnerValue = runnerArg.slice('--runner='.length)
  if (!isOnedirRunnerName(runnerValue)) {
    throw new Error(
      `--runner must be one of ${Object.keys(ONEDIR_RUNNERS).join(', ')}, ` +
        `got "${runnerValue}"`
    )
  }
  return { arch, runner: runnerValue }
}

export async function main(): Promise<void> {
  const { arch, runner } = parseArgs(process.argv.slice(2))
  const runners: OnedirRunnerName[] = runner
    ? [runner]
    : (Object.keys(ONEDIR_RUNNERS) as OnedirRunnerName[])

  const results: RunnerBuildResult[] = []
  for (const r of runners) {
    console.log(
      `Building ${r} (${ONEDIR_RUNNERS[r].tag}) as --onedir for ${arch}...`
    )
    const result = await buildRunner(r, arch)
    results.push(result)
    console.log(`Built ${r} -> ${result.archivePath}`)
  }

  writeSha256Sums(arch, results)
  writeBuildManifest(arch, results)
}

// Phase 34.9 Plan 09: `meta/downloadHelperBinaries.ts` imports `archiveName`
// from this module, and esbuild bundles both into one script executed via
// `node`. Without a further check, this file's own top-level code -- and
// therefore this guarded invocation -- runs as a side effect of merely being
// imported, since `JEST_WORKER_ID` alone cannot distinguish "the entrypoint"
// from "a dependency of the entrypoint" once bundled together. Requiring
// `--arch=` to be present in argv (which `parseArgs` already mandates before
// building anything) is a no-op for every legitimate direct invocation
// (`pnpm build-runners-onedir --arch=<x64|arm64>` always supplies it) and
// prevents this file's main() from running -- and crashing the whole bundle
// with a "Missing required --arch" exit before the importing script's own
// logic ever gets a chance to run -- when it is merely imported for its
// named export.
if (
  !process.env.JEST_WORKER_ID &&
  process.argv.some((a) => a.startsWith('--arch='))
) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
