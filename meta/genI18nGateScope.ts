/**
 * Offline, human/periodic CLI that regenerates the committed fork-file-scope
 * snapshot the i18n enforcement gate reads: `meta/i18nGateScope.json`.
 *
 * Run with `pnpm gen-i18n-gate-scope`.
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
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import packageJson from '../package.json'

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
    generatedBy: 'pnpm gen-i18n-gate-scope',
    files,
    excluded: {
      deferred: [...deferredPaths].sort(),
      reason: { ...DEFERRED_FILES }
    }
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

  // NOT __dirname -- this script is bundled by esbuild to
  // node_modules/.cache/gen-i18n-gate-scope.cjs and run as
  // `node node_modules/.cache/gen-i18n-gate-scope.cjs`, so __dirname in that
  // mode resolves to node_modules/.cache, NOT the source file's directory.
  // `pnpm gen-i18n-gate-scope` always runs from the repo root, so a
  // repo-root-relative path is correct here.
  const outPath = join('meta', 'i18nGateScope.json')
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n')

  // 34.13 review A-17: the staleness ratchet's INPUT, committed so it is
  // readable in CI.
  //
  // The ratchet compares "every fork-touched file eligible for the gate's
  // scope" against "every file actually in the committed scope". The first
  // half was only ever obtainable from a live `git diff` against the upstream
  // merge-base — and `actions/checkout@v6` clones at depth 1 with no Heroic
  // remote, so that diff FAILS in CI and the whole guard degraded to
  // `describe.skip` on every pipeline run. The enforcement existed only on a
  // developer machine that had fetched the merge-base.
  //
  // Writing the derived set here moves the ratchet onto a committed,
  // CI-readable input. The file cannot rot silently: when git IS available
  // the suite additionally asserts this artifact equals the live derivation,
  // so a stale copy fails locally and on any runner that does fetch history.
  const forkTouchedPath = join('meta', 'i18nForkTouchedFiles.json')
  writeFileSync(
    forkTouchedPath,
    JSON.stringify(
      {
        baseCommit,
        baseVersion,
        generatedAt: snapshot.generatedAt,
        generatedBy: 'pnpm gen-i18n-gate-scope',
        purpose:
          'A-17: the CI-readable input to the i18n scope staleness ratchet — every fork-touched src/frontend source file eligible for the hardcoded-string gate (D-17 deferrals already removed, exactly the operand the ratchet compares against), INCLUDING those not yet listed in i18nGateScope.json. Regenerate with `pnpm gen-i18n-gate-scope`.',
        files: snapshot.files
      },
      null,
      2
    ) + '\n'
  )

  console.log(
    `Wrote ${outPath}: ${snapshot.files.length} files in scope, ` +
      `${snapshot.excluded.deferred.length} deferred (D-17).`
  )
  console.log(
    `Wrote ${forkTouchedPath}: ${snapshot.files.length} fork-touched eligible files.`
  )
}

// NOTE: this script is bundled by esbuild to
// node_modules/.cache/gen-i18n-gate-scope.cjs and run as
// `node node_modules/.cache/gen-i18n-gate-scope.cjs` (package.json
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
