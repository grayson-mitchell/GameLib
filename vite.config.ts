/**
 * Plain-Vite renderer build config (D-12, Phase 35 plan 03).
 *
 * Lifted from `electron.vite.config.ts`'s `renderer:` block. That file is NOT
 * deleted by this plan -- `pnpm start`, `pnpm test:e2e` and every `release:*` /
 * `dist:*` script still drive the Electron build through it until plan 35-14.
 * Two renderer build paths therefore coexist on purpose: `electron-vite`
 * (dying) and this one (the one that ships in the Tauri bundle).
 *
 * ---------------------------------------------------------------------------
 * WHAT `pnpm tauri:dev` CAN AND CANNOT PROVE (D-15)
 * ---------------------------------------------------------------------------
 * `pnpm tauri:dev` now serves this config's DEV SERVER over HTTP through
 * `tauri.conf.json`'s `build.devUrl`. The Rust shell's `devUrl` path and its
 * `frontendDist` path are structurally different code: a `devUrl` run fetches
 * every asset from `http://localhost:5173` and resolves NO bundled static
 * asset at all. So a `tauri:dev` pass is
 * not evidence about the packaged build. Use `pnpm tauri:dev:packaged` (`vite build` + `tauri build --debug`)
 * for anything touching `publicDir`, `resource_dir()` or `bundle.resources` --
 * that script goes through `frontendDist` exactly as a release bundle does.
 * `R-34.5-G1-PKG` is precisely a dev-passes/packaged-fails bug in that path.
 *
 * Before this plan `tauri:dev` prebuilt the renderer and ACCIDENTALLY
 * exercised `frontendDist`; the swap to `devUrl` buys HMR and removes the
 * stale-static-bundle failure class, but it also removes that accident, which
 * is why the build-then-serve script above exists as its deliberate
 * replacement rather than as an optional convenience.
 *
 * ---------------------------------------------------------------------------
 * IMPLICIT electron-vite DEFAULTS CARRIED FORWARD BY HAND (plan 35-03)
 * ---------------------------------------------------------------------------
 * `electron-vite` injects a `vite:electron-renderer-preset-config` plugin that
 * mutates the renderer config BEYOND what the `renderer:` block spells out.
 * Copying only the visible keys silently changes the emitted bundle, so these
 * are reproduced explicitly below -- each one measured against
 * `node_modules/electron-vite/dist/chunks/lib-D9_OPmIh.cjs:505-541`:
 *
 *   base                    `'./'` in production only. THE LOAD-BEARING ONE:
 *                           plain vite defaults to `'/'`, which would emit
 *                           `/assets/index-*.js` instead of the
 *                           `./assets/index-*.js` that has been shipping. A
 *                           404 on every bundled asset is exactly the
 *                           white-screen shape `R-34.5-G1-PKG` describes.
 *   build.modulePreload     `{ polyfill: false }` -- otherwise vite injects a
 *                           modulepreload polyfill the shipped bundle never
 *                           had.
 *   build.reportCompressedSize  `false` -- build-log only, no output effect.
 *   envPrefix               `['RENDERER_VITE_', 'VITE_']`. No source file uses
 *                           the `RENDERER_VITE_` prefix today (grepped); it is
 *                           carried so the lift is exact rather than
 *                           approximately exact.
 *
 * `meta/__tests__/viteRendererConfig.test.ts` pins every one of these.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import svgr from 'vite-plugin-svgr'
import path from 'path'

import type { Plugin } from 'vite'

import { assembleRendererDistPlugin } from './meta/assembleRendererDist'
import { preserveRunnerSymlinksPlugin } from './meta/preserveRunnerSymlinks'
import { pruneStaleHelperBinariesPlugin } from './meta/pruneStaleHelperBinaries'
import { pruneUnofferedLocalesPlugin } from './meta/pruneUnofferedLocales'

// Copied, not imported, from `electron.vite.config.ts` on purpose: plan 35-14
// deletes that file, and an import would take this config down with it.
const srcAliases = ['backend', 'frontend', 'common'].map((aliasName) => ({
  find: aliasName,
  replacement: path.join(__dirname, 'src', aliasName)
}))

// FIXME: Potentially publish this as a dedicated plugin, if other projects
//        run into the same issue
const vite_plugin_react_dev_tools: Plugin = {
  name: 'react-dev-tools-replace',
  transformIndexHtml: {
    handler: (html) =>
      html.replace(
        '<!-- REACT_DEVTOOLS_SCRIPT -->',
        '<script src="http://localhost:8097"></script>'
      )
  }
}

export default defineConfig(({ mode }) => ({
  root: '.',
  // See the header block: `'./'` under production is an electron-vite preset
  // default, not a vite default, and dropping it breaks packaged asset URLs.
  base: mode === 'production' ? './' : '/',
  envPrefix: ['RENDERER_VITE_', 'VITE_'],
  server: {
    // `tauri.conf.json`'s `build.devUrl` hardcodes `http://localhost:5173`, and
    // `src/backend/main.ts:321/329` already assumed that port for its
    // dev-origin allowance. `strictPort` makes a port collision fail LOUDLY:
    // without it vite silently moves to 5174 and the Tauri window would load
    // whatever else is squatting on 5173, or nothing at all.
    port: 5173,
    strictPort: true,
    // Quick task 260924-vat: root is '.', so without this chokidar walks
    // cargo's src-tauri/target (tens of thousands of files). On Windows,
    // fs.watch on an exe the linker holds open throws EBUSY, Vite does not
    // handle that FSWatcher error (ignorePermissionErrors does not cover
    // EBUSY), and beforeDevCommand dies mid cold build. Vite 6 APPENDS this
    // list to its own defaults (.git/node_modules/test-results/cacheDir), so
    // do not restate them here. Only target/ is ignored -- it is the only
    // cargo output under src-tauri -- do not widen this to src-tauri/**.
    //
    // Quick task 260925-re8: graphify-out/ is the second member of that same
    // defect class, on a path 260924-vat deliberately did not cover. Measured on
    // this config (vite 6.3.5, chokidar 3.6): the dev watcher held 3485 entries
    // across 8 dirs under graphify-out -- 340 MB of gitignored, regenerable graph
    // output that CLAUDE.md tells contributors to rewrite via `graphify update .`.
    // A rewrite of the 57 MB graph.json under an fs.watch is the same EBUSY that
    // killed the server for target/, and it is worse here: vite dies but the Tauri
    // window and sidecar stay alive, so the app looks healthy while HMR is gone.
    //
    // Each entry below is a MEASURED failure, named as a specific generated
    // directory. build/ and public/bin are watched too (169 dirs, and the same
    // written-while-serving shape) and are deliberately NOT here -- no crash has
    // been observed on them, and keeping this array observation-only is what makes
    // it auditable. See 260925-re8-GATE.md.
    watch: {
      ignored: ['**/src-tauri/target/**', '**/graphify-out/**']
    }
  },
  build: {
    rollupOptions: {
      input: path.resolve('index.html')
    },
    target: 'esnext',
    outDir: 'build',
    // MUST stay false. `build/` also holds `bin/`, `locales/`, the SEA prep
    // blob and the sidecar output, all written by other build steps.
    // Quick task 260901-a2w: this is also why build/bin can accumulate
    // stale entries across builds -- do NOT "fix" that by flipping this to
    // true. The fix is `pruneStaleHelperBinariesPlugin()` in the plugins
    // array below, a targeted mirror-prune, not a wholesale empty.
    emptyOutDir: false,
    minify: true,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    sourcemap: mode === 'development' ? 'inline' : false
  },
  resolve: { alias: srcAliases },
  plugins: [
    react(),
    svgr(),
    mode !== 'production' && vite_plugin_react_dev_tools,
    // Quick task 260901-a2w: `emptyOutDir` stays false above so vite's
    // publicDir copy only ever ADDS to build/bin -- nothing in this
    // pipeline ever deleted a stale entry, which is how build/bin ended up
    // shipping 182 files (46.64 MiB) of a superseded helper release that no
    // longer exists in public/bin. This plugin supplies the missing
    // subtraction as a MIRROR-PRUNE (delete only what's absent from
    // public/bin) rather than an `rm -rf build/bin` -- an unconditional
    // wipe is unsafe because `download-helper-binaries` decides what to
    // (re)download from a stored tag, not from what's on disk, so a wipe is
    // not undone by re-running it. Runs at `buildStart`, which fires at
    // rollup input resolution -- strictly before vite's publicDir copy and
    // therefore strictly before `preserveRunnerSymlinksPlugin`'s
    // `closeBundle` below. The two plugins share no hook, so this ordering
    // is a property of vite's build lifecycle, not of array position, and
    // cannot race the symlink restore. It also refuses to run at all -- and
    // deletes nothing -- when public/bin is not fully populated. See
    // meta/pruneStaleHelperBinaries.ts for the full guard.
    pruneStaleHelperBinariesPlugin(),
    // Quick task 260922-hjb: `public/locales` holds 49 directories while
    // `src/common/languages.ts`'s `supportedLanguages` offers only 43 --
    // `br`/`da`/`ka`/`sl`/`th`/`uz` are unreachable (no `languageDetector`
    // is registered in src/frontend/index.tsx, and i18next's
    // `supportedLngs` resolves an excluded code to `["en"]`) yet ship
    // TWICE: once via `src-tauri/tauri.conf.json`'s wholesale
    // `../build/locales/` resource mapping, and again via
    // `build/renderer/locales` under `frontendDist`. This prunes the BUILD
    // OUTPUT only -- `public/locales` is deliberately left untouched, so
    // `pnpm i18n-churn-guard` (which reads `git diff --name-only --
    // public/locales`, unstaged only) stays out of this task's blast
    // radius. Runs at `closeBundle`, NOT at `buildStart` like its
    // `pruneStaleHelperBinariesPlugin` neighbour above: vite's publicDir
    // copy happens strictly after `buildStart` and would immediately
    // re-add the six directories this build pass itself just copied in.
    // Must stay on the normal enforce tier, ahead of
    // `assembleRendererDistPlugin` below (`enforce: 'post'`) -- that
    // plugin `rm -rf`s `build/renderer` and re-copies `build/locales` into
    // it, which is exactly why pruning `build/locales` first fixes BOTH
    // shipped trees with a single delete. See
    // meta/__tests__/viteRendererConfig.test.ts, which pins this ordering
    // by hook identity, enforce tier and array position -- not by array
    // position alone -- so a future re-order turns that test red instead
    // of silently landing a half-fix. See meta/pruneUnofferedLocales.ts
    // for the full guard and lifecycle rationale.
    pruneUnofferedLocalesPlugin(),
    // F-34.9-01: vite's copyDir (publicDir -> outDir) dereferences
    // symlinks -- every Python.framework symlink inside the onedir
    // runners becomes a real file/directory in build/, which codesign
    // then rejects ("bundle format is ambiguous"). This restores every
    // source symlink after the copy runs. Unconditional -- a no-op
    // wherever the source tree has no symlinks (Linux/Windows checkouts).
    // Carried across from `electron.vite.config.ts` by Phase 35 plan 03; it
    // is not a formality and must not be dropped from this config.
    preserveRunnerSymlinksPlugin(),
    // Quick task 260901-b8z: assembles build/renderer -- the directory
    // tauri.conf.json's frontendDist now points at -- from rollup's own
    // emitted-file list plus the static publicDir passthrough
    // (icon.png/locales/) that never appears in a bundle key.
    // MUST stay LAST: it reads Object.keys(bundle) at generateBundle and
    // assembles at closeBundle, after every other plugin (in particular
    // preserveRunnerSymlinksPlugin, whose build/bin work this plugin never
    // touches -- see meta/assembleRendererDist.ts's header for why the two
    // cannot interact regardless of order). See meta/assembleRendererDist.ts
    // for the full design rationale.
    assembleRendererDistPlugin()
  ]
}))
