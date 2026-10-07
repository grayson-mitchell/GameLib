/**
 * D-05 mechanical no-churn assertion.
 *
 * Phase 34.8 introduced a fork-owned `gamelib` i18n namespace
 * (`public/locales/en/gamelib.json`). D-06's split-brain design (fork
 * content lives in `gamelib.json`, upstream content stays in
 * `translation.json`/`gamepage.json`/`login.json`) and D-11's
 * read-permissive translation-memory reads are only safe if a `t()` call
 * that is missing its `gamelib:` namespace prefix cannot silently mutate
 * an upstream-owned catalog. `keepRemoved: true` (D-03) stops the parser
 * from deleting keys it can no longer see, but it does nothing to stop the
 * parser from ADDING a wrongly-namespaced key into an upstream file.
 *
 * This module is that backstop: it classifies every changed path under
 * `public/locales/` into `gamelib` (allowed -- any `gamelib.json` leaf and
 * its D-10 machine-translation provenance sidecar, `gamelib.mt.json`) or
 * `upstream` (forbidden -- anything else under `public/locales/`), and
 * throws `UpstreamChurnError` naming every offending path plus the likely
 * cause when any upstream path changed.
 *
 * Run with `pnpm i18n-churn-guard` after `pnpm i18n`. The
 * `classifyChangedPaths`/`assertNoUpstreamChurn` exports are also the D-05
 * assertion `pnpm test:ci` runs against the real working tree (see
 * `meta/__tests__/i18nCatalogChurnGuard.test.ts`'s `live tree` block).
 * Neither can fail on a checkout nobody ran the parser in, so
 * `.github/workflows/test.yml` runs `pnpm i18n` and then this CLI before
 * `pnpm test:ci` -- that ordering, not this module's existence, is what
 * turns this from an agreement into something CI proves.
 */

import { execFileSync } from 'node:child_process'

export interface ChurnClassification {
  gamelib: string[] // changed paths ending in /gamelib.json (or /gamelib.mt.json) -- allowed
  upstream: string[] // any other changed path under public/locales/ -- forbidden
}

const LOCALES_PREFIX = 'public/locales/'
const GAMELIB_SUFFIXES = ['/gamelib.json', '/gamelib.mt.json']

export class UpstreamChurnError extends Error {
  constructor(upstreamPaths: string[]) {
    super(
      'pnpm i18n changed a file it must never touch under public/locales/ ' +
        `(D-04/D-05/D-06): ${upstreamPaths.join(', ')}. The most likely ` +
        "cause is a t() call missing its 'gamelib:' namespace prefix, " +
        'writing into an upstream-owned catalog instead of ' +
        'gamelib.json. Do NOT hand-edit the catalog to paper over this -- ' +
        'revert with `git checkout -- public/locales/` and fix the ' +
        'call site.'
    )
    this.name = 'UpstreamChurnError'
  }
}

/**
 * Pure classifier. Filters `paths` to those under `public/locales/`, then
 * buckets each into `gamelib` (a `gamelib.json`/`gamelib.mt.json` leaf) or
 * `upstream` (anything else under `public/locales/`). Paths outside
 * `public/locales/` entirely are ignored -- this guard only ever concerns
 * itself with locale-catalog churn.
 */
export function classifyChangedPaths(paths: string[]): ChurnClassification {
  const result: ChurnClassification = { gamelib: [], upstream: [] }

  for (const path of paths) {
    if (!path.startsWith(LOCALES_PREFIX)) {
      continue
    }

    const isGamelib = GAMELIB_SUFFIXES.some((suffix) => path.endsWith(suffix))
    if (isGamelib) {
      result.gamelib.push(path)
    } else {
      result.upstream.push(path)
    }
  }

  return result
}

/** Throws `UpstreamChurnError` when `paths` contains any upstream-catalog change. */
export function assertNoUpstreamChurn(paths: string[]): void {
  const { upstream } = classifyChangedPaths(paths)
  if (upstream.length > 0) {
    throw new UpstreamChurnError(upstream)
  }
}

/**
 * The changed paths under `public/locales/` in the working tree at `cwd`:
 * STAGED, UNSTAGED and UNTRACKED alike. Shared by the CLI below and the jest
 * suite's `live tree` block, so the two can never disagree about what
 * "changed" means.
 *
 * `git status`, not `git diff --name-only`: the latter (what this used to
 * run) sees only unstaged changes to tracked files. A staged upstream edit
 * and -- the failure that matters most -- a brand-new catalogue the parser
 * wrote for a typo'd namespace (`t('gamelb:x')` -> `en/gamelb.json`) were
 * both invisible to it. `--untracked-files=all` lists each file of a new
 * locale directory instead of the collapsed `xx/`; `-z` keeps paths
 * unquoted and makes a rename's two paths unambiguous.
 */
export function listChangedLocalePaths(cwd?: string): string[] {
  // Fixed argv array via execFileSync -- never execSync with an
  // interpolated shell string.
  const output = execFileSync(
    'git',
    [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--',
      'public/locales'
    ],
    { encoding: 'utf-8', cwd }
  )
  return parsePorcelainZ(output)
}

/**
 * Pure parser for `git status --porcelain=v1 -z`: NUL-separated `XY path`
 * records, where a rename or copy (`R`/`C` in either column) is followed by
 * one extra record holding the ORIGINAL path. Both sides of a rename are
 * returned -- moving an upstream catalogue away is churn too.
 */
export function parsePorcelainZ(output: string): string[] {
  const records = output.split('\0')
  const paths: string[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.length < 4) continue
    const status = record.slice(0, 2)
    paths.push(record.slice(3))
    if (/[RC]/.test(status) && i + 1 < records.length) {
      paths.push(records[++i])
    }
  }
  return paths.filter((path) => path.length > 0)
}

// ---------------------------------------------------------------------------
// CLI half -- guarded so importing this module (e.g. from the jest test
// suite) never triggers a git shell-out or process.exit.
//
// NOTE: this script is run via `node meta/runTs.cjs` (the meta/ convention,
// package.json `i18n-churn-guard`), which DOES set `require.main` -- but
// this module is also imported directly by its jest suite, so the usual
// `require.main === module` idiom would run this at import time under test
// too. `JEST_WORKER_ID` is set by Jest for every worker (including
// --runInBand), so this reliably distinguishes "imported under test" from
// "run as a CLI" (mirrors meta/buildCrossoverIndex.ts's identical guard).
// ---------------------------------------------------------------------------

function runCli(): void {
  let changedPaths: string[]
  try {
    changedPaths = listChangedLocalePaths()
  } catch (error) {
    console.error(
      `::error::i18n-churn-guard could not run 'git status' against ` +
        `public/locales/: ${
          error instanceof Error ? error.message : String(error)
        }`
    )
    process.exit(1)
    return
  }

  try {
    assertNoUpstreamChurn(changedPaths)
  } catch (error) {
    if (error instanceof UpstreamChurnError) {
      console.error(`::error::${error.message}`)
      process.exit(1)
      return
    }
    throw error
  }

  console.log(
    'i18n-churn-guard: clean -- no upstream public/locales/ catalog changed.'
  )
}

if (!process.env.JEST_WORKER_ID) {
  runCli()
}
