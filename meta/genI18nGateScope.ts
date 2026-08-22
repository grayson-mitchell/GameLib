/**
 * Offline, human/periodic CLI that regenerates the committed fork-file-scope
 * artifacts behind the i18n enforcement gate.
 *
 * TWO ARTIFACTS, TWO VERY DIFFERENT POLICIES (quick-260816-9o0):
 *
 *   `meta/i18nForkTouchedFiles.json` — routine. Regenerated on EVERY run.
 *   It is the CI-readable input to the staleness ratchet (34.13 review A-17)
 *   and is pure generator output; regenerating it is the normal thing to do.
 *   `pnpm gen-i18n-gate-scope` does exactly this and nothing else.
 *
 *   `meta/i18nGateScope.json` — HAND-CURATED, and the input to the BLOCKING
 *   hardcoded-string gate (`meta/hardcodedStringGate.ts`). This script will
 *   NOT touch it without the explicit `--rewrite-scope` flag
 *   (`pnpm gen-i18n-scope:rewrite`), and even WITH the flag it REFUSES while
 *   the file's own `generatedBy` says something other than this generator —
 *   printing the counts and paths it would have changed, then exiting 1.
 *
 * Why: A-17 gave people a routine reason to run this script, and an
 * unconditional run silently widened the blocking gate from 160 to 178 files
 * and erased the hand-edited provenance marker. That cost real work twice —
 * 34.13-08 removed two entries by hand rather than regenerate, and the A-17
 * fix agent had to restore the file with `git show HEAD:... >`. A widened
 * gate is not a loud failure; it is 18 files quietly re-entering scope.
 *
 * To legitimately regenerate the scope snapshot: either hand-edit it
 * surgically (as 34.13-08 did), or change its `generatedBy` to
 * `pnpm gen-i18n-gate-scope` first and then run `pnpm gen-i18n-scope:rewrite`.
 *
 * NOTE for anyone reproducing a run in a sacrificial CWD: this script's
 * OUTPUT paths are CWD-relative, but so is the `git diff -- src/frontend`
 * PATHSPEC below. Running it from a scratch directory inside the repo
 * therefore yields an empty diff and an EmptyScopeError rather than a
 * faithful reproduction. Use a CWD outside the repo with `GIT_DIR` /
 * `GIT_WORK_TREE` pointed at it (measured, quick-260816-9o0).
 *
 * MUST NOT run in CI. D-07 identifies fork-added/fork-touched code by
 * diffing against the upstream Heroic merge-base (`package.json`'s
 * `upstream.baseCommit`), but `actions/checkout@v6` gives a shallow,
 * single-remote clone with no Heroic remote and no merge-base commit in its
 * history — the `git diff` below would fail there with
 * "fatal: invalid object name". So this script is run locally (where
 * `origin` already points at Heroic and the merge-base has been fetched)
 * and its output is committed. The gate itself only ever reads the
 * committed JSON artifact this script writes — zero network dependency,
 * zero CI-environment risk (see RESEARCH.md Pitfall 1).
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import packageJson from '../package.json'

// ---------------------------------------------------------------------------
// Provenance marker. Single source of truth for "this file was produced by
// the generator, so the generator may overwrite it". Anything else on disk
// means a human curated it.
// ---------------------------------------------------------------------------

export const GENERATOR_PROVENANCE = 'pnpm gen-i18n-gate-scope' as const

// ---------------------------------------------------------------------------
// Types (contract consumed by plan 05's scanScope() — do not restructure)
// ---------------------------------------------------------------------------

export interface ScopeSnapshot {
  baseCommit: string
  baseVersion: string
  generatedAt: string
  generatedBy: 'pnpm gen-i18n-gate-scope'
  files: string[]
  excluded: {
    deferred: string[]
    reason: Record<string, string>
  }
}

export interface BuildScopeSnapshotOptions {
  diffLines: string[]
  baseCommit: string
  baseVersion: string
  now: Date
}

// ---------------------------------------------------------------------------
// Empty-scope guard — a silently-empty scope is a gate that passes
// everything, which is worse than a script that refuses to run.
// ---------------------------------------------------------------------------

export class EmptyScopeError extends Error {
  constructor() {
    super(
      'i18n gate scope derivation yielded zero files -- a silently-empty ' +
        'scope would be a gate that passes everything. Refusing to build ' +
        'the snapshot; check the diff input and the filters in ' +
        'deriveScopeFiles().'
    )
    this.name = 'EmptyScopeError'
  }
}

// ---------------------------------------------------------------------------
// D-17 deferred files — present in the fork diff, but exempted from the
// scan scope because plan 05's allowlist handles them instead. Keeping a
// file in both places would double-count it.
// ---------------------------------------------------------------------------

const DEFERRED_FILES: Record<string, string> = {
  'src/frontend/screens/Login/components/SteamLogin/index.tsx':
    'D-17 -- deferred; interactive SteamLogin UI is deletion-pending, ' +
    'blocked on Phase 34.4.2',
  'src/frontend/screens/WebView/useTauriOAuthLogin.ts':
    'D-17 -- deferred; Epic OAuth login flow, blocked on Phase 34.5'
}

// ---------------------------------------------------------------------------
// deriveScopeFiles — pure. Takes `git diff --name-status` output lines,
// returns the filtered, sorted, de-duplicated file list.
// ---------------------------------------------------------------------------

interface DiffEntry {
  status: string
  path: string
}

function parseDiffLine(line: string): DiffEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const fields = trimmed.split('\t')
  const status = fields[0]
  // Rename/copy lines (`R100`, `C75`, ...) carry THREE tab-separated fields
  // (status, old path, new path) -- the last field is the destination path,
  // which is what still exists on disk and is what must be scanned.
  const path = fields[fields.length - 1]
  if (!path) return null

  return { status, path }
}

export function deriveScopeFiles(diffLines: string[]): string[] {
  const survivors = new Set<string>()

  for (const line of diffLines) {
    const entry = parseDiffLine(line)
    if (!entry) continue

    // Deleted files cannot be scanned.
    if (entry.status.startsWith('D')) continue

    // Normalise to POSIX separators.
    const path = entry.path.split('\\').join('/')

    // Scope is src/frontend/ TypeScript source only.
    if (!path.startsWith('src/frontend/')) continue
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) continue

    // Non-source assets that can slip into the diff.
    if (path.endsWith('.d.ts')) continue

    // Drop test files.
    if (path.includes('__tests__/')) continue
    if (
      path.endsWith('.test.ts') ||
      path.endsWith('.test.tsx') ||
      path.endsWith('.spec.ts') ||
      path.endsWith('.spec.tsx')
    ) {
      continue
    }

    // Both A (net-new) and M (modified) statuses stay in scope -- RESEARCH.md
    // is explicit that fork-added literals also live mixed into otherwise-
    // upstream files, so an A-only scope would under-scope the gate.
    survivors.add(path)
  }

  return [...survivors].sort()
}

// ---------------------------------------------------------------------------
// buildScopeSnapshot — pure. Assembles the committed ScopeSnapshot, carving
// out the two D-17 deferred files into `excluded`.
// ---------------------------------------------------------------------------

export function buildScopeSnapshot(
  opts: BuildScopeSnapshotOptions
): ScopeSnapshot {
  const derived = deriveScopeFiles(opts.diffLines)

  const deferredPaths = Object.keys(DEFERRED_FILES)
  const deferredSet = new Set(deferredPaths)
  const files = derived.filter((path) => !deferredSet.has(path))

  if (files.length === 0) {
    throw new EmptyScopeError()
  }

  return {
    baseCommit: opts.baseCommit,
    baseVersion: opts.baseVersion,
    generatedAt: opts.now.toISOString(),
    generatedBy: GENERATOR_PROVENANCE,
    files,
    excluded: {
      deferred: [...deferredPaths].sort(),
      reason: { ...DEFERRED_FILES }
    }
  }
}

// ---------------------------------------------------------------------------
// CLI flags. `--rewrite-scope` is the ONLY recognised flag.
// ---------------------------------------------------------------------------

const RECOGNISED_FLAGS = ['--rewrite-scope']

export interface CliFlags {
  rewriteScope: boolean
}

export function parseCliFlags(argv: string[]): CliFlags {
  let rewriteScope = false

  for (const token of argv) {
    if (token === '--rewrite-scope') {
      rewriteScope = true
      continue
    }

    // A typo MUST fail loudly. Silently ignoring `--rewritescope` would
    // degrade into "don't rewrite" and exit 0 — the operator would believe
    // they had asked for a rewrite and get a clean run that did nothing.
    if (token.startsWith('--')) {
      throw new Error(
        `meta/genI18nGateScope.ts: unrecognised flag "${token}". ` +
          `Recognised flags: ${RECOGNISED_FLAGS.join(', ')}.`
      )
    }
  }

  return { rewriteScope }
}

// ---------------------------------------------------------------------------
// Provenance guard over the hand-curated scope snapshot.
// ---------------------------------------------------------------------------

/**
 * The on-disk `generatedBy` string, or `null` when the file is absent,
 * unreadable, not valid JSON, or carries no string `generatedBy`. Never
 * throws — an unreadable file must not crash the routine path.
 */
export function readScopeProvenance(scopePath: string): string | null {
  let raw: string
  try {
    raw = readFileSync(scopePath, 'utf-8')
  } catch {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const generatedBy = (parsed as { generatedBy?: unknown }).generatedBy
    return typeof generatedBy === 'string' ? generatedBy : null
  } catch {
    return null
  }
}

/**
 * Default-deny in the direction that matters: anything that is not EXACTLY
 * this generator's own marker is treated as hand-curated and protected.
 *
 * `null` (absent/unreadable file) is deliberately NOT hand-curated — that is
 * the legitimate bootstrap case, and refusing it would mean the snapshot
 * could never be created in the first place.
 *
 * Deliberately NOT a substring match on "hand-edited": the marker text WILL
 * be reworded eventually (it already carries phase-specific review IDs), and
 * a substring match would then silently stop protecting the file — the exact
 * silent-rot failure mode this guard exists to prevent.
 */
export function isHandCuratedProvenance(provenance: string | null): boolean {
  if (provenance === null) return false
  return provenance !== GENERATOR_PROVENANCE
}

export interface ScopeRewriteRefusal {
  provenance: string
  existingCount: number
  nextCount: number
  added: string[]
  removed: string[]
}

export interface WriteArtifactsResult {
  wroteForkTouched: string
  wroteScope: string | null
  refusal: ScopeRewriteRefusal | null
}

function readScopeFiles(scopePath: string): string[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(scopePath, 'utf-8'))
    const files = (parsed as { files?: unknown }).files
    if (!Array.isArray(files)) return []
    return files.filter((file): file is string => typeof file === 'string')
  } catch {
    return []
  }
}

/**
 * THE single write path for both artifacts. `main()` contains no
 * `writeFileSync` calls of its own — every byte either artifact receives goes
 * through here, so the flag gate and the provenance refusal cannot be
 * bypassed by a second write site drifting in later.
 */
export function writeArtifacts(opts: {
  snapshot: ScopeSnapshot
  outDir: string
  rewriteScope: boolean
}): WriteArtifactsResult {
  const { snapshot, outDir, rewriteScope } = opts

  // 1. The routine artifact, always. This keeps the common path one command.
  const forkTouchedPath = join(outDir, 'i18nForkTouchedFiles.json')
  writeFileSync(
    forkTouchedPath,
    JSON.stringify(
      {
        baseCommit: snapshot.baseCommit,
        baseVersion: snapshot.baseVersion,
        generatedAt: snapshot.generatedAt,
        generatedBy: GENERATOR_PROVENANCE,
        purpose:
          'A-17: the CI-readable input to the i18n scope staleness ratchet — every fork-touched src/frontend source file eligible for the hardcoded-string gate (D-17 deferrals already removed, exactly the operand the ratchet compares against), INCLUDING those not yet listed in i18nGateScope.json. Regenerate with `pnpm gen-i18n-gate-scope`.',
        files: snapshot.files
      },
      null,
      2
    ) + '\n'
  )

  const scopePath = join(outDir, 'i18nGateScope.json')

  // 2. Without the flag the scope file is not opened for writing at all —
  //    not touched, not truncated, not stat-raced.
  if (!rewriteScope) {
    return {
      wroteForkTouched: forkTouchedPath,
      wroteScope: null,
      refusal: null
    }
  }

  // 3. With the flag, the file's OWN header still gets a veto.
  const provenance = readScopeProvenance(scopePath)
  if (isHandCuratedProvenance(provenance)) {
    const existing = readScopeFiles(scopePath)
    const existingSet = new Set(existing)
    const nextSet = new Set(snapshot.files)

    return {
      wroteForkTouched: forkTouchedPath,
      wroteScope: null,
      refusal: {
        provenance: provenance as string,
        existingCount: existing.length,
        nextCount: snapshot.files.length,
        added: snapshot.files.filter((file) => !existingSet.has(file)).sort(),
        removed: existing.filter((file) => !nextSet.has(file)).sort()
      }
    }
  }

  // 4. Generator-provenance (or absent) — a legitimate rewrite.
  writeFileSync(scopePath, JSON.stringify(snapshot, null, 2) + '\n')
  return {
    wroteForkTouched: forkTouchedPath,
    wroteScope: scopePath,
    refusal: null
  }
}

// ---------------------------------------------------------------------------
// CLI entry (guarded so the module stays importable by jest without side
// effects -- mirrors how meta/buildCrossoverIndex.ts separates its pure
// exports from its entry point).
// ---------------------------------------------------------------------------

const BASE_COMMIT_PATTERN = /^[0-9a-f]{40}$/

function readUpstream(): { baseCommit: string; baseVersion: string } {
  const upstream = (
    packageJson as { upstream: { baseCommit: string; baseVersion: string } }
  ).upstream
  return { baseCommit: upstream.baseCommit, baseVersion: upstream.baseVersion }
}

export function main(): void {
  const flags = parseCliFlags(process.argv.slice(2))
  const { baseCommit, baseVersion } = readUpstream()

  // T-34.8-03 -- never interpolate an unvalidated value into a git argument.
  if (!BASE_COMMIT_PATTERN.test(baseCommit)) {
    console.error(
      `::error::package.json's upstream.baseCommit ("${baseCommit}") is ` +
        'not a 40-character lowercase hex commit SHA. Refusing to pass an ' +
        'unvalidated value to git.'
    )
    process.exit(1)
    return
  }

  let diffOutput: string
  try {
    // Fixed argv array via execFileSync -- never execSync with an
    // interpolated shell string (T-34.8-03).
    diffOutput = execFileSync(
      'git',
      ['diff', '--name-status', baseCommit, 'HEAD', '--', 'src/frontend'],
      { encoding: 'utf-8' }
    )
  } catch (error) {
    console.error(
      `::error::git diff against merge-base ${baseCommit} failed -- the ` +
        'commit is likely not present in this clone (the classic symptom ' +
        'is "fatal: invalid object name"). This script is OFFLINE-ONLY: ' +
        'run it locally, where the Heroic remote and merge-base commit are ' +
        'already fetched. It must never be wired into CI ' +
        `(RESEARCH.md Pitfall 1). Underlying error: ${
          error instanceof Error ? error.message : String(error)
        }`
    )
    process.exit(1)
    return
  }

  const diffLines = diffOutput
    .split('\n')
    .filter((line) => line.trim().length > 0)

  const snapshot = buildScopeSnapshot({
    diffLines,
    baseCommit,
    baseVersion,
    now: new Date()
  })

  // NOT __dirname -- this script is bundled by esbuild to a private tmpdir
  // and run from there (meta/runTs.cjs), so __dirname in that mode resolves
  // to the tmpdir, NOT the source file's directory. `pnpm gen-i18n-gate-scope`
  // always runs from the repo root, so a repo-root-relative path is correct.
  //
  // 34.13 review A-17 context for the fork-touched artifact written inside
  // writeArtifacts(): the staleness ratchet compares "every fork-touched file
  // eligible for the gate's scope" against "every file actually in the
  // committed scope". The first half was only ever obtainable from a live
  // `git diff` against the upstream merge-base — and `actions/checkout@v6`
  // clones at depth 1 with no Heroic remote, so that diff FAILS in CI and the
  // whole guard degraded to `describe.skip` on every pipeline run. Writing the
  // derived set moves the ratchet onto a committed, CI-readable input.
  const result = writeArtifacts({
    snapshot,
    outDir: 'meta',
    rewriteScope: flags.rewriteScope
  })

  if (result.refusal) {
    const { provenance, existingCount, nextCount, added, removed } =
      result.refusal

    console.error(
      `::error::REFUSING to rewrite meta/i18nGateScope.json. Its generatedBy ` +
        `says:\n  ${provenance}\n` +
        `That is not "${GENERATOR_PROVENANCE}", so this file is hand-curated ` +
        `and overwriting it would silently change the BLOCKING ` +
        `hardcoded-string gate's scope.\n\n` +
        `This run would have changed it: ${existingCount} -> ${nextCount} ` +
        `files (+${added.length}/-${removed.length}).`
    )

    if (added.length > 0) {
      console.error('\nWould ADD:')
      for (const file of added) console.error(`  + ${file}`)
    }
    if (removed.length > 0) {
      console.error('\nWould REMOVE:')
      for (const file of removed) console.error(`  - ${file}`)
    }

    console.error(
      `\nTwo legitimate ways forward:\n` +
        `  1. Hand-edit meta/i18nGateScope.json surgically, adding or removing ` +
        `only the paths you actually intend (this is what 34.13-08 did), and ` +
        `leave its hand-edited generatedBy marker in place.\n` +
        `  2. If a FULL regeneration really is intended, first change that ` +
        `file's generatedBy to "${GENERATOR_PROVENANCE}", then re-run ` +
        `\`pnpm gen-i18n-scope:rewrite\`. Doing so widens the blocking gate ` +
        `by every path listed above -- make sure that is what you want.\n\n` +
        `meta/i18nForkTouchedFiles.json WAS regenerated; only the scope ` +
        `snapshot was left untouched.`
    )
    process.exit(1)
    return
  }

  // Only claim to have written the scope file when it was actually written --
  // a default run must not report a write it did not perform.
  if (result.wroteScope) {
    console.log(
      `Wrote ${result.wroteScope}: ${snapshot.files.length} files in scope, ` +
        `${snapshot.excluded.deferred.length} deferred (D-17).`
    )
  } else {
    console.log(
      `Left meta/i18nGateScope.json untouched (hand-curated; pass ` +
        `--rewrite-scope, i.e. \`pnpm gen-i18n-scope:rewrite\`, to attempt a ` +
        `rewrite).`
    )
  }
  console.log(
    `Wrote ${result.wroteForkTouched}: ${snapshot.files.length} fork-touched eligible files.`
  )
}

// NOTE: this script is run via `node meta/runTs.cjs` (package.json
// `gen-i18n-gate-scope`), which DOES set `require.main` -- but this module is
// also imported directly by its jest suite, so the usual
// `require.main === module` idiom would run this at import time under test
// too. `JEST_WORKER_ID` is set by Jest for every worker (including
// --runInBand), so this reliably distinguishes "imported under test" from
// "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  try {
    main()
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
