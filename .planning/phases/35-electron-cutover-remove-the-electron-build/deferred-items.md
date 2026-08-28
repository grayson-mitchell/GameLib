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
