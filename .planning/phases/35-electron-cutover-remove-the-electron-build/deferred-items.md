# Phase 35 — deferred items

Out-of-scope discoveries made during plan execution. Logged, deliberately NOT fixed.

**Heading convention (added 2026-08-29):** every entry heading is `## D-35-NN-NN — ...` with the id **unquoted**. This is not cosmetic. Three entries were originally written as ``## `D-35-NN-NN` — ...`` and a later census grepped only the bare form, concluded two items were missing, and **appended duplicates of entries that were already here**. The duplicates have since been merged back and their unique content folded into the originals. Grep for the bare id, and keep writing it that way.

## D-35-03-01 — `meta/i18nForkTouchedFiles.json` is stale against its live git derivation

**Found during:** plan 35-03, regression sweep of the `Meta` jest project.

**Symptom:** `meta/__tests__/genI18nGateScope.test.ts` fails one assertion —
`A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json equals the LIVE git derivation`.
The committed artifact lists three files the live diff against the upstream merge-base no
longer surfaces:

- `src/frontend/components/UI/PathSelectionBox/index.tsx`
- `src/frontend/screens/Library/components/CategoriesManager/index.tsx`
- `src/frontend/screens/Library/components/InstallModal/defaultPlatform.ts`

**Not caused by plan 35-03.** Plan 35-03 touched `vite.config.ts`,
`meta/__tests__/viteRendererConfig.test.ts`, `package.json`, `src-tauri/tauri.conf.json`,
`.github/workflows/release-tauri.yml` and `src/backend/__tests__/releaseWorkflow.test.ts`.
None is a `src/frontend/**` file, and none appears in the failing diff. Verified by grepping
the failure's own diff output for this plan's file names — zero matches.

**Scope note:** the sibling assertions in the same suite pass, including
`A-17 ANTI-ROT non-vacuity: the anti-rot check DOES fail against a mutated copy` — so the
guard is working correctly and is reporting a real staleness, not misfiring.

**Fix when someone owns it:** re-run `pnpm gen-i18n-gate-scope` and commit the regenerated
artifact. Note MEMORY's `regenerating-an-artifact-breaks-the-pins-that-guard-it` before doing
so — regenerating this file has broken its own pins before.

**Status:** open, unowned. Consistent with MEMORY's standing note that the repo's i18n gate is
red repo-wide (`prettier-gate-is-red-repo-wide.md`).

## D-35-03-02 — BLOCKING INPUT FOR PLAN 35-14: `vite` is not a direct dependency

**Found during:** plan 35-03. **This is not a deferred nicety — 35-14 breaks without it.**

Measured at commit `369051ebf`:

```
dependencies:    (no vite package of any kind)
devDependencies: @vitejs/plugin-react-swc, electron-vite, vite-plugin-svgr
```

`vite` itself (6.3.5) resolves only as a **hoisted peer of `electron-vite`**. Plan 35-03's hard
stop therefore did not trigger and nothing was installed — correct behaviour, and the new
`vite.config.ts` works today for exactly that reason.

**Plan 35-14 removes `electron-vite` from `package.json`. That removes the only thing pulling
`vite` in.** After the next `pnpm install`, `pnpm exec vite build` has nothing to resolve — and
that command is 35-14's own `<automated>` verification step, so the plan's proof that "the Tauri
path still works" is the thing that breaks first.

**Required in 35-14:** promote `vite` to a direct `devDependency` in the same commit that removes
`electron-vite`, through the Package Legitimacy Audit protocol in `35-RESEARCH.md`
(`vite` is a new *direct* entry even though it is already installed transitively).
`@vitejs/plugin-react-swc` and `vite-plugin-svgr` are ALREADY direct devDeps and need no action.

**Why this is written down twice** (here and in `35-03-SUMMARY.md`): `35-RESEARCH.md`'s threat
register `T-35-SC` asserts `vite` is already a direct dependency. It is not. A false premise in the
threat register is exactly the shape that survives review, because the plan that would catch it
(35-03) correctly found nothing to install, and the plan that pays for it (35-14) has no reason to
re-derive a fact its own research already states. Neither plan is wrong on its own.

## D-35-03-03 — `tauri dev` does not reap its `beforeDevCommand` Vite server; `strictPort` turns that into a hard failure

**Found during:** plan 35-06 Task 3 live gate, 2026-08-28. Caused by plan 35-03's changes.

**Symptom:** after killing a `tauri:dev` session, the next `pnpm tauri:dev` dies before the
window appears:

```
error when starting dev server:
Error: Port 5173 is already in use
   Error The "beforeDevCommand" terminated with a non-zero status code.
```

**Mechanism.** Plan 35-03 added `beforeDevCommand: pnpm exec vite` and `devUrl:
http://localhost:5173` to `tauri.conf.json`, plus `server: { port: 5173, strictPort: true }` to
`vite.config.ts`. Killing `tauri dev`, `gamelib-shell` and `sidecar.js` leaves the Vite server
**orphaned and still holding 5173** — measured here as pids 27338/27339 (`pnpm exec vite` ->
`./node_modules/.bin/vite`), survivors of a boot 30+ minutes earlier. `strictPort: true` then
correctly refuses to fall through to 5174 and the run aborts.

**`strictPort` is NOT the defect and must not be removed.** It was added deliberately so a
collision fails loudly rather than silently serving the renderer on a port `devUrl` is not
pointing at — a silent 5174 fallback would produce a blank window with no stated cause, which is
strictly worse. The defect is the unreaped child.

**Workaround, which anyone hitting this needs:**

```
lsof -nP -iTCP:5173 -sTCP:LISTEN     # find it
kill <pid>
```

A `pkill -f "tauri dev"; pkill -f gamelib-shell; pkill -f sidecar.js` sequence does **not** cover
it — `vite` matches none of those patterns. This is worth folding into whatever kill helper the
project ends up with, and is a live papercut for anyone driving a live gate.

**Related:** MEMORY's `tauri-dev-noops-against-a-running-instance` — the same family. That one is
"a stale instance survives and you silently test it"; this one is "a stale child survives and
blocks the new run". The second is far better behaviour, because it is visible.

## D-35-06-01 — the tray offers recent games from signed-out stores and from bottled installs, and every failure is SILENT

**Found during:** plan 35-06 Task 3 live gate, 2026-08-28. Operator-observed, then diagnosed
from `~/Library/Logs/GameLib/gamelib.log` and live process state.

**Not a plan 35-06 defect.** The tray resolved the runner and dispatched the launch correctly in
every case measured. Both findings are about what the recent-games list CONTAINS and what the
user is told when a dispatched launch goes nowhere. Recorded here rather than fixed inside a
plan whose scope is the tray surface itself.

### Finding 1 — no auth or availability filter on the recent list

`Phoenix Point` (`appName: Iris`, legendary) renders in the tray while Epic is signed out — the
operator signed out during plan 35-02's item 7 test and the entry survived. `getRecentGames`
reads `games.recent` straight from `configStore` and filters on nothing but `appName` presence.
A `RecentGame` records that a game was once launched, never that it can be launched now.

The correct behaviour is a judgement call and deliberately not made here: filter unavailable
entries out, or render them disabled, or render them and fail loudly. What is NOT defensible is
the current combination of rendering them enabled and failing silently — see Finding 2.

### Finding 2 — a dispatched-but-doomed launch produces NO user-visible signal

Three distinct failure causes were hit in one session and **all three were indistinguishable
from a dead menu item**:

1. **Signed-out store** — Epic logged out (`Iris`).
2. **Bottled Steam not signed in** — `All Will Fall` (`2706020`) IS fully installed
   (`StateFlags 4`, 4.2 GB, in the CrossOver bottle's own `steamapps`, not the macOS Steam
   library) and had run the day before. The launch dispatched correctly:
   `Running Wine command: .../GameLibSteam/.../steam.exe -applaunch 2706020`. But the bottled
   client is logged out — `steamwebhelper.exe ... -steamid=0` — so `-applaunch` lands on a login
   prompt, and per `crossover-renders-steam-dialogs-offscreen` that prompt is INVISIBLE.
   `raiseFrontmostBottledProcess` then waited ~18s for a game process four separate times.
3. **Native vs bottled divergence** — `Pillars of Eternity` (`291650`) launched fine via
   `steam://rungameid/291650`. The operator's own summary — *"native games launch, bottles
   don't"* — was exactly right, and the two paths share nothing downstream of the tray.

`dispatch_tray_launch` logs each outcome to stderr and surfaces nothing, which its own doc
comment states as intentional: *"the tray has nothing to show the user either way."* That is
true of the Rust tray in isolation and false of the product — the app has a toast/dialog surface
and the tray can reach the renderer, as the About item proves.

**Cost of leaving it:** this consumed a large part of the 35-06 live gate. Three benign,
correctly-behaving refusals were investigated as suspected tray defects, and two wrong
conclusions were drawn and retracted along the way (an "uninstalled" call made against the wrong
Steam library, and a "stale binary" call made from a `strings` pattern that could not match a
Rust symbol). A silent failure does not just cost the user — it costs whoever diagnoses it.

**Fix when someone owns it:** surface the outcome. `dispatch_tray_launch`'s `err=` arm and the
"could not resolve a runner" arm both have a caller-visible failure to report. The bottled-Steam
logged-out case additionally deserves its own message, since the underlying prompt is
unreachable by design on this platform.

**Status:** open, unowned. Neither blocks D-16.

## D-35-04-01 — `main.rs`'s `resolve_packaged_app_root` doc comment now asserts a FALSEHOOD

**Found during:** plan 35-04 Task 1, 2026-08-28.

`src-tauri/src/main.rs:6141`'s doc comment on `resolve_packaged_app_root()` says:

> `electronStub.app.isPackaged` stays `false` under the sidecar regardless of this value, so
> `publicDir` still appends `'public'`, not `'build'`, even when this resolves correctly — the
> packaged asset root itself is a named, deliberately unclosed residual (`R-34.5-G1-PKG`,
> `34.5-APP-ROOT-SWEEP.md` § 3), not something this function claims to fix.

**Every clause of that is now false.** Plan 35-04 made `app.isPackaged` a getter delegating to
`isPackagedSidecar()`, and the packaged artifact was measured resolving
`publicDir=<Resources>/build exists=true`. The residual is closed.

**Why it was not fixed in 35-04:** the plan's `files_modified` does not include `main.rs`, and at
the time Task 1 ran an operator `tauri dev` session was live — a Rust edit would have forced a
rebuild/restart of their app, and the `cargo` gates a Rust change owes could not be run against a
contended `src-tauri/target/` lock. Deliberately deferred rather than done half-gated.

**This is the `summary-can-be-wrong-while-the-record-is-right` shape, inverted:** the CODE is now
right and its own doc comment is the part that lies. A future reader of `main.rs` — which is
exactly where 35-04's own objective says the defect is "independently documented from the Rust
side" — will be told the defect is still open.

**Fix when someone owns it:** rewrite that paragraph to record that half (b) was closed by plan
35-04 and that `publicDir` now resolves to `<resource_dir()>/build`. Comment-only; owes a
`cargo build` + the `Backend` suites that read `main.rs` off disk (`tauriShellSource.test.ts`,
`appRootResolution.test.ts`). **Note `stripSourceComments` drops every line matching
`/^\s*(\/\/|\*|\/\*)/`, so `///` doc lines are invisible to those gates — a source gate written
over this comment would be vacuous.**

**Status:** open. Small, and should not leave phase 35.

## D-35-04-02 — the CrossOver index snapshot is deliberately NOT in `bundle.resources`

**Found during:** plan 35-04 Task 2, 2026-08-28.

`crossover_index/fetcher.ts` reads `join(publicDir, 'crossover-index.json.gz')`, so by the letter
of D-19 half (a) it belongs in the bundle. It was omitted, on a read of the bundler:

- `tauri-utils-2.9.3/src/resources.rs:186` — a literal path that does not exist yields
  `Error::ResourcePathNotFound`, a HARD build failure.
- `:257` — a glob that matches nothing yields `Error::GlobPathNotFound`, also hard.
- **There is no optional-resource form in Tauri 2.9.3.**

The file is gitignored and absent from a fresh clone, and `.github/workflows/release-tauri.yml:135`
explicitly tolerates its absence (`|| echo "No published index yet; shipping without a bundled
snapshot"`). A required entry would convert a documented-tolerable state into a build break —
including breaking every local `tauri build`, as it would have broken 35-04's own.

Harmless today: `loadBundledSnapshot()`'s own docstring states an absent snapshot is "a NORMAL
cold-start, not an error" and it returns `null` at info level. And nothing regressed — the snapshot
never shipped under the old `["../build/bin/"]` config either.

**Fix when someone owns it:** either have the build step always produce the file (an empty/marker
gzip when no published index exists, so the literal always resolves), or add a pre-bundle step that
injects the entry into the config only when the file is present. Do NOT "fix" it by adding the
literal — that breaks the contributor build.

**Status:** open, low priority.

## D-35-04-03 — six directory-symlinks in the PyInstaller `Python.framework` do not survive bundling

**Found during:** plan 35-04's packaged-artifact probe, 2026-08-28. **Pre-existing, NOT caused by
this plan — but load-bearing for the first time because of it.**

`build/bin/` carries 12 symlinks. In the packaged `.app`, 0 symlinks survive:

| source symlink | target | in bundle |
|---|---|---|
| `{legendary,gogdl,nile}/_internal/Python` | `Python.framework/Versions/3.12/Python` | dereferenced into a real 7,996,912-byte file (x3) |
| `{legendary,gogdl,nile}/_internal/Python.framework/Python` | `Versions/Current/Python` | dereferenced into a real file (x3) |
| `{legendary,gogdl,nile}/_internal/Python.framework/Resources` | `Versions/Current/Resources` | **MISSING** (x3) |
| `{legendary,gogdl,nile}/_internal/Python.framework/Versions/Current` | `3.12` | **MISSING** (x3) |

**Mechanism:** Tauri's resource walk skips directory entries (`resources.rs`:176-179 — "Skip
directories"), and a symlink-to-DIRECTORY resolves to a directory, so it yields nothing. A
symlink-to-FILE resolves to a file and is copied by value. Identical under the old array form; only
the destination differed.

**Why it matters now and did not before:** under `["../build/bin/"]` the tree shipped to
`Contents/Resources/_up_/build/bin/`, which `publicDir` never read — the bundled runners were
unreachable, so their internal layout was moot. As of this plan they are reachable and will be
executed for the first time.

**Measured impact: NONE.** All four bundled runners were executed directly from the read-only
mounted DMG and all four succeeded — `legendary 0.21.0`, `gogdl 1.3.0`, `nile 1.2.0`,
`comet 0.2.0`, every one exit 0. The PyInstaller loader uses `_internal/Python`, which is present
as a real file; the missing links are the framework's cosmetic `Current`/`Resources` aliases.

**Watch for:** any future runner that resolves through `Python.framework/Versions/Current/...`, or
a `codesign`/notarisation step — a framework without its `Versions/Current` symlink is not a
structurally valid macOS framework and **signing may reject it**. Phase 34.9's macOS packaging work
is the natural owner.

**Status:** open, no current functional impact, measured rather than assumed.

## D-35-04-04 — `enrichmentFlows.test.ts` fails only under full-suite load

**Found during:** plan 35-04 gate runs, 2026-08-28.

`REQ-34.2-14 channel "getAnticheatInfo" ...` fails with `expect(response).toBeDefined()` receiving
`undefined` when the whole `Backend` project runs, and passes 41/41 when the suite runs alone. It
also passed in a full-project run that merely excluded `decompressPool.test.ts`. A frame-response
timing assertion, not a defect this plan introduced — none of 35-04's files is in the enrichment
path. New instance of MEMORY's `full-suite-run-manufactures-failures-under-load`.

**Status:** open, unowned. Recorded so a future run does not re-diagnose it from scratch.

## D-35-05-01 — RESOLVED 2026-08-29 (the prescribed method was corrected, not followed) — was BLOCKING: plan 35-05's prescribed swap carries a silent total-data-loss defect

**Found during:** plan 35-05, Task 2 pre-read. **Measured, not code-read** (probe script run
against the installed `conf@10.2.0`, in a scratchpad temp dir — the real store was never written).

Plan 35-05 Task 2 instructs: "add `cwd` to every options object … leave `name`,
`clearInvalidConfig` and every other existing option value **exactly as it is**."

`conf` has **no `name` option**. It reads `options.configName`. `electron-store@8.2.0`'s entire
value-add over `conf` is four lines of option translation (`node_modules/electron-store/index.js`
:51-69):

```js
options = {name: 'config', ...options}
if (options.cwd) { options.cwd = path.isAbsolute(options.cwd) ? options.cwd : path.join(defaultCwd, options.cwd) }
else { options.cwd = defaultCwd }          // defaultCwd = app.getPath('userData')
options.configName = options.name          // <-- the rename the plan does not mention
delete options.name
```

Measured consequences of following the plan literally:

| Probe | Options passed | `conf`'s resolved `.path` | Reads pre-existing value? |
|-------|----------------|---------------------------|---------------------------|
| 1 | `{cwd: <abs>, name: 'gogLibrary'}` | `<abs>/config.json` | **NO — `undefined`** |
| 2 | `{cwd: <abs>, configName: 'gogLibrary'}` | `<abs>/gogLibrary.json` | yes, incl. dot-notation |
| 3 | `{cwd: 'store_cache', …}` (the literal value all 5 sites pass) | **`<process.cwd()>/store_cache/…`** — i.e. the repo | n/a |

All five production construction sites pass `{cwd: 'store_cache', name: <filename>}`. So the
prescribed change produces **two independent silent relocations**, either of which is strictly
worse than the single one the plan was written to prevent:

1. **`name` is ignored** → every cache store collapses onto ONE file, `store_cache/config.json`.
   Measured blast radius on this machine's live profile: **24 distinct `store_cache/*.json`
   files** (`gog_library`, `steam_library`, `steam_metadata`, `humble_library`,
   `legendary_library`, `crossover_index`, …) all collapse to one, and every existing value
   reads back `undefined`.
2. **relative `cwd` resolves against `process.cwd()`**, not `userData` — `conf` does
   `path.resolve(options.cwd, …)`. Adding `cwd` "explicitly" does not fix this unless the value
   is made ABSOLUTE from `pathShim.getPath('userData')`.

**Correct fix** (not applied — see D-35-05-02 for why this plan stopped): a first-party shim
module over `conf` replicating electron-store's four translation lines, sourcing `defaultCwd`
from `pathShim.getPath('userData')` instead of `app.getPath('userData')`, plus fileStore's
WR-11 resolve+relative containment check carried forward as defence-in-depth.

**Verified NOT a problem:** `conf@10.2.0` keeps `.get(k, default)`, `.set`, `.has`, `.delete`,
`.clear`, `.store`, `Symbol.iterator`, dot-notation paths, `clearInvalidConfig`, `defaults` and
`accessPropertiesByDotNotation`. Prototype-pollution guard holds — `set('__proto__.polluted', …)`
left `({}).polluted === undefined` (dot-prop@6 `disallowedKeys`), so Phase 29 CR-01's concern is
satisfied by the library itself.

**Status:** open. This is an input correction for whoever re-runs 35-05, not a nicety.

## D-35-05-02 — RESOLVED 2026-08-29 (scope corrected to ~48 sites, operator-approved) — was BLOCKING: plan 35-05's site count is ~9, the real count is ~48

**Found during:** plan 35-05, scope enumeration.

The plan's `must_haves` assert "the scope is TEN sites … Nine land here". The measured scope of
removing `electron-store` from `package.json` is:

| Category | Count | Detail |
|---|---|---|
| Production construction sites | **5**, not 4 | plan misses `storeWriteHandlers.ts:364` (`storeNew`); the others are `electron_store.ts:63`, `cache.ts:35`, `handlers.ts:297`, `storeWriteHandlers.ts:92` |
| Production/type imports | 4 | `electron_store.ts:1`, `cache.ts:1`, `handlers.ts:73`, `common/types/electron_store.ts:1` |
| Hook + its docs | 2 | `installElectronHook.ts` (intercepts `electron` **as well as** `electron-store` — so case B applies: keep the file, delete only the `electron-store` branch), `bootstrap.ts` comment |
| **`jest.mock('electron-store', …)` test files** | **37** | not mentioned by the plan at all |
| **Manual mock** | 1 | `src/backend/__mocks__/electron-store.ts` — does `jest.requireActual('electron-store')`; hard-breaks the moment the package leaves `node_modules` |
| **Build config** | 1 | `package.json` `build:sidecar` carries `--external:electron-store` |
| **AST gate** | 1 | `sidecar/__tests__/externalDynamicImportGate.test.ts`'s `FORBIDDEN_DYNAMIC_IMPORT_MODULES = ['electron', 'electron-store']` |
| Doc comments naming it | ~30 | `storeChangeNotifier.ts`, `fileStore.ts`, `storePolicy.ts`, `humble/electronStores.ts`, … |

Consequences the plan's acceptance criteria do not survive:

- `grep -rln "electron-store" src/backend/ src/common/ | grep -v __tests__` **cannot** return
  nothing — `__mocks__/electron-store.ts` is not under a `__tests__` directory, and ~30
  non-test files reference the string in prose comments. The criterion was written from a grep
  of *import* sites only.
- The plan's verify step, `pnpm test --selectProjects Backend -- cache storeChangeNotifier`,
  runs **2 of the 37** affected suites. It is structurally incapable of detecting breakage in
  the other 35 — a fresh instance of MEMORY's `gate-failure-mechanisms` /
  `jest-selectprojects-is-case-sensitive-and-exits-zero`.

**The architectural fork the plan never contemplated:** those 37 suites currently do
`jest.mock('electron-store', () => ({__esModule: true, default: jest.requireActual('../fileStore').default}))`,
routing store construction at the sidecar's hand-rolled `fileStore.ts`. Once production stops
importing `electron-store`, every one of those mocks goes **inert** (MEMORY:
`per-suite-jest-mock-os-is-inert.md`, ~30 dead mocks last time). Whoever resumes must choose:

- **(A) Retire `fileStore.ts`** — sidecar runs real `conf`; repoint all 37 suites + delete
  `fileStore.test.ts`'s subject. Simplest end state, removes 450 lines of reimplementation, but
  changes the storage engine of the process that holds Steam/Humble credentials, and Phase 27
  T-27-03 / Phase 29 CR-01, WR-11, D-14, D-07 all attach to `fileStore.ts`.
- **(B) Keep `fileStore.ts` as the sidecar engine** behind the new first-party module; repoint
  the 37 mocks at the new specifier. Preserves every existing assertion, but leaves production
  (conf) and tests (fileStore) on different engines — a test/production divergence.

**Mitigating fact, measured:** `src/backend/jest.config.js` registers
`jest.setupContainment.ts` in `setupFiles` for the **entire** Backend project, redirecting
`os.homedir()` + `HOME`/`APPDATA`/`XDG_*` to a disposable per-run root. `pathShim`'s
`resolveAppDataDir()` goes through `homedir()`, so even a fully inert mock would write into the
containment root, **not** the developer's real profile. The `tests-clobbering-real-steam-store`
failure mode is structurally closed here. This lowers the severity of getting the fork wrong;
it does not remove the need to choose.

**Status:** RESOLVED 2026-08-29. Both D-35-05-01 and D-35-05-02 were raised as blockers, put to the
operator, and discharged: the prescribed method was corrected rather than followed, and the ~48-site
scope was approved to stay in 35-05. Plan 35-05 is COMPLETE. **Left in the ledger deliberately** —
the measurement (24 cache files collapsing onto one `config.json` inside the repo) is the reason
`store_backend.ts` exists, and deleting the record would leave that shim looking like
over-engineering to the next reader.

## D-35-05-03 — four stale `electron-store` log strings in `wine/manager/utils.ts`

**Found during:** plan 35-05, bundle verification.

`src/backend/wine/manager/utils.ts` emits four user-visible log/error strings of the form
`Can't find ${release.version} in electron-store -> wine-downloader-info.json!`. The package is
gone; the storage layer is now `backend/store_backend.ts` over `conf`. Cosmetic only — no
resolution or behaviour depends on the text — and out of plan 35-05's scope, so left alone.

Confirmed as the ONLY remaining `electron-store` mentions in the built sidecar bundle, alongside
one prose comment in `cache.ts`. Zero module references.

**Status:** open, unowned, no functional impact.

## D-35-05-04 — `electronUntouched.test.ts`'s docstring predates structural containment

**Found during:** plan 35-05, while re-pinning that file's sha256 (Gate 8).

Its module docstring states: *"`pathShim.ts` has no `HOME`/`XDG_CONFIG_HOME`/`APPDATA` override
for darwin, so `configStore` reads/writes the developer's REAL `~/Library/Application
Support/GameLib/steam_store/config.json`"*, and builds a "may run against real user data" safety
argument on top of it.

That premise is **no longer true**. Phase 34.2 gap cycle 3 (plan 34.2-19) added
`src/backend/jest.setupContainment.ts` to `src/backend/jest.config.js`'s `setupFiles` for the
ENTIRE Backend project, which redirects `os.homedir()` (and `node:os`'s, and `userInfo()`) plus
`HOME`/`USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`XDG_*` into a disposable per-test-file root. The
suite therefore does NOT reach real user data any more.

The file's actual assertions are unaffected — it still proves what it claims — so this is stale
narration, not a broken test. **Deliberately not fixed here:** the file is pinned by
`gameDetailsImportGate.test.ts` Gate 8, so any edit forces another re-pin, and plan 35-05 had
already consumed one re-pin for a one-line specifier change. Bundling an unrelated docstring
rewrite into that would muddy the audit trail the pin exists to protect.

**Fix when someone owns it:** correct the docstring and re-pin in the same commit, stating both
reasons.

**Status:** open, unowned.

## D-35-05-05 — REQUIRED ACTION FOR PLAN 35-16: remove the `electron-store` devDependency

**Filed 2026-08-29, immediately after plan 35-05.** Not a defect — a deliberate, temporary
retention with a named owner. It must not outlive 35-16.

Plan 35-05 removed `electron-store` from `dependencies` (REQ-35-03, correctly: nothing in the
backend imports it any more). But `src/preload/api/misc.ts:182` still holds the ONE remaining
consumer, deliberately deferred to plan 35-16:

```ts
export const storeNew = function (storeName, options) {
  if (isTauri()) { registerStore(storeName, options); return }
  const ElectronStore = require('electron-store') as typeof Store   // <-- Electron path only
```

**Why leaving it unresolvable was not acceptable.** `src/frontend/helpers/electronStores.ts:28`
calls `window.api.storeNew(...)`, and `src/frontend/index.tsx:14` records that this fires
**synchronously the moment the module is first imported**. On the Electron path that is a
`require` at app boot. The package resolved only because plan 35-05 ran
`pnpm install --lockfile-only` and never pruned `node_modules` — **the next clean install would
have broken `pnpm start` at startup**, silently, with no gate red anywhere.

That would violate the ordering property D-17 rests on: waves 1-7 are additive and BOTH shells
stay usable until `35-14`. It is why the D-18 A/B re-test ran in wave 1. Neither 35-05 nor 35-16 is
wrong on its own — the defect lives in the interval between them, which is the shape that survives
review.

**Resolution applied:** `electron-store@^8.2.0` re-added as a **devDependency**. The runtime
dependency is genuinely gone, which is REQ-35-03's substance; dev-only retention for a shell that
is deleted at 35-14 is honest rather than a dodge. Lockfile delta measured: **17 insertions,
additive only, identical integrity hash, `downloaded 0 / added 0`** — the exact bytes already
present. 148 tests across the 6 suites that read `package.json` re-run green.

**Plan 35-16 must, in the same commit that removes `misc.ts`'s lazy require:**
delete `"electron-store": "^8.2.0"` from `devDependencies` and refresh the lockfile.

**Note the asymmetry with `D-35-03-02`** (`vite` must be PROMOTED at 35-14). One dependency is
being added at a cutover point and one removed; both exist because a package's declaration and its
last consumer are being separated across plans. A plan that only reads its own `files_modified`
sees neither.

---

## D-35-11-01 — the EOS remove confirmation cannot be app-styled without moving a destructive gate across the IPC boundary (plan 35-11, Task 1, NOT DONE — needs a human decision)

**Status: DEFERRED, deliberately not attempted. This is the half of plan 35-11's Task 1 that was
not executed, and it is recorded here rather than silently dropped.**

Plan 35-11 asks for the EOS remove confirmation to "route through the app-styled dialog path". It
cannot, as the path exists today, and the blocker is structural rather than cosmetic:

- `eos_overlay.ts:161`'s `remove(): Promise<boolean>` **awaits** `dialog.showMessageBox` (imported
  from `'electron'`) and gates the destructive `legendary eos-overlay remove` on
  `response === 1`. The boolean is load-bearing twice: once inside the backend as the destructive
  gate, and again in the renderer at `AdvancedSettings/index.tsx:210`
  (`setEosOverlayInstalled(!result.value)`).
- The app-styled path, `showDialogBoxModalAuto` (`dialog/dialog.ts:8`), **returns `void`**. It is
  one-way: `sendFrontendMessage('showDialog', ...)`. A button's `onClick` does not survive the
  structured-clone hop, and the serializable replacement (`ButtonOptions.action`,
  `common/types.ts:48`) is a **closed enum with exactly one literal**, `'steamSignIn'`, resolved
  renderer-side in `DialogHandler`. There is no mechanism to return a user's choice to the backend.

So the migration requires one of two structural changes, both beyond a polish item:

1. **Move the gate to the renderer.** `AdvancedSettings/index.tsx` shows the confirmation using the
   existing house pattern (`showDialogModal` with real `onClick`s — see
   `AllowInstallationBrokenAnticheat.tsx:19`, same settings-surface family) and only calls
   `window.api.removeEosOverlay()` on confirm. Observable behaviour is identical, but the backend
   would then remove **unconditionally** whenever the channel is invoked — a trust-boundary change
   for a destructive filesystem operation, and it makes `remove()`'s documented `False` return
   branch unreachable. Plan 35-11's own constraint says the return contract must not change, and
   `T-35-45` names exactly this as a data-loss risk wearing a cosmetic diff.
2. **Add a request/response dialog channel.** A new IPC surface; clearly its own plan.

**Also relevant: the source todo's own prescription was not satisfied.**
`.planning/todos/pending/2026-08-24-eos-remove-dialog-renders-as-a-native-system-dialog-not-app-styled.md`
sets a three-step order — (1) decide which confirmations are legitimately OS-native across the ~14
native `showMessageBox` sites, (2) fix the in-app `Dialog` primitive, (3) only then migrate
callers. **Step 2 has since landed** (quick task `260820-kq0` round 3 added `StyledPaper` in
`Dialog.tsx:49`, so the primitive is genuinely styled and the "dead stylesheet" trap no longer
applies). **Step 1 has not.** The todo is explicit that fixing only the EOS site "narrows the
inconsistency without resolving it".

**Correction to plan 35-11's own framing, recorded so it is not re-derived wrongly.** The plan's
`must_haves` says the two dialogs should become "consistent with the ~14 other dialogs that already
use the app pattern". The ~14 census in the source todo is the count of **native** `showMessageBox`
call sites — the ones that do NOT use the app pattern, of which EOS is one. The app-styled
population is the ~25 `Dialog` consumers. The plan inverted the two.

**What a future plan needs to decide:** whether a settings-surface destructive confirmation may be
gated renderer-side. That is the single question blocking this item.

**Why this entry exists at all, and what it stops from going wrong.** `REQ-35-17` is satisfied on the path-rejection dialog and **NOT** on EOS. Without this item written down here, the requirement reads as discharged.

**Status:** open, unowned. Does not block D-16.

## D-35-11-02 — one `type: 'ERROR'` dialog carries a "Warning" title (plan 35-11, out of scope)

`installFlowRegistration.ts:463` raises `box.warning.title` ("Warning") /
`box.warning.epic.import` with `type: 'ERROR'`, so a warning renders under the red "Error:"
content header. Pre-existing, untouched by plan 35-11, and not caused by its CSS change. Noted
only because plan 35-11 read every `showDialogBoxModalAuto` call site in that file while
identifying the two path-rejection ones (`:319` move, `:442` import).

## D-35-12-01 — the Heroic Flatpak application id survives D-11 in a Steam shortcut, not in a manifest

**Found during:** plan 35-12, the post-deletion reference sweep.

`src/backend/shortcuts/nonesteamgame/nonesteamgame.ts` still writes Heroic's Flatpak
application id when adding a game to Steam as a non-Steam shortcut:

```ts
if (isFlatpak) {
  newEntry.Exe = `"flatpak"`                                    // :262
}
// ...
if (isFlatpak) {
  newEntry.LaunchOptions = `run com.heroicgameslauncher.hgl ${newEntry.LaunchOptions}`  // :302
}
```

**Why plan 35-12 did not fix it.** The plan's `files_modified` is `package.json`, `flatpak/`,
`flathub/`, `.github/workflows/` and the new `meta/` test. This is a `src/backend/` runtime path,
and removing the branch is a behaviour change rather than a deletion of dead packaging machinery.
Scope boundary applied; logged rather than fixed.

**Why it matters anyway.** Plan 35-12's own threat register entry `T-35-52` (Spoofing) says the
`com.heroicgameslauncher.hgl` identity is handled because "the whole identity is deleted rather
than renamed". That is true **for the distribution manifests**, which are gone. It is not true for
this call site, which the mitigation text did not consider. The register's wording asserts a
completeness it does not have — the same shape as MEMORY.md's
`threat-mitigation-text-can-assert-false-parity`.

**The concrete consequence.** D-11 means GameLib is never distributed as
`com.heroicgameslauncher.hgl`. So if `isFlatpak` is ever true (it is derived from the presence of
`/.flatpak-info`, not from the app id), this code writes a Steam shortcut that runs
`flatpak run com.heroicgameslauncher.hgl "gamelib://launch?..."` — i.e. it asks Flatpak to launch
**Heroic**, passing it a GameLib deep link. The shortcut either fails (Heroic not installed) or
hands the URL to a different application.

**What a future plan needs to decide:** whether the `isFlatpak` branches in this file are simply
dead once D-11 lands and should be deleted, or whether GameLib intends to support *running under*
someone else's Flatpak runtime. Deleting them is the D-11-consistent reading; it was not this
plan's call to make.

**Scoping note, folded in from a duplicate entry (see the convention note at the top of this file).** ~119 further `flatpak` references survive across the tree, but they are a **different concern** — runtime detection of a Flatpak *host* (`isFlatpak`, `flatpakHome`, `flatpakRuntimeVersion`, and `flatpakSteamPath`, which detects the user's **Steam** installed as a Flatpak). Those are legitimate and were correctly left alone. Only the publishing-identity use is in question.

**Status:** open, unowned. Behaviour change, outside 35-12's `files_modified`, so logged not fixed.

## D-35-08-01 — plan 35-08's Task 1 acceptance criteria contradict its own `key_links`; two are UNMET BY DESIGN

**Found during:** plan 35-08 execution. **Status:** not a defect in the code. This entry exists so a
later verifier scoring 35-08's acceptance criteria does not "close" it by adding dead code.

Plan 35-08 names two mutually exclusive transports for the same commands.

**Task 1's acceptance criteria** require `generate_handler!` registration, explicitly:

```
- `grep -c 'wake_lock_start\|wake_lock_stop' src-tauri/src/main.rs` is at least `4`
  (two definitions + two `generate_handler!` entries).
- `grep -A8 'generate_handler!' src-tauri/src/main.rs | grep -c 'wake_lock'` is at least `2`.
```

**The same plan's `must_haves.key_links`, and all of Task 2**, require the opposite:

```yaml
from: "src/backend/sidecar/electronStub.ts powerSaveBlocker"
to:   "the Rust wake-lock command"
via:  "requestRustInvoke, mirroring clipboard.writeText's RUST_CLIPBOARD_WRITE_TEXT forwarding"
```

These are different transports. `generate_handler!` is the **renderer's** surface — it holds exactly
four relay commands (`sidecar_invoke`, `sidecar_send`, `open_external`, `sidecar_store_snapshot`).
`requestRustInvoke` routes to **`dispatch_rust_channel`**, which is where every comparable arm
already lives. Verified rather than assumed: the plan's own named exemplar, `clipboard.writeText` /
`RUST_CLIPBOARD_WRITE_TEXT`, is a `dispatch_rust_channel` arm (`main.rs:1224`, `:1238`) and appears
nowhere in `generate_handler!`.

**Why satisfying the criteria literally would be worse than failing them.** Handler-only
registration means the sidecar's calls never arrive at all — the seam would be dead. Registering in
both places adds unreachable code AND hands the webview a power-management capability: app-defined
`invoke_handler` commands require no capability permission (see the reasoning already written into
`capabilities/default.json`), so a `generate_handler!` entry is directly reachable from renderer
JavaScript, including the untrusted remote content that capability's scope warns about. That is
against D-02's zero-renderer-grant stance and the same refusal `dialog:allow-open` and
`deep-link:default` received.

**Disposition:** the executor implemented the architecture and left both criteria unmet, reporting
rather than improvising. Confirmed correct by the orchestrator. **A future verifier should score
these two criteria as SUPERSEDED, not FAILED, and must not add `generate_handler!` entries.** The
substance behind them — that both commands exist and are reachable from the JS side — is met and
covered by `wakeLock.test.ts` plus the `dispatch_rust_channel` arms at `main.rs:6385` and `:6396`.

Same shape as the 35-07 finding where an existing gate outlawed more than its decision did: a
mechanically-checkable criterion encoding a wrong assumption about which surface a call arrives on.

## D-35-09-01 — BLOCKING: plan 35-09's mechanism is BANNED IN SOURCE, and its premise is STALE

**Found during:** plan 35-09 execution, 2026-08-29. The executor **stopped and built nothing** —
tree clean, no commits, no SUMMARY (writing one would have been a false record). Every claim below
was independently re-verified by the orchestrator before this entry was written.

**Status: BLOCKING. 35-09 needs re-planning. 35-13 (wave 7) depends on 35-09 and is blocked with
it.** 35-10 does not depend on either and proceeds.

### 1. The prescribed mechanism is prohibited, in-source, three times

Plan 35-09 requires `Webview::clear_all_browsing_data()`. `src-tauri/src/main.rs` forbids it:

| Site | Text |
|---|---|
| `:2066` | ``clear_all_browsing_data()` MUST NOT appear anywhere in this file` |
| `:5742` | `D-08 is non-negotiable on every platform: never clear_all_browsing_data()` |
| `:6237` | `never-clear_all_browsing_data() discipline` |

`REQUIREMENTS.md:691`, **REQ-34.4.1-06, a CLOSED `[x]` requirement**, states the rule and the harm:

> **Domain-scoped, NEVER blanket wipe** — the same jar will hold Epic/GOG/Amazon cookies once 34.5
> lands, and `clear_all_browsing_data()` would silently sign the user out of storefronts they never
> touched. Research established **no one-shot "clear domain X" API**: shape `cookies()` + suffix
> filter + loop per-cookie `delete_cookie()`.

Seven prior plans (34.4.1-01/-06/-15/-21/-22/-23, 34.5-06) carried acceptance criteria pinning this
to **0 occurrences**. It is mitigation text for T-34.4.1-03/-30/-66/-93/-99 and T-34.5-20.

**Measured blast radius:** the shared jar holds **62 live cookies** — Humble 19+1+1, Amazon 8+2,
GOG 3+2, Epic 6. A blanket wipe on Epic logout destroys every other authenticated storefront
session, including Humble's `_simpleauth_sess`. Plan 35-09's `must_haves` frames this as "accepted
coarseness"; REQ-34.4.1-06 had already rejected it *as the harm*.

### 2. It could not have discharged the 34.6 Step 8 FAIL it exists to close

`34.6-LIVE-GATE.md:1324` states Step 8's bar: `clearEpicCookies` removes Epic-domain cookies
**without** removing other domains' — scored by identity. The fixture is a named non-Epic
`.gog.com` cookie that must **SURVIVE**. A blanket wipe removes it. **The plan's success criterion
is unreachable via the plan's own mechanism.**

**And the gate would not have caught that.** Task 3's steps 1–7 never check the survivor clause —
they only ask whether re-login requires credentials, which a blanket wipe passes trivially. Task 3's
acceptance criteria are **strictly weaker than the D-13 bar they claim to re-run**. A gate written
to close a failure, that scores the regression as PASS.

### 3. The premise is stale — the described defect was already fixed

`35-AB-RETEST.md` Item 7 — which the plan's own Task 2 `read_first` names — records the Tauri leg as
**"THE RECORDED SYMPTOM DID NOT REPRODUCE."** The lying self-report is fixed: `cleared 9
epicgames.com cookie(s) (measured post-removal delta)`, and an independent structured binarycookies
parse confirms `EPIC_SESSION_AP` **ABSENT**. (That measurement discarded a `strings(1)` reading as
unsound first — a binary jar retains tombstoned bytes, so a name appearing in the file is not
evidence of a live cookie.) 34.4.1 plan 23 already built what Task 1 asks to invent:
`legendary/user.ts:137-222` forks on `getLoginWindowSeam()` and runs domain-scoped
`clearEpicCookies` + `clearEpicStorage` with the post-removal re-read.

### 4. The REAL open defect, which is a different one

The domain-scoped clear is **INCOMPLETE**, not absent. Live survivors after an Epic logout:

- on `epicgames.com` suffixes: `EPIC_LOGIN_ID` (96), `_tald` (36), `_epicSID` (32), `EPIC_DEVICE`
  (32), `__cf_bm` on `.www.` and on `.ecosec.on.` — **6 total**;
- on **Epic-owned domains an `epicgames.com` suffix filter cannot match by construction**:
  `EPIC_DEVICE` on `.fortnite.com`, `.twinmotion.com`, `.unrealengine.com`, `.metahuman.com`.
  `EPIC_COOKIE_HOST = 'epicgames.com'` (`legendary/user.ts:24`).

Separately and genuinely correct in plan 35-09: a `deleted === 0` outcome should FAIL the logout.
Today `legendary/user.ts` swallows every wipe step into
`logWarning('... failed (continuing)')`.

### 5. Where the defect entered, so it is not re-derived

Not the plan's invention. `35-CONTEXT.md:126` **D-09** prescribes "DELETING THE WEBVIEW DATA
DIRECTORY, not by clearing cookies", and `35-RESEARCH.md:45` says "Use `clear_all_browsing_data()`
as D-09's concrete implementation." **Neither cites the in-source ban or REQ-34.4.1-06.** Three
documents deep, and the plan inherited it faithfully. Re-planning 35-09 without correcting D-09
itself will reproduce this.

### 6. Two secondary conflicts, both already-known shapes

- Task 1's `generate_handler!` acceptance criterion is wrong for the same reason as
  `D-35-08-01` — every comparable arm lives in `dispatch_rust_channel`.
- The `capabilities/default.json` grant must **not** be added.
  `webview:allow-clear-all-browsing-data` in a capability scoped `"windows": ["main"]`, where
  untrusted remote content renders, would hand that content a one-call wipe of every storefront
  session. Same refusal as `dialog:allow-open` and `deep-link:default`.

**Open decision for the operator:** which Epic-owned domains belong in the clear's filter. That is a
scope decision, not an implementation detail, which is why the executor did not improvise one.

### OPERATOR DECISION 2026-08-29 — option (a), apex domain list

**Decision:** extend the Epic cookie clear from the single `epicgames.com` suffix to an explicit
list of Epic-owned apex domains — `epicgames.com`, `fortnite.com`, `unrealengine.com`,
`twinmotion.com`, `metahuman.com` — keeping `cookie_domain_matches` and the existing post-removal
re-read. `clear_all_browsing_data()` stays banned. Accepted cost: the list can go stale if Epic
adds a domain, which is preferable to a filter that cannot match by construction.

**Also decided, and endorsed by the executor as the one genuinely correct requirement in the
original plan:** a `deleted === 0` outcome must FAIL the logout. Today
`legendary/user.ts` swallows every wipe step into `logWarning('... failed (continuing)')`, which is
the defect class that produced the original lying report.

### Measured design constraints for the re-plan — a naive loop DOES NOT WORK

Verified at source 2026-08-29, before any re-plan was written. **A plan that just loops
`seam.clearCookies(label, host)` over five domains will FAIL on four of them, on macOS.**

`seam.clearCookies(label, host)` takes ONE host, so looping is the right TS shape. But the Rust arm
`humble_login_clear_cookies` (`main.rs:5747`) carries a **macOS-only Epic fallback** at `:5769`:

```rust
#[cfg(target_os = "macos")]
if existing_window.is_none() && cookie_domain_matches(domain, Some(EPIC_COOKIE_DOMAIN)) {
    return clear_default_data_store_cookies_for_domain(app, domain);
}
let window = existing_window.ok_or_else(|| format!("humble_login:no-window:{label}"))?;
```

`EPIC_COOKIE_DOMAIN` (`main.rs:3167`) is the single literal `"epicgames.com"`. Epic's login window
is opened by `open_pristine_epic_login_window`, which **never registers a Tauri-managed
`WebviewWindow`**, so `existing_window` is structurally always `None` on that path. Passing
`fortnite.com` therefore fails the domain guard and falls straight through to the
`humble_login:no-window:{label}` error. The four sibling domains would return errors, not clears.

**So the re-plan needs, at minimum:**

1. **Rust.** `EPIC_COOKIE_DOMAIN` becomes a SET, and the `:5770` guard matches any member. Note the
   constant's doc comment at `:3161` currently asserts it is *"the only value that arm's
   `clearEpicCookies` step ever passes as `domain`"* — that becomes FALSE on this change and must be
   rewritten, not left. Same shape as `D-35-04-01`, a doc comment surviving into a falsehood.
2. **The guard must stay narrow for every other caller.** Its comment records that Humble/GOG/Amazon
   all fail the domain check and fall through unchanged. Widening the set must not widen it to them
   — that property needs a test, not a reading.
3. **`main.rs:9913`'s source gate** enumerates `humble_login_clear_cookies` call sites as an EXACT
   structural (arm, guard) set, deliberately so a site can neither migrate nor lose its guard
   silently. Any change here moves that gate; re-derive it rather than re-pinning it blind.
4. **TS.** `EPIC_COOKIE_HOST` (`legendary/user.ts:24`) becomes the list; sum the per-domain deltas;
   `deleted === 0` across ALL domains fails the logout.
5. **Cookies only for the siblings.** The storage clear (`clearEpicStorage`) is origin-scoped by
   construction — it runs JS inside the target page's own origin, which is exactly what keeps it
   from touching another storefront. `EPIC_DEVICE` on the sibling domains is a COOKIE, so no
   per-origin storage window is needed for them. Do not add one.

**Sequencing:** this touches `src-tauri/src/main.rs`, so it cannot run concurrently with plan 35-10,
which holds the same file.

## D-35-10-01 — TIME-CRITICAL, DEADLINE WAVE 8: `uncaughtException` has no sidecar equivalent and dies at 35-14

**Found during:** plan 35-10. The executor flagged, without checking, that nobody had swept
`main.ts` for *other* module-scope side effects that never made the jump to the sidecar — it ported
one (`installed.json`), and there might be siblings. The orchestrator ran that sweep. **There is
exactly one, and it is load-bearing.**

**Deadline: this must be resolved BEFORE plan 35-14 (wave 8), which deletes `src/backend/main.ts`
permanently.** After that the handler is unrecoverable without rewriting it from scratch.

### The sweep result, stated in both directions

`setInterval` in `main.ts`: **0 occurrences.** The `.on(` hits are Electron `mainWindow`/`app`
lifecycle events (`maximize`, `close`, `will-navigate`, `window-all-closed`, `before-quit`,
`open-url`, `second-instance`) — all genuinely shell-level, all already owned by the Rust shell or
by plan 35-07's deep-link work. Those are **not** gaps, and recording that is the point of a
two-directional sweep.

**The one real gap is `process.on('uncaughtException')` at `main.ts:618`.**

```js
// Maybe this can help with white screens
process.on('uncaughtException', async (err) => {
  logError(err, LogPrefix.Backend)
  if (process.env.CI === 'e2e') return
  showDialogBoxModalAuto({ title: ..., message: ..., type: 'ERROR' })
})
```

### Why it is not already covered

`src/backend/sidecar/processGuards.ts` installs a process-level **`unhandledRejection`** guard
(Phase 34.4.1 plan 09) and is careful to describe itself as defence-in-depth. It does **not** install
`uncaughtException`, and those catch different things: a rejected promise with no `.catch()` versus
a thrown synchronous exception. `grep -rn uncaughtException src/` returns exactly two hits — the
handler itself, and a comment.

### The comment is the proof it is load-bearing

`src/backend/logger/index.ts:151` exists *because* the handler does, and documents its behaviour:

> Add a basic error handler to our stdout/stderr. If we don't do this, the main
> `process.on('uncaughtException', ...)` handler catches them (**and presents an error message to
> the user**, which is hardly necessary for "just" failing to write to the streams)

So a piece of live code is written around a handler that is about to be deleted, and its comment
will survive into a falsehood — the same shape as `D-35-04-01` and the `EPIC_COOKIE_DOMAIN` doc
comment named in `D-35-09-01`.

### Consequence if it ships as-is

Under Electron an uncaught synchronous throw in backend code is logged with `LogPrefix.Backend` and
raised to the user as an error dialog. Under Tauri, after 35-14, the same throw reaches a Node
process with no handler: **the sidecar dies, and `console.*` in the sidecar is captured nowhere at
all** (see the A/B document's own sink table). The observable is the app going dead with nothing in
either log sink — which is precisely the "white screens" failure the handler's own comment says it
was added to help with.

### What a fix owes

Not a verbatim port. `showDialogBoxModalAuto` still works from the sidecar, but the `CI === 'e2e'`
guard is Electron-harness-specific (plan 35-01's census established that harness is Electron-only
and does not survive this phase), so its intent needs carrying forward rather than its letter.
Install alongside the existing `unhandledRejection` guard in `processGuards.ts`, which already has
the idempotence flag, the log-only discipline and the tests.

**Status:** open, unowned, **deadline wave 8**.

## D-35-09-02 — a FAILED Epic cookie clear is invisible to the user; T-35-39 is logged, not mitigated

**Found during:** orchestrator verification of plan 35-09 Task 2, 2026-08-29. **The code is
correct** — this is a gap in how far the fix reaches, not a defect in what it does. Raised before
the Task 3 live gate so an operator does not discover it by burning a run.

`T-35-39`'s mitigation text says a clear that removes nothing must reject "rather than
warning-and-continuing, so the failure is unobservable" is closed. It is now observable **in
`gamelib.log`**. It is not observable **to the person logging out.**

**The full failure path, traced:**

1. `legendary/user.ts` throws with a per-domain breakdown → `gamelib.log`. Good.
2. `ipcMain.handle('logoutLegendary')` rejects → `window.api.logoutLegendary()` rejects.
3. `GlobalState.epicLogout`'s `try/finally` does not swallow — correct — and rethrows.
4. `Runner/index.tsx:44`'s `handleLogout` catches it and calls **`console.error`**.
5. **Under Tauri, renderer `console.*` is visible only in the WKWebView inspector.** It reaches
   neither `gamelib.log` nor the terminal `[shell]` sink (see `35-AB-RETEST.md`'s sink table).
6. Meanwhile `epicLogout`'s inner `.finally` has already cleared the Epic library state, and
   `handleLogout`'s `finally` recovers the button.

`grep -n 'showDialogBoxModalAuto\|notify\|sendFrontendMessage' src/backend/storeManagers/legendary/user.ts`
returns **nothing**.

**So a failed, security-relevant clear looks exactly like a successful one:** library empties, button
returns to normal, no message anywhere the user will ever look. The threat's stated harm — "the next
user of a shared machine opens the login window already authenticated" — is not prevented by a log
line nobody reads.

**Why this was NOT fixed inline, deliberately.** The obvious fix is a dialog or notification from the
backend, and that is not trivially safe here: this project has a recorded incident
(`sidecar-dialog-reject-crashes`) where a rejecting dialog call crashed the sidecar, and
`processGuards.ts`'s own governing rule is that "a fix that introduces a NEW throw/reject/exit path
is worse than the bug it fixes". Adding a user-facing surface on a path that is *already* handling a
failure needs its own care, not an opportunistic line.

**Options for the operator:**

- **(a) Toast/notification on logout failure.** Cheapest visible signal. Must not itself be able to
  reject into the failing path.
- **(b) Leave the user signed-IN on a failed clear** — i.e. do not clear `epic` library state when
  the logout rejects, so the UI honestly reflects that logout did not complete. Arguably the most
  correct, and the largest behaviour change.
- **(c) Accept it and say so in the release notes** — the failure is recorded in `gamelib.log`,
  which is what the diagnostics bundle collects.

**Interaction with Task 3, and it matters:** the gate's step 4 says "note exactly what the UI told
you". On a PASSING run the UI says nothing and that is fine. This entry exists so that if the run
FAILS, the operator is not misled by a UI that looks identical either way — read the log, not the
screen.

**Also flagged by the executor and worth keeping beside this:** a logout against an already-empty
jar now legitimately measures zero and therefore fails. That is the operator decision working as
decided, but it is a real edge — a user who logs out twice in a row sees the second one fail.

**Status:** open, unowned. Does not block Task 3.

### D-35-10-01 CLOSED 2026-08-29 — plus a regression the closing work uncovered

**Closed by `b26e3a61a`.** `installUncaughtExceptionGuard()` sits beside its `unhandledRejection`
sibling in `processGuards.ts`, installed from the same first-import position, log-and-continue,
both halves separately wrapped, stderr only, with its own late-bound sink bound to **`logError`**
not `logWarning` — a shared sink would have silently demoted every uncaught exception to a warning.
`logger/index.ts`'s comment now names what actually catches. 12 RED-proof mutations, all reverted.

**Two things from the Electron original were deliberately NOT ported**, both argued rather than
skipped:

- **The dialog.** `showDialogBoxModalAuto` cannot be reached without breaking the WR-04
  zero-static-imports invariant — `backend/dialog/dialog.ts` pulls in `logger`/`electron`/
  `main_window`/`ipc` — so it would need a THIRD late-bound sink, `null` for the whole early-boot
  window, i.e. absent exactly when a white screen happens. It also pushes a frame over the RPC
  transport and fires an un-awaited `showErrorBox` promise on failure: a transport-dependent,
  promise-producing, user-facing call inside a handler already processing a crash, which is the
  literal `sidecar-dialog-reject-crashes` shape. Left out, and said so in the guard's doc comment.
- **`CI === 'e2e'`.** It only ever skipped the error BOX; `logError` ran above it. With no dialog
  there is no blocking surface to suppress, so the branch is dead rather than ported mechanically.

**The `IN-06` exit-listener ceiling moved 20 -> 32, and it is legitimate.** It went RED first at
`Expected: < 20, Received: 23` — the detector doing its job — and was re-measured, not raised on
suspicion. 23 measured against a ceiling of 32 is nine `isolateModules` calls of headroom, the same
margin the original 12-against-20 measurement chose. The RED-proof also established the test is
**VACUOUS under `-t` filtering** (the listeners come from the other tests' nine `isolateModules`
calls), proven both ways: ceiling 3 with a filter passes; ceiling 3 on the full file fails at 12.

---

## D-35-10-02 — RESOLVED SAME DAY: the `installed.json` watcher hung the sidecar, and its only gate ran nowhere

**Found by acting on the closing recommendation to run `pnpm smoke:sidecar`.** It came back RED.
Bisected rather than attributed: the gate FAILS on the tree with plan 35-10's watcher wired in and
PASSES with it removed, everything else identical.

`watch(target, ...)` (`installedJsonWatcher.ts:91`) had no `unref()`. An `FSWatcher` is a libuv
handle and references the event loop, so the sidecar started, served, then **hung forever on stdin
EOF instead of exiting 0**. The shell's `shutdown_child()` would then have to SIGKILL it, and any
path that misses that kill leaves an orphan holding an authenticated session — the hazard
`RunEvent::Exit`'s own comment describes.

**Nothing in the toolchain could have caught it.** The call site is guarded by `JEST_WORKER_ID`, so
jest never exercises the live path; `pnpm build:sidecar` exits 0 because the bundle builds fine, it
just cannot exit; `tsc` has nothing to say. 9 watcher tests and 4362 backend tests were green
throughout.

**The more important half: `smoke:sidecar` ran in NO GATE** — not CI, not `.husky`. It existed only
as a manual `package.json` script, which is why this survived a day undetected, and why the
2026-08-23 boot-order regression class had no live guard at all. **A gate that is wired nowhere is
worse than no gate, because its existence implies coverage it is not providing.** It is now a step
in `test.yml`'s `ci` job. Fixed in `ef77e4a1e`.

## D-35-13-01 — REQUIRED READING FOR PLAN 35-15: the `Tray` stub has no `setImage`, and `tray_icon.ts` calls it

**Found during:** plan 35-13, Task 2, while reading consuming sites for the type declarations.
**Owner:** plan 35-15 (the 67-file specifier rewrite). Not fixed here — plan 35-13's constraints
forbid behaviour changes inside the move.

`src/backend/platform/index.ts`'s `Tray` class exports exactly four members: the constructor,
`setToolTip()`, `setContextMenu()` and `on()`. It has **no `setImage`**.
`src/backend/tray_icon/tray_icon.ts:54` calls `appIcon.setImage(getIcon(process.platform))`.

**Why this is inert today.** `tray_icon.ts:1` imports `Tray` from `'electron'`, so under `tsc` the
name resolves to real electron's `Tray`, which does have `setImage` — it compiles. At runtime under
Tauri the Rust tray at `src-tauri/src/main.rs` is what actually ships (D-06 is a delta over an
existing tray, not a build), so this TypeScript path does not execute.

**What happens at 35-15.** The moment that import is repointed to `backend/platform`, `Tray`
becomes the stub class and line 54 becomes a **TS2339 compile error**. That is loud, not silent,
which is the good case — but the failure mode to avoid is an executor "fixing" the mechanical sweep
by DELETING the `setImage` call. That would silently drop tray icon updates if the TypeScript tray
is ever revived, and it would look like a legitimate part of a 67-file rewrite.

**Correct fix when 35-15 reaches it:** add `setImage(): void {}` to the stub class, matching how the
other three no-op members are already declared. Do not delete the call site.

## D-35-13-02 — REQUIRED READING FOR PLAN 35-16: `extra-mock-function.ts` AUGMENTS the ambient `Electron` namespace and cannot be rewritten mechanically

**Found during:** plan 35-13, Task 2.
**Owner:** plan 35-16.

`src/common/typedefs/extra-mock-function.ts` contains:

```ts
declare global {
  namespace Electron {
    interface BrowserWindow { options: Electron.BrowserWindowConstructorOptions }
    namespace BrowserWindow { function setAllWindows(...): void }
    interface Tray { menu: Electron.MenuItemConstructorOptions[] }
  }
}
```

This file **does not consume** the ambient `Electron` namespace — it **declares into** it, adding
test-only members to electron's own interfaces via declaration merging. D-03's mechanical
`Electron.X` → `X` rewrite is therefore wrong here in both directions: there is no first-party
namespace to merge into, and the members it adds exist to satisfy test code that reaches them
through electron's types.

Plan 35-16 must treat this file as its own decision, not as one of the 32 namespace-reference
sites. It is the one file where the rewrite changes what the declaration MEANS rather than only
where it points.

## D-35-13-03 — CORRECTION TO PLAN 35-15's PREMISE: `BrowserWindow` cannot be re-exported from `backend/platform`, so the rewrite is not one string per site

**Found during:** plan 35-13, Task 2 — measured, not predicted (`TS2323`).
**Owner:** plan 35-15.

`src/backend/platform/index.ts` already exports `BrowserWindow` as a **value** (a plain `const`
object carrying `getAllWindows`). It is not a class, so it contributes no type meaning. Adding
`export type { BrowserWindow } from './types'` alongside it fails with
**`TS2323: Cannot redeclare exported variable`**.

19 of the 20 declared types re-export from `backend/platform` normally. `BrowserWindow` does not.
Its consumer — `src/backend/utils/openDialog.ts:20`, `import type { BrowserWindow, OpenDialogOptions }
from 'electron'` — must be split at 35-15: `OpenDialogOptions` from `backend/platform`, and
`BrowserWindow` from **`backend/platform/types`**.

`35-13-PLAN.md`'s success criterion says the rewrite "stays a one-string change per site." That
holds for every site except this one. Plan 35-15 should not assume a uniform sed.

## D-35-08-02 — a running game ALSO holds a system-sleep assertion, mislabelled as a download

**Found during:** plan 35-08 Task 3, the live wake-lock gate (`35-08-LIVE-GATE.md`, F-35-08-A).
**Status:** open, unowned. Real user-visible behaviour, reproduced 3 of 3 game launches.
**Not a defect in 35-08's own code** — the Rust arms and the `powerSaveBlocker` stub each took
exactly the kind they were asked for. The wrong kind was *requested* by an inherited caller.

Observed on macOS with `pmset -g assertions`: every game launch takes a
`PreventUserIdleSystemSleep` assertion named `"GameLib: a download is in progress"` alongside the
correct `PreventUserIdleDisplaySleep`, and holds it for the entire play session. No download is
running.

**Mechanism** (traced in source, not inferred from the symptom):

1. `src/frontend/state/GlobalState.tsx:1633` — `allowedPendingOps` contains BOTH `'launching'`
   and `'playing'`.
2. A launch passes through status `'launching'` first, so `pendingOps` is 1 while `playing` is
   still `false` → `window.api.lock(false)`.
3. `src/backend/sidecar/appShellFlowRegistration.ts:300-302` — the `!playing && !isSleepBlocked`
   branch fires → `powerSaveBlocker.start('prevent-app-suspension')`.
4. Status then becomes `'playing'` → `lock(true)` → the display assertion is taken, correctly.
5. The system assertion is never released, because `unlock()` only fires once `pendingOps` hits
   0 — which is when the game exits.

**Why this was invisible until now.** The block at `appShellFlowRegistration.ts` mirrors Heroic's
`main.ts:618-631`, so the same sequence exists upstream. Under Phase 33's D-08 no-op stub the call
held nothing, so a wrong `kind` had no observable consequence. Plan 35-08 made the assertions real
and thereby made a latent caller bug live. This is the `upstream-port-verbatim-ships-silent-defects`
shape: the port was faithful and the defect came with it.

**Why it matters rather than being cosmetic.** It defeats plan 35-08's own `success_criteria` —
*"A game running keeps the display awake; a download running keeps the system awake; neither keeps
the other awake."* It is also a real power regression: playing a game now blocks system idle sleep
for the whole session, which is exactly the class of battery drain T-35-31 was written about, and
the label a user sees in `pmset` / Activity Monitor names a download that does not exist.

**What a fix has to decide (NOT this plan's call).** The narrow fix is to stop taking the
app-suspension lock for the `'launching'`/`'playing'` statuses, since those are covered by the
display lock. But `allowedPendingOps` is one list serving two different questions — "is an
operation pending?" and "which sleep kind should that operation block?" — and those have come
apart. Whoever fixes it should split the two rather than special-case one status, and should note
that `launcher.ts:190` already takes its own display lock independently of this path.

**Secondary note, unexplained and deliberately left so.** Two of the three launches took TWO
display assertions with distinct ids; one took a single one. Two is the expected count — both
`launcher.ts:190` and `appShellFlowRegistration.ts:305` take a display lock on a launch. All were
released, so this is duplication and not a leak, but the single-display launch at 18:45:58 has no
established cause and no cause is invented here.
