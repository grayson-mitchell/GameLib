# 260901-e7o Research — restore runner symlinks in the Tauri macOS bundle

**Researched:** 2026-09-01
**Scope:** Cause 3 of `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md`
**Tauri CLI under study:** `@tauri-apps/cli` 2.11.4 (`node_modules/@tauri-apps/cli/package.json:3`). All Rust
sources below were fetched at tag **`tauri-cli-v2.11.4`**, whose `crates/tauri-cli/Cargo.toml:3` reads
`version = "2.11.4"` — an exact match, not a `dev`-branch approximation.

---

## Verdicts up front

| Q | Verdict | Confidence |
|---|---------|-----------|
| **Q2 — implementable in CI?** | **YES, and cheaply — but NOT via a post-build repair.** The fix is a config-level move from `bundle.resources` to `bundle.macOS.files`, which Tauri copies with a **symlink-preserving** `copy_dir`, one step BEFORE codesigning, inside the same `tauri build`. Zero CI-workflow change. A post-build repair is viable but expensive and is the fallback. | **HIGH** (source-level, three files, plus an upstream unit test) — but the end-to-end has **not** been exercised by a real build; that is the plan's Task 1. |
| **Q3 — signing blocker?** | **NO — not for Tauri, as Tauri signs today.** MEASURED: Tauri invokes `codesign --force -s <id>` on the `.app` root with **no `--deep`**, and that command exits **0** over the broken tree. The F-34.9-01 error is real and reproduces at exit 1 — but only when `codesign` is pointed AT the framework, which is what electron-builder does and Tauri does not. **This is a size + structural-correctness fix, not a release blocker.** Notarization remains an untested unknown. | **HIGH** for the codesign result (ran it, both directions). **LOW** for notarization (no credentials). |

**One correction to the existing record, confirmed:** the todo says "only the KEPT `arm64/darwin` and `x64/darwin` trees are affected". **`x64/darwin` carries ZERO symlinks and is byte-identical repo-to-shipped.** Only `arm64/darwin` is affected. (The `x64/darwin` tree is 4 files — it is the Steam-bridge shim leg, not a PyInstaller onedir tree.)

**A second, previously unrecorded finding — the defect is worse than "duplicated files":** two of the four symlinks per runner are **DROPPED ENTIRELY** from the shipped bundle, not dereferenced. The shipped `Python.framework` has **no `Resources` entry and no `Versions/Current` entry at all**. See Q1 for the mechanism and Q3 for the measurement.

---

## Q1 — Does Tauri 2.11.x offer any way to preserve symlinks in `bundle.resources`?

**No. There is no config option, and it is an unfixed upstream bug — not a design choice.**

### The mechanism, exactly

`bundle.resources` is copied by `Settings::copy_resources`:

```rust
// crates/tauri-bundler/src/bundle/settings.rs:1179-1186
pub fn copy_resources(&self, path: &Path) -> crate::Result<()> {
  for resource in self.resource_files().iter() {
    let resource = resource?;
    let dest = path.join(resource.target());
    fs_utils::copy_file(resource.path(), &dest)?;   // <- ONLY copy_file
  }
  Ok(())
}
```

`fs_utils::copy_file` (`crates/tauri-bundler/src/utils/fs_utils.rs:81-96`) ends in `fs::copy(from, to)` — which
**follows** symlinks — and has no symlink branch whatsoever.

The directory walk that feeds it is `tauri_utils::resources::ResourcePaths`:

- `crates/tauri-utils/src/resources.rs:263-268` — `WalkDir::new(&path).into_iter()`, **without** `follow_links(true)`, so walkdir never descends *through* a symlinked directory.
- `crates/tauri-utils/src/resources.rs:161-162` — each walkdir entry is immediately mapped to a `PathBuf` (`entry.into_path()`).
- `crates/tauri-utils/src/resources.rs:176-181` — `// Skip directories` / `if entry.is_dir() { … }`. Because `entry` is now a `PathBuf`, this is `Path::is_dir()`, which **DOES follow symlinks**.

Composing those three facts gives the exact observed behaviour:

| Source entry | `Path::is_dir()` | walkdir descends? | Outcome in the bundle |
|---|---|---|---|
| symlink → **file** | false | n/a | yielded to `copy_file` → **dereferenced into a real file copy** |
| symlink → **directory** | true | **no** (no `follow_links`) | **skipped as a "directory" and never emitted — the entry VANISHES** |

Per runner: `_internal/Python` and `_internal/Python.framework/Python` are file-links → +2 real copies of the
7,996,912 B `Python` binary. `_internal/Python.framework/Resources` and
`_internal/Python.framework/Versions/Current` are dir-links → **dropped**.

That predicts `+2 files` and `+2 × 7,996,912 B` per runner, `×3 runners` = `+6 files`, `+47,981,472 B`, `−12 symlinks`.
The measured artifact matches to the byte (Q3).

### `fs_utils::copy_dir` — the same crate ALREADY has a symlink-preserving copier

```rust
// crates/tauri-bundler/src/utils/fs_utils.rs:116-133 (inside copy_dir)
for entry in walkdir::WalkDir::new(from) {
  …
  if entry.file_type().is_symlink() {
    let target = fs::read_link(entry.path())?;
    if entry.path().is_dir() { symlink_dir(&target, &dest_path)?; }
    else { symlink_file(&target, &dest_path)?; }
  } else if entry.file_type().is_dir() { fs::create_dir_all(dest_path)?; }
  else { fs::copy(entry.path(), dest_path)?; }
}
```

Upstream even unit-tests it: `copy_dir_with_symlinks`, `fs_utils.rs:188-239`, which asserts
`read_link(copy/link) == "sub/file.txt"` after the copy. **`copy_resources` simply does not call it.**
`copy_dir` is used by `copy_frameworks_to_bundle` (`macos/app.rs:403`) and by
`copy_custom_files_to_bundle` (`macos/app.rs:200`) — the latter is `bundle.macOS.files`, which is the basis of the
recommended fix.

### Config schema: no relevant option

Dumped from the installed `node_modules/@tauri-apps/cli/config.schema.json` (2.11.4). `BundleConfig` exposes
`active, targets, createUpdaterArtifacts, publisher, homepage, icon, resources, copyright, license, licenseFile,
category, fileAssociations, shortDescription, longDescription, useLocalToolsDir, externalBin, macOS, iOS,
windows, linux`. `MacConfig` exposes `files, bundleVersion, bundleName, minimumSystemVersion, exceptionDomain,
signingIdentity, hardenedRuntime, providerShortName, entitlements, infoPlist, dmg` (plus `frameworks`,
`skipStapling` in the Rust settings). **Nothing symlink-related anywhere.** `[VERIFIED: installed schema]`

### Upstream status

**[CITED: https://github.com/tauri-apps/tauri/issues/13219]** — *"[bug] Embedding Additional Files not keep
Symlinks when building dmg"*, opened **2025-04-12**, **still OPEN**, labels `type: bug, platform: macOS,
status: needs triage`, **1 comment**, last activity 2026-07-14. The single comment (user `phlmn`, 2026-07-14)
describes our case verbatim:

> "We are also experiencing this issue with relative symlinks. When embedding a python interpreter we get three
> copies of the python binary due to the `python3 -> python3.12` and `python -> python3.12` symlinks. […] This
> happens also without building the dmg. `target/debug` already contains the resources with 'resolved' symlinks.
> Are there any plans on fixing this?"

No maintainer reply in 17 months; still `needs triage`. **It is a bug, labelled as such by the project, with no
owner.** An upstream fix is not worth waiting for. Filing a PR against `copy_resources` is a legitimate optional
follow-up (the symlink-handling code already exists two functions away in the same file) but must not gate this task.

---

## Q2 — Where exactly can a repair step run? (LOAD-BEARING)

### The ordering inside `tauri build`, from source

`crates/tauri-bundler/src/bundle/macos/app.rs::bundle_project`:

| Line | Step |
|---|---|
| 67-70 | `fs::remove_dir_all` the existing `.app` (fresh every build) |
| 80-91 | icns, Assets.car, `Info.plist` |
| 93-95 | `copy_frameworks_to_bundle` (`bundle.macOS.frameworks`) — uses `copy_dir`, symlink-safe |
| **97** | **`settings.copy_resources(&resources_dir)` ← `bundle.resources`, DEREFERENCES** |
| 99-105 | `copy_binaries` (`externalBin`) |
| 107-111 | `copy_binaries_to_bundle` |
| **113** | **`copy_custom_files_to_bundle` ← `bundle.macOS.files`, uses `copy_dir`, SYMLINK-SAFE** |
| **115-132** | `if settings.no_sign() {…} else if let Some(keychain) = …` → `remove_extra_attr` (`xattr -crs`) then **`sign(&keychain, sign_paths, settings)`** |
| 134-150 | notarize (+ staple) |

Then, later, in `crates/tauri-bundler/src/bundle.rs`:
- `:164-172` `PackageType::Dmg` → `macos::dmg::bundle_project`, which builds the DMG from the **already-signed** `.app` and signs the DMG itself at `macos/dmg/mod.rs:193-207`.
- `:244-262` **the `.app` is DELETED** when `MacOsBundle` is not in the requested targets. Our `bundle.targets` is `["nsis","appimage","dmg"]` (`src-tauri/tauri.conf.json:31`), so on macOS only `dmg` is built and the `.app` is deleted — which is why only the DMG exists on disk locally.

**Answers to the parent's explicit sub-questions:**

- **Does Tauri sign the bundle itself, and when relative to resource copying?** **YES**, inside `tauri build`, at `app.rs:115-132`, **after** resource copying (`:97`) and **after** `macOS.files` (`:113`). A post-`tauri build` repair therefore (a) invalidates the `.app` signature, and (b) arrives after the DMG was already built from the unrepaired `.app`, and (c) with our current `targets` there is **no `.app` left to repair at all**.
- **Does the DMG preserve symlinks?** **YES — measured, not assumed.** `bundle_dmg.sh` uses `hdiutil create -srcfolder … -format UDZO` (`bundle_dmg.sh:29`, `:382`). Mounting the current release DMG read-only shows `lrwxr-xr-x  Applications -> /Applications` at the volume root. A symlink survives the image round-trip. `[VERIFIED: hdiutil attach + ls -la]`
- **The updater artifact also preserves symlinks:** `updater_bundle.rs:245-251` calls `builder.follow_symlinks(false)` on the macOS `tar.gz`. `[VERIFIED: source]`

### Hooks available in 2.11.4

`config.schema.json` `BuildConfig` = `runner, devUrl, frontendDist, beforeDevCommand, beforeBuildCommand,
beforeBundleCommand, features, removeUnusedCommands, additionalWatchFolders`.

- **`beforeBundleCommand` IS real in v2** (our config simply does not set it). But it is useless here:
  `crates/tauri-cli/src/bundle.rs:189-200` runs it, and `:219` calls `tauri_bundler::bundle_project` **afterwards**.
  It fires **before** any resource is copied.
- `beforeBuildCommand` is earlier still — `crates/tauri-cli/src/build.rs:189-196`, inside `setup()`, before
  `interface.build()` at `:118`.
- **There is no `afterBundleCommand` / `afterBuildCommand` in the schema.** `[VERIFIED: installed schema]`

**Conclusion: no hook fires in the required window (after `copy_resources`, before `sign`). Confidence HIGH.**

### The four candidate shapes, costed

#### **Option A — RECOMMENDED. Move the darwin runner trees from `bundle.resources` to `bundle.macOS.files`.**

`bundle.macOS.files` is a `{ path-relative-to-Contents: source-path }` map. It is copied at `app.rs:113` by
`copy_custom_files_to_bundle` (`app.rs:183-209`), which dispatches to `fs_utils::copy_dir` for directory sources
(`app.rs:200`) — **the symlink-preserving copier**. The CLI really does wire the config through:

```rust
// crates/tauri-cli/src/interface/rust.rs:1635-1637
macos: MacOsSettings {
  …
  files: config.macos.files,
```

Concretely, in `src-tauri/tauri.macos.conf.json`, replace

```json
"bundle": { "resources": { "../build/bin/arm64/darwin/": "build/bin/arm64/darwin", … } }
```

with (keys are relative to `Contents/`, hence the `Resources/` prefix)

```json
"bundle": { "macOS": { "files": { "Resources/build/bin/arm64/darwin": "../build/bin/arm64/darwin", … } } }
```

**Destination paths are byte-identical to today** (`Contents/Resources/build/bin/arm64/darwin/…`), so nothing at
runtime changes: `src/backend/constants/paths.ts:80-83` resolves `publicDir = resolve(app.getAppPath(), 'build')`
and never reads Tauri's resource config.

Why it is the right shape:
- Runs **before** signing → no re-sign, no invalidated signature.
- Entirely inside `tauri build` → **`.github/workflows/release-tauri.yml` needs no change at all**; `tauri-action@v1` (`:431-438`) is untouched.
- Fail-loud: `copy_custom_files_to_bundle` errors with `"… does not exist"` on a missing source (`app.rs:185-189`), unlike a silent no-op.
- File-valued entries (`EpicGamesLauncher.exe`, `GalaxyCommunication.exe`, `legendary.LICENSE`) work too, via `fs_utils::copy_file` (`app.rs:197`).
- `macOS.files` is macOS-only by construction, so the Windows/Linux overlays are untouched.

Costs and hazards (all must be in the plan):
1. **`packagingConfig.test.ts` churn.** Roughly lines **146-357 of 404** assert against the merged per-platform `bundle.resources` map (`describe` blocks at `:146`, `:198`, `:299`). Those assertions must be re-pointed at the merged `bundle.macOS.files` map. This is the single largest cost of Option A and it collides with the task's `scoped_out` boundary — **see "Scope tension" below.**
2. **You cannot map the same destination through BOTH mechanisms.** `copy_resources` (`:97`) would write a real file first, and `copy_dir`'s `symlink()` at `fs_utils.rs:124/126` would then fail `EEXIST`. Each darwin tree must be in exactly one of the two maps.
3. **`macOS.files` is a `HashMap` — iteration order is nondeterministic.** Our entries are disjoint sibling paths, so ordering is irrelevant; but a future *nested* pair of entries could produce a non-deterministic `EEXIST`. Worth a comment in the config.
4. **Hidden dependency on the vite plugin.** If the source stays `../build/bin/...`, Option A is only correct because `preserveRunnerSymlinksPlugin` restored the symlinks into `build/` first. Deleting that plugin would silently re-break this. **Variant A′: source directly from `../public/bin/arm64/darwin` instead** — `public/bin/arm64/darwin` was measured to be identical (279 files / 12 symlinks) and is the true upstream. A′ removes the coupling entirely. It does *not* remove the need for the vite plugin (the Electron `dist:mac` path still uses `build/`), it only decouples the Tauri path from it. **This is a genuine design choice for the planner, not a settled one.**

#### **Option B — FALLBACK. `tauri build --bundles app` → repair → re-sign → build the DMG separately.**
Requires: adding `app` to macOS targets (or `--bundles app`), running the repair, re-running `codesign` over the
whole `.app` with the right identity/entitlements/`--options runtime`, then invoking `bundle_dmg.sh` or
`create-dmg` by hand, then re-signing the DMG, then producing and signing the updater `tar.gz` + `.sig`
(`sign_updaters`, `crates/tauri-cli/src/bundle.rs:222`). In CI this means abandoning `tauri-action@v1`'s bundling
and artifact-upload path for the macOS legs, or bolting a second job on after it. **Rough cost: 4-6× Option A,
with a much larger blast radius on a release pipeline that has *never completed a real tag-push run*
(`release-tauri.yml:5-9`).** Recommend only if Option A fails its live gate.

#### **Option C — post-DMG repair.** Impossible: the DMG is read-only, compressed, and (when signing is enrolled) signed.

#### **Option D — ship a `.tar` resource and extract at first run.** Rejected: moves 100 MB of I/O to runtime, invents a new failure mode, and defeats the whole point of a pre-laid-out onedir tree.

### Scope tension — the planner must resolve this explicitly

The task's `scope_boundaries` say *"Anything touching `frontendDist` or `bundle.resources` MAPPINGS — both were
just settled by quick-260901-b8z and quick-260901-8rm"* is out of scope. **Option A moves entries out of
`bundle.resources`.** It does not change *which* trees ship or *where they land* — 8rm's actual decision — but it
does edit that map and its tests. The honest framing: **8rm settled the SET of shipped trees; Option A changes the
COPY MECHANISM while preserving that set byte-for-byte.** If the boundary is read literally, this task has no
in-scope fix at all and reduces to Option B. **This is a decision for the user, not for research to assume.**

---

## Q3 — Is this a codesigning-correctness fix or a size fix? (LOAD-BEARING)

### What is actually in the shipped bundle — measured

Mounted `src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg` (155,175,396 B, the post-b8z release
artifact) read-only via `hdiutil attach -readonly -nobrowse`.

```
Contents/Resources/build/bin/arm64/darwin/legendary/_internal/Python.framework
├── Python                      <- REAL FILE, 7,996,912 B   (was: symlink -> Versions/Current/Python)
└── Versions
    └── 3.12
        ├── Python              <- REAL FILE, 7,996,912 B
        └── Resources/Info.plist
```

**`Python.framework/Resources` — ABSENT. `Python.framework/Versions/Current` — ABSENT.** Not "a real directory
where a link belongs" (what the todo assumed) but **gone entirely**, exactly as Q1's mechanism predicts.

Counts on the mounted tree: **285 files, 0 symlinks, 148,688,545 B** apparent bytes — an exact match to the
parent's baseline. 9 files named `Python` (3 per runner).

### Does the runner still execute? YES

`otool -D` on the shipped `Versions/3.12/Python` gives install name **`@rpath/Python`**, and the dereferenced
real file `_internal/Python` satisfies it. The runners therefore work today; nothing is functionally broken.
This is *why* the defect has survived unnoticed.

### The codesign experiment — run, both directions

Three fixtures from the real `legendary` framework: **good** (`cp -R`, symlinks intact, 3 links / 7,997,887 B),
**bad** (`cp -RL`, real dirs where links belong, 0 links / 23,993,661 B), **shipped** (copied off the mounted DMG,
0 links, `Resources`/`Versions/Current` absent). This Mac has **`0 valid identities found`**
(`security find-identity -v -p codesigning`), so everything below is ad-hoc `-s -`.

**Pointed AT the framework** — `codesign --force -s - <framework>`:

| fixture | exit | stderr |
|---|---|---|
| good | **0** | `replacing existing signature` |
| bad | **1** | **`bundle format is ambiguous (could be app or framework)`** ← F-34.9-01, verbatim |
| shipped | **1** | **`bundle format unrecognized, invalid, or unsuitable`** |

**Pointed at a minimal `.app` with the framework under `Contents/Resources/build/bin/arm64/darwin/legendary/_internal/`,
using Tauri's exact flag shape** — `codesign --force -s - <app>` and `codesign --force --options runtime -s - <app>`:

| fixture | `--force -s -` | `--force --options runtime -s -` | `--deep --force -s -` | `--verify --deep --strict` |
|---|---|---|---|---|
| good | 0 | 0 | 0 | 0, *valid on disk / satisfies its Designated Requirement* |
| bad | **0** | **0** | **0** | **0**, same |
| shipped | **0** | **0** | **0** | **0**, same |

**Interpretation.** `codesign` treats everything under `Contents/Resources/` as opaque resource data and seals it
into `_CodeSignature/CodeResources` without classifying nested `.framework` directories. `--deep` only descends
into the *recognised* nested-code locations (`MacOS, Frameworks, PlugIns, XPCServices, Helpers, Libraries` —
mirrored in the bundler's own `NESTED_CODE_FOLDER` at `macos/app.rs:44-51`), which does not include arbitrary
`Resources/` subtrees.

### Why F-34.9-01 fired on electron-builder but will not fire on Tauri

Tauri's signer is `tauri-macos-sign`, and its `Keychain::sign` builds exactly this argv
(`crates/tauri-macos-sign/src/keychain.rs:207-246`):

```rust
let mut args = vec!["--force", "-s", &identity];
if hardened_runtime { args.push("--options"); args.push("runtime"); }
// + --keychain <p>, + --entitlements <p>
```

**No `--deep`, and the only macOS targets are `sign_paths`** — `bundle.macOS.frameworks`, `externalBin`, the main
binaries, and the `.app` root (`macos/app.rs:93-125`). **`bundle.resources` content is never a sign target.**
electron-builder, by contrast, enumerates and signs nested code individually — which is precisely the
`probe2-bad.framework` case that exits 1 above.

### Verdict

**This is a SIZE fix plus a STRUCTURAL-CORRECTNESS fix. It is NOT a signing blocker for Tauri as Tauri signs
today.** It does not change the priority of enrolling Apple certs.

The structural claim still stands on its own merits and should be stated as such, not dressed up as a signing
blocker: the shipped `Python.framework` violates Apple's framework layout (no `Versions/Current`, no `Resources`),
it is 45.76 MiB of pure duplication, and any future step that points `codesign` at that framework — an
electron-builder-style nested-signing sweep, a third-party notarization helper, a `codesign --verify` sweep in a
release gate — **will exit 1**, as measured.

### Open risk that this research CANNOT close: notarization

`notarize_inner` (`crates/tauri-macos-sign/src/lib.rs:133-200`) `ditto`s the `.app` and submits it to
`notarytool`. Apple's notary service performs its own server-side structural and nested-code inspection, which is
strictly broader than local `codesign`. **Whether the notary service rejects a malformed nested framework under
`Resources/` is untestable without an enrolled Apple Developer account and is left as an OPEN QUESTION.** A
related, *pre-existing and independent* concern surfaced while measuring: every `.so` and dylib in the runner trees
is currently **`adhoc`**-signed (reported by `pnpm verify:runner-bundle`), and Tauri never signs them individually
— that is a likely notarization problem in its own right, orthogonal to symlinks, and out of scope here.

---

## Q4 — Can `meta/preserveRunnerSymlinks.ts` be reused?

**YES — as a literal drop-in, with zero code changes. Proven by execution, not by reading.**

### Its contract

- **Source of truth:** `collectSymlinks(sourceDir)` (`meta/preserveRunnerSymlinks.ts:47-83`) walks the **source tree** and records `{ relPath, target }` for every `dirent.isSymbolicLink()`. There is no hard-coded list; the repo tree *is* the manifest. It recurses only on `dirent.isDirectory()` (lstat semantics), so a symlink-to-dir is never walked through.
- **`rejected`** (`isContainedSymlinkTarget`, `:121-140`): refuses any **absolute** target, and any relative target that resolves outside `destDir` (resolved from the *link's own* directory). Purely lexical — no `realpathSync`, so it does not require the destination to exist yet. Checked **before** `rmSync` (`:174-182`), deliberately, so a rejected record leaves the dereferenced file untouched rather than deleting it and refusing to replace it (T-34.9-18-02).
- **`skipped`**: destination *parent* directory missing.
- `restoreSymlinks` is idempotent: `rmSync(destPath, { recursive: true, force: true })` unlinks a symlink without following it.
- The plugin wrapper `preserveRunnerSymlinksPlugin` (`:217-262`) **throws** if either bucket is non-empty. Its defaults are `sourceDir = <repo>/public`, `destDir = <repo>/build`.

### Does it transfer to an `.app` bundle? Measured: yes, exactly.

Because the destination layout inside the bundle is `Contents/Resources/build/bin/...`, calling
`restoreSymlinks('<repo>/public', '<app>/Contents/Resources/build')` produces `relPath` values
(`bin/arm64/darwin/legendary/_internal/Python`, …) that land precisely right. **No path rewriting needed.**

Executed against a writable copy of the real shipped tree:

```
{"restored":12,"skipped":0,"rejected":0}
BEFORE: files=285  links= 0  bytes=148,688,545
AFTER:  files=279  links=12  bytes=100,707,073
```

That is **−47,981,472 B (−45.76 MiB)** and an exact match to the repo tree (279 / 12 / 100,707,073). All 12 links
restored, including the two the bundler had *dropped* — `Python.framework/Resources` and
`Python.framework/Versions/Current` are recreated and resolve correctly, because `restoreSymlinks` creates them
from the source manifest rather than from whatever the destination happens to contain.

`find <repo>/public -type l` returns exactly **12** entries, all under `bin/arm64/darwin`. There are no other
symlinks anywhere in `public/`, so a bundle-wide restore has no blast radius beyond the three runners.

### Where it applies under each option

- **Option A (recommended):** the module is **not needed for Tauri at all** — the bundler's own `copy_dir` does the job. `preserveRunnerSymlinksPlugin` must nevertheless stay wired at `vite.config.ts:126` (it is what puts the symlinks into `build/` for the Electron `dist:mac` path, and — under Option A-not-A′ — for Tauri's source tree too). The pinned assertion in `packagingConfig.test.ts` (find it by the describe title `'vite.config.ts registers the runner-symlink preservation plugin (F-34.9-01)'`) stays green.
- **Option B (fallback):** `restoreSymlinks` is the repair step, called with the two arguments above. **Extend the existing module; do not write a second implementation.** The only additions needed are a CLI entry point (a `main()` taking `<appPath>`) and a `package.json` script, mirroring `verify:runner-bundle`.

---

## Q5 — Verification strategy

### The gate already exists, and it is already proven non-vacuous in both directions

`meta/verifyRunnerBundle.ts` (`pnpm verify:runner-bundle <root> [--arch=…]`, `package.json:64`) already enforces
the exact structural property, via `inspectFramework` (`:150-219`) and `summarise` (`:427-…`), and
`findDarwinBinRoot` (`:230-263`) **searches** for `build/bin/<arch>/darwin` under any root — the Tauri layout
(`Contents/Resources/build/bin/arm64/darwin`) is found without modification.

**Run against the real shipped `.app` on the mounted DMG — EXIT 1, six failures:**

```
- legendary: framework …/legendary/_internal/Python.framework malformed --
    Versions/Current does not exist (F-34.9-01)
- legendary: framework …/legendary/_internal/Python.framework malformed --
    top-level stub "Python" is a real file, not symlink into Versions/Current (F-34.9-01)
  (× gogdl, × nile — 2 per runner)
```

**Run against the same tree after `restoreSymlinks` — EXIT 0:**

```
PASS: all three onedir runners present, executable and Mach-O; tree sizes above the floor.
```

One mutation, one command, opposite verdicts. That is the mutation proof.

### Trap coverage — checked against the four the parent named

| Trap | Status |
|---|---|
| "passes when a directory is missing" | **Covered.** `findDarwinBinRoot` **throws** (`:258-263`) when no `build/bin/<arch>/darwin` exists under the root. It cannot silently pass on an absent tree. |
| "measuring something another mechanism repopulates" | **Covered by construction under Option A** — the assertion is made on the *mounted release artifact*, which nothing else writes to. Additionally assert the repair's own reported output where one exists (Option B: `restored 12, skipped 0, rejected 0`). |
| "`du` vs apparent bytes" | **Use `sum(stat -f %z)` over regular files, symlinks excluded** — the b8z convention (`260901-b8z-MEASUREMENTS.md:3-8`). Every figure in this document was derived that way. Never `du`. |
| "comparing the wrong pair" | **OLD SHIPPED vs NEW SHIPPED.** The `repo − shipped` pairing produced two retracted explanations in this task series. |

### The gate's blind spot — must be closed by the plan

`inspectFramework` checks only **`Versions/Current`** and the **top-level stub**. It does **not** check
`Python.framework/Resources`, and it does **not** check `_internal/Python` (which lives outside the framework
directory). A tree missing both of those would still exit 0. Add two artifact-level assertions on the shipped
`build/bin/arm64/darwin` tree:

```
symlink count == 12       (find <tree> -type l | wc -l)
file    count == 279      (find <tree> -type f | wc -l)
apparent bytes == 100,707,073
```

All three are exact, all three were measured on the repaired tree, and each fails in a distinguishable way.

### Expected post-fix numbers, with arithmetic

| Quantity | Current (measured) | After fix | Basis |
|---|---|---|---|
| shipped `build/bin/arm64/darwin` — files | 285 | **279** | `285 − 6` (2 dereferenced file-links × 3 runners) — **MEASURED on the repaired tree**, not predicted |
| — symlinks | 0 | **12** | 4 per runner × 3 — MEASURED |
| — apparent bytes | 148,688,545 | **100,707,073** | `148,688,545 − 6 × 7,996,912 = 100,707,073` — MEASURED |
| shipped `build/bin/x64/darwin` | 46,423,272 | **46,423,272** | unchanged; 4 files, 0 symlinks |
| installed `.app` apparent bytes | 384,357,326 (`260901-b8z-MEASUREMENTS.md:188-189`) | **336,375,854** | `384,357,326 − 47,981,472` — **PREDICTED arithmetic** |
| DMG bytes | 155,175,396 | **≈ 141 MB, band 138-145 MB** | **WEAK ESTIMATE — DO NOT USE AS A GATE THRESHOLD.** UDZO/zlib (`hdiutil imageinfo`: `Format: UDZO`, ratio 0.400); `gzip -6` of the 7,996,912 B `Python` is 2,351,896 B, so removing 6 copies removes ≈ 14.1 MB *if* zlib block boundaries behaved like per-file compression, which they do not. Record the DMG size as **data**, never as a pass condition. |

### Recommended gate shape

1. Build a **real release artifact** (`--debug` is not sufficient: the packaged-`--debug` build runs `node build/main/sidecar.js`, not the bundled SEA). Mount the DMG read-only per `260901-8rm-MEASUREMENTS.md:8-9`.
2. `pnpm verify:runner-bundle "<mount>/GameLib.app" --arch=arm64` → **must exit 0**. *(It exits 1 today — that is the mutation control, already run.)*
3. The three exact counts above on `Contents/Resources/build/bin/arm64/darwin`.
4. `codesign --force -s - <a copy of the shipped legendary Python.framework>` → **must exit 0**. *(Exits 1 today with `bundle format unrecognized, invalid, or unsuitable` — also already run.)* Copy off the read-only mount first.
5. `x64/darwin` non-regression: still 4 files, 0 symlinks, 46,423,272 B.
6. Record the DMG and `.app` sizes as data, not as thresholds.
7. **A live functional gesture, not just a structural one** — see Q6.

---

## Q6 — Risk assessment

| # | Risk | Assessment |
|---|---|---|
| 1 | **The helpers must still EXECUTE.** A broken `Python` link means legendary/nile/gogdl fail to launch — far worse than 45 MiB. | **The single highest risk.** Note the failure would be *silent in every automated gate*: `verifyRunnerBundle` checks Mach-O magic and file counts, not execution. The restored layout is byte-identical to the repo tree that the Electron `dist:mac` path has always shipped, and `otool -D` confirms `@rpath/Python` is satisfied by `_internal/Python` in both shapes — but that is an inference. **The plan MUST include a live gesture on the packaged artifact: launch it and run one real Epic/GOG/Amazon library operation per runner.** Do not accept a structural gate as proof of execution. |
| 2 | **The `.app` gets *smaller* — does anything assert a size floor?** | `verifyRunnerBundle`'s `FILE_COUNT_FLOOR = 20` (`meta/verifyRunnerBundle.ts:64`) is per-runner and counts `Dirent.isFile()`, which is **false for symlinks**. Post-fix a runner tree loses 2 files and gains 4 symlinks; the counts stay far above 20. `packagingConfig.test.ts` asserts config shape, not sizes. **No known size-floor assertion breaks.** The b8z non-regression band (`230,000,000 < t < 260,000,000`) is already stale and already documented as such. |
| 3 | **Gatekeeper / quarantine.** | `remove_extra_attr` runs `xattr -crs <app>` (`macos/app.rs:156-163`). `-s` means *do not follow symlinks* — it operates on the link itself. Non-destructive either way. Quarantine is applied to the downloaded DMG as a whole, not per-entry. **No expected interaction. Confidence MEDIUM** (reasoned from the `xattr` flags, not exercised on a signed+quarantined artifact). |
| 4 | **`hdiutil` compression vs symlinks.** | **Measured safe** — the current DMG already carries `Applications -> /Applications` through `hdiutil create -srcfolder -format UDZO`. |
| 5 | **The updater `tar.gz`.** | `builder.follow_symlinks(false)` (`updater_bundle.rs:248`) — symlinks preserved, so the updater artifact shrinks too. Separately note: with `bundle.targets` = `["nsis","appimage","dmg"]`, `MacOsBundle` is not in the requested set, so per `bundle.rs:206-218` **no macOS updater artifact is produced today** and the bundler logs *"configured to create updater artifacts but no updater-enabled targets were built"*. The stale `bundle/macos/GameLib.app.tar.gz` on disk is dated **Aug 23** — a leftover, not this build's output. **Flagged as a possibly-separate defect; out of scope here.** |
| 6 | **Anything downstream reading those paths expecting real files.** | `grep` of `src/backend/constants/paths.ts` shows the only `bin/*/darwin` consumers are `steam_api.dll` (`:103-104`) and `steam-bridge-helper` (`:117-118`) — neither is inside a `Python.framework`. Nothing in the repo reads `_internal/Python*` by path. **Confidence MEDIUM** — grep-based, and a dynamic/constructed path would not show up. |
| 7 | **Option A only: `copy_dir` failing `EEXIST`.** | `copy_dir` has no dest-exists guard (its doc comment claims one; the code at `fs_utils.rs:103-135` does not implement it) and `symlink()` fails if the destination exists. Safe today because `app.rs:67-70` deletes the whole `.app` first, and because our `macOS.files` keys are disjoint. **Becomes a real hazard if a future entry nests inside another** (HashMap order is nondeterministic). Put a comment in `tauri.macos.conf.json`. |
| 8 | **Option A only: `macOS.files` is unexercised by any real build in this repo.** | Source-level evidence is strong and upstream unit-tests both halves (`app.rs:598-628` `test_copy_custom_file_to_bundle_dir`; `fs_utils.rs:188-239` `copy_dir_with_symlinks`), but nothing here has run it end-to-end. **Make it the plan's Task 1 with a real release build, before touching 200 lines of `packagingConfig.test.ts`.** |
| 9 | **Windows / Linux legs.** | `bundle.macOS.files` is read only by the macOS bundler and only lives in `tauri.macos.conf.json`. `release-tauri.yml`'s Windows and Linux legs are untouched. Note those overlays remain unexercised by any real build (`release-tauri.yml:5-9`; the pipeline has never completed a tag-push run) — a pre-existing gap, not one this task creates. |

---

## Open questions / unknowns — LABELLED

1. **Does `bundle.macOS.files` actually preserve the symlinks end-to-end in a real 2.11.4 build?** **UNPROVEN.** Every link in the chain is source-verified (`rust_interface.rs:1637` → `app.rs:113` → `app.rs:200` → `fs_utils.rs:121-127`) and upstream unit-tests both ends, but no build was run. **Must be the plan's first gate.** If it fails, fall back to Option B.
2. **Does Apple's notarization service reject the malformed nested framework?** **UNTESTABLE HERE** — `security find-identity -v` reports `0 valid identities found` on this Mac and no Apple Developer account is enrolled. Local `codesign` says no (measured). The notary service's server-side inspection is strictly broader and is a genuine unknown. If it *does* reject, Q3's verdict flips from "size fix" to "release blocker" — but that would surface only at first enrolled release.
3. **The runner trees' `.so`/dylib files are all `adhoc`-signed and Tauri never signs them individually.** Likely an independent notarization problem. **Out of scope; recommend a separate todo.**
4. **Is the macOS updater artifact silently not being produced?** `bundle.targets` excludes `app`, and `bundle.rs:206-218` warns rather than errors. The `.tar.gz` on disk is 9 days stale. **Not investigated; flagged.**
5. **Does the DMG size drop by ≈14 MB?** Estimated from `gzip -6` of the duplicated binary; UDZO compresses 1 MB *filesystem-image blocks*, not files, so the real figure will differ. **Record as data, never as a gate threshold.**
6. **Scope boundary.** Option A edits `bundle.resources` mappings, which the task brief scopes out. Research cannot resolve this — **the user must.** Under a literal reading only Option B remains, at 4-6× the cost.
7. **Option A vs A′ (source from `../build/bin/…` vs `../public/bin/…`).** Both work; A′ decouples the Tauri path from `preserveRunnerSymlinksPlugin`. **Not decided here.**
8. **Risk 6 was assessed by grep.** A dynamically constructed path into `_internal/` would not appear. Low likelihood, non-zero.

---

## Appendix — commands actually run

```bash
# Tauri source, pinned to the tag matching the installed CLI (2.11.4)
curl https://raw.githubusercontent.com/tauri-apps/tauri/tauri-cli-v2.11.4/crates/{…}
#   tauri-bundler/src/{bundle.rs,bundle/settings.rs,bundle/macos/app.rs,
#     bundle/macos/sign.rs,bundle/macos/dmg/mod.rs,bundle/updater_bundle.rs,
#     utils/fs_utils.rs}
#   tauri-utils/src/resources.rs
#   tauri-cli/src/{build.rs,bundle.rs,interface/rust.rs}
#   tauri-macos-sign/src/{lib.rs,keychain.rs}

node -e "…node_modules/@tauri-apps/cli/config.schema.json…"     # BuildConfig / MacConfig / DmgConfig keys
gh api repos/tauri-apps/tauri/issues/13219                       # upstream bug, OPEN, needs triage
security find-identity -v -p codesigning                         # -> 0 valid identities found

find build/bin/arm64/darwin  -type l    # 12 links / 279 files
find public/bin/arm64/darwin -type l    # 12 links / 279 files (identical)
find public -type l                     # exactly 12, all under bin/arm64/darwin

hdiutil attach src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg -readonly -nobrowse -mountpoint <mp>
#   volume root carries `Applications -> /Applications`   (symlinks survive UDZO)
ls -la  <mp>/…/legendary/_internal/Python.framework       # Resources & Versions/Current ABSENT
otool -D <mp>/…/Python.framework/Versions/3.12/Python     # @rpath/Python
hdiutil imageinfo <dmg> | grep Format                     # UDZO, ratio 0.400

# fixtures
cp -R  <repo>/build/bin/arm64/darwin/legendary/_internal/Python.framework  Python.framework.good
cp -RL <repo>/build/bin/arm64/darwin/legendary/_internal/Python.framework  Python.framework.bad
cp -R  <mount>/…/Python.framework                                          Python.framework.shipped

codesign --force -s - <framework>                 # good 0 | bad 1 "ambiguous" | shipped 1 "unrecognized"
codesign --force -s - <Probe.app>                 # good 0 | bad 0 | shipped 0
codesign --force --options runtime -s - <app>     # 0 / 0 / 0
codesign --deep --force -s - <app>                # 0 / 0 / 0
codesign --verify --deep --strict --verbose=2 <app>   # 0 / 0 / 0, all "valid on disk"

# repair simulation, on a writable copy of the real shipped tree
#   BEFORE 285 files / 0 links / 148,688,545 B
node meta/runTs.cjs --bundle … <probe calling restoreSymlinks('<repo>/public',
                                   '<copy>/GameLib.app/Contents/Resources/build')>
#   -> {"restored":12,"skipped":0,"rejected":0}
#   AFTER  279 files / 12 links / 100,707,073 B      (delta -47,981,472 B = -45.76 MiB)

pnpm verify:runner-bundle <mount>/GameLib.app --arch=arm64      # EXIT 1, 6 failures (F-34.9-01)
pnpm verify:runner-bundle <repaired copy>/GameLib.app --arch=arm64   # EXIT 0, PASS
codesign --force -s - <repaired legendary Python.framework>     # exit 0
codesign --verify --strict <same>                               # exit 0, valid on disk

gzip -6 -c <Python 7,996,912 B> | wc -c                         # 2,351,896
```

Byte totals throughout are `sum(stat -f %z)` over regular files, symlinks excluded. `du` was never used.
