---
phase: 35-electron-cutover-remove-the-electron-build
plan: 05
subsystem: persistence
tags: [electron-store, conf, store-backend, pathShim, containment, D-04, D-03]

# Dependency graph
requires: [35-01]
provides:
  - "`electron-store` is gone from package.json, pnpm-lock.yaml and every import site in src/ — the last third-party runtime `require('electron')` in the tree"
  - "`src/backend/store_backend.ts`: first-party shim over conf@10.2.0 owning electron-store's option translation (name->configName, relative cwd -> join(userData, cwd)) with cwd sourced from pathShim.getPath('userData')"
  - "CORRECTION to plan 35-05's own Task 2: its prescribed method ('add cwd, leave name exactly as it is') was measured to cause total silent data loss and must not be followed"
  - "Store path parity gate (cache.test.ts): 24 cache stores resolve to distinct files under <userData>/store_cache/, proven non-vacuous against the naive passthrough"
  - "WR-11 containment carried forward from fileStore.ts, split into two anchors (cwd always; userData only for relative cwd) because Electron's app.getPath('userData') is not string-identical to pathShim's"
  - "installElectronHook.ts intercepts ONLY 'electron' now — case B applied, file survives for plan 35-18"
  - "Measured scope correction: ~48 sites, not the plan's 9-10 (37 test mocks, a manual mock, build:sidecar's --external, an AST gate)"
affects: [35-16, 35-18]

# Tech tracking
tech-stack:
  added: ["conf@^10.2.0 (promoted from transitive to direct; identical resolved version, zero supply-chain delta)"]
  removed: ["electron-store@^8.2.0"]
  patterns:
    - "First-party shim module owning a removed wrapper's option translation, so 5 call sites keep passing the option names they always passed"
    - "Non-vacuity test that reproduces the WRONG implementation inline and asserts it does the specific damage, run from a disposable cwd because the wrong implementation litters"
    - "Containment anchored to the value the caller supplied (cwd) rather than a globally-derived root, when two derivations of that root are not string-identical"
key-files:
  created:
    - src/backend/store_backend.ts
  renamed:
    - "src/backend/__mocks__/electron-store.ts -> src/backend/__mocks__/store_backend.ts"
  modified:
    - src/backend/electron_store.ts
    - src/backend/cache.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/storeWriteHandlers.ts
    - src/backend/sidecar/installElectronHook.ts
    - src/backend/sidecar/bootstrap.ts
    - src/common/types/electron_store.ts
    - src/backend/__tests__/cache.test.ts
    - package.json
    - pnpm-lock.yaml
key-decisions:
  - "Package Legitimacy Gate PASSED (human, 2026-08-29): conf@^10.2.0, NOT latest — 11+ are ESM-only, 15 needs Node>=20. 10.2.0 was already lockfile-pinned as electron-store's own dependency, so supply-chain delta is zero. Accepted deferral: sitting on a 2022-era major while upstream is at 15."
  - "Option (B) per operator ruling: sidecar test suites keep redirecting to fileStore.ts; production runs conf. Preserves every existing assertion."
  - "Containment split into two anchors rather than fileStore's single userData anchor — required, not stylistic (measured failure)."
requirements-completed: [REQ-35-03]
date: 2026-08-29
---

# Phase 35 Plan 05: Replace electron-store with conf — Summary

Replaced `electron-store@8.2.0` with a first-party shim over `conf@10.2.0` at every backend
and common site, removing the last third-party runtime dependency on Electron. The plan's own
prescribed method was measured to be defective and was corrected before implementation.

## The plan defect, and why deviating was mandatory rather than stylistic

Plan 35-05's Task 2 instructs: add `cwd`, and *"leave `name`, `clearInvalidConfig` and every
other existing option value **exactly as it is**."*

**`conf` has no `name` option.** It reads `configName`:

```js
// conf/dist/source/index.js:129-130
const fileExtension = options.fileExtension ? `.${options.fileExtension}` : '';
this.path = path.resolve(options.cwd, `${options.configName ?? 'config'}${fileExtension}`);
```

`electron-store`'s entire value-add over `conf` was four lines of option translation:

```js
// electron-store/index.js:60-67
if (options.cwd) { options.cwd = path.isAbsolute(options.cwd) ? options.cwd
                                 : path.join(defaultCwd, options.cwd) }
else { options.cwd = defaultCwd }        // defaultCwd = app.getPath('userData')
options.configName = options.name;
delete options.name;
```

Measured against the installed `conf@10.2.0` (probe in a scratchpad temp dir; the live profile
was never written):

| Options passed | `conf`'s resolved `.path` | reads a pre-existing value? |
|---|---|---|
| `{cwd: <abs>, name: 'gogLibrary'}` | `<abs>/config.json` | **no — `undefined`** |
| `{cwd: <abs>, configName: 'gogLibrary'}` | `<abs>/gogLibrary.json` | yes, incl. dot-notation |
| `{cwd: 'store_cache', …}` — the literal all 5 sites pass | **`<process.cwd()>/store_cache/…`** (the repo) | n/a |

All five production construction sites pass `{cwd: 'store_cache', name: <filename>}`. Following
the instruction literally produces **two independent silent relocations**, either of which is
strictly worse than the one the plan was written to prevent:

1. `name` ignored → all **24** live `store_cache/*.json` files collapse onto one `config.json`,
   every existing value reading back `undefined`.
2. relative `cwd` resolved against `process.cwd()` — adding `cwd` "explicitly" does not fix this
   unless the value is made absolute.

`backend/store_backend.ts` now owns that translation. This is recorded here, in the shim's
header, in `electron_store.ts` at the constructor site, and in `deferred-items.md` (D-35-05-01),
because a future reader will otherwise re-derive the plan's method and reintroduce the defect.

## Path parity: the acceptance proof

**A. Derivation vs the real profile** (pure computation, zero writes). The shim's production
derivation resolves to files that already exist on the operator's live install:

```
pathShim userData = /Users/<user>/Library/Application Support/GameLib
gog_library     -> …/GameLib/store_cache/gog_library.json     exists: true
steam_library   -> …/GameLib/store_cache/steam_library.json   exists: true
humble_library  -> …/GameLib/store_cache/humble_library.json  exists: true
configStore ({cwd:'store'}) -> …/GameLib/store/config.json
```

**B. Round-trip against a file the OLD backend actually wrote.** `~/Library/Application
Support/GameLib/store/config.json` was **copied out** to a temp dir and read through the new
stack. The source was opened read-only; its sha256 is byte-identical before and after
(`05c15fa4581aa2496c261fe7c131e91e57267f5c07cde72e650234f754afe923`):

```
configStore path       = <COPY>/store/config.json
  theme                = "midnightMirage"
  language             = "en"
  DOT games.recent len = 18
  DOT games.recent[0]  = "Phoenix Point"
  DOT settings.defaultInstallPath = "/Users/<user>/GameLib"
  DOT window-props.width          = 1427
timestampStore entries = 20
```

This is a genuine old-backend file, not a synthetic fixture. Dot-notation resolves, including
through a hyphenated key (`window-props.width`) — load-bearing for `isSecretStoreKey`'s
`key.startsWith(`${secret}.`)` matching until plan 35-16 replaces the deny-list (threat T-35-17).

One dead end worth recording: the first round-trip attempt targeted `<userData>/config.json` and
read back `undefined` for everything. That file is **GlobalConfig's own format**
(`{defaultSettings, version}`), not an electron-store store. The real `configStore` is
`{cwd:'store'}` → `store/config.json`. The `undefined` was the correct answer to the wrong
question.

## The gate that would have caught this

`src/backend/__tests__/cache.test.ts` → `describe('store path parity (Phase 35 D-04)')`:

- all 24 cache-store names resolve to **distinct** paths;
- each is exactly `<userData>/store_cache/<name>.json`, never a shared `config.json`;
- each is under userData and **not** under the repo working directory;
- **non-vacuity**: the naive `{cwd, name}` passthrough to raw `conf` is reproduced inline and
  asserted to collapse all 24 onto ONE path outside userData. This test runs from a disposable
  cwd, because `conf` **mkdirs its relative cwd during construction** — measured: it created a
  stray `store_cache/` in the repo root on the first run, even though it writes no file;
- round-trip against an old-layout file, plus a `name`-traversal escape refusal.

14/14 pass.

## Containment: an anchor that had to be split

`fileStore.ts`'s WR-11 resolve+relative check was moved (not reimplemented) into the shim, and
**split into two anchors**:

- **Anchor 1, always:** the resolved file must sit inside its own `cwd`. This is the anchor that
  addresses the actual threat — `cwd` is hardcoded at every call site, whereas `name` arrives
  from an RPC frame via `storeWriteHandlers.ts`'s `resolveWritableStore()`/`storeNew`. Stricter
  than the original for that path: it also forbids escaping `store_cache` into a sibling.
- **Anchor 2, only when `cwd` was relative** (i.e. derived by us from userData).

The split is **required, and was found by the gate failing**, not by reasoning. `game_overrides/
electronStores.ts` passes an absolute `join(userDataPath, 'store')` where `userDataPath` is
Electron's `app.getPath('userData')`. That is **not string-identical** to pathShim's: Electron
derives the leaf from the app name (`gamelib` unpackaged) while pathShim hardcodes `GameLib`.
`path.relative` is a pure string operation with no knowledge that macOS is case-insensitive, so
a single userData anchor computed `../gamelib/store` and threw on a path that is in fact the
very same directory.

**Path-identity note for Linux.** On macOS/Windows the two spellings collide to one directory
(verified: `ls` of `.../GameLib` and `.../gamelib` returns byte-identical listings on this
machine). On **Linux** they would not. `electron-builder.yml` sets `productName: GameLib`, so
the **packaged** Electron build already resolves `GameLib` and matches pathShim exactly; the
divergence is confined to unpackaged `pnpm start` on Linux. `backend/constants/paths.ts` already
hardcodes `join(configFolder, 'GameLib')` for `appFolder`, so pathShim's literal is the
codebase's existing convention rather than a new one.

## Scope: ~48 sites, not 9

The plan asserted "TEN sites … Nine land here". Measured reality (D-35-05-02):

| Category | Plan | Actual |
|---|---|---|
| Production construction sites | 4 | **5** — `storeWriteHandlers.ts:364` (`storeNew`) was missed |
| `jest.mock('electron-store', …)` files | 0 | **37** |
| Manual mock (`jest.requireActual('electron-store')`) | 0 | 1 |
| `build:sidecar`'s `--external:electron-store` | 0 | 1 |
| AST gate constant | 0 | 1 |
| Prose-only mentions | 0 | ~30 |

Per the operator's **option (B)** ruling, the 37 suites keep redirecting to `fileStore.ts`; only
the specifier changed. Every existing assertion stands.

## Test results (counts, not exit codes)

| Project(s) | Suites | Tests |
|---|---|---|
| Backend | 182 passed / **183** | 4294 passed, 3 failed, 2 skipped / **4299** |
| Common + Meta | 29 passed / **30** | 669 passed, 1 failed, 1 skipped / **671** |
| Frontend + Preload | 138 passed / **138** | 2241 passed / **2241** |
| **Total** | **349 / 351** | **7204 passed, 4 failed, 3 skipped / 7211** |

Both failing suites are pre-existing and unrelated:

- `decompressPool.test.ts` — 3 LZMA native-decode failures (`expected 'native', received
  'pure-js'`), environmental, called out in the brief as pre-existing.
- `genI18nGateScope.test.ts` — deferred item **D-35-03-01**. The diff is 4 removed
  `src/frontend/**` files; this plan touched no frontend file. (Note: D-35-03-01 recorded 3 files;
  it is now 4. The staleness is growing.)

Projects were selected by grepping for suites that read `package.json`
(`grep -rln "package.json" --include="*.test.ts" src/ meta/`) — that surfaced Backend and Meta,
plus one Frontend suite, so all five projects were run rather than the two the file paths suggest.
The changed suites are confirmed present in the run: `cache.test.ts` (14 tests, named individually
in output), `storeChangeNotifier.test.ts`, `devSecretVault.test.ts` (13), `gameDetailsImportGate`
(49), and the Backend total rose 4286 → 4299 as the new gate landed.

`pnpm codecheck` (`tsc --noEmit`) exits **0**. `pnpm build:sidecar` exits **0** and the bundle
contains exactly one `require("conf")` and zero `electron-store` module references (5 residual
string matches are prose: one comment and four log messages in `wine/manager/utils.ts`).

## Deviations from plan

**1. [Rule 1 — plan defect] `name` → `configName` translation added.** See above. Without it the
plan ships total silent data loss. Mandatory.

**2. [Rule 3 — scope] 37 test mocks, the manual mock, the build script and the AST gate.** Not in
the plan; unavoidable, since removing the package breaks `jest.mock('electron-store')` resolution.
Escalated as a checkpoint and resolved by operator ruling (option B) before implementation.

**3. [Rule 2 — security] Containment anchor split.** Carrying WR-11 forward naively broke
`game_overrides`. Documented above.

**4. [Rule 1] `devSecretVault.test.ts` pathShim mock needed a module-scope default.** The mock
only installed an implementation in `beforeEach`, but `cache.ts` constructs at module scope, so
the mock is now reached during the import graph. Previously the construction went through
electron-store → `app.getPath()` → the `electron` automock and never touched this mock at import
time.

**5. [procedural] Gate 8 sha256 re-pinned** for `electronUntouched.test.ts` (1 line: the mock
specifier). Done per the gate's own documented procedure, with both prior digests retained and
the reason stated in the commit. Independently confirmed with `shasum -a 256`.

## Acceptance criteria NOT met, stated plainly

- **`grep -rln "electron-store" src/backend/ src/common/ | grep -v __tests__` returns nothing** —
  **not achievable, and was never achievable.** ~30 non-test files mention the string in prose,
  and `__mocks__/` is not under a `__tests__` directory. The criterion was written from a grep of
  *import* sites. What IS true: **zero** live import specifiers remain outside
  `preload/api/misc.ts`. The only three residual matches in `src/backend` are past-tense comments
  explicitly describing the removal.
- **`grep -c "getPath('userData')"` across the four files ≥ 4** — not met by that shape. The
  criterion's stated alternative was used: **one shared helper that calls it once**
  (`translateStoreOptions`). Stating the shape, as the criterion requires.
- **`installElectronHook.ts` has zero occurrences of `electron-store`** — it has 4, all in a
  docstring explaining that the interception was deleted and why. Judged better than silence:
  a reader will otherwise wonder why the hook now handles one specifier. The threat this
  criterion guards (T-35-19, a comment describing a live mechanism that no longer exists) does
  not apply — the text is unambiguously past-tense.
- **The round-trip test lives in `cache.test.ts`** — met, via `jest.requireActual`, since that
  suite mocks the store backend.

## Not settled by this plan

- **`pnpm start` / `pnpm tauri:dev` were not launched.** The plan's verification asks for both.
  Not done: the operator has a live GameLib instance running against the real profile, and
  `tauri:dev` exits 0 without replacing a running instance (MEMORY). `pnpm build:sidecar`
  succeeding and 7204 green tests are strong but not equivalent evidence. **This is the open
  item most worth a human smoke test.**
- **No full `pnpm install` was run** — only `--lockfile-only --ignore-scripts`. `node_modules`
  still physically contains `electron-store`, though nothing resolves it. A clean install should
  be done before trusting CI.
- **`preload/api/misc.ts`** keeps its lazy `require('electron-store')` — deliberate, plan 35-16
  owns it, and the file now carries the three-way collision marker.
- **conf@10 vs 15**: accepted deferral, recorded in the dependency commit.
- Four stale log strings in `wine/manager/utils.ts` still say "electron-store ->
  wine-downloader-info.json". Cosmetic, out of scope.

## Commits

| Hash | Message |
|---|---|
| `02edfedad` | docs(35-05): mark the misc.ts three-way collision for plan 35-16 |
| `6d23a3f12` | docs(35-05): record two blocking findings — conf option rename, true scope |
| `a071486b1` | feat(35-05): replace electron-store with a conf-backed first-party shim |
| `d5fc8a458` | chore(35-05): drop electron-store from package.json, add conf@^10.2.0 |
| `a7c2a252d` | test(35-05): gate store path parity — 24 distinct files, proven non-vacuous |
| `8493788fa` | fix(35-05): default the devSecretVault pathShim mock, re-pin Gate 8 digest |
| `5f5d673b3` | docs(35-05): carry the cwd rationale forward to the constructor site |

54 files changed, 664 insertions(+), 152 deletions(-).

## Self-Check: PASSED

All 11 created/modified files verified present on disk; `src/backend/__mocks__/electron-store.ts`
verified removed; all 7 commit hashes verified present in `git log`.
