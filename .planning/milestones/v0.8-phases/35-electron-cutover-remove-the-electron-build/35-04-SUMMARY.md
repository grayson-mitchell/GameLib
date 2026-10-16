---
phase: 35-electron-cutover-remove-the-electron-build
plan: 04
subsystem: build
tags: [d-14, d-19, d-16, packaging, tauri, sea, publicdir, locales, req-35-10, req-35-11, t-35-11, t-35-12, t-35-13, t-35-14, t-35-15]
status: COMPLETE — blocking checkpoint PASSED, operator ran the packaged .app from the DMG on macOS arm64, 2026-08-29

# Dependency graph
requires: [35-01, 35-03]
provides:
  - "src/backend/sidecar/isPackagedSidecar.ts — the SINGLE node:sea-backed fail-closed dev-vs-packaged derivation, with THREE callers and no second copy"
  - "app.isPackaged as a delegating GETTER rather than a hardcoded false — R-34.5-G1-PKG half (b) root cause removed"
  - "bundle.resources in MAP form, every publicDir-resolved asset shipped to Contents/Resources/build/... — half (a)"
  - "ARTIFACT-LEVEL proof of both halves from a real 529 MB DMG: Contents/Resources/build/ exists, locales/en/ populated, and the packaged sidecar itself logs `publicDir resolved=<Resources>/build exists=true`"
  - "The three tauri-utils resource-resolution facts that make the naive fix wrong, each read at the crate source rather than inferred"
  - "packagingConfig.test.ts guard against reverting to the array form or a `../`-prefixed target"
affects: [35-14, 35-15, 35-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MOVE a security-relevant derivation into its own module and re-export from its old home, so the old import path keeps resolving while the new callers physically cannot re-derive it — grep proves the callers it found, the re-export covers the ones it missed"
    - "Read the BUNDLER's own source for how it computes a target path before writing a bundling config. `resource_relpath`'s `..` -> `_up_` rule is invisible in every doc and is the entire defect"
    - "Prove a packaging fix by MOUNTING the artifact and listing the directory, then by running the artifact's own binary against the artifact's own resource root — a config diff and a green build prove nothing about where files landed"
    - "Prefer a GETTER over a captured boolean when a module-scope object literal exposes a value another module also reads at module scope; a snapshot passes a single-direction test and fails the second read"
    - "State the negative in the artifact too: verifying that `Contents/Resources/public` does NOT exist is what makes the positive result decisive"

key-files:
  created:
    - src/backend/sidecar/isPackagedSidecar.ts
    - src/backend/sidecar/__tests__/isPackagedSidecar.test.ts
  modified:
    - src/backend/sidecar/humbleFlowRegistration.ts
    - src/backend/sidecar/devSecretVault.ts
    - src/backend/sidecar/electronStub.ts
    - src-tauri/tauri.conf.json
    - src/backend/sidecar/__tests__/devSecretVault.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/__tests__/packagingConfig.test.ts
    - .planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md

key-decisions:
  - "`app.isPackaged` is now a THIRD CALLER of one function, never a second derivation. This is the distinction D-14's security note turns on and it is not a stylistic one: `devSecretVault.ts`'s guardrail (c) decides whether a plaintext on-disk secret vault may install itself from this exact value, so two derivations that can drift are a latent bypass of a fail-closed guard (T-35-11)."
  - "A build-time stamped `isPackaged` constant was REJECTED and the rejection recorded in the new module's header so a later optimiser does not reintroduce it. It fails OPEN — any build path that forgets to stamp it reports 'not packaged' and unlocks the dev vault inside a shipped binary (T-35-12). The runtime `node:sea` probe fails CLOSED (`catch -> true`)."
  - "`bundle.resources` uses the MAP form because the ARRAY form DERIVES its targets, and the derivation is the defect. Appending more `../`-prefixed entries to the array would have reproduced the same mismatch one directory over — a green diff and the same empty directory."
  - "Locales are carried as a DIRECTORY entry, never a glob. A glob target is `dest.join(file_name)` in tauri-utils, which discards intermediate directories and would have collapsed 49 languages' gamelib.json onto one path, each overwriting the last."
  - "Every file entry names its FULL target path. A file entry's target is used verbatim, so `\"../build/changelog.json\": \"build/\"` would have written a FILE named `build` on top of the `build` DIRECTORY."
  - "Tray PNGs NOT bundled — `main.rs:102-111` takes them via `include_bytes!` from `public/` at COMPILE time and the Rust tray never reads them from disk. Decided on the read of `tray_image()`, as the plan required, not on the assumption that plan 35-15 deletes their only TS consumer."
  - "`crossover-index.json.gz` NOT bundled, as a named gap rather than an oversight. Tauri 2.9.3 has no optional-resource form; requiring it would break every build where the snapshot is absent, a state `release-tauri.yml:135` explicitly tolerates."
  - "`main.rs` deliberately UNTOUCHED, so this plan owes no `cargo` gate. Its `resolve_packaged_app_root` doc comment is consequently now false — logged as D-35-04-01 rather than fixed half-gated while an operator `tauri dev` session held the cargo lock."

requirements-completed: [REQ-35-10, REQ-35-11]

# Metrics
duration: ~2h
completed: 2026-08-29
commits: [c69f383b1, 4e8197d3a, b581f023f]
---

# Plan 35-04 — `R-34.5-G1-PKG`, both halves, closed against a real packaged artifact

## What this plan did

Collapsed `app.isPackaged` to a single `node:sea`-backed derivation shared with
`devSecretVault.ts`'s fail-closed guardrail (c), rewrote `bundle.resources` so every
`publicDir`-resolved asset ships to a path `publicDir` actually reads, and then **proved both
halves together against a real 529,583,166-byte DMG** — by mounting it, listing the directory, and
running the artifact's own sidecar binary against the artifact's own resource root.

Either fix alone is inert. Fixing (b) alone resolves correctly to a directory that does not exist;
fixing (a) alone ships files to a directory nothing reads. That is why they are one plan and one
piece of evidence.

## The artifact — before and after

This is the finding. A bare after-state understates it.

**2026-08-22 DMG probe (`34.2-HUMAN-UAT.md`, `G-34.2-UAT-02`)** found, in
`GameLib.app/Contents/Resources/`:

```
_up_
icon.icns
```

That was everything. No `build/`. The locale files were not in the artifact at all, and the runner
tree that WAS shipped sat under `_up_/build/bin/`, which nothing reads.

**2026-08-29, this plan, same probe on `GameLib_0.7.0_aarch64.dmg` mounted read-only:**

```
Contents/Resources/
  build/                     <-- was absent
  icon.icns
                             <-- "_up_" is GONE

Contents/Resources/build/
  bin/                    (dir)
  changelog.json           2002
  icon.png               667342
  locales/                (49 languages)
  webviewPreload.js         387

Contents/Resources/build/locales/en/
  gamelib.json     9319      gamepage.json  19113
  login.json        700      translation.json 69538
```

File-count parity against the source tree: **locales 147 / 147**, **bin 489 / 495 regular files**
(the surplus is dereferenced symlinks — see D-35-04-03). No broken symlinks anywhere under
`Resources/build`. The PyInstaller onedir layout survived intact (`legendary/legendary` plus
`legendary/_internal/`), and all four bundled runners executed directly from the read-only mounted
DMG: `legendary 0.21.0`, `gogdl 1.3.0`, `nile 1.2.0`, `comet 0.2.0`, each exit 0.

Build command, recorded because `35-CONTEXT.md` requires every gate claim to name its build:
`pnpm exec vite build` -> `pnpm build:sidecar-sea` -> `pnpm exec tauri build`. Exit 0, release
profile, 1m34s compile, target `aarch64-apple-darwin`. The bundler **cleans `GameLib.app` after
producing the DMG**, so the `.app` was inspected by mounting the DMG — the same shape as the
2026-08-22 probe, which is what makes the two comparable.

**This is a PACKAGED measurement, not a dev one.** `pnpm tauri:dev` structurally cannot serve here:
after plan 35-03 it loads the renderer over `devUrl` and resolves no bundled assets.

## The string probe — both directions

On `Contents/MacOS/gamelib-sidecar` (170,026,880 bytes, the SEA binary):

| Direction | Pattern | Count |
|---|---|---|
| KEY | `notify.finished.reparing` | **1** |
| VALUE | `Finished Repairing` | **0** |

**The still-absent VALUE is the CORRECT outcome, and the probe is a control rather than the pass
condition.** The KEY being present proves the probe works on this binary — that a count of 0
elsewhere means "absent", not "the probe is broken against this target". The VALUE is expected to
be absent because locale data ships as loose files under `Resources/build/locales/`, exactly as
intended; it was never supposed to be baked into the binary.

What makes this decisive rather than merely consistent is the closing evidence:

```
$ grep -o '"reparing": *"[^"]*"' .../Contents/Resources/build/locales/en/translation.json
"reparing": "Error Repairing"
"reparing": "Finished Repairing"
```

The exact string that was absent from the **entire artifact** on 2026-08-22 is now in it — as a
loose file, in the right place, reachable by `publicDir`. `en/translation.json` parses as valid
JSON with 78 top-level keys.

## The trap, and the three ways to reproduce it one directory over

The plan existed to avoid one specific failure: a `../`-prefixed resource entry does not land where
`publicDir` looks. Rather than assume the mechanism, it was read at the crate source
(`tauri-utils-2.9.3/src/resources.rs`). Three facts came out of that read, and **each one was a
live way to ship a green diff and the same empty directory**:

**1. `resource_relpath` maps `Component::ParentDir` to a literal `_up_` segment (`:21-24`) — and it
is applied to the TARGET as well (`:239`).**

```rust
Component::ParentDir => dest.push("_up_"),
```

In the array form, targets are derived this way, so `"../build/bin/"` shipped to
`Contents/Resources/_up_/build/bin/`. Meanwhile `constants/paths.ts` computes
`resolve(app.getAppPath(), 'build')` and `app.getAppPath()` is the Tauri shell's `resource_dir()`
= `Contents/Resources`. Two directories that never met. **Because `resource_relpath` also runs on
the map's target value, a map entry whose target contained `..` would come straight back as
`_up_`** — the map form alone is not the fix; the target must be clean.

**2. A GLOB target is `dest.join(path.file_name())` (`:207`) — it DISCARDS intermediate
directories.**

`"../build/locales/**/*.json": "build/locales"` would have flattened **49 languages' `gamelib.json`
onto one path**, each overwriting the last, and the build would have been green. Locales therefore
use the directory form, which takes the walkdir branch (`:196-201`) and preserves structure via
`strip_prefix`.

**3. A FILE entry's target is the FULL path, not a parent directory (`:216-222`).**

The source's own comment calls this "a confusing special case". `"../build/changelog.json":
"build/"` would have written a **file named `build`** on top of the `build` **directory**.

Each of these produces a passing config, a passing build, and a broken artifact. None is visible in
a diff of `tauri.conf.json`.

## Half (b) — one derivation, three callers

`electronStub.ts:207` held `isPackaged: false`, hardcoded since Phase 27. `paths.ts:73-76` computes:

```ts
export const publicDir = resolve(
  app.getAppPath(),
  app.isPackaged || process.env.CI === 'e2e' ? 'build' : 'public'
)
```

so a constant `false` appended `'public'` in every packaged run.

`isPackagedSidecar()` was **moved** — not copied — out of `humbleFlowRegistration.ts` into
`src/backend/sidecar/isPackagedSidecar.ts`, body byte-for-byte: same guarded `node:sea` require,
same `{ isSea: () => boolean }` assertion, same fail-closed `catch -> true`.
`humbleFlowRegistration.ts` re-exports the symbol so any caller the move's grep did not find still
resolves. `devSecretVault.ts`'s import was repointed and **nothing else about guardrail (c) was
touched** — not its logic, not its wording, not its call sites at `:282`. `app.isPackaged` became:

```ts
get isPackaged(): boolean {
  return isPackagedSidecar()
}
```

A **getter, not a captured boolean**, and that is load-bearing: the `app` object literal is
evaluated at module scope and `paths.ts` reads `app.isPackaged` at module scope too, so a snapshot
would freeze whatever the SEA context looked like at the earliest possible moment.

**The count is THREE CALLERS OF ONE FUNCTION, never two derivations.** That is the distinction
D-14's security note turns on, and it is not tidiness: `devSecretVault.ts`'s guardrail (c) decides
whether a plaintext on-disk secret vault may install itself from this value. The first time two
derivations disagree, one of them is unlocking something the other believes is locked (T-35-11).

### Two other `require('node:sea')` call sites remain, and they are NOT `isPackaged` derivations

Verified explicitly, and recorded here **so nobody later "consolidates" them**:

| Site | What it asks | Is it an `isPackaged` derivation? |
|---|---|---|
| `isPackagedSidecar.ts:83` | is this a packaged SEA build? | **YES — the one derivation** |
| `depot/decompressPool.ts:332` | can I `getAsset('decompressWorker.js')`? | **No** — worker asset resolution |
| `depot/lzmaNativeBinding.ts:205` | can I `getRawAsset('lzma_native.node')`? | **No** — native addon resolution |

Both of the latter call `isSea()` only as a **gate immediately before an asset read**, and both
have a real dev-path fallback on the `false` branch. They answer "is my embedded asset reachable",
not "is this build packaged". Folding them into `isPackagedSidecar()` would couple an asset-loading
decision to a security decision and would gain nothing — their `catch` arms fall through to the dev
path (correctly, for asset resolution) where the security derivation must fail CLOSED. **They are
deliberately left alone.**

### T-35-13 — worker-thread safety was measured, not assumed

`35-PREFLIGHT.md` OQ-1's disposition, quoted verbatim as the plan requires:

> **Disposition: `AGREES`**
>
> Both contexts evaluate `isSea()` identically within themselves (dev: `false`/`false`; SEA:
> `true`/`true`). D-14's unification of `isPackagedSidecar()`'s value across a worker-thread and
> main-thread caller is safe as designed. Plan 35-04 may proceed treating `app.isPackaged` as a
> third caller of `isPackagedSidecar()` without owing a new worker-thread-context test case to
> `src/backend/sidecar/__tests__/devSecretVault.test.ts`.

Consequence: proceeded as written. **No worker-context case was added to `devSecretVault.test.ts`**,
because the disposition is `AGREES` and not `DIVERGES`. Had it been `UNMEASURED`, the plan's own
instruction was to stop and not perform the delegation at all.

## Half (b) proven at the artifact level too — not only by the UI

Beyond the operator's visual confirmation, the packaged sidecar binary was run directly against the
mounted bundle's own resource root, with a contained `HOME` so nothing touched the real config:

```
[bootstrap] appRoot resolved=.../GameLib.app/Contents/Resources source=GAMELIB_APP_ROOT
[bootstrap] publicDir resolved=.../GameLib.app/Contents/Resources/build exists=true
```

Zero `SIDECAR ASSET ROOT DEFECT` lines, zero `ERROR` lines in the boot log. And the **negative
control**, which is what makes the positive decisive:

```
$ ls -d .../GameLib.app/Contents/Resources/public
ls: ... No such file or directory
```

`public/` does not exist inside the bundle. So a rendering translation could only have come from
`build/`, and the pre-fix code would have resolved to a directory that is provably absent.

## The blocking checkpoint — PASSED

Operator ran the packaged `GameLib.app` from the DMG, macOS arm64, 2026-08-29:

1. **UI shows real English text** — no raw i18n keys.
2. **Switching language in Settings works** — the UI changes.

That is the visual proof `publicDir` resolved to `Contents/Resources/build`, and it is decisive
because `Contents/Resources/public` was verified absent.

**NOT exercised, and explicitly not claimed:** the Epic/GOG library operation. Runner `--version`
calls from the read-only DMG are the **only** evidence about the bundled runners. Nothing here says
an install, sync or launch was performed through them.

## Deliberate omissions, each decided on a read

**Tray PNGs — NOT bundled.** `main.rs:102-111`:

```rust
const TRAY_ICON_DARK: &[u8] = include_bytes!("../../public/icon-tray-dark.png");
const TRAY_ICON_LIGHT: &[u8] = include_bytes!("../../public/icon-tray-light.png");
const TRAY_ICON_TEMPLATE: &[u8] = include_bytes!("../../public/icon-tray-template.png");
```

`tray_image()` consumes these constants only. The bytes are embedded **at compile time from
`public/`**; the Rust tray never reads a PNG from disk. The decision was made on that read, as the
plan instructed, not on the separate fact that plan 35-15 deletes `tray_icon/tray_icon.ts`.

**`crossover-index.json.gz` — NOT bundled, as a named gap.** `fetcher.ts` reads
`join(publicDir, 'crossover-index.json.gz')`, so by the letter of half (a) it belongs in the
bundle. But `resources.rs:186` errors `ResourcePathNotFound` on a missing literal and `:257` errors
`GlobPathNotFound` on a glob matching nothing — **there is no optional-resource form in Tauri
2.9.3**. The file is gitignored and absent from a fresh clone, and `release-tauri.yml:135`
explicitly tolerates its absence (`|| echo "No published index yet; shipping without a bundled
snapshot"`). A required entry would convert a documented-tolerable state into a hard build
failure — including breaking this plan's own build. Harmless today:
`loadBundledSnapshot()`'s own docstring states an absent snapshot is "a NORMAL cold-start, not an
error". Nothing regressed either — it never shipped under the old config. Logged as D-35-04-02.

## Deviations from plan

### Three files modified beyond `files_modified`, each unavoidable

1. **`src/backend/sidecar/__tests__/devSecretVault.test.ts`.** Its mock targeted
   `jest.mock('../humbleFlowRegistration', ...)` with a `requireActual` spread. Repointing
   `devSecretVault.ts`'s import to `../isPackagedSidecar` necessarily broke it. Retargeted to
   `jest.mock('../isPackagedSidecar', ...)`, and simplified to a **full replacement** — safe only
   because that module has exactly one export. The old spread existed because
   `humbleFlowRegistration.ts` also exports the real `registerHumbleFlows()`, which the bootstrap
   block drives at `handlers.ts:194`'s module scope. **That reason was preserved in the header** so
   a future repoint at a multi-export module restores the spread. Rule 3.

2. **`src/backend/sidecar/__tests__/testContainment.test.ts`.** Its Block C set-equality gate fails
   on any unclassified `*.test.ts` in the sidecar `__tests__` directory, so the new suite had to be
   registered. Classified `STRUCTURALLY_CONTAINED` **on a read of its import graph, not on
   assumption**: it declares no file-wide `jest.mock`, requires only `../isPackagedSidecar` (whose
   sole dependency is the `node:sea` builtin) and `../electronStub`, and `pathShim`'s
   `resolveAppDataDir()`/`homedir()` calls all live INSIDE `getPath()` — none runs at module scope.
   The reasoning is written into the file's docstring alongside the existing per-entry rationales.
   Rule 3.

3. **`src/backend/__tests__/packagingConfig.test.ts`.** Added the half-(a) config guard. Not
   strictly forced, but T-35-15 is the defect's own shape — a config that ships nothing still
   builds green — and the array form was one keystroke away from returning. Rule 2.

### Comments corrected because the change made them false

`humbleFlowRegistration.ts` carried two comment sites (its module docstring and the
`humbleRunValidation` gate) asserting that "`electronStub`'s `app` shim hardcodes that same flag to
`false` always". After Task 1 that is untrue. Both were rewritten to past tense with the delegation
recorded. Left as-is, they would have been the `summary-can-be-wrong-while-the-record-is-right`
shape planted at the exact site a future reader would consult.

### A log message deliberately NOT updated

`isPackagedSidecar()`'s `catch` still logs `[humbleFlowRegistration] node:sea unavailable --
defaulting humbleRunValidation to PACKAGED`. That prefix now names the wrong module. It was left
byte-identical anyway because `humbleFlows.test.ts:1006` pins the `node:sea unavailable` substring
and the plan mandated a byte-for-byte move; rewording it is a behaviour change to a log a test
reads. The reason is recorded in the new module's docstring so it does not read as rot.

### `main.rs` untouched

Kept the Rust footprint at zero so this plan owes no `cargo build`/`cargo test` gate — which
mattered, because an operator `tauri dev` session held the `src-tauri/target/` cargo lock when
Task 1 ran. The cost is D-35-04-01 below.

## Gates — counts, not exit codes

| Gate | Result |
|---|---|
| `pnpm codecheck` (`tsc --noEmit`) | exit 0 |
| `pnpm test --selectProjects Backend` (all suites) | **183 suites, 4288 passed, 3 failed, 2 skipped, 4293 total** |
| Targeted: `isPackagedSidecar devSecretVault humbleFlows packagingConfig testContainment tauriConf` | **6 suites, 174 passed, 174 total** |
| `pnpm exec eslint` on every changed file | 0 errors (warnings are the pre-existing `require-await` set) |
| `pnpm exec prettier --check` on every changed file | clean |

**The 3 failures are all in `src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` —
the pre-existing, environmental LZMA set. Not chased, per standing instruction.** A fourth suite,
`enrichmentFlows.test.ts`, failed once under full-suite load and passed 41/41 alone; logged as
D-35-04-04, a new instance of `full-suite-run-manufactures-failures-under-load`.

`--selectProjects Backend` is case-sensitive and exits 0 when it matches nothing, so the counts
above are the evidence, not the exit codes.

## Every new gate proven non-vacuous by mutation

Each mutation was applied to the real file, the suite re-run, then the file restored from a `cp`
snapshot and re-verified **sha256-identical** — never `git checkout -- <file>`, per the standing
prohibition (`.husky/post-checkout` runs `download-helper-binaries` and throws).

| Mutation | Red |
|---|---|
| `electronStub.ts`: restore `isPackaged: false` | **4 tests red** (both behavioural delegation tests + non-vacuity + the source gate) |
| `humbleFlowRegistration.ts`: re-add a second `node:sea` probe | **1 test red** |
| `tauri.conf.json`: revert to the array form | **7 tests red** |
| `tauri.conf.json`: map form but a `../`-prefixed target | **2 tests red** (the exact one-directory-over trap) |
| `tauri.conf.json`: locales as a flattening glob | **1 test red** |
| `tauri.conf.json`: add `"../build/main/": "build/main"` | **T-35-14 red** |

Restore hashes: `electronStub.ts` `127a591b…`, `humbleFlowRegistration.ts` `5bb77441…`,
`tauri.conf.json` `f9037075…` — each confirmed identical to its pre-mutation snapshot.

The new test file also carries an explicit **non-vacuity test** proving `stripSourceComments` has
not eaten the source the four source-gate assertions run over. Without it all four would pass
against an empty string. This matters here specifically: the comment in `electronStub.ts` *names*
both `node:sea` and the old `isPackaged` literal, so a naive raw grep over that file would
false-fire; the gate runs over stripped source, and the plan's raw-grep acceptance criteria were
additionally satisfied by rewording the comment so `grep -cF 'isPackaged: false'` reads **0** and
`grep -cF "require('node:sea')"` on `humbleFlowRegistration.ts` reads **0**.

## Renderer asset paths — the OTHER cause of the same symptom

`35-03-SUMMARY.md` records that `electron-vite` injected `base: './'` through a plugin invisible in
`electron.vite.config.ts`, and that a naive lift would have emitted `/assets/...` — 404ing every
asset in a packaged bundle, **the same white-screen shape as `R-34.5-G1-PKG`**. Confirmed on this
plan's real production build:

- `build/index.html` emits `src="./assets/index-Col7xcVK.js"` and three `href="./assets/..."`
- **zero** occurrences of `src="/assets/` or `href="/assets/`

So the two causes are now distinguishable. A future white screen with a populated
`Contents/Resources/build/` is an asset-path or embedded-asset-protocol fault, not a
`bundle.resources` fault. Note the renderer is **embedded in `gamelib-shell`** (compressed) rather
than written to `Resources/`, so `strings` cannot confirm it in the binary — the on-disk
`build/index.html` that was embedded is the strongest available check short of launching, and the
operator's launch supplied the rest.

## Deferred (logged, not fixed) — commit `b581f023f`

Four findings written to `deferred-items.md`. **One carries real risk.**

### D-35-04-03 — RISK: six directory-symlinks do not survive bundling

`build/bin/` carries 12 symlinks. In the packaged `.app`, **0 survive**:

| source symlink | target | in bundle |
|---|---|---|
| `{legendary,gogdl,nile}/_internal/Python` | `Python.framework/Versions/3.12/Python` | dereferenced to a real 7,996,912-byte file (x3) |
| `{legendary,gogdl,nile}/_internal/Python.framework/Python` | `Versions/Current/Python` | dereferenced to a real file (x3) |
| `{legendary,gogdl,nile}/_internal/Python.framework/Resources` | `Versions/Current/Resources` | **MISSING** (x3) |
| `{legendary,gogdl,nile}/_internal/Python.framework/Versions/Current` | `3.12` | **MISSING** (x3) |

**Mechanism:** Tauri's resource walk skips directory entries (`resources.rs:176-179`, "Skip
directories"), and a symlink-to-DIRECTORY resolves to a directory, so it yields nothing. A
symlink-to-FILE resolves to a file and is copied by value.

**Pre-existing and identical under the old array form** — only the destination differed. But it is
**load-bearing for the first time** because of this plan: under `["../build/bin/"]` the tree landed
at `_up_/build/bin/`, which `publicDir` never read, so the bundled runners were unreachable and
their internal layout was moot. They are now reachable and will be executed.

**Measured runtime impact: NONE.** All four runners executed from the read-only mounted DMG, exit 0.
The PyInstaller loader uses `_internal/Python`, present as a real file; the missing links are the
framework's `Current`/`Resources` aliases.

**The risk is codesign.** A macOS framework without its `Versions/Current` symlink is not
structurally valid and **signing may reject it**. This is the same failure class
`preserveRunnerSymlinksPlugin` exists to prevent on the Vite side — that plugin restores 12
symlinks on every renderer build precisely because a build step flattening them breaks the bundle;
here the Tauri bundler flattens them again, one stage later, with no equivalent guard.
**This is untested against a real signing run.** Phase 34.9's macOS packaging work is the natural
owner.

### D-35-04-01 — `main.rs`'s `resolve_packaged_app_root` doc comment now asserts the opposite of the truth

`src-tauri/src/main.rs:6141`'s doc comment still says:

> `electronStub.app.isPackaged` stays `false` under the sidecar regardless of this value, so
> `publicDir` still appends `'public'`, not `'build'` … the packaged asset root itself is a named,
> deliberately unclosed residual (`R-34.5-G1-PKG`), not something this function claims to fix.

**Every clause of that is now false.** The code is right and its own doc comment is the part that
lies — sitting at exactly the place this plan's own objective points a reader to as the Rust-side
record of the defect. Deferred because `main.rs` is not in `files_modified` and the `cargo` gates a
Rust edit owes could not be run against a contended `src-tauri/target/` lock. Comment-only when
someone takes it; note that `stripSourceComments` drops every line matching
`/^\s*(\/\/|\*|\/\*)/`, so `///` doc lines are invisible to the `Backend` suites that read
`main.rs` — a source gate written over this comment would be vacuous.

**This should not leave phase 35.**

### D-35-04-02 — `crossover-index.json.gz` deliberately not bundled

See "Deliberate omissions" above. Open, low priority.

### D-35-04-04 — `enrichmentFlows.test.ts` fails only under full-suite load

Passes 41/41 alone; fails one frame-response assertion in a full `Backend` run. Not this plan's
doing — none of its files is in the enrichment path. Open, unowned.

## Consequence for other documents — NOT applied here

Per `ROADMAP.md`, closing both halves of `R-34.5-G1-PKG` discharges `G-34.2-UAT-02`'s
`blocked_on:` in `.planning/phases/34.2-*/34.2-HUMAN-UAT.md` (`status: diagnosed`,
`blocked_on:` this phase), and makes `REQ-34.2-02` true for a packaged build rather than only for
dev.

**`34.2-HUMAN-UAT.md` was deliberately NOT edited by this plan.** Writing into a closed phase's
record is the orchestrator's call. This is precisely the shape in which a forward-dated claim gets
planted — a plan in phase 35 marking an item complete in phase 34.2's UAT ledger, where the next
reader has no reason to re-derive whether it was earned. Recorded here as a consequence for
someone else to apply.

`STATE.md` and `ROADMAP.md` were likewise not touched and no `gsd-sdk` `state.*` / `roadmap.*` /
`requirements.*` / `phase.complete` verb was invoked, per standing instruction. Tracking is applied
by hand.

## Commits

| Commit | Task | Files |
|---|---|---|
| `c69f383b1` | 1 | `isPackagedSidecar.ts`, `isPackagedSidecar.test.ts`, `humbleFlowRegistration.ts`, `devSecretVault.ts`, `electronStub.ts`, `devSecretVault.test.ts`, `testContainment.test.ts` |
| `4e8197d3a` | 2 | `src-tauri/tauri.conf.json`, `packagingConfig.test.ts` |
| `b581f023f` | 3 | `deferred-items.md` |

## Self-Check: PASSED

- All three commits exist and are reachable from HEAD.
- Both created files exist on disk; all seven modified files appear across the three commits.
- `src/backend/constants/paths.ts` is **absent** from the diff, as the plan's constraint requires —
  `publicDir`'s expression was always correct; only `app.isPackaged`'s value and the bundle's
  contents were wrong.
- `src-tauri/src/main.rs` is absent from the diff (see D-35-04-01).
- Acceptance greps: `node:sea` in `isPackagedSidecar.ts` = 8; `isPackaged: false` in
  `electronStub.ts` = **0**; `get isPackaged` = 1; `require('node:sea')` in
  `humbleFlowRegistration.ts` = **0**; `bundle.resources` map form with 5 entries, all targets
  under `build/`, no `main`/`preload`/`sea-config`/`sidecar-prep` keys.
- Adjacent config keys verified undisturbed: `bundle.targets`, `frontendDist`, `devUrl`,
  `beforeDevCommand`, `externalBin`, `plugins.updater.pubkey`.
- The DMG was unmounted and all probe artifacts removed; `git status --short` is clean.
- The blocking checkpoint was passed by the operator on a real packaged artifact, 2026-08-29 — not
  inferred from a dev run, and not claimed for the Epic/GOG runner path, which was not exercised.
