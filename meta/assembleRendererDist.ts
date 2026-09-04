/**
 * Quick task 260901-b8z: assembles a renderer-only directory
 * (`build/renderer`) that Tauri's `frontendDist` points at, so
 * `tauri-codegen` stops brotli-embedding ~410 MB of helper binaries, the
 * dead Electron main bundle and the SEA prep blob into `gamelib-shell`.
 * Fix (2) of
 * `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md`.
 *
 * WHY THE COPY IS DRIVEN BY ROLLUP'S EMITTED-FILE LIST, NOT A DIRECTORY GLOB:
 * a directory glob over `build/assets` would also pick up the ~19,540,372 B
 * of stale entries `emptyOutDir: false` accumulates there across builds
 * (`build/assets` currently holds 263 files; only 78 / 5,453,018 B are
 * actually reachable from the current `index.html`). Capturing
 * `Object.keys(bundle)` from `generateBundle` is exact -- it is precisely the
 * set rollup wrote for THIS build pass -- so the stale-asset drop falls out
 * for free, without a separate prune mechanism and without touching
 * `emptyOutDir`, whose MUST-stay-false rationale at `vite.config.ts:106-111`
 * still holds verbatim under this design: `build/` also holds `bin/`,
 * `locales/`, the SEA prep blob and the sidecar output, all written by other
 * build steps this plugin does not touch.
 *
 * WHY `manifest.json` AND `robots.txt` ARE EXCLUDED: vestigial CRA/PWA
 * scaffold. `index.html` has no `<link rel="manifest">`, there is no service
 * worker, and nothing in the renderer references either file (RESEARCH.md
 * §2, sweeps 4 and 7). They are dropped deliberately, not by oversight --
 * carrying them forward would be silently reintroducing dead weight into the
 * one directory this task exists to shrink.
 *
 * WHY THE ARRAY-POSITION DEPENDENCY ON `preserveRunnerSymlinksPlugin` IS A
 * NON-ISSUE: both this plugin and the symlink plugin run at
 * `closeBundle`/`enforce: 'post'`, so vite runs them in `plugins` array
 * order -- but the symlink plugin only ever touches `build/bin`, and nothing
 * under `bin/` is ever copied into `build/renderer` (no bundle key starts
 * with `bin/`, confirmed by the Task 1 probe: 79 captured keys, all either
 * `index.html` or `^assets/`). The two plugins cannot interact regardless of
 * which one runs first.
 *
 * WHY `locales/` AND `icon.png` ARE STRUCTURALLY DUPLICATED BY DESIGN: the
 * renderer reads them over `tauri://` from `frontendDist`
 * (`src/frontend/index.tsx`'s i18next `loadPath`, `public/manifest.json`'s
 * `icons[].src`), while the sidecar's i18next-fs-backend and
 * `paths.ts`'s `windowIcon` read the SAME two assets from
 * `Contents/Resources/build` via `bundle.resources` targets -- a completely
 * separate copy mechanism this task does not touch. Deduplicating either
 * copy would break backend-side translated strings or the window icon for
 * the other consumer. The resulting ~9.72 MiB of on-disk duplication is
 * accepted: `/build` is gitignored (`.gitignore:12`), and jest, prettier and
 * eslint all ignore it already.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync
} from 'node:fs'
import { dirname, join } from 'node:path'

import type { Plugin } from 'vite'

export const STATIC_RENDERER_FILES = ['icon.png']
export const STATIC_RENDERER_DIRS = ['locales']

function countFilesRecursive(dir: string): number {
  if (!existsSync(dir)) {
    return 0
  }
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      count += countFilesRecursive(full)
    } else if (entry.isFile()) {
      count += 1
    }
  }
  return count
}

function hasJsonFileRecursive(dir: string): boolean {
  if (!existsSync(dir)) {
    return false
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (hasJsonFileRecursive(full)) {
        return true
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      return true
    }
  }
  return false
}

/**
 * Pure function: assembles `rendererDir` from `outDir` given the bundle keys
 * rollup reported for this build pass. `rm -rf`s `rendererDir` first (a
 * stale prior tree must not survive), copies every bundle key byte-for-byte,
 * then the static files/dirs this bundle-key-driven copy can never see
 * (`icon.png` and `locales/` appear in no bundle key -- they are
 * `publicDir` passthrough, not rollup output), then runs every fail-loud
 * post-condition. Throws on the FIRST failure, naming the missing path --
 * this is what stands between a broken/partial assembly and a shipped white
 * screen (T-b8z-02).
 */
export function assembleRendererDist(
  outDir: string,
  rendererDir: string,
  bundleKeys: string[]
): void {
  if (bundleKeys.length === 0) {
    throw new Error(
      'assembleRendererDist: bundleKeys is empty -- generateBundle never ' +
        'fired (or fired with nothing captured). Refusing to assemble a ' +
        'renderer dir from the static set alone: an assembly that copied ' +
        'only icon.png/locales could look plausible and still ' +
        'ship a white screen.'
    )
  }

  rmSync(rendererDir, { recursive: true, force: true })
  mkdirSync(rendererDir, { recursive: true })

  for (const key of bundleKeys) {
    const src = join(outDir, key)
    if (!existsSync(src)) {
      throw new Error(
        `assembleRendererDist: bundle key '${key}' has no matching file at ${src}`
      )
    }
    const dest = join(rendererDir, key)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }

  for (const file of STATIC_RENDERER_FILES) {
    const src = join(outDir, file)
    if (!existsSync(src)) {
      throw new Error(
        `assembleRendererDist: required static file '${file}' is missing from ${outDir}`
      )
    }
    const dest = join(rendererDir, file)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
  }

  for (const dir of STATIC_RENDERER_DIRS) {
    const src = join(outDir, dir)
    if (!existsSync(src)) {
      throw new Error(
        `assembleRendererDist: required static directory '${dir}' is missing from ${outDir}`
      )
    }
    const dest = join(rendererDir, dir)
    cpSync(src, dest, { recursive: true })
  }

  // Fail-loud post-conditions. Each names the missing path so a red build
  // log is actionable, not just "something failed".
  if (!existsSync(join(rendererDir, 'index.html'))) {
    throw new Error(
      `assembleRendererDist: assembled tree at ${rendererDir} is missing index.html`
    )
  }

  if (countFilesRecursive(join(rendererDir, 'assets')) === 0) {
    throw new Error(
      `assembleRendererDist: assembled ${join(rendererDir, 'assets')} has zero files`
    )
  }

  for (const file of STATIC_RENDERER_FILES) {
    if (!existsSync(join(rendererDir, file))) {
      throw new Error(
        `assembleRendererDist: assembled tree at ${rendererDir} is missing static file '${file}'`
      )
    }
  }

  for (const dir of STATIC_RENDERER_DIRS) {
    const destDir = join(rendererDir, dir)
    // Deliberately checked as its own condition, not folded into the
    // existsSync above: a present-but-empty (or JSON-free) locales/ is the
    // exact `collectEntries`-returns-empty-Map shape this repo already owns
    // once (meta/pruneStaleHelperBinaries.ts:404-421) -- a post-condition
    // that only checks the directory exists would pass on it.
    if (!hasJsonFileRecursive(destDir)) {
      throw new Error(
        `assembleRendererDist: assembled ${destDir} is missing, or contains no *.json files`
      )
    }
  }
}

/**
 * `generateBundle`/`closeBundle` vite plugin factory. `generateBundle`
 * captures `Object.keys(bundle)` into plugin-instance-local state (a closure
 * variable, not module scope -- so multiple plugin instances in the same
 * process, e.g. across jest test cases, never contaminate each other);
 * `closeBundle` runs the pure function over that captured list.
 *
 * `enforce: 'post'` and registration as the LAST entry in `vite.config.ts`'s
 * `plugins` array (after `preserveRunnerSymlinksPlugin()`) matter for the
 * documented non-interaction above, not for correctness of this plugin in
 * isolation. Defaults are `__dirname`-relative
 * (`join(__dirname,'..','build')` / `join(__dirname,'..','build','renderer')`),
 * matching both `meta/preserveRunnerSymlinks.ts` and
 * `meta/pruneStaleHelperBinaries.ts` -- NOT derived from `config.build.outDir`,
 * so the plugin has no implicit dependency on vite's own config resolution
 * order.
 */
export function assembleRendererDistPlugin(options?: {
  outDir?: string
  rendererDir?: string
}): Plugin {
  const outDir = options?.outDir ?? join(__dirname, '..', 'build')
  const rendererDir =
    options?.rendererDir ?? join(__dirname, '..', 'build', 'renderer')

  let bundleKeys: string[] = []

  return {
    name: 'gamelib-assemble-renderer-dist',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      bundleKeys = Object.keys(bundle)
    },
    closeBundle() {
      assembleRendererDist(outDir, rendererDir, bundleKeys)
      console.log(
        `[assemble-renderer-dist] assembled ${bundleKeys.length} bundle key(s) + static files into ${rendererDir}`
      )
    }
  }
}
