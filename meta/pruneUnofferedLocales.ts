/**
 * Quick task 260922-hjb. `public/locales` holds 49 directories while
 * `src/common/languages.ts`'s `supportedLanguages` offers only 43 -- `br`,
 * `da`, `ka`, `sl`, `th` and `uz` are unreachable (no `languageDetector` is
 * registered in `src/frontend/index.tsx`, and i18next's `supportedLngs`
 * resolves an excluded code to `["en"]`) yet ship TWICE: once via
 * `src-tauri/tauri.conf.json`'s wholesale `../build/locales/` resource
 * mapping, and again via `build/renderer/locales` under `frontendDist`
 * (`meta/assembleRendererDist.ts`'s `STATIC_RENDERER_DIRS`). ~1000K across
 * the two trees, per the todo this plan closes.
 *
 * Modelled on `meta/pruneStaleHelperBinaries.ts` -- same shape (pure
 * functions + a plugin factory at the bottom), same commenting density --
 * but every detail below is re-derived for THIS prune, not ported: the
 * source of truth is `supportedLanguages`, not a mirrored directory, and the
 * guard question is "does the offered list still look like a real offered
 * list", not "is public/bin fully populated".
 *
 * WHY THE HOOK IS `closeBundle`, NOT `buildStart` (unlike the neighbouring
 * `pruneStaleHelperBinariesPlugin`, which prunes `build/bin` at
 * `buildStart`): vite's own publicDir copy (`copyDir(publicDir, outDir)`,
 * `dep-DBxKXgDP.js:46262`) runs during `prepareOutDir`, strictly AFTER
 * `buildStart` fires. A `buildStart` prune here would be undone by this same
 * build's own copy re-adding all 49 directories a few steps later. Only a
 * hook that fires after the copy -- `closeBundle` -- can make the prune
 * stick.
 *
 * WHY NO `enforce` KEY, AND WHY THAT MATTERS MORE THAN ARRAY POSITION:
 * `sortUserPlugins` (`dep-DBxKXgDP.js:49184-49195`) partitions user plugins
 * into pre/normal/post by `enforce`, and `resolvePlugins`
 * (`:41874-41916`) concatenates them in that order -- a plugin with NO
 * `enforce` lands before EVERY `enforce: 'post'` plugin regardless of where
 * it sits in the `plugins` array. `assembleRendererDistPlugin` IS
 * `enforce: 'post'`, and it `rmSync`s `build/renderer` wholesale before
 * `cpSync`ing `build/locales` into it (`assembleRendererDist.ts:124`,
 * `:151-160`). Because this plugin runs on the normal tier, it always
 * completes before that copy -- which is precisely why ONE prune of
 * `build/locales` fixes BOTH shipped trees.
 *
 * WHY `closeBundle` MUST STAY A PLAIN SYNCHRONOUS FUNCTION: `hookParallel`
 * (`rollup.js:3603-3616`) does not `await` between non-`sequential`
 * plugins -- it pushes every hook's promise and lets them interleave. The
 * ordering guarantee above holds only because a SYNCHRONOUS hook body runs
 * to completion inside `runHook` before the loop reaches the next plugin.
 * Making this `async` would silently reopen the exact race the `enforce`
 * tiering was chosen to avoid.
 *
 * This ordering is pinned by `meta/__tests__/viteRendererConfig.test.ts`
 * (hook identity, enforce tier, synchronicity, array order) -- if a future
 * edit re-orders the plugins array or adds `enforce: 'post'` here, that test
 * goes red instead of the bug landing as a silent half-fix.
 *
 * Deliberately does NOT reference or touch anything under `public/locales/`
 * or `src-tauri/tauri.conf.json` -- this prunes build output only.
 */
import {
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
  type Dirent
} from 'node:fs'
import { join } from 'node:path'

import type { Plugin } from 'vite'

import { resolveDestPath } from './preserveRunnerSymlinks'
import { supportedLanguages } from '../src/common/languages'

// A scope-collapse floor, NOT a second ceiling -- borrowed reasoning from
// `meta/lintScoped.cjs:61-73`. An offered list that silently collapsed to a
// handful (an empty import, a bad merge) would compute a prune set covering
// almost the whole tree, and a guard that only checked "non-empty" would
// wave it through. 20 is well under the measured 43 and far above any
// plausible collapse remnant.
const OFFERED_FLOOR = 20

// The measured ratio today is 6/49 = 0.122. A quarter of the tree leaves
// headroom for a few more unreachable locales accumulating (as has already
// happened once) while still refusing a wholesale wipe.
const MAX_PRUNE_FRACTION = 0.25

/**
 * Returns the DIRECTORY names under `localesDir` that are absent from
 * `offered`, sorted. Files are ignored -- only `dirent.isDirectory()`
 * counts, matching `computeUnofferedLocaleDirs`'s sibling walks elsewhere in
 * this repo. Returns `[]`, never throws, when `localesDir` does not exist or
 * is unreadable -- a fresh CI checkout with no pre-existing `build/locales`
 * must compute an empty set, not fail.
 */
export function computeUnofferedLocaleDirs(
  localesDir: string,
  offered: readonly string[]
): string[] {
  const offeredSet = new Set(offered)
  return listLocaleDirNames(localesDir)
    .filter((name) => !offeredSet.has(name))
    .sort()
}

function listLocaleDirNames(localesDir: string): string[] {
  if (!existsSync(localesDir)) {
    return []
  }

  let dirents: Dirent[]
  try {
    dirents = readdirSync(localesDir, { withFileTypes: true })
  } catch {
    return []
  }

  return dirents.filter((dirent) => dirent.isDirectory()).map((d) => d.name)
}

export interface OfferedLocalesAssessment {
  ok: boolean
  reasons: string[]
}

/**
 * Refuse-to-prune guard, in the spirit of `assessPublicBin`. Every failing
 * condition is collected, never short-circuited (same reason `runScope` in
 * `meta/lintScoped.cjs` reports all failures at once rather than stopping at
 * the first). `ok` is false when:
 *
 *   - `offered` has fewer than `OFFERED_FLOOR` entries (scope collapse).
 *   - `offered` does not contain `'en'` (the one locale that must always be
 *     reachable -- i18next's fallback).
 *   - the prune set itself contains `'en'` (would delete the fallback).
 *   - the prune set is more than `MAX_PRUNE_FRACTION` of `presentDirs`
 *     (looks like a wholesale wipe, not a targeted prune).
 */
export function assessOfferedLocales(
  offered: readonly string[],
  presentDirs: readonly string[],
  pruneSet: readonly string[]
): OfferedLocalesAssessment {
  const reasons: string[] = []

  if (offered.length < OFFERED_FLOOR) {
    reasons.push(
      `offered list has only ${offered.length} entries (floor is >= ${OFFERED_FLOOR}) -- looks collapsed, not a real offered set`
    )
  }

  if (!offered.includes('en')) {
    reasons.push(`offered list does not contain 'en'`)
  }

  if (pruneSet.includes('en')) {
    reasons.push(
      `prune set contains 'en' -- refusing to delete the fallback locale`
    )
  }

  if (
    presentDirs.length > 0 &&
    pruneSet.length / presentDirs.length > MAX_PRUNE_FRACTION
  ) {
    reasons.push(
      `prune set (${pruneSet.length}) exceeds ${Math.round(MAX_PRUNE_FRACTION * 100)}% of present directories (${presentDirs.length}) -- looks like a wholesale wipe, not a targeted prune`
    )
  }

  return { ok: reasons.length === 0, reasons }
}

export interface PruneLocalesResult {
  pruned: string[]
  bytesFreed: number
  guardEvaluated: boolean
}

/**
 * Prunes `localesDir` entries absent from `offered`. An EMPTY prune set is a
 * silent no-op -- `guardEvaluated` stays `false` and `assessOfferedLocales`
 * is never called, even when `localesDir` does not exist. This is what keeps
 * a fresh CI checkout green: `.github/workflows/release-tauri.yml` runs
 * `pnpm exec vite build` with no pre-existing `build/`, so the prune set is
 * empty and this function must not demand anything about the offered list in
 * that case.
 *
 * A NON-EMPTY prune set evaluates the guard first, strictly before the FIRST
 * `rmSync`. If `assessOfferedLocales` reports `ok: false`, this throws
 * WITHOUT deleting anything.
 *
 * Every delete target is resolved through `resolveDestPath` (reusing
 * `meta/preserveRunnerSymlinks.ts`'s containment idiom rather than
 * re-implementing it) -- names come entirely from this module's own
 * `readdirSync`, never from outside, but the containment check stays
 * defense-in-depth.
 */
export function pruneUnofferedLocales(
  localesDir: string,
  offered: readonly string[] = supportedLanguages
): PruneLocalesResult {
  const presentDirs = listLocaleDirNames(localesDir)
  const pruneSet = computeUnofferedLocaleDirs(localesDir, offered)

  if (pruneSet.length === 0) {
    return { pruned: [], bytesFreed: 0, guardEvaluated: false }
  }

  const assessment = assessOfferedLocales(offered, presentDirs, pruneSet)
  if (!assessment.ok) {
    throw new Error(
      [
        `pruneUnofferedLocales: refusing to prune ${pruneSet.length} ` +
          `director${pruneSet.length === 1 ? 'y' : 'ies'} from "${localesDir}" -- ` +
          'the offered-locales guard failed:',
        ...assessment.reasons.map((reason) => `  - ${reason}`)
      ].join('\n')
    )
  }

  let bytesFreed = 0
  const pruned: string[] = []

  for (const name of pruneSet) {
    const targetPath = resolveDestPath(localesDir, name)
    bytesFreed += sumApparentBytes(targetPath)
    rmSync(targetPath, { recursive: true, force: true })
    pruned.push(name)
  }

  return { pruned, bytesFreed, guardEvaluated: true }
}

/**
 * Sums `stat().size` (apparent bytes, never `du`/block-allocated size) over
 * every regular file at or beneath `path`, skipping symlinks -- same
 * semantics as `pruneStaleHelperBinaries.ts`'s `sumApparentBytes`, re-derived
 * locally rather than imported (that function is not exported).
 */
function sumApparentBytes(path: string): number {
  const st = lstatSync(path)
  if (st.isSymbolicLink()) {
    return 0
  }
  if (st.isFile()) {
    return st.size
  }
  if (st.isDirectory()) {
    let total = 0
    for (const dirent of readdirSync(path, { withFileTypes: true })) {
      total += sumApparentBytes(join(path, dirent.name))
    }
    return total
  }
  return 0
}

/**
 * `closeBundle` vite plugin factory. See the file header for the full
 * ordering argument: no `enforce` key (normal tier, ahead of every
 * `enforce: 'post'` plugin including `assembleRendererDistPlugin`), and a
 * plain SYNCHRONOUS `closeBundle` body -- not `async`.
 *
 * Default `localesDir` is `__dirname`-relative (`build/locales`), matching
 * every sibling plugin in this file's family, not derived from
 * `config.build.outDir`.
 */
export function pruneUnofferedLocalesPlugin(options?: {
  localesDir?: string
}): Plugin {
  const localesDir =
    options?.localesDir ?? join(__dirname, '..', 'build', 'locales')

  return {
    name: 'gamelib-prune-unoffered-locales',
    apply: 'build',
    closeBundle() {
      const { pruned, bytesFreed } = pruneUnofferedLocales(localesDir)
      if (pruned.length === 0) {
        console.log('[prune-unoffered-locales] nothing to prune')
      } else {
        console.log(
          `[prune-unoffered-locales] pruned ${pruned.length} director${
            pruned.length === 1 ? 'y' : 'ies'
          }, ${bytesFreed} bytes freed`
        )
      }
    }
  }
}
