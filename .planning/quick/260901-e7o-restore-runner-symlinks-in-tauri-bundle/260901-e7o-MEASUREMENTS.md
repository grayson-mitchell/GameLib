# 260901-e7o Measurements

**Derivation discipline (applies to every number in this file):** every byte figure is
`sum(stat -f %z)` over `find <tree> -type f` (regular files only). `du` is never used anywhere in
this task — APFS block allocation produces phantom deltas that do not reflect what is actually
shipped. Every comparison below names both sides explicitly (OLD SHIPPED vs NEW SHIPPED, or repo
tree vs repo tree) — never `repo tree − shipped tree`, the pairing that produced two retracted
explanations earlier in this task series. File/symlink counts are `find <tree> -type f | wc -l`
and `find <tree> -type l | wc -l` respectively, cross-checked against `verify:runner-bundle`'s own
`censusTree()` (which walks `readdirSync(..., { withFileTypes: true })` and branches on
`isDirectory()`/`isFile()`/`isSymbolicLink()` — lstat-based Dirent types, so a symlinked directory
is never descended into and never double-counted as a file).

## Task 1 — Baseline census + OLD-artifact control

### Repo tree (pre-existing, independent of this task's packaging fix)

Measured directly against the working tree, this machine, 2026-09-01:

| Tree | Files | Symlinks | Apparent bytes | Source |
|---|---:|---:|---:|---|
| `build/bin/arm64/darwin` | 279 | 12 | 100,707,073 | `find -type f/-type l` + `stat -f %z`, cross-checked by `pnpm verify:runner-bundle build/bin/arm64/darwin --arch=arm64 --expect-files=279 --expect-symlinks=12 --expect-bytes=100707073` → `PASS:` |
| `build/bin/x64/darwin` | 4 | 0 | 46,423,272 | `find -type f` + `stat -f %z` |

`build/bin/arm64/darwin` and `public/bin/arm64/darwin` are identical (both 279/12/100,707,073) —
`meta/checkBuildBinMirror.ts` (`pnpm check:build-bin-mirror`) pins this in both directions
(relPath and `readlinkSync` target), so the repo's own staged tree already carries all 12
PyInstaller symlinks correctly. **The defect this task fixes is introduced downstream, at Tauri's
packaging step, not in the repo tree or the vite build.**

### OLD SHIPPED artifact (the real, unrepaired field defect)

Control captured **before** Task 2's build could overwrite the live DMG:
`cp src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg /tmp/e7o-OLD.dmg`, verified
`stat -f %z /tmp/e7o-OLD.dmg` = `155175396` both before the copy and immediately after (both the
source and the copy matched exactly). Preserved at that exact byte size through both gate runs
below.

Independently measured by mounting the control DMG read-only and running `find`/`stat -f %z`
directly against the shipped tree (not merely reading `verify:runner-bundle`'s own report of
itself):

```
hdiutil attach /tmp/e7o-OLD.dmg -readonly -nobrowse -mountpoint "$MP"
find "$MP/GameLib.app/Contents/Resources/build/bin/arm64/darwin" -type f | wc -l   -> 285
find "$MP/GameLib.app/Contents/Resources/build/bin/arm64/darwin" -type l | wc -l   -> 0
find "$MP/GameLib.app/Contents/Resources/build/bin/arm64/darwin" -type f -exec stat -f %z {} \; | awk '{s+=$1} END {print s}'  -> 148688545
find "$MP/GameLib.app/Contents/Resources/build/bin/x64/darwin" -type f | wc -l    -> 4
find "$MP/GameLib.app/Contents/Resources/build/bin/x64/darwin" -type l | wc -l    -> 0
find "$MP/GameLib.app/Contents/Resources/build/bin/x64/darwin" -type f -exec stat -f %z {} \; | awk '{s+=$1} END {print s}'  -> 46423272
hdiutil detach "$MP"
```

| Tree | Files | Symlinks | Apparent bytes |
|---|---:|---:|---:|
| OLD SHIPPED `arm64/darwin` | 285 | 0 | 148,688,545 |
| OLD SHIPPED `x64/darwin` | 4 | 0 | 46,423,272 |

### Comparison — repo tree vs OLD SHIPPED (arm64/darwin only; x64/darwin is unaffected on both sides)

| | repo `build/bin/arm64/darwin` | OLD SHIPPED `arm64/darwin` | delta (SHIPPED − repo) |
|---|---:|---:|---:|
| Files | 279 | 285 | +6 |
| Symlinks | 12 | 0 | −12 |
| Apparent bytes | 100,707,073 | 148,688,545 | +47,981,472 |

The +47,981,472 B inflation is exactly 6 × 7,996,912 B — each of the 12 dropped symlinks left
behind either a dereferenced real-file copy (6 of the 12: the top-level stub and the Resources
alias per runner, since `Versions/Current` and the `_internal/Python` sibling stub's targets are
directories/files already counted elsewhere in the walk) or vanished from the count entirely,
consistent with Tauri's `bundle.resources` copier (`copy_resources`) dereferencing every symlink
it encounters rather than the symlink-preserving `copy_dir` used by `bundle.macOS.files`.
`x64/darwin` (4 files, 0 symlinks — this tree has no PyInstaller framework, hence no symlinks to
drop either way) is byte-identical between repo and OLD SHIPPED, confirming the defect is scoped
to `arm64/darwin` only, exactly as this task's `<objective>` states.

### OLD-artifact gate control run (`meta/verifyRunnerBundle.ts`, hardened)

```
$ pnpm verify:runner-bundle "$MP/GameLib.app" --arch=arm64
```

Exit code: **1** (`OLD_EXIT=1`).

Full `FAIL:` section (12 failures — 4 malformation classes × 3 runners: legendary, gogdl, nile):

```
FAIL:
  - legendary: framework .../legendary/_internal/Python.framework is malformed -- Versions/Current does not exist (F-34.9-01)
  - legendary: framework .../legendary/_internal/Python.framework is malformed -- top-level stub "Python" is a real file, not a symlink into Versions/Current (F-34.9-01)
  - legendary: framework .../legendary/_internal/Python.framework is malformed -- Resources alias does not exist (F-34.9-01)
  - legendary: _internal sibling stub for .../legendary/_internal/Python.framework is a real file, not a symlink (F-34.9-01)
  - gogdl: framework .../gogdl/_internal/Python.framework is malformed -- Versions/Current does not exist (F-34.9-01)
  - gogdl: framework .../gogdl/_internal/Python.framework is malformed -- top-level stub "Python" is a real file, not a symlink into Versions/Current (F-34.9-01)
  - gogdl: framework .../gogdl/_internal/Python.framework is malformed -- Resources alias does not exist (F-34.9-01)
  - gogdl: _internal sibling stub for .../gogdl/_internal/Python.framework is a real file, not a symlink (F-34.9-01)
  - nile: framework .../nile/_internal/Python.framework is malformed -- Versions/Current does not exist (F-34.9-01)
  - nile: framework .../nile/_internal/Python.framework is malformed -- top-level stub "Python" is a real file, not a symlink into Versions/Current (F-34.9-01)
  - nile: framework .../nile/_internal/Python.framework is malformed -- Resources alias does not exist (F-34.9-01)
  - nile: _internal sibling stub for .../nile/_internal/Python.framework is a real file, not a symlink (F-34.9-01)
```

2 of the 4 failure classes per runner (`Versions/Current does not exist`, top-level stub is a real
file) were already catchable by the pre-hardening gate. The other 2 (`Resources alias does not
exist`, `_internal sibling stub ... is a real file`) are the classes Task 1 added — confirmed
present in this real, unrepaired field artifact, not only against synthetic `mkdtemp` fixtures.
This satisfies gate steps 1g's `grep -qi 'Resources'` and `grep -qi '_internal'` checks.

### Repo-tree gate run (hardened, exact census)

```
$ pnpm verify:runner-bundle build/bin/arm64/darwin --arch=arm64 --expect-files=279 --expect-symlinks=12 --expect-bytes=100707073
```

Exit code: **0**. Printed census line: `Census: 279 files, 12 symlinks, 100707073 apparent bytes
(sum(stat -f %z), never du)`. Ends with `PASS: all three onedir runners present, executable and
Mach-O; tree sizes above the floor.`

### Full automated gate result (1a–1g, plan `260901-e7o-PLAN.md:308-367`, run verbatim)

| Step | Check | Result |
|---|---|---|
| 1a | `/tmp/e7o-OLD.dmg` = 155,175,396 B | PASS |
| 1b | `pnpm exec jest --config meta/jest.config.js verifyRunnerBundle` — `Test Suites: 1 passed, 1 total`, ≥30 tests | PASS — 36 tests passed |
| 1c | Repo tree exact census 279/12/100,707,073 | PASS |
| 1d | Off-by-one (`--expect-symlinks=11`) rejected | PASS — exit 1 |
| 1e | Partial flag set (`--expect-files=279` alone) rejected | PASS — exit 1 |
| 1f | Absent darwin tree (`/tmp`) still throws | PASS — exit 1 |
| 1g | OLD artifact exits 1, names both `Resources` and `_internal` | PASS |

`echo "TASK 1 GATE PASS"` printed at the end of the verbatim script — all 7 sub-gates passed
without weakening any check.

## Task 2 — Fix applied, real release artifact built and measured

### Config change

`src-tauri/tauri.macos.conf.json` — both darwin trees moved from `bundle.resources` (dereferencing
`copy_resources`) to `bundle.macOS.files` (symlink-preserving `copy_dir`, `macos/app.rs:113` →
`:200`, one step before codesigning). Key/value direction is reversed in `macOS.files` (key =
destination relative to `Contents/`, value = CWD-relative source) — confirmed correct by the gate
results below, not merely by inspection. Neither darwin tree remains in `bundle.resources`.

### Build

`pnpm exec vite build` → `pnpm build:sidecar-sea` → `pnpm exec tauri build --config
'{"bundle":{"createUpdaterArtifacts":false}}'` (no `tauri:build` script exists; the flag is passed
on the CLI, not written into a repo file). Vite's own `preserveRunnerSymlinksPlugin` reported:

```
[preserve-runner-symlinks] restored 12 symlink(s), skipped 0, rejected 0
```

`tauri build` finished cleanly, producing
`src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg`. 0 codesigning identities are
enrolled on this machine (`security find-identity -v -p codesigning` reports `0 valid identities
found`, per `260901-e7o-RESEARCH.md` Q3) — this is an unsigned/ad-hoc build; notarization is
untestable here and nothing is claimed about it.

### NEW SHIPPED census (mounted DMG, read-only, `find`/`stat -f %z` — independent of
`verify:runner-bundle`'s own report of itself)

| Tree | Files | Symlinks | Apparent bytes |
|---|---:|---:|---:|
| NEW SHIPPED `arm64/darwin` | 279 | 12 | 100,707,073 |
| NEW SHIPPED `x64/darwin` | 4 | 0 | 46,423,272 |

Both trees match the repo tree exactly (Task 1's baseline table) — the packaging-time defect is
fully closed. `x64/darwin` is unchanged from OLD SHIPPED (4/0/46,423,272 both before and after),
confirming no regression on the tree this task did not need to fix.

### OLD SHIPPED vs NEW SHIPPED (arm64/darwin — the only tree this task changes)

| | OLD SHIPPED | NEW SHIPPED | delta |
|---|---:|---:|---:|
| Files | 285 | 279 | −6 |
| Symlinks | 0 | 12 | +12 |
| Apparent bytes | 148,688,545 | 100,707,073 | **−47,981,472** |

Recovered exactly 47,981,472 B (45.76 MiB) per macOS bundle, matching this task's `<objective>`
prediction exactly.

**Superseded 2026-09-01 by quick-260901-kl2: 277 files / 12 symlinks / 97,884,865 B after
`steam_api.pdb` + `steam_api_shim.lib` (2,822,208 B) stopped shipping. The figure above
remains the correct record for its own date.**

### All 12 links verified by name (legendary, gogdl, nile × 4 links each)

For every runner, all four of `_internal/Python`, `_internal/Python.framework/Python`,
`_internal/Python.framework/Resources`, `_internal/Python.framework/Versions/Current` are present
(`[ -L ... ]` true) and resolve (`[ -e ... ]` true, i.e. not dangling). 12/12 confirmed.

### Hardened gate on the new artifact

```
$ pnpm verify:runner-bundle "$APP" --arch=arm64 --expect-files=279 --expect-symlinks=12 --expect-bytes=100707073
```

Exit code: **0**.

### codesign on the shipped framework

```
$ codesign --force -s - "$FWDIR/Python.framework"
/tmp/e7o-fw.jbHaaw/Python.framework: replacing existing signature
```

Exit code: **0** (was 1, `bundle format unrecognized, invalid, or unsuitable`, on the OLD
artifact's dereferenced framework — measured in `260901-e7o-RESEARCH.md` Q3). Run against a
writable copy taken off the read-only mount, per this task's environment hazards; the mount was
detached immediately after the copy.

### DATA ONLY — recorded, never asserted as a threshold

| Figure | Value | Note |
|---|---:|---|
| Installed `.app` apparent bytes | 336,375,854 | Predicted (arithmetic: 384,357,326 − 47,981,472) = 336,375,854 — **exact match** |
| DMG bytes | 141,158,181 | Was 155,175,396 (OLD DMG). UDZO compresses 1 MB filesystem-image blocks, not files — this delta is not the same figure as the apparent-byte delta above and is recorded as data only, per this task's explicit instruction not to gate on DMG size. |

### Full automated gate result (2a–2j, plan `260901-e7o-PLAN.md:443-521`, run verbatim)

| Step | Check | Result |
|---|---|---|
| 2a | Pre-build: `build/bin`/`public/bin` non-empty, `check:build-bin-mirror` OK | PASS |
| 2b | Build: `vite build` → `build:sidecar-sea` → `tauri build` | PASS |
| 2c | Vite's own report: "restored 12 symlink(s), skipped 0, rejected 0" | PASS |
| 2d | DMG produced, mounted read-only | PASS |
| 2e | arm64/darwin exact census 279/12/100,707,073 | PASS |
| 2f | x64/darwin non-regression 4/0/46,423,272 | PASS |
| 2g | All 12 links present, are symlinks, and resolve | PASS |
| 2h | Hardened gate on the artifact, exact census | PASS — exit 0 |
| 2i | `codesign --force -s -` on shipped framework copy | PASS — exit 0 |
| 2j | `.app`/DMG bytes recorded as data | Recorded (336,375,854 / 141,158,181) |

`echo "TASK 2 GATE PASS"` printed at the end of the verbatim script.

## Task 3 — Live per-runner checkpoint resolution (partial + substituted, NOT a clean 3/3 UI pass)

Task 3 was a blocking human checkpoint (`type="checkpoint:human-verify"`, per-runner live
execution gesture on legendary/gogdl/nile from the real installed app). The executor cannot
perform UI gestures itself; it stopped at the checkpoint and returned the structured request.
The result below is **not** a clean 3/3 UI pass — it is recorded exactly as resolved, per
explicit instruction not to overstate it.

### Human verdicts (performed by the user)

| Runner | Verdict | Detail |
|---|---|---|
| B — gogdl (GOG) | **PROVEN, full-strength** | Real library re-sync through the app UI, logged in. Exactly the gesture the plan specified. Also demonstrates the app→helper spawn path is intact. |
| A — legendary (Epic) | **NOT PROVEN — deferred** | UI gesture not performed: Epic login shows a blank page. User is on a work network that likely blocks Epic. Not a failure of the runner — the gesture was never reachable in this environment. Deferred to a home network. |
| C — nile (Amazon) | **NOT PROVEN — deferred** | UI gesture not performed: the user owns no Amazon games, so no library exists to re-sync. |

### Substitute evidence (orchestrator-run, not user-run — attributed accordingly)

Because A and C were environmentally unreachable, the gap was closed at the layer this specific
change (an on-disk framework-symlink layout change) can actually break: whether each runner's
Python interpreter boots from the restored framework. Both runs were against the installed
`/Applications/GameLib.app`, confirmed to be the new build:

- Apparent bytes: **336,375,854** — exact match to the built artifact (see Task 2 DATA ONLY table).
- **12 symlinks** present in `Contents/Resources/build/bin/arm64/darwin`.

Direct helper execution, all from the installed app:

```
legendary  rc=0   legendary version "0.21.0", codename "Lowlife"
gogdl      rc=0   1.3.0
nile       rc=0   1.2.0 Robert Speedwagon
comet      rc=0   comet 0.2.0
```

### Mutation proof that `--version` is not a vacuous gesture

The plan's own checker had warned that a `--version` handled before the interpreter loads would
prove nothing. Performed on a `copytree(symlinks=True)` **copy** in a scratch directory — never
on the installed app — copy deleted afterward:

```
CONTROL  (unmodified copy)             rc=0    stdout='1.3.0'
MUTATED  (_internal/Python -> dangling) rc=255  [PYI-7129:ERROR] Failed to load Python shared library
RESTORED                                rc=0    stdout='1.3.0'
```

Breaking exactly the symlink this task restores makes the binary fail (PYI-7129); restoring it
makes it pass again. `--version` therefore demonstrably requires `Python.framework` to load —
the gesture is non-vacuous.

### How this is scored

- **PROVEN:** all three PyInstaller runners (legendary, gogdl, nile) boot their Python
  interpreter from the restored framework in the installed artifact, via a gesture shown
  non-vacuous by mutation. This is the complete failure mode e7o could have introduced — the
  task changed nothing but the on-disk framework layout, not the login/library-sync layer.
- **PROVEN (user, full-strength):** gogdl end-to-end through the app UI, which also demonstrates
  the app→helper spawn path is intact.
- **NOT PROVEN / DEFERRED:** legendary and nile end-to-end through the app UI. Recorded as an
  explicit open item with its reason (Epic unreachable on a work network; no Amazon games
  owned), **not** as a pass. Both UI paths are untouched by this change.

The plan's original 3/3-UI criterion was **not** met. It was **partially met and partially
substituted**: 1/3 full-strength UI pass (gogdl), 2/3 substituted by a mutation-proven
direct-execution gesture at the layer this change can break, with the UI layer itself deferred
and unresolved for legendary/nile.

### Observation, not a finding of this task (deferred, undiagnosed)

The Epic login blank page is very unlikely to be related to this task — e7o only moved darwin
`bin` trees between two Tauri config keys, and the Epic login window loads a remote
`epicgames.com` URL, which this task never touches. Flagged as worth re-checking on a home
network in a future session; not diagnosed here.

## Task 4 — packagingConfig.test.ts gate hole closed, todo updated

### Code change

`src/backend/__tests__/packagingConfig.test.ts`:
- `TauriConfig` interface extended with `bundle.macOS?: { files?: unknown }`.
- Added `mergedMacFilesMap(platform)` (returns `{}` for platforms with no `bundle.macOS` block).
- Added `platformShipsBinPath(platform, relPath)`: true if `relPath` ships via either
  `bundle.resources` (existing `mergedMapCoversBinPath`) or, macOS-only, `bundle.macOS.files`.
- Added positive-coverage tests: macOS ships `arm64/darwin/legendary/legendary`,
  `arm64/darwin/gogdl/gogdl`, `arm64/darwin/nile/nile`, and `x64/darwin` — closes the hole where
  no test asserted macOS actually ships the darwin trees.
- Added a windows/linux negative test: neither ships `arm64/darwin` or `x64/darwin` via either map.
- Extended the macOS negative guard (`no linux/, no arm64/win32`) to scan
  `mergedResourceMap('macos')` keys **and** `mergedMacFilesMap('macos')` values.
- Extended the windows/linux negative guards to also assert neither overlay declares a
  `bundle.macOS` key.
- Added a disjointness test: no `bundle.resources` key on any platform (base included) contains
  `darwin` — darwin ships only through `bundle.macOS.files`.
- Added a no-nesting test: no `macOS.files` key is a path-prefix of another (HashMap iteration
  order in `fs_utils::copy_dir` is nondeterministic; a nested pair would make results unstable).
- Updated the header docblock and the `quick-260901-8rm` describe title to record that the SET
  macOS ships is unchanged from that earlier task — only the MECHANISM moved.
- `vite.config.ts` plugin pin (F-34.9-01, the final describe block) left completely untouched.

### Jest run

```
$ pnpm exec jest --config src/backend/jest.config.js packagingConfig
Test Suites: 1 passed, 1 total
Tests:       47 passed, 47 total
Time:        0.183 s
```

47 passed (gate required ≥30). No failures.

### Independent `node -e` config-invariant block (run separately from the jest suite)

Asserted directly against the raw JSON in `tauri.conf.json` / `tauri.macos.conf.json` /
`tauri.windows.conf.json` / `tauri.linux.conf.json`:
- `Object.keys(macOS.files).length === 2`.
- Exact key/value pairs: `Resources/build/bin/arm64/darwin` → `../build/bin/arm64/darwin`,
  `Resources/build/bin/x64/darwin` → `../build/bin/x64/darwin`.
- Every key starts with `Resources/build/` and contains no `..`.
- Every value starts with `../build/bin/`.
- No `bundle.resources` key on any platform (base/macos/windows/linux) contains `darwin`.
- Neither windows nor linux overlay declares `bundle.macOS`.
- No nested `macOS.files` keys.
- quick-260901-8rm non-regression: windows/linux still carry their `x64/win32` resource key;
  macOS still carries `EpicGamesLauncher.exe`, `GalaxyCommunication.exe`, `legendary.LICENSE`;
  macOS gained no `/linux` or `arm64/win32` key.

Result: `NODE INVARIANT BLOCK PASS`.

### Todo greps (`.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md`)

| Pattern | Matches |
|---|---:|
| `100,707,073` | 1 |
| `47,981,472` | 1 |
| `quick-260901-e7o` | 7 |

File confirmed still present under `.planning/todos/pending/` (not moved to `done/`) — the
`steam_api.pdb`/`steam_api_shim.lib` item (~2.7 MB) remains open, as instructed.

### `pnpm codecheck`

`tsc --noEmit` — clean, no output, exit 0.

### Full automated gate result (Task 4, plan `260901-e7o-PLAN.md` action items)

| Step | Check | Result |
|---|---|---|
| 4a | `packagingConfig.test.ts` jest run, ≥30 tests | PASS — 47/47 |
| 4b | Independent `node -e` config-invariant block | PASS |
| 4c | quick-260901-8rm non-regression (windows/linux resource keys, macOS exe/LICENSE coverage, no `/linux`/`arm64/win32` gain) | PASS |
| 4d | Todo greps for measured figures and task ID | PASS — 1/1/7 matches |
| 4e | Todo still in `.planning/todos/pending/` | PASS |
| 4f | `pnpm codecheck` | PASS — clean |

`TASK 4 GATE PASS`.
