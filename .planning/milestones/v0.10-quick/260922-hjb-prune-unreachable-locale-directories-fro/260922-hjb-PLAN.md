---
phase: quick-260922-hjb
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - todo-2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle
files_modified:
  - meta/pruneUnofferedLocales.ts
  - meta/__tests__/pruneUnofferedLocales.test.ts
  - meta/__tests__/viteRendererConfig.test.ts
  - vite.config.ts
  - .planning/todos/pending/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md

must_haves:
  truths:
    - "After a real `pnpm exec vite build`, `build/locales` holds exactly the 43 offered language directories - not 49."
    - "After the same build, `build/renderer/locales` ALSO holds exactly 43 - the renderer copy is fixed by the same single prune, not left at 49."
    - "`public/locales` is byte-identical before and after the build - 49 directories, no git diff."
    - "The offered set is READ from `src/common/languages.ts`, so this change adds a consumer of that list and never a fifth copy of it."
    - "A prune that would delete `en`, or that runs against an unreadable/implausibly small offered list, or that would delete an implausible fraction of the tree, throws and deletes nothing."
    - "An empty prune set is a silent no-op that evaluates no guard, so a cold CI checkout stays green."
    - "The prune-before-assemble ordering requirement is pinned by an assertion, so a future plugin re-order or an async/enforce change turns a gate red instead of silently half-fixing the bug."
  artifacts:
    - path: "meta/pruneUnofferedLocales.ts"
      provides: "Pure prune-set computation + guards + a closeBundle vite plugin factory"
      exports: ["computeUnofferedLocaleDirs", "assessOfferedLocales", "pruneUnofferedLocales", "pruneUnofferedLocalesPlugin"]
      min_lines: 120
    - path: "meta/__tests__/pruneUnofferedLocales.test.ts"
      provides: "Temp-dir unit coverage of the prune set + every guard's FAILING direction, plus a live-listing pin on the six unreachable codes"
      contains: "mkdtempSync"
    - path: "vite.config.ts"
      provides: "The plugin wired into the plugins array with the ordering rationale in situ"
      contains: "pruneUnofferedLocalesPlugin"
  key_links:
    - from: "meta/pruneUnofferedLocales.ts"
      to: "src/common/languages.ts"
      via: "import { supportedLanguages }"
      pattern: "from '\\.\\./src/common/languages'"
    - from: "vite.config.ts"
      to: "meta/pruneUnofferedLocales.ts"
      via: "plugins array entry, normal enforce tier, before every enforce:'post' plugin"
      pattern: "pruneUnofferedLocalesPlugin\\(\\)"
    - from: "meta/__tests__/viteRendererConfig.test.ts"
      to: "vite.config.ts"
      via: "hook-identity + enforce-tier ordering pin"
      pattern: "gamelib-prune-unoffered-locales"
---

<objective>
Stop shipping the six unreachable locale directories (`br`, `da`, `ka`, `sl`, `th`, `uz`) in the Tauri bundle by pruning them from the BUILD OUTPUT at build time, derived from `supportedLanguages`.

Purpose: `.planning/todos/pending/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md` is filed as `ready: human` on a blocker that is now ANSWERED — there is no automated Weblate sync into this fork (Weblate runs on Heroic; no Weblate config exists in this repo; locale content arrived exactly once via a hand-run `git show` copy in `5973d4448`, and the fork has since hand-edited non-English catalogs in `d466a141d`, `ecbfa3a1b`, `59a82cd18`). A build-time prune is strictly stronger than deleting `public/locales/<code>`: it survives any future manual refresh, and it automatically catches a NEW unreachable locale that a delete could never see.

Output: `meta/pruneUnofferedLocales.ts`, its test, an ordering pin in the existing vite-config gate, the `vite.config.ts` wiring, and the todo moved to `completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md
@meta/pruneStaleHelperBinaries.ts
@meta/__tests__/pruneStaleHelperBinaries.test.ts
@meta/assembleRendererDist.ts
@meta/__tests__/viteRendererConfig.test.ts
@vite.config.ts
@src/common/languages.ts

<measurements>
<!-- Measured at HEAD on this machine during planning. Re-verify anything you depend on. -->

```
public/locales/          49 dirs
build/locales/           49 dirs      <- ships via tauri.conf.json bundle.resources
build/renderer/locales/  49 dirs      <- ships via frontendDist
src/common/languages.ts  supportedLanguages = 43 codes
dirs present but in NO list: br, da, ka, sl, th, uz
codes in the list with NO dir: (none)
du -sk per tree: br 40K, da 120K, ka 104K, sl 40K, th 100K, uz 96K = 500K/tree, ~1000K shipped
```

THE TODO UNDERCOUNTS BY HALF. It says 532K and names only `build/locales/`. Locales ship TWICE:
1. `src-tauri/tauri.conf.json` maps `"../build/locales/": "build/locales"` under `bundle.resources`.
2. `meta/assembleRendererDist.ts` exports `STATIC_RENDERER_DIRS = ['locales']` and `cpSync`s `build/locales` -> `build/renderer/locales`, which is what `frontendDist` points at. Its header (~line 38) calls this duplication structural and by design.

A prune touching only `build/locales/` fixes HALF the defect.

`pnpm lint` baseline, MEASURED at HEAD this session (exit 0, both scopes PASS):
```
src  scope: 1119 warnings, ceiling SRC_CEILING   = 1124  -> 5 slots of headroom
test scope:  638 warnings, ceiling TESTS_CEILING =  638  -> ZERO headroom
```
`meta/lintScoped.cjs:98-103` routes `**/__tests__/**/*.ts` into the TESTS scope. The new test file
must therefore produce ZERO eslint warnings or `pnpm lint` goes red. The src ceiling DRIFTS —
re-measure before assuming the 5 slots are still there.

`pnpm codecheck` is `tsc --noEmit` against a `tsconfig.json` whose `include` is `["src"]` and whose
`exclude` lists `vite.config.ts`. It does NOT typecheck `meta/`. Jest's `ts-jest` preset does
(`jest.config.js` lists `<rootDir>/meta` as a project), so the new test run IS the typecheck for
this change.
</measurements>

<lifecycle_evidence>
<!-- Read out of node_modules during planning. This is WHY the hook choice below is what it is. -->

The vite/rollup build order, verified in `node_modules/vite/dist/node/chunks/dep-DBxKXgDP.js` and
`node_modules/rollup/dist/shared/rollup.js`:

1. `bundle = await rollup(rollupOptions)` -> `buildStart` fires here.
2. `if (options.write) prepareOutDir(...)` (`dep-DBxKXgDP.js:46208`) -> `copyDir(publicDir, outDir)`
   at `:46262`. **This is where all 49 locale dirs are copied into `build/`.**
3. `bundle.write(output)` -> `generateBundle`, `writeBundle`.
4. `bundle.close()` -> `hookParallel('closeBundle', [])` (`rollup.js:24227`).

=> `buildStart` (what `pruneStaleHelperBinaries` uses) is WRONG here: step 1 precedes step 2, so
this build's own publicDir copy would immediately re-add the six. The hook must be `closeBundle`.

Ordering inside step 4, and why it is NOT an array-position gamble:
- `sortUserPlugins` (`dep-DBxKXgDP.js:49184-49195`) partitions user plugins into pre / normal /
  post by `enforce`, and `resolvePlugins` (`:41874-41916`) concatenates them in that order.
  A plugin with NO `enforce` therefore lands before EVERY `enforce: 'post'` plugin regardless of
  where it sits in the `plugins` array.
- `preserveRunnerSymlinksPlugin` and `assembleRendererDistPlugin` are BOTH `enforce: 'post'`.
- `hookParallel` (`rollup.js:3603-3616`) iterates `getSortedPlugins(hookName)` in that resolved
  order. It does not `await` between non-`sequential` plugins — it pushes promises — so the
  ordering guarantee holds only because a SYNCHRONOUS hook body runs to completion inside
  `runHook` before the loop reaches the next plugin. **The new plugin's `closeBundle` must be a
  plain synchronous function. Making it `async` would silently reopen the race.**
- `assembleRendererDist` `rmSync`s `build/renderer` wholesale and then `cpSync`s `build/locales`
  into it (`assembleRendererDist.ts:124` and `:151-160`). So a prune of `build/locales` that lands
  before it fixes BOTH trees with one delete.

This is route (a) from the brief, and it is chosen over route (b) ("prune both trees explicitly")
because (b) would have to run at `closeBundle` too, in the same `hookParallel` batch as the
assemble step, and would therefore be racing the very `rmSync`/`cpSync` it is trying to correct.
(a) has a one-directional dependency backed by vite's enforce-tier partition; (b) has a
bidirectional one backed by nothing.
</lifecycle_evidence>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write meta/pruneUnofferedLocales.ts</name>
  <files>meta/pruneUnofferedLocales.ts</files>
  <behavior>
    - `computeUnofferedLocaleDirs(localesDir, offered)` returns the DIRECTORY names under `localesDir` that are absent from `offered`, sorted. Files are ignored (only `dirent.isDirectory()` counts). Returns `[]`, never throws, when `localesDir` does not exist.
    - Against the live `public/locales` listing and the live `supportedLanguages`, it returns exactly `['br','da','ka','sl','th','uz']`.
    - `assessOfferedLocales(offered, presentDirs, pruneSet)` returns `{ ok, reasons }`. `ok` is false when: `offered` has fewer than `OFFERED_FLOOR` entries; `offered` does not contain `'en'`; the prune set contains `'en'`; or the prune set is more than `MAX_PRUNE_FRACTION` of `presentDirs`.
    - `pruneUnofferedLocales(localesDir, offered)` with an EMPTY prune set returns `{ pruned: [], bytesFreed: 0, guardEvaluated: false }` and calls no guard and no `rmSync`.
    - With a NON-EMPTY prune set and a failing guard, it THROWS and the on-disk tree is unchanged (assert the directories still exist after the throw).
    - With a non-empty prune set and a passing guard, it deletes exactly those directories and leaves every offered directory intact.
  </behavior>
  <action>
Create `meta/pruneUnofferedLocales.ts`, modelled on `meta/pruneStaleHelperBinaries.ts` — same shape (pure functions + a plugin factory at the bottom), same commenting density, but re-derive every detail rather than porting it verbatim (CLAUDE.md bans verbatim ports).

Import the offered set: `import { supportedLanguages } from '../src/common/languages'`. This change must add a CONSUMER of that list, never a fifth copy of it — the sibling todo `2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md` already complains about the four existing copies. Do NOT hand-type the 43 codes anywhere in this file or its test. `src/common/languages.ts` is a 45-line module with exactly one export and zero imports, so importing it from build-time code is safe (contrast the explicit DO-NOT-IMPORT warning at the top of `pruneStaleHelperBinaries.ts`, which exists because `downloadHelperBinaries.ts` runs `main()` at module scope).

Exports:
- `computeUnofferedLocaleDirs(localesDir: string, offered: readonly string[]): string[]` — `readdirSync(..., { withFileTypes: true })`, keep only `isDirectory()`, keep only names not in `offered`, sorted. Empty array (no throw) when the directory is absent or unreadable.
- `assessOfferedLocales(offered, presentDirs, pruneSet): { ok: boolean; reasons: string[] }` — the refuse-to-prune guard, in the spirit of `assessPublicBin`. Every failing condition must be collected, not short-circuited (same reason `runScope` in `meta/lintScoped.cjs` reports all failures).
- `pruneUnofferedLocales(localesDir, offered = supportedLanguages): { pruned: string[]; bytesFreed: number; guardEvaluated: boolean }`.
- `pruneUnofferedLocalesPlugin(options?: { localesDir?: string }): Plugin`.

Constants, each with its rationale written in situ:
- `OFFERED_FLOOR = 20` — a scope-collapse floor, NOT a second ceiling. Borrowed reasoning from `meta/lintScoped.cjs:61-73`: an offered list that silently collapsed to a handful would compute a prune set covering almost the whole tree, and a guard that only checked "non-empty" would wave it through. 20 is well under the measured 43 and far above any plausible collapse remnant.
- `MAX_PRUNE_FRACTION = 0.25` — the measured ratio today is 6/49 = 0.122. A quarter of the tree leaves headroom for a few more unreachable locales accumulating while still refusing a wholesale wipe.

Guard ordering is load-bearing: `pruneUnofferedLocales` computes the prune set, returns the silent no-op when it is empty (guard NOT evaluated, mirroring `guardEvaluated: false`), then runs `assessOfferedLocales` and throws on `ok: false` — strictly before the FIRST `rmSync`. The empty-set no-op is what keeps a cold CI checkout green: `.github/workflows/release-tauri.yml` runs `pnpm exec vite build` with no pre-existing `build/`.

Containment: resolve each delete target with `resolveDestPath` from `./preserveRunnerSymlinks`, the containment idiom this repo already owns — the names come from our own `readdirSync` and are never accepted from outside, but keep it as defense-in-depth exactly as `pruneStaleHelperBinaries.ts:351` does.

Byte accounting: sum `lstatSync().size` over regular files only (apparent bytes, never `du` block size), skipping symlinks — same semantics as `sumApparentBytes`.

The plugin factory: `name: 'gamelib-prune-unoffered-locales'`, `apply: 'build'`, NO `enforce` key, and a plain SYNCHRONOUS `closeBundle()` — not `async`. Default `localesDir` is `join(__dirname, '..', 'build', 'locales')`, `__dirname`-relative like every sibling plugin, not derived from `config.build.outDir`. Log a one-line result in both the pruned and nothing-to-prune cases.

The file header MUST carry the ordering argument in situ so a future re-order is not silently destructive. Write out, in prose: (1) why `buildStart` is wrong here and `closeBundle` is right — vite's `prepareOutDir` publicDir copy (`dep-DBxKXgDP.js:46208`/`:46262`) runs strictly AFTER `buildStart`, so a `buildStart` prune would be undone by this build's own copy; (2) that the plugin carries NO `enforce`, that `sortUserPlugins` therefore places it before every `enforce: 'post'` plugin, and that `assembleRendererDistPlugin` (`enforce: 'post'`) `rm -rf`s `build/renderer` and re-copies `build/locales` — which is precisely why ONE prune of `build/locales` fixes both shipped trees; (3) that the `closeBundle` body must stay SYNCHRONOUS, because `hookParallel` (`rollup.js:3603-3616`) does not await between non-`sequential` plugins and the ordering therefore rests on a sync body completing inside `runHook`; (4) that the ordering is pinned by `meta/__tests__/viteRendererConfig.test.ts`, naming the test.

Do NOT reference or touch anything under `public/locales/`, and do NOT touch `src-tauri/tauri.conf.json`.
  </action>
  <verify>
    <automated>node meta/runTs.cjs --bundle --platform=node --target=node21 meta/pruneUnofferedLocales.ts > /dev/null 2>&1 || npx tsc --noEmit --esModuleInterop --strict --resolveJsonModule --module esnext --moduleResolution node --target es2017 meta/pruneUnofferedLocales.ts</automated>
    <automated>grep -v '^ \*' meta/pruneUnofferedLocales.ts | grep -v '^//' | grep -c "supportedLanguages"</automated>
  </verify>
  <done>`meta/pruneUnofferedLocales.ts` exists, exports the four names above, imports `supportedLanguages` from `../src/common/languages`, hand-copies no language code, and its `closeBundle` is a non-async function. The second verify command returns a non-zero count from non-comment lines (proves the import is live code, not just prose).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Cover the prune and PIN the ordering</name>
  <files>meta/__tests__/pruneUnofferedLocales.test.ts, meta/__tests__/viteRendererConfig.test.ts</files>
  <behavior>
    New `meta/__tests__/pruneUnofferedLocales.test.ts`, modelled on `meta/__tests__/pruneStaleHelperBinaries.test.ts`:
    - LIVE PIN (this is the one that pins the real defect): `computeUnofferedLocaleDirs(join(__dirname,'..','..','public','locales'), supportedLanguages)` equals exactly `['br','da','ka','sl','th','uz']`. A future unreachable locale turns this red. Assert the reverse direction too — every entry of `supportedLanguages` has a directory under `public/locales` — so a code added to the list without a catalog is also caught.
    - Temp-dir coverage of `computeUnofferedLocaleDirs`: ignores loose files, returns `[]` for an absent directory, returns `[]` when every directory is offered.
    - Guard FAILING directions, each asserted to throw AND to leave the tree on disk untouched: offered list below `OFFERED_FLOOR`; offered list without `'en'`; a prune set containing `'en'`; a prune set exceeding `MAX_PRUNE_FRACTION` of the tree.
    - Guard PASSING direction: the realistic 49-dir / 43-offered shape prunes exactly 6, keeps 43, reports `guardEvaluated: true` and a non-zero `bytesFreed`.
    - Empty-prune-set no-op: returns `guardEvaluated: false` even when the offered list would FAIL the guard — proving the guard is genuinely not evaluated, not merely passing.
    - COMPOSITION PIN: on a temp outDir seeded with 49 locale dirs plus the minimum `assembleRendererDist` demands (an `index.html` bundle key, an `assets/` file, `icon.png`), run `pruneUnofferedLocales` and THEN `assembleRendererDist` in that order and assert the assembled `renderer/locales` holds exactly 43. Then run them in the REVERSE order and assert it holds 49 — the failing direction is the whole point, and this repo has a standing lesson that a gate whose failing direction is never exercised proves nothing.

    Added to `meta/__tests__/viteRendererConfig.test.ts`, alongside the existing 260901-a2w hook-identity test at `:146-171`:
    - `pluginNames(config)` contains `'gamelib-prune-unoffered-locales'`.
    - The prune-locales plugin has `closeBundle` defined and `buildStart` undefined (a `buildStart` "simplification" would be undone by vite's own publicDir copy).
    - `typeof plugin.closeBundle === 'function'` and `plugin.closeBundle.constructor.name === 'Function'` — NOT `'AsyncFunction'`, and not the object form that could carry `order`/`sequential`.
    - `plugin.enforce` is not `'post'`, while `assembleRendererDistPlugin`'s IS `'post'` — this is the assertion that makes the ordering independent of array position, per `sortUserPlugins`.
    - The prune-locales entry still precedes the assemble entry in the flattened array (belt-and-braces; redundant with the enforce assertion by design).
    - A source-text guard, matching the existing `F-34.9-01` one at `:217-221`: `vite.config.ts` still contains the string `260922-hjb` and the phrase naming the ordering dependency.
  </behavior>
  <action>
Write the tests to the behaviours above.

ZERO-WARNING CONSTRAINT — read this before writing: `pnpm lint`'s TESTS scope sits at 638/638 with NO headroom (measured at HEAD this session; `meta/lintScoped.cjs:59` `TESTS_CEILING = 638`, and `:98-103` routes `**/__tests__/**/*.ts` there). A single new eslint warning in either test file turns `pnpm lint` red. Write the new file warning-free from the start rather than raising the ceiling — in particular avoid unawaited promises, `any`, and unused `eslint-disable` directives (an orphaned disable costs +2). Do not add a disable comment you have not proven fires.

Use `mkdtempSync(join(tmpdir(), 'hjb-locales-'))` in `beforeEach` and `rmSync(..., { recursive: true, force: true })` in `afterEach`, exactly as `pruneStaleHelperBinaries.test.ts:46-51` does. Nothing in this file may write to, delete from, or otherwise mutate the real `public/locales`, `build/locales` or `build/renderer` — the live pin is a READ of `public/locales` only.

Derive the seeded 49-dir fixture from `supportedLanguages` plus the six literal unreachable codes. The six ARE hand-written here on purpose and only here: they are the test's expectation, and an expectation computed by the same code under test asserts nothing.

For the composition pin, import `assembleRendererDist` from `../assembleRendererDist` — it throws on an empty `bundleKeys`, on a missing `index.html`, on a zero-file `assets/`, on a missing `icon.png`, and on a `locales/` with no `*.json` anywhere beneath it, so seed each locale directory with a real (tiny) `translation.json`.

In `viteRendererConfig.test.ts`, extend the existing flattened-plugin helper rather than adding a second copy of it, and keep the new assertions in the same comment style as the surrounding block (task ID + what the RED case looks like).
  </action>
  <verify>
    <automated>npx jest meta/__tests__/pruneUnofferedLocales.test.ts meta/__tests__/viteRendererConfig.test.ts 2>&1 | tail -20</automated>
    <automated>npx eslint meta/__tests__/pruneUnofferedLocales.test.ts meta/__tests__/viteRendererConfig.test.ts --max-warnings 0</automated>
  </verify>
  <done>Both test files pass. `eslint --max-warnings 0` is clean on both, so the 638/638 TESTS ceiling is unmoved. The live pin reports exactly the six codes; the composition pin's reverse-order case is asserted to yield 49 and passes.</done>
</task>

<task type="auto">
  <name>Task 3: Wire into vite.config.ts and prove it on a real build</name>
  <files>vite.config.ts, .planning/todos/pending/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md</files>
  <action>
Add `import { pruneUnofferedLocalesPlugin } from './meta/pruneUnofferedLocales'` to `vite.config.ts`'s import block (alphabetical among the three existing `./meta/...` imports).

Insert `pruneUnofferedLocalesPlugin()` into the `plugins` array AFTER `pruneStaleHelperBinariesPlugin()` and BEFORE `preserveRunnerSymlinksPlugin()`. Array position is belt-and-braces here — the plugin carries no `enforce`, so `sortUserPlugins` already puts it ahead of both `enforce: 'post'` plugins — but put it there anyway so a reader who does not know that rule still sees the right order.

The comment above the entry must match the density of the neighbouring entries (they run 10-18 lines with task IDs and rationale). It must say, in prose: quick task `260922-hjb`; that `public/locales` holds 49 directories while `src/common/languages.ts` offers 43, so `br`/`da`/`ka`/`sl`/`th`/`uz` are unreachable (no `languageDetector` is registered and `supportedLngs` resolves an excluded code to `["en"]`) yet ship twice — once via `tauri.conf.json`'s wholesale `../build/locales/` resource mapping and once via `build/renderer/locales` under `frontendDist`; that this prunes the BUILD OUTPUT and never `public/locales`, which is deliberately left untouched so `pnpm i18n-churn-guard` (it reads `git diff --name-only -- public/locales`, unstaged only) stays out of the blast radius; that it runs at `closeBundle` and NOT at `buildStart` like its `pruneStaleHelperBinariesPlugin` neighbour, because vite's publicDir copy happens after `buildStart` and would immediately re-add the six; and that it must stay on the normal enforce tier ahead of `assembleRendererDistPlugin`, whose `rm -rf` + re-copy of `build/locales` is what makes one prune fix both trees — with the pointer that `meta/__tests__/viteRendererConfig.test.ts` pins exactly this.

DO NOT touch `emptyOutDir` (its MUST-stay-false rationale at `vite.config.ts:107-113` is unchanged), `src-tauri/tauri.conf.json`, or anything under `public/locales/`.

Then move the todo from `.planning/todos/pending/` to `.planning/todos/completed/` with `git mv`. PROJECT MEMORY TRAP: `git mv` commits HEAD content and silently drops unstaged edits — this has bitten three times. If you edit the todo body (to record that the Weblate blocker was answered and that the real figure is ~1000K across two trees, not 532K across one), verify with `git show :<path> | grep -c '<your new text>'` BEFORE committing, every time.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/viteRendererConfig.test.ts 2>&1 | tail -10</automated>
    <automated>rm -rf build/renderer && pnpm exec vite build > /tmp/hjb-build.log 2>&1; echo "BUILD_EXIT=$?"; grep -c "prune-unoffered-locales" /tmp/hjb-build.log</automated>
    <automated>echo "build/locales: $(ls build/locales | wc -l)  build/renderer/locales: $(ls build/renderer/locales | wc -l)  public/locales: $(ls public/locales | wc -l)"</automated>
    <automated>node -e "const{readdirSync}=require('fs');const off=require('fs').readFileSync('src/common/languages.ts','utf8').match(/\[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s=>s.slice(1,-1));for(const t of ['build/locales','build/renderer/locales']){const d=readdirSync(t);const extra=d.filter(x=>!off.includes(x));const missing=off.filter(c=>!d.includes(c));if(extra.length||missing.length||d.length!==43)throw new Error(t+': '+d.length+' dirs, extra='+extra+', missing='+missing);}console.log('both trees: 43, en present:',readdirSync('build/locales').includes('en'))"</automated>
    <automated>git status --porcelain public/locales | wc -l</automated>
    <automated>pnpm codecheck</automated>
    <automated>pnpm lint</automated>
    <automated>pnpm prettier</automated>
  </verify>
  <done>
`BUILD_EXIT=0` (the exit status is captured separately — NEVER pipe the build to `tail`, project memory records three wrong conclusions from that habit). The build log contains the prune plugin's line. `build/locales` and `build/renderer/locales` have BOTH gone 49 -> 43, `en` is present, and the offered/present sets match exactly in both. A "nothing to prune" result is a FAILURE here, not a pass — both trees were measured at 49 before this change. `git status --porcelain public/locales` reports 0 lines, and `public/locales` still lists 49. `pnpm codecheck`, `pnpm lint` and `pnpm prettier` all exit 0, with lint's TESTS scope still at 638/638 and the src scope at or under the ceiling measured at HEAD (1119/1124 this session — re-measure, it drifts).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| build output -> shipped bundle | Anything left in `build/locales` and `build/renderer/locales` is signed and shipped to users. |
| `src/common/languages.ts` -> delete decision | A source list now decides what gets `rmSync`'d during a build. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hjb-01 | Denial of Service | `pruneUnofferedLocales` deleting the wrong tree | mitigate | Guard refuses when `offered` is under `OFFERED_FLOOR`, lacks `'en'`, when the prune set contains `'en'`, or when it exceeds `MAX_PRUNE_FRACTION` of the tree; guard runs strictly before the first `rmSync`; failing direction is unit-tested to leave the tree on disk. |
| T-hjb-02 | Tampering | Path traversal out of `localesDir` | mitigate | Names come only from this module's own `readdirSync`; every delete target is still resolved through `resolveDestPath`'s containment check. |
| T-hjb-03 | Denial of Service | Half-fix after a plugin re-order — `build/renderer/locales` silently back to 49 | mitigate | Plugin carries no `enforce` (normal tier, ahead of every `'post'` plugin per `sortUserPlugins`); `closeBundle` kept synchronous; hook identity, enforce tier, sync-ness and array order all pinned in `viteRendererConfig.test.ts`; composition test asserts the reverse order yields 49. |
| T-hjb-04 | Tampering | Accidental mutation of tracked `public/locales` | mitigate | Plugin default and every test path target build output only; `git status --porcelain public/locales` asserted empty in Task 3. |
| T-hjb-SC | Tampering | npm/pip/cargo installs | accept | No package is installed by this plan — every import (`node:fs`, `node:path`, `vite` types, `src/common/languages.ts`, `./preserveRunnerSymlinks`, `../assembleRendererDist`) already exists in the tree. |
</threat_model>

<verification>
- `npx jest meta/__tests__/pruneUnofferedLocales.test.ts meta/__tests__/viteRendererConfig.test.ts` green.
- `npx eslint <both test files> --max-warnings 0` clean (TESTS ceiling has zero headroom).
- `pnpm exec vite build` captured to a file, exit status checked separately, then `ls build/locales | wc -l` and `ls build/renderer/locales | wc -l` both report 43 (down from a measured 49), with `en` and all 43 offered codes present in each.
- `git status --porcelain public/locales` reports nothing; `ls public/locales | wc -l` still 49.
- `pnpm codecheck`, `pnpm lint`, `pnpm prettier` all exit 0.
</verification>

<success_criteria>
- Both shipped locale trees go 49 -> 43 on a real build; the six unreachable directories (`br`, `da`, `ka`, `sl`, `th`, `uz`, ~1000K across the two trees) no longer reach the bundle.
- `public/locales` is untouched — no delete, no diff, still 49 directories.
- The 43-code list gained a consumer, not a fifth copy: `meta/pruneUnofferedLocales.ts` imports `supportedLanguages`.
- A NEW unreachable locale added to `public/locales` tomorrow is pruned automatically and turns the live-pin test red, so it is noticed rather than silently shipped.
- The prune-before-assemble ordering is pinned by assertions on hook identity, enforce tier and synchronicity, so the half-fix failure mode cannot land green.
- The todo is in `.planning/todos/completed/`.
</success_criteria>

<output>
Create `.planning/quick/260922-hjb-prune-unreachable-locale-directories-fro/260922-hjb-SUMMARY.md` when done.
</output>
