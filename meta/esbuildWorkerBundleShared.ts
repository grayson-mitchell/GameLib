/**
 * Debug/dev-mode-decompress-worker-electron-hook: pure, side-effect-free
 * helpers shared between `meta/buildSidecarSea.ts` (the packaged SEA worker
 * bundle) and `meta/buildDecompressWorkerDev.ts` (the dev/Electron worker
 * bundle) -- both need the IDENTICAL `--alias:electron` esbuild fix
 * (quick-260817-pkx originally, this debug session extends it to dev mode),
 * so the flags/entry-path/spawn helper are single-sourced here instead of
 * duplicated, to prevent the two bundles from silently drifting apart.
 *
 * Deliberately factored OUT of `buildSidecarSea.ts` rather than imported
 * from it directly: that file has an unconditional `if
 * (!process.env.JEST_WORKER_ID) { main().catch(...) }` at module scope,
 * which runs the FULL SEA build pipeline (codesign, postject injection, Node
 * binary download/copy) as a side effect of merely IMPORTING it -- discovered
 * empirically when `buildDecompressWorkerDev.ts` first imported from
 * `buildSidecarSea.ts` directly and `pnpm build:decompress-worker-dev`
 * silently also produced a full `src-tauri/binaries/gamelib-sidecar-*`
 * binary on every invocation. This module has no such guard because it has
 * no `main()`/CLI entry point at all -- it is pure exports, safe to import
 * from anywhere.
 */

import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** `decompressWorker.ts`'s source entry -- both the SEA and dev worker
 *  bundles compile this exact file. */
export const DECOMPRESS_WORKER_ENTRY_PATH = join(
  'src',
  'backend',
  'storeManagers',
  'steam',
  'depot',
  'decompressWorker.ts'
)

/**
 * Phase 23.1 plan 05 (coordinator-directed fix, live-hardware finding
 * 2026-08-18): a real packaged SEA install reproduced spike 023's own
 * predicted failure mode verbatim -- `lzmaNativeBinding.ts`'s dev-branch
 * path resolution used its `dir` argument (`lzma-native`'s own
 * `require('node-gyp-build')(__dirname)` call, rewritten by
 * `--alias:node-gyp-build` to `resolveNativeBinding(dir)`), but once esbuild
 * BUNDLES `lzma-native`'s `index.js` together with the shim into one output
 * file, `__dirname` inside both collapses to the single bundled file's own
 * location -- `"."` for an eval'd SEA worker (no backing file at all), or
 * the dev worker bundle's own output directory (`build/main`) for the dev
 * build. Neither value is `lzma-native`'s real package root, and -- the
 * important part -- NEITHER is distinguishable at runtime from a
 * hypothetical OTHER bundled package's own collapsed `__dirname`: once
 * bundled, every caller reaching this alias passes the exact same
 * (meaningless) `dir` value, so no runtime inspection of `dir` can ever
 * recover caller identity again. This is a structural consequence of
 * `--alias` being global to the whole bundle, not a bug in the previous
 * `dirBelongsToLzmaNative()` check itself -- see
 * `lzmaNativeBinding.ts`'s own file header for the full genealogy.
 *
 * Fix, reusing spike 023's own proven mechanism (`build-sea.mjs`'s
 * `writeResolvedPaths()` / `resolved-paths.generated.cjs`) rather than
 * reinventing it: resolve `lzma-native`'s real on-disk package root at BUILD
 * TIME, in THIS script's own unbundled context (where normal Node module
 * resolution against the real `node_modules` still works correctly), and
 * bake it into a small generated CJS data file with no `__dirname`
 * dependency of its own -- `lzmaNativeBinding.ts`'s dev branch `require()`s
 * it via a plain relative specifier, which esbuild resolves by reading the
 * file's actual on-disk content and inlining it as a literal object AT
 * BUILD TIME, immune to the collapse above because it never touches
 * `__dirname` at all.
 *
 * The SECURITY property `dirBelongsToLzmaNative()` existed to protect
 * (T-23.1-03-02: some OTHER bundled package's own `node-gyp-build` call
 * must not silently receive lzma-native's native binding) is NOT dropped --
 * it is RELOCATED to build time, where it can actually be evaluated
 * reliably: `assertNodeGypBuildSingleConsumer()` below scans the real,
 * unbundled dependency tree (not the collapsed runtime `dir` value) for any
 * OTHER package declaring a dependency on `node-gyp-build`, and fails the
 * build loudly if one is found. This is strictly MORE reliable than the
 * runtime check it replaces, which (as this finding demonstrates) could
 * never actually distinguish callers once genuinely bundled in the first
 * place.
 */
export const LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH = join(
  'src',
  'backend',
  'storeManagers',
  'steam',
  'depot',
  'lzmaNativeResolvedPaths.generated.cjs'
)

/**
 * Pure resolution -- `lzma-native`'s real on-disk package root, via this
 * (unbundled) script's own normal Node module resolution. Exported
 * separately from {@link writeLzmaNativeResolvedPaths} so a test can assert
 * the resolved value without touching the filesystem.
 */
export function resolveLzmaNativePkgRoot(): string {
  try {
    return dirname(require.resolve('lzma-native/package.json'))
  } catch (error) {
    throw new Error(
      `COMPILE GATE FAILED: cannot resolve lzma-native/package.json -- ` +
        `is the dependency installed? (${(error as Error).message})`
    )
  }
}

/**
 * Writes the generated data module `lzmaNativeBinding.ts`'s dev branch
 * `require()`s -- see this file's own header comment above for the full
 * rationale. Must run BEFORE either esbuild worker-bundle invocation (both
 * `bundleWorkerForSea()` and `bundleWorkerForDev()` call this): esbuild
 * resolves a relative `require()` by reading the target file's real
 * on-disk content at BUILD TIME, so the generated file must already exist
 * when esbuild runs, exactly mirroring spike 023's own
 * `writeResolvedPaths()`-then-`bundleWorker()` ordering.
 */
export function writeLzmaNativeResolvedPaths(): string {
  const pkgRoot = resolveLzmaNativePkgRoot()
  const content =
    `// GENERATED by meta/esbuildWorkerBundleShared.ts's ` +
    `writeLzmaNativeResolvedPaths() -- do not edit by hand, do not commit.\n` +
    `module.exports = ${JSON.stringify({ LZMA_NATIVE_PKG_ROOT: pkgRoot }, null, 2)}\n`
  writeFileSync(LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH, content)
  return pkgRoot
}

/**
 * The real security check T-23.1-03-02 needs, relocated to build time (see
 * this file's header comment for why the runtime `dir`-based version could
 * never work once genuinely bundled). Scans every top-level package under
 * `node_modules` for a `dependencies`/`devDependencies`/`peerDependencies`
 * entry named `node-gyp-build`, EXCLUDING `lzma-native` itself (the one
 * legitimate consumer this alias exists for) and `node-gyp-build` itself
 * (whose own `package.json` unsurprisingly mentions its own name, not a
 * real self-dependency). Returns the list of offending package names --
 * empty means safe. Scoped packages (`@scope/name`) are walked one level
 * deeper. Deliberately reads `package.json` DECLARATIONS rather than
 * grepping source for `require('node-gyp-build')` call sites: an installed
 * package that depends on `node-gyp-build` is the reliable, low-maintenance
 * signal this project's own `NATIVE_LZMA_REQUIRED_TRIPLES`-style build
 * checks already use elsewhere, and -- unlike a post-bundle string scan --
 * cannot be defeated by the exact same aliasing/bundling collapse this
 * whole fix exists to route around.
 */
export function findOtherNodeGypBuildConsumers(
  nodeModulesDir: string = 'node_modules'
): string[] {
  const offenders: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(nodeModulesDir)
  } catch {
    return offenders
  }

  const candidatePkgDirs: string[] = []
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    if (entry.startsWith('@')) {
      let scopedEntries: string[]
      try {
        scopedEntries = readdirSync(join(nodeModulesDir, entry))
      } catch {
        continue
      }
      for (const scopedEntry of scopedEntries) {
        candidatePkgDirs.push(join(entry, scopedEntry))
      }
    } else {
      candidatePkgDirs.push(entry)
    }
  }

  interface PartialPkgJson {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  for (const pkgDir of candidatePkgDirs) {
    if (pkgDir === 'lzma-native' || pkgDir === 'node-gyp-build') continue
    const pkgJsonPath = join(nodeModulesDir, pkgDir, 'package.json')
    let pkgJson: PartialPkgJson
    try {
      pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as PartialPkgJson
    } catch {
      continue
    }
    const declaresIt =
      Boolean(pkgJson.dependencies?.['node-gyp-build']) ||
      Boolean(pkgJson.devDependencies?.['node-gyp-build']) ||
      Boolean(pkgJson.peerDependencies?.['node-gyp-build'])
    if (declaresIt) offenders.push(pkgDir)
  }

  return offenders
}

/**
 * COMPILE-GATE wrapper around {@link findOtherNodeGypBuildConsumers} -- call
 * this before either worker esbuild invocation, alongside
 * {@link writeLzmaNativeResolvedPaths}. Throwing here, loudly, at build
 * time is the actual T-23.1-03-02 mitigation now (see this file's header).
 */
export function assertNodeGypBuildSingleConsumer(
  nodeModulesDir: string = 'node_modules'
): void {
  const offenders = findOtherNodeGypBuildConsumers(nodeModulesDir)
  if (offenders.length > 0) {
    throw new Error(
      `COMPILE GATE FAILED (T-23.1-03-02): --alias:node-gyp-build is global ` +
        `to the whole worker bundle, and this build's own dependency tree now ` +
        `has ${offenders.length} OTHER package(s) also declaring a ` +
        `node-gyp-build dependency: ${offenders.join(', ')}. Aliasing it to ` +
        `lzmaNativeBinding.ts is only safe while lzma-native is the sole ` +
        `consumer -- bundling one of these would silently hand it ` +
        `lzma-native's native binding (or vice versa). Re-scope this alias, ` +
        `or lzmaNativeBinding.ts's own identity handling, before proceeding.`
    )
  }
}

/**
 * CR-02/GAP-2 fix (originally `buildSidecarSea.ts`): resolves esbuild's own
 * installed binary path directly rather than relying on `.bin` shims, which
 * pnpm materializes differently per OS (a POSIX shell shim plus `.CMD`/
 * `.ps1` siblings on Windows -- no extensionless native executable to spawn
 * directly there).
 */
export function resolveEsbuildCli(): string {
  try {
    return require.resolve('esbuild/bin/esbuild')
  } catch (error) {
    throw new Error(
      `COMPILE GATE FAILED (D-06/CR-02): cannot resolve esbuild/bin/esbuild -- ` +
        `is the dependency installed? (${(error as Error).message})`
    )
  }
}

/**
 * The ten esbuild flags proven correct for a fully self-contained,
 * electron-stub-aliased worker bundle (originally `buildSidecarSea.ts`'s
 * `seaEsbuildFlags()`, written for the SEA path, fixed by quick task
 * 260817-pkx; extended to ten by Phase 23.1 Plan 03). `--alias:electron`
 * statically replaces `require('electron')`/`import ... from 'electron'`
 * (first-party AND inside bundled third-party code) with this project's own
 * `backend/sidecar/electronStub.ts` at BUILD TIME -- so there is no
 * unresolved runtime `require('electron')` left in the output for ANY
 * bundler's chunk-splitting/hoisting order to race against. The
 * `i18next-fs-backend` alias and `sidecarSeaFsShim` inject exist for
 * unrelated esbuild/cjs-bundling pitfalls this worker's import chain can
 * also reach (see the original SEA fix's commit history) -- kept identical
 * across both bundles rather than hand-trimmed per consumer, so neither can
 * regress independently.
 *
 * Phase 23.1 Plan 03: `--alias:node-gyp-build` is the SAME mechanism class
 * as `--alias:electron` above -- a build-time specifier rewrite, NOT the
 * `pnpm.patchedDependencies` computed-require rewrite RESEARCH.md Pitfall 4
 * rules out for a native addon. `lzma-native` resolves its native binding
 * through `require('node-gyp-build')(__dirname)`, a runtime-computed
 * `prebuilds/${platform}-${arch}/*.node` path that esbuild can neither
 * statically resolve nor bundle (a `.node` binary is not JS). The specifier
 * is therefore statically replaced at BUILD TIME with this project's own
 * SEA-aware shim
 * (`src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts`), which
 * resolves the binding via `sea.getRawAsset()` + `process.dlopen()` inside a
 * packaged SEA sidecar, or a direct `process.dlopen()` from
 * `node_modules/lzma-native/prebuilds/` everywhere else. This alias is
 * deliberately in THIS shared flag set (not hand-added per consumer) so the
 * SEA main bundle, the SEA worker bundle, and the dev worker bundle all get
 * it identically -- a per-consumer alias would let the three drift apart,
 * the exact failure mode this module was extracted to prevent in the first
 * place. `assertNodeGypBuildSingleConsumer()` above is the backstop for the
 * alias being global to each bundle -- a BUILD-TIME check now (Phase 23.1
 * plan 05), not a runtime one: `lzmaNativeBinding.ts`'s own `dir`-based
 * runtime identity guard turned out to be structurally incapable of
 * distinguishing callers once genuinely bundled (see this file's own
 * `LZMA_NATIVE_RESOLVED_PATHS_MODULE_PATH` doc comment above for the full
 * finding).
 */
export function seaEsbuildFlags(outfile: string, entry: string): string[] {
  return [
    '--bundle',
    '--platform=node',
    '--target=node22',
    '--format=cjs',
    '--alias:electron=./src/backend/sidecar/electronStub.ts',
    '--alias:i18next-fs-backend=i18next-fs-backend/cjs',
    '--alias:node-gyp-build=./src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts',
    '--inject:./meta/sidecarSeaFsShim.ts',
    `--outfile=${outfile}`,
    entry
  ]
}

/** Argv-form (never a shell string, T-24-06 convention) child_process spawn,
 *  capturing stdout/stderr for compile-gate error reporting. */
export function spawnArgv(
  command: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
