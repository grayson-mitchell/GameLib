# 260901-i8i Measurements — Drop x64/darwin Intel Mac Tree

Real observed numbers from executing `260901-i8i-PLAN.md` (revision r2) against this
machine and a freshly built, freshly mounted `.dmg`. All byte counts are apparent size
via `sum(stat -f %z)`, never `du` (APFS block allocation causes phantom deltas).

## Size basis (both labelled, per `<size_basis>` — never present one unlabelled)

| Basis | `x64/darwin` bytes removed | What it is |
| --- | --- | --- |
| **Dev machine (this repo, this session)** | **46,423,272** | 4 files: `comet` (11,213,032 B, live) + `gogdl` (11,906,720 B) + `legendary` (14,167,984 B) + `nile` (9,135,536 B), the latter three being Jun 28 fossils pre-dating the 34.18 key removal |
| **Fresh checkout / CI release** | **11,213,032** | `comet` only — the sole file with a live download-key producer as of this change |

Backup of the pre-deletion tree (verified SHA-256 match, restore path if ever needed):
`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/43af95b6-6811-4809-aec7-5fac64d6667f/scratchpad/x64-darwin-backup/`
(comet 11,213,032 B / gogdl 11,906,720 B / legendary 14,167,984 B / nile 9,135,536 B = 46,423,272 B total, all 4 files SHA-256 verified against the pre-deletion source).

**Do not headline 46.4 MB as the release saving — that is the dev-machine basis only. A CI
release loses 11,213,032 B (comet only), because the other three files were already absent
from CI-produced trees since 2026-08-27 (pre-34.18 key removal fossils that only existed
locally on this dev machine).**

## Task 3 census — packaged DMG artifact

Build command sequence:
```
pnpm exec vite build
pnpm build:sidecar-sea
pnpm exec tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Artifact: `src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg`
Mounted (readonly, nobrowse) at `/Volumes/GameLib`.

### Criterion 1 — x64/darwin absent

`test ! -d "$MP/GameLib.app/Contents/Resources/build/bin/x64/darwin"` → **PASS** (directory does not exist).

### Criterion 2 — x64/win32 survivor (unaffected non-goal)

All 4 sub-checks passed:
- (a) `build/bin/x64/win32/` directory present
- (b) `EpicGamesLauncher.exe` present
- (c) `GalaxyCommunication.exe` present (via `bundle.resources` win32 keys, untouched by this change)
- (d) file sizes match BASELINE.md (2 files / 211,452 B total)

### Criterion 3 — arm64/darwin non-regression

`pnpm verify:runner-bundle "$MP/GameLib.app" --arch=arm64 --expect-files=279 --expect-symlinks=12 --expect-bytes=100707073`

```
Census: 279 files, 12 symlinks, 100707073 apparent bytes (sum(stat -f %z), never du)

PASS: all three onedir runners present, executable and Mach-O; tree sizes above the floor.
```

Matches BASELINE.md exactly: 279 files, 12 symlinks, 100,707,073 B, 0 dangling symlinks.
Frameworks (structural integrity ENFORCED, F-34.9-01) verified for legendary, gogdl, nile —
all three report `Python.framework Versions/Current symlink=true target=3.12 Resources
symlink=true target=Versions/Current/Resources codesign=adhoc`.

### Criterion 4 — SIZE

```
TOTAL SIZE: 289952582
EXPECTED:   289952582
MATCH
```

Sum of `stat -f %z` over every file under `$MP/GameLib.app` (this machine, local basis) =
**289,952,582 B** — exact match to the plan's prediction (`336,375,854 − 46,423,272 =
289,952,582`). No shortfall, no arithmetic correction needed.

Fresh-CI basis (not independently built here, derived from the size_basis table):
a CI-produced `.app` would be `289,952,582 + 46,423,272 − 11,213,032 = 325,162,822 B`
smaller by only the comet-key removal (11,213,032 B) relative to a pre-change CI release,
since the other three fossil files (35,210,240 B) were never present in CI output to begin
with.

### Criterion 5 — ANTI-VACUITY

```
arm64/darwin dir: PRESENT
file count under $R: 282 (need > 200)
ANTI-VACUITY: PASS
x64/darwin absent: OK
```

### Criterion 6 — helper execution (rc=0 for all four)

| Helper | Command | Output | Expected | rc |
| --- | --- | --- | --- | --- |
| legendary | `legendary --version` | `legendary version "0.21.0", codename "Lowlife"` | 0.21.0 | 0 |
| gogdl | `gogdl --version` | `1.3.0` | 1.3.0 | 0 |
| nile | `nile --version` | `1.2.0 Robert Speedwagon` | 1.2.0 | 0 |
| comet | `comet --version` | `comet 0.2.0` | 0.2.0 | 0 |

All four versions match plan expectations exactly. `comet` binary at
`Contents/Resources/build/bin/arm64/darwin/comet`, 10,667,240 B (arm64 build, distinct
from the removed x64 comet binary).

### Criterion 7 — detach

```
"disk4" ejected.
detach rc=0
no GameLib volumes remain mounted
```

## Mutation-proof observations (Task 1)

Both mutation-proof tests in `meta/__tests__/x64NonGoalSurvivor.test.ts` were confirmed to
go RED when their target source was mutated in a scratch copy outside the repo, then
restored to source (never committing the mutation):

- **category 1'** (Tauri-era win32 helper resource keys): mutating a scratch copy of
  `src-tauri/tauri.macos.conf.json` to remove `EpicGamesLauncher.exe` from
  `bundle.resources` flipped the assertion RED; restored, re-ran GREEN.
- **category 2'** (surviving comet/helper literals): mutating a scratch copy of
  `meta/downloadHelperBinaries.ts` to remove `comet-aarch64-apple-darwin` flipped the
  assertion RED; restored, re-ran GREEN.

## Summary of all edits (files_modified)

1. `meta/__tests__/x64NonGoalSurvivor.test.ts` — widened with 2 new `it()` blocks (category
   1' and 2'), plus the deferred negative assertion for the retired x64 comet key.
2. `src-tauri/tauri.macos.conf.json` — removed `x64/darwin` from `bundle.macOS.files`.
3. `meta/downloadHelperBinaries.ts` — removed `darwin: 'comet-x86_64-apple-darwin'` from the
   comet `x64` map.
4. `meta/__tests__/downloadHelperBinaries.test.ts` — removed the retired literal, added a
   negative assertion.
5. `src/backend/__tests__/packagingConfig.test.ts` — removed `x64/darwin` from the positive
   `test.each`, extended the negative test to assert macOS does not ship `x64/darwin`.
6. `.github/workflows/release-tauri.yml` — removed the `x86_64-apple-darwin` matrix leg
   (4→3 legs), literalized `GAMELIB_BRIDGE_TARGET_ARCH` to `'arm64'`, dropped the
   `x86_64-apple-darwin` signing target, reworded CR-01 comments to past tense (split
   across backtick spans to avoid colliding with the new negative test literal).
7. `src/backend/__tests__/releaseWorkflow.test.ts` — retitled/retargeted triple-count tests
   (4→3), replaced the CR-01 ternary-guard describe block (deleted 3 tests + 2 helper
   functions, added 2 replacement tests), preserved 2 pre-existing tests verbatim per the
   W3 constraint (describe now reports 4 tests total, not 2), retargeted the tmpdir bridge
   fixture from `x64/darwin` to `arm64/darwin` in 2 locations, updated the arg-passthrough
   fixture test to `aarch64-apple-darwin`.
8. `meta/buildSidecarSea.ts` — removed `x86_64-apple-darwin` from
   `NATIVE_LZMA_REQUIRED_TRIPLES` (Option A / W1 decision), reworded doc comment without
   quoting the retired literal (grep count exactly 5, matching the plan's gate).
9. `meta/__tests__/buildSidecarSea.test.ts` — updated `NATIVE_LZMA_REQUIRED_TRIPLES`
   assertions (4→3 triples).
10. `public/bin/x64/darwin/` — deleted via `rm -rf` (gitignored, not tracked), backed up
    and SHA-256-verified beforehand.

Untouched (explicitly out of scope): `steam_api.pdb` / `steam_api_shim.lib` (item 6,
`buildSteamBridgeShims.ts`), `src/backend/utils.ts:563-564` (D-3 locked decision).
