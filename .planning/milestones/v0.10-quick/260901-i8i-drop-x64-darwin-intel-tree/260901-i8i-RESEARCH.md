# Quick 260901-i8i: drop the `x64/darwin` Intel tree — Research

**Researched:** 2026-09-01
**Domain:** macOS packaging / helper-binary provenance
**Confidence:** HIGH on the producer + consumer censuses (every claim below is a read of the
current tree or of git history). MEDIUM on the shipped-artifact byte deltas (no build was run —
that is execution's job).

---

## Summary

The residue is smaller and larger than the brief states, in different places.

**Smaller:** only ONE of the four files has a live producer. `comet` is still fetched by
`meta/downloadHelperBinaries.ts:382`. The other three (`gogdl`, `legendary`, `nile`, Jun 28
mtimes) are **orphans on this dev machine** — their download keys were removed by Phase 34.18
and nothing in the repo has recreated them since. All four are gitignored. **A fresh checkout
(any CI runner) has only `comet` in `public/bin/x64/darwin` — 11,213,032 B, not 46,423,272 B.**
The 46.4 MB figure recorded by quick-260901-8rm and quick-260901-e7o was measured on locally
built DMGs and includes 35,210,240 B of dev-machine-only stale files that no CI release has
shipped since 2026-08-27. The plan's size criterion must state which basis it uses or it will
look like it under-delivered.

**Larger:** `.github/workflows/release-tauri.yml:55-57` still declares a full
`--target x86_64-apple-darwin` matrix leg. Every tagged release still builds and publishes an
Intel Mac bundle. And that leg is **coupled to the tree we are removing**: it is the only leg
that emits `build/bin/x64/darwin/steam-bridge-helper` + `steam_api.dll`
(`meta/buildSteamBridgeShims.ts` via `GAMELIB_BRIDGE_TARGET_ARCH: x64` at
`release-tauri.yml:157`), and `Resources/build/bin/x64/darwin` in `tauri.macos.conf.json:12` is
their only route into the bundle. **Deleting that mapping while leaving the leg in place ships a
silently bridge-less Intel DMG.** Either both go or neither does.

**Primary recommendation:** remove the download key, the tree, the config mapping AND the
`x86_64-apple-darwin` release leg in one task. Leave `src/backend/utils.ts:563-564` untouched.

---

## Background correction — the brief's reconstruction is wrong in both directions

The brief asks whether "the surface that ships the Intel tree TODAY is the Tauri config, created
AFTER 34.18 closed". It was not.

| Surface | Landed | Commit | Relative to 34.18 close (2026-08-27) |
|---|---|---|---|
| `src-tauri/tauri.conf.json` gains `"../build/bin/": "build/bin"` | **2026-08-10** | `1969bd3a1` feat(34.9-07) | **17 days BEFORE** |
| `release-tauri.yml` `x86_64-apple-darwin` leg | **2026-07-24** | `0f6180d49` feat(34-06) | **34 days BEFORE** |
| quick-260901-8rm narrows to per-platform overlays | 2026-09-01 | `8cdbf4272` | after |
| quick-260901-e7o moves darwin trees to `bundle.macOS.files` | 2026-09-01 | `43a4971cf` | after |

`grep -rn "release-tauri" .planning/phases/34.18-*/` returns **zero hits**. The Tauri packaging
surface existed, shipped the Intel tree, and never appears anywhere in 34.18's scope table,
research or plans. D-07's table names only `electron-builder.yml`, `build-base.yml`,
`dist:mac`/`release:mac` and the digest keys. `build-base.yml` and `electron-builder.yml` were
both deleted later by 35-14 (`0ad77e5a1`), so **34.18's entire in-scope surface no longer
exists, while the surface it never saw is the one still shipping Intel today.**

e7o did not introduce the residue. It relocated it and measured it as a parity check, which is
the correct thing to do for a symlink fix. e7o's own record does contain one factual error worth
correcting: `260901-e7o-RESEARCH.md:18` describes the x64/darwin tree as "4 files — Steam-bridge
shim leg, not PyInstaller onedir tree". It is not the steam-bridge shim leg; it is comet plus
three pre-Phase-34.9 flat runner binaries. `[VERIFIED: ls -la public/bin/x64/darwin]`

**And 34.18 SAW the four files.** `34.18-07-SUMMARY.md:105` records, verbatim, during a live-gate
incident: *"every other platform's comet survived; `x64/darwin` still held all four"*. This is a
KNOWN, OBSERVED gap on the file side.

**Why the comet key survived is a new failure shape, not `census-by-wrong-namespace`.**
`34.18-02-PLAN.md:149` reads: *"Do NOT touch: ... the `comet-x86_64-*` keys ... Plan 34.18-01's
`meta/__tests__/x64NonGoalSurvivor.test.ts` will fail if you do."* The constraint was written as
a blanket over ALL six comet keys when only the four linux/win32 ones were D-07 non-goals — it
shielded an in-scope macOS-arch key. This is the
`negative-gate-can-outlaw-more-than-its-decision` shape (memory), third instance.

Secondary record defect: **that constraint's stated enforcement is false.**
`x64NonGoalSurvivor.test.ts` never pinned any comet literal — its own test title says the
category-2 assertion is written as six individual `toContain` calls precisely so it does not
match "the unrelated comet-* keys". The real comet pin lives in
`meta/__tests__/downloadHelperBinaries.test.ts:464-476`. Report only; nothing to fix in 34.18.

---

## Q1 — Producer census

All four are **gitignored, not tracked**. `git ls-files public/bin` returns exactly
`.gitignore`, `arm64/linux/vulkan-helper`, `legendary.LICENSE`, `x64/linux/vulkan-helper`.
`git check-ignore -v` maps each of the four to `public/bin/.gitignore` lines 1/3/5/7.
**Removal mechanics are therefore `rm -rf` + source-edit, never `git rm`.**
`[VERIFIED: git ls-files / git check-ignore]`

| File | Bytes | mtime | Producer | Status |
|---|---|---|---|---|
| `comet` | 11,213,032 | Aug 27 19:39 | **LIVE.** `meta/downloadHelperBinaries.ts:382` — `darwin: 'comet-x86_64-apple-darwin'` inside `downloadComet()`'s `x64` map → `downloadGithubAssets()` → `downloadAsset()` → writes `join('public','bin',arch,platform,exeFilename)` at `:259`, `chmod 755` at `:265`. | Must edit source |
| `gogdl` | 11,906,720 | Jun 28 15:56 | **NONE.** Pre-34.9 flat `gogdl_macOS_x86_64` key; removed from source by 34.18. `downloadGogdl()` (`:330-349`) now has `x64: { linux, win32 }` only, plus `downloadOnedirAsset('gogdl','arm64')`. | Orphan — `rm` only |
| `legendary` | 14,167,984 | Jun 28 15:56 | **NONE.** Same, `downloadLegendary()` `:305-328`. | Orphan — `rm` only |
| `nile` | 9,135,536 | Jun 28 15:56 | **NONE.** Same, `downloadNile()` `:351-368`. | Orphan — `rm` only |

Proof the three keys are gone, not just unused: `meta/__tests__/downloadHelperBinaries.test.ts:452`
asserts `no *_macOS_x86_64/*_macOS_arm64 literal remains for legendary/gogdl/nile`, and
`meta/runnersOnedirDigests.json` `digests` holds exactly three `*_macOS_arm64_onedir.tar.gz`
keys. `[VERIFIED: file read + python json read]`

**Fifth potential producer, CI-only:** `meta/buildSteamBridgeShims.ts` writes
`public/bin/${targetArch}/darwin/{steam-bridge-helper, steam_api.dll, steam_appid.txt,
steam_api.pdb, steam_api_shim.lib}` where `targetArch = GAMELIB_BRIDGE_TARGET_ARCH ??
process.arch` (`:107-111`). On the `x86_64-apple-darwin` release leg that env var is `x64`
(`release-tauri.yml:157`), so **that leg populates `public/bin/x64/darwin/` with five bridge
files**. Never on an arm64 dev host. This is the coupling described in the Summary.

**Consequence of the mtime split, answered:** two mechanisms, exactly as suspected — Aug 27 =
live download (comet, same run that refreshed `arm64/darwin/comet`), Jun 28 = fossil from before
the 34.9 onedir repackaging.

---

## Q2 — Consumer census

`build/bin/x64/darwin` currently mirrors all four files (`ls` confirms 4 files, Sep 1 11:21) —
vite's publicDir copy. It is not a separate producer.

| # | File:line (current) | What it is | Effect of the sweep |
|---|---|---|---|
| C1 | `src-tauri/tauri.macos.conf.json:12` | `"Resources/build/bin/x64/darwin": "../build/bin/x64/darwin"` in `bundle.macOS.files` | **THE ship surface.** Delete this key. |
| C2 | `meta/downloadHelperBinaries.ts:382` | `darwin: 'comet-x86_64-apple-darwin'` | **Live producer.** Delete the `darwin:` line only; keep its `linux:`/`win32:` siblings at `:381`/`:383`. |
| C3 | `meta/__tests__/downloadHelperBinaries.test.ts:464-476`, entry at `:466` | `describe('regression: comet/epic-integration untouched')` → `it.each([... 'comet-x86_64-apple-darwin' ...])('still contains the literal %s')` | **GOES RED.** Move that one literal out of the `it.each` and into a `not.toContain` assertion; leave the other seven. |
| C4 | `src/backend/__tests__/packagingConfig.test.ts:416-423`, entry at `:420` | `test.each([...,'x64/darwin'])('macOS ships %s')` | **GOES RED.** Drop the entry; add `expect(platformShipsBinPath('macos','x64/darwin')).toBe(false)`. |
| C5 | `src/backend/__tests__/packagingConfig.test.ts:425-430`, `:428` | windows/linux do not ship `x64/darwin` | Stays green, becomes near-vacuous. Extend to cover macOS (see C4). |
| C6 | `src/backend/utils.ts:563-564` (`x64Path` + `existsSync`), error text at `:594` | runtime fallback | **Leave untouched** — see Q4. |
| C7 | `meta/__tests__/x64NonGoalSurvivor.test.ts:80-86` | pins `x64Path` AND the exact substring `join(publicDir, 'bin', 'x64', process.platform` | **Hard constraint on Q4.** Any edit to `utils.ts:563` breaks the gate that bounds this sweep. |
| C8 | `src/backend/__tests__/utils.test.ts:248-261` | `'darwin + arm64, only the x64 nested candidate exists'` — `existsSync` fully mocked | Unaffected by tree deletion; RED only if `utils.ts:563` changes. |
| C9 | `src/backend/__tests__/utils.test.ts:~305` | error message contains `join('x64','darwin','nile','nile')` | Same as C8. |
| C10 | `.github/workflows/release-tauri.yml:55-57` (matrix leg), `:157` (`GAMELIB_BRIDGE_TARGET_ARCH` ternary), `:173` (rustup `aarch64,x86_64` targets) | **still builds an Intel Mac release** | Scope decision — coupled to C1, see Summary. |
| C11 | `.github/workflows/release-tauri.yml:427-428` | prune step's `if IS_MACOS; then test -d build/bin` | Stays green (`build/bin` still holds `arm64/darwin` + `x64/win32`). |
| C12 | `src/backend/__tests__/releaseWorkflow.test.ts:388-402` | `evaluateBridgeArch('x86_64-apple-darwin') === 'x64'` | RED **only if** C10 is done. |
| C13 | `src/backend/__tests__/releaseWorkflow.test.ts:466-473` + `:520-526` | seeds/asserts `build/bin/x64/darwin/steam-bridge-helper` + `steam_api.dll` in a tmpdir fixture | Self-contained; stays green either way. Becomes a misleading record if C10 is done — retarget to `arm64/darwin`. |
| C14 | `src/backend/__tests__/releaseWorkflow.test.ts:170-174` | pins both `sidecar_triple:` literals | RED **only if** C10 is done. |
| C15 | `meta/buildSteamBridgeShims.ts:11,18,27-32,93-111,125,174` | `targetArch`-parameterised output into `public/bin/${targetArch}/darwin/` | Only reachable via C10. **Do not touch its Windows-artifact emission** (todo item 6, out of scope). |
| C16 | `meta/pruneStaleHelperBinaries.ts` (`computePruneSet`, `pruneStaleHelperBinariesPlugin`), wired at `vite.config.ts:141` | mirror-prune `build/bin` ← `public/bin`, `enforce:'pre'`, `buildStart` | **This is the removal mechanism for `build/bin/x64/darwin`, not an obstacle.** See Q5. |
| C17 | `meta/checkBuildBinMirror.ts` / `pnpm check:build-bin-mirror` | bidirectional file/symlink/byte mirror gate with an anti-vacuity guard | **This is a proof step.** Guard only requires `public/bin` to hold ≥1 regular file — satisfied. |
| C18 | `meta/verifyRunnerBundle.ts:381-408` (`findDarwinBinRoot`), default `arch = process.arch` at `:800` | arch-parameterised bundle census | Unaffected. `meta/__tests__/verifyRunnerBundle.test.ts:992` passes `--arch=x64` deliberately as a **known-absent** arch to prove the throw — deleting the real tree makes that test more honest, not less. |
| C19 | `meta/assembleRendererDist.ts:32-34` | explicitly documents that nothing under `bin/` reaches `build/renderer` | Unaffected. |
| C20 | `.husky/post-checkout` (`pnpm i && pnpm download-helper-binaries`) | re-fetch hazard | See Q5 — **does not** undo the deletion, for a non-obvious reason. |

**No other consumer exists.** Searched: all `*.ts/tsx/json/yml/yaml/js/cjs` outside
`node_modules`, `.planning`, `graphify-out`, `build/` for `x64/darwin`, `apple-darwin`,
`macOS_x86_64`, `bin', 'x64'`; plus every file in `meta/` named in the brief
(`checkBuildBinMirror`, `pruneStaleHelperBinaries`, `verifyRunnerBundle`,
`assembleRendererDist`), every `.github/workflows/*` (note: `build-base.yml` **no longer
exists** — deleted by `0ad77e5a1` 35-14), and every `package.json` script.
`grep -rn -- "--arch=x64"` finds no invocation in `package.json` or any workflow — only the
`verifyRunnerBundle.test.ts:992` negative case. `[VERIFIED: grep + ls]`

---

## Q3 — The over-reach boundary

### What `meta/__tests__/x64NonGoalSurvivor.test.ts` actually asserts today

Exactly **two** `it()` blocks. Its header still describes three categories; that is now stale.

| Category | Header claims | Live today |
|---|---|---|
| 1 — win32 helper path key | 7 refs in `electron-builder.yml` incl. the `mac:` block | **RETIRED.** An in-file comment records that 35-14 deleted `electron-builder.yml` wholesale, and that the module-scope `readFileSync` of it was removed because the ENOENT was taking categories 2 and 3 down with it. **Nothing in this file guards the win32 x64 path key any more.** |
| 2 — linux/windows download keys | 6 exact literals in `meta/downloadHelperBinaries.ts` | LIVE. Six individual `toContain` calls: `legendary_linux_x64`, `legendary_windows_x64.exe`, `gogdl_linux_x86_64`, `gogdl_windows_x86_64.exe`, `nile_linux_x86_64`, `nile_windows_x86_64.exe`. **Deliberately excludes the comet keys** — the test title says so explicitly. |
| 3 — runtime x64 fallback | `x64Path` box64 affordance in `src/backend/utils.ts` | LIVE. `toContain('x64Path')` and `toContain("join(publicDir, 'bin', 'x64', process.platform")`. |

**So the file does NOT bound this sweep the way its header implies.** Two gaps:

1. **The four surviving comet non-goal keys are unguarded by this file.**
   `comet-x86_64-unknown-linux-gnu`, `comet-x86_64-pc-windows-msvc.exe`,
   `comet-aarch64-*`, `GalaxyCommunication-dummy.exe`, `EpicGamesLauncher.exe` are pinned only
   by `downloadHelperBinaries.test.ts:464-476` — **the very `it.each` this sweep must edit
   (C3)**. An over-reaching edit that deleted the whole `describe` block, or the whole `x64:`
   object in `downloadComet()`, would remove the pin and the thing it pins in one move and
   nothing would go red.
2. **Category 1's replacement lives elsewhere and the survivor file does not know.** The Tauri-era
   equivalent is `packagingConfig.test.ts`'s
   `mergedMapCoversBinPath(platform, 'x64/win32/EpicGamesLauncher.exe')` +
   `'x64/win32/GalaxyCommunication.exe'`, asserted for all three overlays — which is strictly
   stronger than the old yaml grep. But it is not referenced from the survivor gate, so a reader
   following the header is left thinking category 1 is dead.

### Proposed ADDED coverage (recommend the plan include this)

Add to `meta/__tests__/x64NonGoalSurvivor.test.ts`:

- **Category 1′ (Tauri era):** read `src-tauri/tauri.macos.conf.json` and assert both
  `../build/bin/x64/win32/EpicGamesLauncher.exe` and
  `../build/bin/x64/win32/GalaxyCommunication.exe` keys survive in `bundle.resources`.
- **Category 2′:** move the four surviving `comet-x86_64-*`/`comet-aarch64-*` non-darwin literals
  into this file as individual `toContain` calls, so they are pinned somewhere the sweep is not
  editing. Simultaneously add `expect(SOURCE).not.toContain('comet-x86_64-apple-darwin')`.
- Update the header block to record that category 1 was replaced, not lost.

Both must be mutation-proved at plan time using the file's own documented idiom: copy the target
to a scratch path **outside the repo**, delete one reference, confirm RED, discard. Never a
second permanent test.

### Explicit non-goals — these `x64` hits are NOT this sweep's business

| Landmark | Why it stays |
|---|---|
| `src-tauri/tauri.macos.conf.json:4-6` — `x64/win32/EpicGamesLauncher.exe`, `x64/win32/GalaxyCommunication.exe` | macOS legitimately runs these under Wine with no platform guard (`legendary/games.ts`, `launcher.ts`). D-07 non-goal #2. **Criterion 2 in Q6 proves these positively.** |
| `tauri.windows.conf.json` / `tauri.linux.conf.json` — `x64/win32`, `arm64/win32`, `x64/linux`, `arm64/linux` | other platforms |
| `meta/downloadHelperBinaries.ts` — the 6 linux/windows literals, `comet-x86_64-unknown-linux-gnu`, `comet-x86_64-pc-windows-msvc.exe`, `GalaxyCommunication-dummy.exe`, `EpicGamesLauncher.exe` | D-07 non-goal #3 |
| `src/backend/utils.ts:563-564` | D-07 non-goal #4, box64 on Linux ARM. See Q4. |
| `public/bin/x64/linux/vulkan-helper` (git-TRACKED) | Linux |
| `meta/buildSidecarSea.ts` `x86_64-apple-darwin` triple support (`:219-220,434-435,489-534`) | only reachable via C10; if C10 is done these become dead-but-harmless, and the SEA builder must keep multi-triple support for the linux/windows legs anyway |
| `src/backend/constants/environment.ts:30`, `steam/__tests__/removeCopies.test.ts` `darwin+x64` cases | **runtime Rosetta / VirtualApple detection**, not packaging. Unrelated meaning of `x64`. |
| `src/backend/wine/manager/downloader/utilities.ts:80` | Wine/Proton arch selection |
| `meta/buildSteamBridgeShims.ts` `steam_api.pdb` / `steam_api_shim.lib` emission | **todo item 6, explicitly scoped out.** Touching this file for the arch change does not license the Windows-artifact cleanup. |

**Restating D-07's consequence for the verifier: a bare `x64` grep hit is NOT evidence of an
incomplete sweep.**

---

## Q4 — The runtime fallback: recommend NO CHANGE

`src/backend/utils.ts:554-596` (read in full):

```
:554-560  archSpecificPath = join(publicDir,'bin',process.arch,process.platform,...segments)
:561      if (existsSync(archSpecificPath)) return archSpecificPath
:563      const x64Path = join(publicDir,'bin','x64',process.platform,...segments)
:564      if (existsSync(x64Path)) return x64Path
:574-590  isMacOnedirRunner stale-flat detection (arm64 only)
:592-596  throw naming BOTH paths + resolved publicDir
```

**Options:**

- **A — leave it exactly as is. RECOMMENDED.**
- B — guard with `process.platform !== 'darwin'`. **Rejected:** breaks C7
  (`x64NonGoalSurvivor.test.ts:82-85` pins the exact substring
  `join(publicDir, 'bin', 'x64', process.platform`), whose header forbids relaxing the
  assertion. Also breaks C8/C9. Buys nothing measurable.
- C — delete the fallback. **Rejected:** kills the Linux-ARM box64 affordance, D-07 non-goal #4.

**Why A, on the merits and not just the gate:**

1. **There is no "darwin arm" to remove.** The line is a single
   `process.platform`-parameterised expression, not a branch. Removing "the darwin case" means
   *adding* a conditional that never existed.
2. **The diagnostic gets BETTER, not worse.** Trace the only macOS path: on arm64,
   `archSpecificPath` = `.../bin/arm64/darwin/{legendary,gogdl,nile}/{runner}` or
   `.../bin/arm64/darwin/comet`, all present in every shipped artifact and gated by
   `pnpm verify:runner-bundle`. So `:561` returns and `:563` is **never evaluated**. `:563` is
   reachable on macOS only in the already-broken state where `arm64/darwin` is missing — and in
   that state, today, the fallback could return a real Intel binary that then dies with an
   exec-format/Rosetta error *six layers downstream in `callRunner`* — the exact 34.5 live-gate
   failure shape `:548-553`'s comment exists to prevent. **With the tree gone, that
   silently-wrong-arch return becomes impossible and the loud throw at `:592-596` fires
   instead**, naming both attempted paths and the resolved `publicDir`.
3. **No macOS user sees a worse message.** The `:594` string interpolates `x64Path` regardless of
   whether the directory exists; "Tried … x64 fallback path: … Neither exists on disk" is
   accurate and complete once the tree is gone.

**Answer to the brief's framing:** removing the tree does not turn the branch into a useless
probe — it turns it from a *possible silent wrong-arch success* into a *guaranteed loud failure*.
34.18's "inert, not harmful" rationale does change, but in the direction that argues for keeping
the line, not removing it.

---

## Q5 — Ordering and the post-checkout hazard

### Established mechanics

**`.release_tags` today:**
`{"legendary":"0.21.0","gogdl":"v1.3.0","nile":"v1.2.0","comet":"v0.2.0","epic-integration":"v0.4","__darwin_layout":"964f49a55677dbe568ebe833001a2a831b4d0f169b90d67adb8390c25c0400be"}`
`[VERIFIED: cat public/bin/.release_tags]`

- **`pnpm download-helper-binaries` is TAG-idempotent.** Removing the `darwin:` key from
  `downloadComet()` changes neither `RELEASE_TAGS` (`meta/releaseTags.ts`, untouched) nor
  `__darwin_layout` (`computeLayoutMarker` hashes `runnersOnedirDigests.json`'s `layout` +
  `digests` only — it cannot see the asset map). So the stored tags keep matching and the script
  re-downloads **nothing**. **`rm -rf public/bin/x64/darwin` STICKS across `.husky/post-checkout`.**
- **But the source edit is still mandatory.** On a fresh clone `.release_tags` is absent, every
  key is fetched, and comet's `darwin` entry recreates the file. Deleting only the files is a
  dev-machine-local no-op with zero effect on CI.
- **`build/bin/x64/darwin` removes itself.** `pruneStaleHelperBinariesPlugin()`
  (`vite.config.ts:141`, `enforce:'pre'`, `buildStart`) runs `computePruneSet(build/bin,
  public/bin)`, which emits **top-most** build-only entries — with `public/bin/x64/darwin` gone,
  `x64/darwin` is one entry, `rmSync(..., {recursive:true})`. `assessPublicBin`'s guard checks
  only `.release_tags` freshness and the three **arm64** onedir trees, so an x64/darwin deletion
  cannot trip it; the prune is permitted, not thrown.

### The two traps, named

1. **`computePruneSet` empty ⇒ silent no-op BY DESIGN.** `pruneStaleHelperBinaries` returns
   `{pruned:[], bytesFreed:0, guardEvaluated:false}` and the plugin logs
   `nothing to prune`. That keeps a fresh CI checkout green — and it means **"nothing to prune"
   is NOT evidence the tree went away.** It is equally consistent with the tree never having been
   in `build/bin`. (`non-fatal-read-helper-default-is-a-silent-policy` class.)
2. **`assert-a-plugins-output-not-a-directory-refilled-later`.** The prune runs at `buildStart`;
   vite's publicDir copy runs later in the same build. Checking `build/bin/x64/darwin` mid-build
   proves nothing.

**Therefore assert BOTH, and only AFTER `vite build` exits:**
`[prune-stale-helper-binaries] pruned 1 entry, N bytes freed` with N > 0 in the build log,
**AND** `test ! -d build/bin/x64/darwin`.

### Recommended order

1. **All source/config edits first, in one commit:** `downloadHelperBinaries.ts:382` (drop
   `darwin:` only); `src-tauri/tauri.macos.conf.json:12` (drop that one key);
   `downloadHelperBinaries.test.ts:466` (→ `not.toContain`); `packagingConfig.test.ts:416-430`
   (invert `x64/darwin`); the added `x64NonGoalSurvivor.test.ts` coverage from Q3; and — if in
   scope — `release-tauri.yml:55-57/:157/:173` plus `releaseWorkflow.test.ts:170-174,388-402,
   466-473,520-526`.
   *Doing the config edit here (not later) guarantees no `tauri build` ever runs with a
   `bundle.macOS.files` source path pointing at a directory that no longer exists — an untested
   Tauri failure mode.*
2. `rm -rf public/bin/x64/darwin`. **Plain `rm -rf`.** Never `git checkout -- <path>` (fires
   `.husky/post-checkout`), never `git stash`, never `git reset`. Restore-by-`cp` if needed —
   back the tree up to `/tmp` first, it is 46 MB and not re-downloadable after step 1.
3. `pnpm exec vite build` → assert the two conditions above.
4. `pnpm check:build-bin-mirror` exits 0 — proves both directions and its own anti-vacuity guard
   proves it was not certifying over an empty `public/bin`.
5. `pnpm download-helper-binaries` explicitly → exits 0 **and** `test ! -d
   public/bin/x64/darwin`. This is the post-checkout-hazard proof; run the command directly
   rather than relying on a checkout.
6. Jest: `pnpm exec jest --config src/backend/jest.config.js packagingConfig utils releaseWorkflow`
   and `pnpm exec jest --config meta/jest.config.js downloadHelperBinaries x64NonGoalSurvivor
   verifyRunnerBundle`. Note `--selectProjects` is case-sensitive and exits 0 on a miss — prefer
   explicit `--config` paths as above.
7. Packaged build + DMG census (Q6).

---

## Q6 — Proof method

Config assertions are insufficient and `pnpm tauri:dev` is blind to bundled resources (serves
over `devUrl`). Use a real bundle, mounted read-only. `pnpm tauri:dev:packaged` (`--debug`) is
sufficient for a resource census, but **use a release build** so the arm64 numbers are directly
comparable to e7o's recorded baseline.

```bash
pnpm exec vite build
pnpm build:sidecar-sea
# createUpdaterArtifacts:false on the COMMAND LINE only — never a repo edit.
# TAURI_SIGNING_PRIVATE_KEY is unset; 0 codesigning identities; build is unsigned/ad-hoc.
pnpm exec tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'

MP=$(hdiutil attach -nobrowse -readonly \
      src-tauri/target/release/bundle/dmg/GameLib_0.7.0_aarch64.dmg \
      | awk '/\/Volumes\//{print $NF}')
R="$MP/GameLib.app/Contents/Resources/build/bin"
```

Tauri deletes the intermediate `.app` when only the `dmg` target is requested — mounting the DMG
is the only way in. Always `stat -f %z` summed apparent bytes, **never `du`**.

| # | Criterion | Command | Pass |
|---|---|---|---|
| 1 | **NEGATIVE** — the Intel tree is gone | `test ! -d "$R/x64/darwin"` | exit 0 |
| 2a | **POSITIVE non-goal survivor** — win32 exes still ship | `test -f "$R/x64/win32/EpicGamesLauncher.exe" && test -f "$R/x64/win32/GalaxyCommunication.exe"` | exit 0 |
| 2b | …and are real files, not zero-byte | `find "$R/x64/win32" -type f -exec stat -f %z {} \; ` | 2 lines, both > 0 |
| 2c | …and nothing else crept in | `find "$R/x64/win32" -type f \| wc -l` | exactly `2` |
| 2d | **the `x64` path key itself survives** — proves a leaf was removed, not the key | `test -d "$R/x64"` | exit 0 |
| 3 | **arm64 non-regression**, e7o's exact census | `find "$R/arm64/darwin" -type f \| wc -l`; `-type l \| wc -l`; summed `stat -f %z` | `279` / `12` / `100707073` |
| 3b | …via the hardened gate | `pnpm verify:runner-bundle "$MP/GameLib.app" --arch=arm64 --expect-files=279 --expect-symlinks=12 --expect-bytes=100707073` | exit 0 |
| 4 | **SIZE** — installed `.app` apparent bytes drop | sum `stat -f %z` over `$MP/GameLib.app` before/after | **dev-machine basis: −46,423,272 B. Fresh-checkout/CI basis: −11,213,032 B.** State which. |
| 5 | **ANTI-VACUITY** — criterion 1 cannot pass on an empty/failed mount | `test -d "$R/arm64/darwin"` and `find "$R" -type f \| wc -l` | exit 0 and `> 200` |
| 6 | cleanup | `hdiutil detach "$MP"` | exit 0 |

**Criterion 2 is deliberately positive** — four independent assertions (presence, non-zero size,
exact count, surviving parent key) on the *same* mounted artifact as criterion 1, so "the win32
non-goal survived" is measured, never inferred from the absence of a complaint.

**Mutation-prove the new negative assertions** (C3, C4, Q3's additions) at plan time: re-add the
removed literal in a **scratch copy outside the repo**, confirm RED, discard the copy. Do not
commit a second permanent test — this is the file's own documented vacuity-guard idiom
(`buildRunnersOnedir.test.ts:765`, `verifyRunnerBundle.test.ts:373`).

---

## Open Questions for the planner / operator

1. **Is `release-tauri.yml`'s `x86_64-apple-darwin` leg in scope?** It is coupled to C1 (removing
   the mapping alone ships a bridge-less Intel DMG). The locked decision — "GameLib does not
   support Intel Macs" — argues it must go. But it is not what the brief scoped, and it drags in
   `releaseWorkflow.test.ts` (three describes) and re-opens the question of whether the SEA
   builder's `x86_64-apple-darwin` support stays. **Recommend: in scope, same task.** Flag to the
   operator before planning.
2. **Which size basis does the success criterion use?** Dev-machine 46,423,272 B vs
   fresh-checkout 11,213,032 B. Both are true; only one is what a released artifact loses.
3. **Should `260901-8rm-MEASUREMENTS.md` / the todo's `x64/darwin | 44 | 44.3 | kept` row be
   annotated?** They are honest measurements of a local build, but a later reader will read 44 MB
   as the CI-release number. Recommend a one-line annotation, never an edit to the recorded
   figure (the `260823-v27` precedent).

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | A fresh CI checkout gets only `comet` in `public/bin/x64/darwin` | Summary, Q1, Q6/4 | Derived by reading the four download-map functions, not by running a cold download. If wrong, the size criterion's fresh-checkout figure is wrong (the dev-machine figure is measured and unaffected). Cheap to falsify: `mv public/bin /tmp/x && pnpm download-helper-binaries && ls public/bin/x64/darwin` — but that is a 300 MB refetch, so leave it to execution if the number matters. |
| A2 | Deleting the `bundle.macOS.files` source directory without deleting its key would fail the Tauri build | Q5 step 1 | Not tested; the ordering in Q5 makes it moot. |
| A3 | e7o's 279/12/100,707,073 arm64 census still holds on the next release build | Q6 crit. 3 | If the arm64 tree changed for any unrelated reason since 2026-09-01, criterion 3 will fire a false RED. Re-baseline from the repo tree (`public/bin/arm64/darwin`) before the run if so. |

## Sources

- Repo, read directly at HEAD (`fix/steam-native-install-stability`, 2026-09-01): `meta/downloadHelperBinaries.ts`, `meta/pruneStaleHelperBinaries.ts`, `meta/checkBuildBinMirror.ts`, `meta/verifyRunnerBundle.ts`, `meta/buildSteamBridgeShims.ts`, `meta/releaseTags.ts`, `meta/runnersOnedirDigests.json`, `meta/__tests__/x64NonGoalSurvivor.test.ts`, `meta/__tests__/downloadHelperBinaries.test.ts`, `src/backend/utils.ts`, `src/backend/__tests__/packagingConfig.test.ts`, `src/backend/__tests__/utils.test.ts`, `src/backend/__tests__/releaseWorkflow.test.ts`, `src-tauri/tauri.conf.json` + three overlays, `vite.config.ts`, `.github/workflows/release-tauri.yml`, `.github/workflows/build-runners-onedir-macos.yml`, `.husky/post-checkout`, `public/bin/.release_tags`, `public/bin/.gitignore`
- Git: `git ls-files public/bin`, `git check-ignore -v`, `git log --follow -- src-tauri/tauri.macos.conf.json`, `git log -S "x86_64-apple-darwin" -- .github/workflows/release-tauri.yml`, `git log -S '"../build/bin/"' -- src-tauri/tauri.conf.json`, `git log --diff-filter=D -- .github/workflows/build-base.yml`
- Planning record: `34.18-CONTEXT.md` (D-07 table, `<deferred>`), `34.18-02-PLAN.md:135-160`, `34.18-07-SUMMARY.md:103-109`, `260901-8rm-MEASUREMENTS.md`, `260901-e7o-{RESEARCH,PLAN,MEASUREMENTS,SUMMARY}.md`, `.planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-…md`
- graphify: `graphify query` (helper-binary community 134/257), `graphify explain downloadHelperBinaries`
