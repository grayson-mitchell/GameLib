---
phase: quick-260923-tip
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/releaseTags.ts
  - meta/downloadHelperBinaries.ts
  - meta/pruneStaleHelperBinaries.ts
  - meta/preserveRunnerSymlinks.ts
  - meta/assembleRendererDist.ts
  - meta/__tests__/runnerTargetPlatform.test.ts
  - meta/__tests__/downloadHelperBinaries.test.ts
  - meta/__tests__/pruneStaleHelperBinaries.test.ts
  - meta/__tests__/preserveRunnerSymlinks.test.ts
  - meta/__tests__/assembleRendererDist.test.ts
  - .planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md
autonomous: true
requirements: [TODO-260922-WINSYMLINK]

must_haves:
  truths:
    - "On a win32 host, `pnpm download-helper-binaries` never fetches or extracts a darwin onedir archive, so no Python.framework symlink is ever created on Windows."
    - "On a win32 host with no darwin trees in public/bin, pruneStaleHelperBinaries' population guard passes on a correctly-populated win32 tree and still FAILS LOUD on a missing/partial win32 tree."
    - "On a darwin host, darwin onedir download, the __darwin_layout marker and the darwin half of the population guard all behave exactly as they do today."
    - "restoreSymlinks recreates a link whose SOURCE-side target resolves to a directory with the 'dir' link type, and a file-targeted link with 'file'."
    - "When an earlier vite/rollup build error occurred, preserve-runner-symlinks' and assemble-renderer-dist' closeBundle hooks rethrow THAT error instead of raising their own, so `vite build` prints the first cause."
  artifacts:
    - path: "meta/releaseTags.ts"
      provides: "resolveRunnerTargetPlatform() -- the single host-vs-target platform resolver shared by the downloader and the prune guard"
      contains: "resolveRunnerTargetPlatform"
    - path: "meta/__tests__/runnerTargetPlatform.test.ts"
      provides: "Unit coverage for the host/target scoping decision (pure, no Windows host needed)"
    - path: "meta/preserveRunnerSymlinks.ts"
      provides: "symlinkTypeFor() + typed symlinkSync call"
      contains: "symlinkTypeFor"
  key_links:
    - from: "meta/downloadHelperBinaries.ts"
      to: "meta/releaseTags.ts"
      via: "resolveRunnerTargetPlatform import"
      pattern: "resolveRunnerTargetPlatform"
    - from: "meta/pruneStaleHelperBinaries.ts"
      to: "meta/releaseTags.ts"
      via: "resolveRunnerTargetPlatform import (NOT via downloadHelperBinaries -- that import would start a real network download mid-build)"
      pattern: "from './releaseTags'"
    - from: "meta/preserveRunnerSymlinks.ts"
      to: "node:fs symlinkSync"
      via: "third type argument"
      pattern: "symlinkSync\\(record\\.target, destPath, "
---

<objective>
Fix the three stacked defects that make `pnpm exec vite build` fail on Windows
(`.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`),
implementing that todo's **Best** direction plus its two defense-in-depth items.

Purpose: a Windows packaged build currently has to copy macOS `Python.framework`
symlink trees it will never ship (`src-tauri/tauri.windows.conf.json` maps only
`build/bin/{x64,arm64}/win32`). Every layer of that path fails, and vite prints
the LAST error rather than the first, so each failure is misdiagnosed.

Output: darwin onedir runners are scoped out of non-darwin builds entirely
(Layer 1), symlinks that survive are recreated with the correct Windows link
type (Layer 2), and an earlier build error is no longer masked by a
`closeBundle` guard (Layer 3). All three decisions are unit-tested without a
Windows host where the logic is pure.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md
@meta/releaseTags.ts
@meta/downloadHelperBinaries.ts
@meta/pruneStaleHelperBinaries.ts
@meta/preserveRunnerSymlinks.ts
@meta/assembleRendererDist.ts
@vite.config.ts

<interfaces>
<!-- Contracts the executor needs. Do not go hunting for these. -->

meta/releaseTags.ts (existing exports):
  export type SupportedPlatform = 'win32' | 'darwin' | 'linux'
  export type DownloadedBinary = 'legendary' | 'gogdl' | 'nile' | 'comet' | 'epic-integration'
  export const RELEASE_TAGS: Record<DownloadedBinary, string>

meta/downloadHelperBinaries.ts (existing exports, all consumed by its test file):
  export function listTarEntries(archivePath: string): Promise<string[]>
  export function toTarPathOperand(p: string, separator?: string): string
  export function extractTarGz(archivePath: string, destDir: string): Promise<void>
  export function downloadOnedirAsset(binaryName: string, arch: string): Promise<void>
  export function computeLayoutMarker(layout: string, digests: Record<string,string>): string
  export function darwinLayoutMarker(): string
  export function compareDownloadedTags(): Promise<DownloadedBinary[]>
  export function storeDownloadedTags(): Promise<void>
  // module-scope main() is suppressed under jest by `if (!process.env.JEST_WORKER_ID)`

meta/pruneStaleHelperBinaries.ts (existing exports):
  export type EntryKind = 'file' | 'dir' | 'symlink'
  export function collectEntries(root: string): Map<string, EntryKind>
  export function computePruneSet(buildBinDir: string, publicBinDir: string): string[]
  export interface PublicBinAssessment { ok: boolean; reasons: string[] }
  export function assessPublicBin(publicBinDir: string): PublicBinAssessment
  export function computeDarwinLayoutMarker(): string
  export interface PruneResult { pruned: string[]; bytesFreed: number; guardEvaluated: boolean }
  export function pruneStaleHelperBinaries(buildBinDir: string, publicBinDir: string): PruneResult
  export function pruneStaleHelperBinariesPlugin(options?: { buildBinDir?: string; publicBinDir?: string }): Plugin

meta/preserveRunnerSymlinks.ts (existing exports):
  export interface SymlinkRecord { relPath: string; target: string }
  export function collectSymlinks(rootDir: string): SymlinkRecord[]
  export function resolveDestPath(destDir: string, relPath: string): string
  export function isContainedSymlinkTarget(destDir: string, relPath: string, target: string): boolean
  export function restoreSymlinks(sourceDir: string, destDir: string): { restored; skipped; rejected }
  export function preserveRunnerSymlinksPlugin(options?: { sourceDir?: string; destDir?: string }): Plugin

meta/assembleRendererDist.ts (existing exports):
  export const STATIC_RENDERER_FILES: string[]
  export const STATIC_RENDERER_DIRS: string[]
  export function assembleRendererDist(outDir: string, rendererDir: string, bundleKeys: string[]): void
  export function assembleRendererDistPlugin(options?: { outDir?: string; rendererDir?: string }): Plugin

Repo precedent for host-vs-target (copy this idiom, meta/buildSidecarSea.ts:526):
  export function resolveTriple(env: NodeJS.ProcessEnv = process.env): string {
    const override = env.GAMELIB_SIDECAR_TARGET_TRIPLE
    if (typeof override === 'string' && override.length > 0) return override
    return hostTriple()
  }

Actual public/bin contents produced by `pnpm download-helper-binaries` (measured
2026-09-23; `vulkan-helper` is NOT produced by this script and must not be in
any expected table):
  x64/win32/   legendary.exe gogdl.exe nile.exe comet.exe GalaxyCommunication.exe EpicGamesLauncher.exe
  arm64/win32/ legendary.exe gogdl.exe comet.exe
  x64/linux/   legendary gogdl nile comet   (+ vulkan-helper, other source)
  arm64/linux/ legendary gogdl nile comet   (+ vulkan-helper, other source)
  arm64/darwin/ comet (flat file) + legendary/ gogdl/ nile/ (onedir trees)

Jest: root jest.config.js declares projects; meta/jest.config.js sets
`displayName: 'Meta'`. Run one suite with:
  npx jest --selectProjects Meta "meta/__tests__/<file>.test.ts"
(verified working on this Windows box, forward slashes).

Typecheck: `pnpm codecheck` == `tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Scope the darwin onedir runners to darwin builds, and narrow the prune guard without weakening it</name>
  <files>meta/releaseTags.ts, meta/downloadHelperBinaries.ts, meta/pruneStaleHelperBinaries.ts, meta/__tests__/runnerTargetPlatform.test.ts, meta/__tests__/downloadHelperBinaries.test.ts, meta/__tests__/pruneStaleHelperBinaries.test.ts</files>
  <behavior>
    runnerTargetPlatform.test.ts (new):
    - `resolveRunnerTargetPlatform({}, 'win32')` returns `'win32'`; `'darwin'` host returns `'darwin'`; `'linux'` host returns `'linux'`.
    - `resolveRunnerTargetPlatform({ GAMELIB_RUNNER_TARGET_PLATFORM: 'darwin' }, 'win32')` returns `'darwin'` (explicit target beats host).
    - Empty string override (`''`, how GitHub Actions renders an unset matrix field) falls back to the host — pinned as its own case, mirroring `resolveTriple`'s documented rule.
    - An override that is not a `SupportedPlatform` (e.g. `'freebsd'`) THROWS naming the variable and the accepted values — never silently falls back, which would turn a typo'd CI matrix field into a silently wrong bundle.
    - Default-argument case: called with no arguments it reads `process.env` / `process.platform` (assert it returns one of the three literals; do not assert a specific one, the suite runs on all three OSes).

    downloadHelperBinaries.test.ts (extend):
    - With target `'win32'`: `compareDownloadedTags()` does NOT add legendary/gogdl/nile purely because the stored `__darwin_layout` marker is absent/stale (the layout branch is darwin-only now).
    - With target `'darwin'`: the existing layout-branch behaviour is unchanged (keep every existing assertion green — this is the no-regression pin).
    - With target `'win32'`: `storeDownloadedTags()` writes every RELEASE_TAGS key and does NOT write a `__darwin_layout` key (a marker written on a host that skipped the darwin download would be a false claim).
    - With target `'darwin'`: `storeDownloadedTags()` still writes `__darwin_layout`.
    - With target `'win32'`: the three `downloadOnedirAsset` call sites are not reached — assert via the mocked `fetch`/`spawn` surface that no `*-onedir-*` archive URL is fetched and `tar` is never spawned.

    pruneStaleHelperBinaries.test.ts (extend):
    - `assessPublicBin(dir, 'win32')` returns `ok: true` for a tree holding `.release_tags` (tags matching, no `__darwin_layout`) plus the full win32 flat-binary set, and with NO `arm64/darwin` tree present at all.
    - FAILING DIRECTION (the guard must still be meaningful): `assessPublicBin(dir, 'win32')` returns `ok: false` with a reason naming the path when (a) a single win32 `.exe` is missing, (b) a win32 `.exe` is present but zero bytes, and (c) `.release_tags` carries a stale tag. Assert on `reasons`, not just on `ok`.
    - `assessPublicBin(dir, 'darwin')` keeps every existing darwin assertion (onedir file-count floor, exec bit, `__darwin_layout` marker) — existing tests must pass unchanged when the new parameter defaults to `'darwin'` in those cases.
    - `pruneStaleHelperBinaries(buildBin, publicBin, 'win32')` still THROWS (deleting nothing) when the win32 assessment fails and the prune set is non-empty.
  </behavior>
  <action>
    Implement the todo's **Best** direction: darwin onedir runners are never downloaded into, nor demanded by, a non-darwin build.

    1. `meta/releaseTags.ts` — add the shared resolver. This file is the existing
       "single source of truth for the platform/binary vocabulary" and is already
       imported by BOTH consumers, which is why it lives here:
       `meta/pruneStaleHelperBinaries.ts` must NOT import
       `meta/downloadHelperBinaries.ts` (that module's `main()` runs at import
       scope outside jest and would start a real network download mid-`vite build`
       — the warning is already written at the top of pruneStaleHelperBinaries.ts;
       keep it true).

       ```
       export function resolveRunnerTargetPlatform(
         env: NodeJS.ProcessEnv = process.env,
         hostPlatform: NodeJS.Platform = process.platform
       ): SupportedPlatform
       ```

       Keying decision, and write it into the docblock: this repo has NO existing
       target-platform signal for the runner download. The one host-vs-target
       precedent is `GAMELIB_SIDECAR_TARGET_TRIPLE` (`meta/buildSidecarSea.ts:526`),
       which covers the SEA sidecar only and says nothing about which runner
       binaries to vendor. So this keys off the HOST (`process.platform`) by
       default, with a new optional `GAMELIB_RUNNER_TARGET_PLATFORM` override in
       the same shape as `resolveTriple` for a future cross-platform leg. Host
       keying is correct for CI today: `.github/actions/install-deps/action.yml`
       runs `pnpm download-helper-binaries` on each matrix leg's own runner OS,
       so host == target on every leg of `release-tauri.yml`. Treat `''` as unset
       (GitHub renders an unset matrix field as the empty string). THROW on an
       unrecognised override value naming the variable and the three accepted
       values — do not silently fall back.

    2. `meta/downloadHelperBinaries.ts` — scope the darwin onedir work.
       - Resolve the target platform ONCE in `main()` and thread it (or read it
         via the resolver inside the affected functions; either is fine, but do
         not read `process.platform` directly at more than one site).
       - `downloadLegendary()` / `downloadGogdl()` / `downloadNile()`: skip their
         `downloadOnedirAsset(..., 'arm64')` call when the target is not
         `'darwin'`. Log one line per skip naming the runner and the reason so
         the build log is not silently shorter.
       - `compareDownloadedTags()`: gate the `__darwin_layout` re-download branch
         (the `DARWIN_LAYOUT_RUNNERS` loop) on target === `'darwin'`.
       - `storeDownloadedTags()`: only include the `__darwin_layout` key when
         target === `'darwin'`.
       - DELIBERATELY OUT OF SCOPE, and say so in a comment: the flat
         single-file assets that `downloadGithubAssets()` fetches for every
         platform (including `comet-aarch64-apple-darwin`) are left downloading
         on every host. They carry zero symlinks — they are not part of this
         defect — and `.release_tags` is keyed per RUNNER, not per platform, so
         narrowing that path would make a tree downloaded on one host report
         "up to date" while another platform's binaries were missing. Only the
         SYMLINK-BEARING darwin onedir archives are scoped here.

    3. `meta/pruneStaleHelperBinaries.ts` — narrow the population guard to the
       in-scope platform, keeping it fail-loud (this is the half that must not
       become a no-op).
       - `assessPublicBin(publicBinDir, targetPlatform: SupportedPlatform = resolveRunnerTargetPlatform())`.
       - P1 (`.release_tags` exists, parses, every RELEASE_TAGS key matches) stays
         unconditional. The `__darwin_layout` marker check becomes darwin-only,
         matching `storeDownloadedTags`' new behaviour above.
       - P2 (the onedir exec-bit + `RUNNER_FILE_COUNT_FLOOR` checks over
         `arm64/darwin/{legendary,gogdl,nile}`) becomes darwin-only.
       - NEW P3, which is what keeps the guard meaningful rather than
         tags-only on win32/linux: an explicit per-platform table of the flat
         binaries `download-helper-binaries` produces (use the measured table in
         `<interfaces>` above verbatim — `vulkan-helper` is NOT produced by this
         script and must not appear). Each listed path must be a regular file of
         NON-ZERO size, and on `linux`/`darwin` must additionally carry an exec
         bit. Skip the exec-bit half on `win32`: `.exe` files carry no meaningful
         mode there, and asserting one would make the guard fail on every Windows
         checkout — a guard that is always red teaches people to ignore it.
       - `pruneStaleHelperBinaries(buildBinDir, publicBinDir, targetPlatform?)`
         and `pruneStaleHelperBinariesPlugin({ ..., targetPlatform? })` thread the
         parameter through. The guard is still evaluated only on a non-empty
         prune set, and still throws BEFORE any `rmSync` — do not move that.
       - Update the module docblock: the guard now asserts the population of the
         platform this build will actually ship, and the reason set names the
         exact missing/empty path, so an under-populated win32 tree still refuses
         to prune.

    4. Append a dated resolution note to
       `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`
       recording that Layer 1 is closed by scoping (not by fixing tar's symlink
       emulation), and that Layers 2 and 3 are Tasks 2 and 3 of this plan. Do NOT
       move the file to `completed/` yet and do NOT touch its frontmatter — the
       `ready:`/`severity:`/`platform:` keys are CI-enforced and already correct.

    DO NOT delete or regenerate anything under `public/bin`. The operator
    hand-repaired the darwin links there; that tree is gitignored and out of
    this plan's blast radius. Scoping changes what FUTURE downloads fetch, not
    what is already on disk.
  </action>
  <verify>
    <!-- `.planning` is in .prettierignore, so the todo file is deliberately NOT
         listed here — checking it would exit 0 over zero matched files, which is
         a vacuous gate. Only real source paths are listed. -->
    <automated>npx prettier --check meta/releaseTags.ts meta/downloadHelperBinaries.ts meta/pruneStaleHelperBinaries.ts meta/__tests__/runnerTargetPlatform.test.ts meta/__tests__/downloadHelperBinaries.test.ts meta/__tests__/pruneStaleHelperBinaries.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx jest --selectProjects Meta "meta/__tests__/runnerTargetPlatform.test.ts" "meta/__tests__/downloadHelperBinaries.test.ts" "meta/__tests__/pruneStaleHelperBinaries.test.ts"</automated>
    <automated>npx jest --selectProjects Meta</automated>
  </verify>
  <done>
    `resolveRunnerTargetPlatform` exists in `meta/releaseTags.ts` and is imported
    by both consumers (and by neither via `downloadHelperBinaries.ts`). On a
    non-darwin target no onedir archive is fetched, no `__darwin_layout` marker
    is written or demanded, and `assessPublicBin` still returns `ok: false` with
    a path-naming reason for a missing or zero-byte in-scope binary. Every
    pre-existing Meta test still passes unchanged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Recreate symlinks with the correct Windows link type, computed against the SOURCE tree</name>
  <files>meta/preserveRunnerSymlinks.ts, meta/__tests__/preserveRunnerSymlinks.test.ts</files>
  <behavior>
    - `symlinkTypeFor(sourceDir, record)` returns `'dir'` when the record's target,
      resolved from the LINK'S OWN directory inside `sourceDir`, resolves to a
      directory (e.g. `Python.framework/Versions/Current -> 3.12`).
    - It returns `'file'` when the target resolves to a regular file
      (e.g. `Python.framework/Python -> Versions/Current/Python`).
    - It returns `'file'` when the target does not resolve at all in the source
      tree (dangling source link) — a fallback, asserted explicitly rather than
      left to chance.
    - It resolves through a CHAIN: a link whose target is itself a
      directory-symlink still yields `'dir'` (this is the real
      `Resources -> Versions/Current/Resources` shape, where `Current` is itself
      a link). Build this fixture explicitly.
    - It is computed against `sourceDir`, NOT `destDir`: a fixture where the
      destination holds the WRONG kind at that path (vite's dereferenced copy
      left a real file where a directory link belongs) still yields `'dir'`.
    - `restoreSymlinks` passes that type through: on POSIX assert via
      `lstatSync(dest).isSymbolicLink()` plus the restored link resolving as a
      directory (`statSync(dest).isDirectory()`); the assertion must hold on
      Windows too, where an untyped link would NOT resolve as a directory.
      Do not assert on Windows-only `dir /AL` output.
  </behavior>
  <action>
    Layer 2 (defense in depth). Add and use an exported pure helper:

    ```
    export function symlinkTypeFor(sourceDir: string, record: SymlinkRecord): 'dir' | 'file'
    ```

    Resolve `record.target` from `dirname(join(sourceDir, record.relPath))`, then
    `statSync` it (FOLLOWING links, so a chained `Current` resolves) inside a
    try/catch; `isDirectory()` -> `'dir'`, anything else or a throw -> `'file'`.

    In `restoreSymlinks`, pass it as the third argument:
    `symlinkSync(record.target, destPath, symlinkTypeFor(sourceDir, record))`.

    Write the WHY into the docblock, because this is the non-obvious part:
    - Windows symlinks are TYPED. Node defaults to `'file'` unless the target
      already resolves at creation time. A file symlink pointing at a directory
      does not resolve as a directory, so vite's `copyDir` `statSync` fails on it
      and aborts the publicDir copy partway through — the exact Layer 2 cascade
      in the source todo, where the previous build's output poisoned the next
      build's copy.
    - The type is computed against the SOURCE tree, never the destination: at
      the moment the link is created the destination sibling may not exist yet
      (or may hold vite's dereferenced wrong-kind copy). The source tree is the
      only place the truth is available.
    - `'junction'` is deliberately NOT used. Node resolves a junction target
      against `process.cwd()` and junctions require an absolute path; every
      target here is relative by design (`isContainedSymlinkTarget` refuses
      absolute targets outright), so `'dir'` is the only correct value.
    - The type argument is IGNORED on POSIX, so this is a no-op for the
      macOS -> macOS build that exercises this code today.

    Keep this even though Task 1 stops darwin sources reaching a Windows build:
    macOS builds still run this path on every build, and a future cross-platform
    or `GAMELIB_RUNNER_TARGET_PLATFORM` leg could reintroduce the trees. Say so
    in the comment so a later reader does not delete it as dead.

    Do not change `isContainedSymlinkTarget`, `resolveDestPath`, the
    rejected/skipped bucket ordering, or the `rmSync`-before-`symlinkSync`
    sequence — the ordering rationale already written there (T-34.9-18-02) is
    load-bearing.
  </action>
  <verify>
    <automated>npx prettier --check meta/preserveRunnerSymlinks.ts meta/__tests__/preserveRunnerSymlinks.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx jest --selectProjects Meta "meta/__tests__/preserveRunnerSymlinks.test.ts"</automated>
  </verify>
  <done>
    `symlinkTypeFor` is exported and covered by the five behaviours above
    (including the chained-link and source-vs-destination cases), and
    `restoreSymlinks`' `symlinkSync` call passes a third argument. The existing
    `preserveRunnerSymlinks.test.ts` suite — including its known-bad `cp -RL`
    fixture and the CR-01/WR-01 guards — still passes unchanged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Stop the closeBundle guards from masking the first build error</name>
  <files>meta/preserveRunnerSymlinks.ts, meta/assembleRendererDist.ts, meta/__tests__/preserveRunnerSymlinks.test.ts, meta/__tests__/assembleRendererDist.test.ts</files>
  <behavior>
    For BOTH `preserveRunnerSymlinksPlugin()` and `assembleRendererDistPlugin()`,
    driving the plugin's hooks directly (no real vite build needed):
    - `buildEnd(new Error('first cause'))` then `closeBundle()` throws the SAME
      error instance (`toThrow` on identity, not just message) — not the plugin's
      own "bundleKeys is empty" / "refusing to emit" message.
    - In that errored case the plugin performs NO work: `assembleRendererDist`
      does not `rm -rf` the renderer dir (assert a sentinel file placed there
      survives), and `restoreSymlinks` creates no links (assert against a temp
      dest tree).
    - `buildEnd()` called with NO argument (the success path rollup uses) leaves
      the plugin's normal behaviour completely unchanged: `closeBundle()` still
      throws the plugin's OWN error for the empty-bundleKeys / non-empty-skipped
      cases, and still succeeds on a good tree. This is the no-regression pin —
      the guards must not become unconditionally silent.
    - `closeBundle()` with `buildEnd` never called at all behaves like the
      success path (a plugin instance must not require the hook to have fired).
    - Each plugin instance is independent: a recorded error on one instance does
      not leak into a second instance created in the same process (the closure,
      not module scope — the same constraint `assembleRendererDistPlugin`'s
      `bundleKeys` already documents).
  </behavior>
  <action>
    Layer 3. Rollup still runs `closeBundle` after a `buildStart` or publicDir-copy
    failure, so whichever guard throws there replaces the real first cause in
    `vite build`'s output — which is why the actual error
    (`pruneStaleHelperBinaries: refusing to prune ...`) was only visible through
    vite's JS API with a `buildEnd(err)` hook.

    In each of the two plugin factories, add a closure-local recorder (NOT module
    scope — multiple instances coexist in one jest process, the same reason
    `bundleKeys` is already a closure variable):

    ```
    let earlierBuildError: Error | undefined
    ...
    buildEnd(err) { if (err) earlierBuildError = err },
    closeBundle() {
      if (earlierBuildError) throw earlierBuildError
      ...existing body unchanged...
    }
    ```

    Rethrow the recorded error UNCHANGED (same instance, no wrapping, no message
    prefix) so the stack and message vite prints are the original first cause.
    Skipping the plugin's own body in that case is deliberate and doubly
    valuable for `preserveRunnerSymlinks`: restoring links over a half-copied
    `build/` tree is exactly what produced the dangling links that poisoned the
    NEXT build.

    Comment both sites with the mechanism (rollup runs `closeBundle` even after a
    failed build; `buildEnd(err)` is the only hook that sees the first error) so
    the two-line addition is not mistaken for boilerplate.

    Use vite's own `Plugin` hook typing for `buildEnd` — do not hand-widen it to
    `any`; `pnpm codecheck` covers `tsconfig.meta.json` and must stay clean.
  </action>
  <verify>
    <automated>npx prettier --check meta/preserveRunnerSymlinks.ts meta/assembleRendererDist.ts meta/__tests__/preserveRunnerSymlinks.test.ts meta/__tests__/assembleRendererDist.test.ts</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx jest --selectProjects Meta "meta/__tests__/preserveRunnerSymlinks.test.ts" "meta/__tests__/assembleRendererDist.test.ts"</automated>
    <automated>npx jest --selectProjects Meta</automated>
    <automated>npx jest --selectProjects Meta "meta/__tests__/viteRendererConfig.test.ts"</automated>
  </verify>
  <done>
    Both plugins rethrow a recorded earlier build error by identity and do no
    work in that case, while the no-error path — including both guards' own
    fail-loud throws — is byte-for-byte unchanged in behaviour. The full Meta
    project passes, and `viteRendererConfig.test.ts` (which pins plugin ordering
    by hook identity and enforce tier) is still green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GitHub release -> `public/bin` | Externally-sourced onedir archives and binaries land in the vendored tree. |
| `public/bin` -> `build/` -> shipped bundle | Untrusted symlink targets and archive entries are recreated inside the signed artifact. |
| Environment -> build scripts | `GAMELIB_RUNNER_TARGET_PLATFORM` is new build-time-controlled input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tip-01 | Tampering | `resolveRunnerTargetPlatform` env override | mitigate | Value is validated against the three `SupportedPlatform` literals and THROWS otherwise; it only selects which platform's assets are fetched and never becomes a path segment, URL component or spawn argument. |
| T-tip-02 | Elevation of Privilege | `symlinkTypeFor` / `symlinkSync` | mitigate | Type selection is additive only. `isContainedSymlinkTarget` still runs FIRST and still refuses absolute and `..`-escaping targets; no target string is rewritten. A `'dir'` type cannot widen where a link points. |
| T-tip-03 | Denial of Service | Narrowed `assessPublicBin` | mitigate | Narrowing is scoped to platform, not to strength: the new P3 flat-binary table replaces the darwin P2 checks on win32/linux so an under-populated tree still fails loud and still deletes nothing. Unit-tested in its FAILING direction (missing file, zero-byte file, stale tag). |
| T-tip-04 | Repudiation | Layer-3 error rethrow | mitigate | The recorded error is rethrown as the SAME instance with no wrapping, so the printed message and stack are the genuine first cause rather than a plugin-authored summary. |
| T-tip-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs no packages. No `package.json` dependency is added or changed. |
</threat_model>

<verification>
- `pnpm codecheck` exits 0.
- `npx jest --selectProjects Meta` exits 0 with no pre-existing Meta test modified in behaviour (only extended).
- `npx prettier --check` passes over every path listed in `files_modified`.
- `pnpm planning-gates` exits 0 (the todo file is edited in place; its
  CI-enforced `severity:`/`platform:`/`ready:` frontmatter keys must be left
  untouched and must still be present).
- Manual grep sanity: `grep -n "symlinkSync(record.target" meta/preserveRunnerSymlinks.ts`
  shows a THREE-argument call.
</verification>

<success_criteria>
- A non-darwin build neither downloads nor demands the darwin onedir trees, and
  a darwin build is behaviourally identical to today (Layer 1, the todo's
  "Best" direction).
- Any symlink this pipeline does recreate carries the correct Windows link type,
  computed against the source tree (Layer 2).
- An earlier build error is what `vite build` prints, not a `closeBundle` guard's
  own message (Layer 3).
- The host-vs-target keying decision is written down in code, with its rationale
  (host-keyed by default because CI runs `download-helper-binaries` per matrix
  leg on the matching runner OS; `GAMELIB_RUNNER_TARGET_PLATFORM` exists as the
  explicit override for a future cross-platform leg).
- No file under `public/bin` is deleted, regenerated or otherwise modified.

**Optional operator-run check (NOT a blocking gate — do not run it as part of a
task's `<verify>`):** on this Windows box, `pnpm exec vite build` twice in a row
with no manual link repair and no `build/` cleanup, plus a deliberately broken
`buildStart` showing its own error message. That is the source todo's own
"Done when", and it is what should promote the todo to `completed/` — but it is
a multi-minute full build and is left to the operator.
</success_criteria>

<output>
Create `.planning/quick/260923-tip-fix-windows-packaged-build-darwin-runner/260923-tip-SUMMARY.md` when done
</output>
