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
 * Run with `pnpm i18n-churn-guard` after `pnpm i18n`, before staging the
 * result. The `classifyChangedPaths`/`assertNoUpstreamChurn` exports are
 * also the D-05 assertion `pnpm test:ci` runs against the real working
 * tree (see `meta/__tests__/i18nCatalogChurnGuard.test.ts`'s `live tree`
 * block) — that is what turns this from an agreement into something CI
 * proves.
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
  let diffOutput: string
  try {
    // Fixed argv array via execFileSync -- never execSync with an
    // interpolated shell string.
    diffOutput = execFileSync(
      'git',
      ['diff', '--name-only', '--', 'public/locales'],
      { encoding: 'utf-8' }
    )
  } catch (error) {
    console.error(
      `::error::i18n-churn-guard could not run 'git diff' against ` +
        `public/locales/: ${
          error instanceof Error ? error.message : String(error)
        }`
    )
    process.exit(1)
    return
  }

  const changedPaths = diffOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

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
