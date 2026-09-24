---
created: 2026-09-22T09:00:00.000Z
title: "Windows packaged build (`vite build`) breaks on the darwin runner `Python.framework` symlinks -- three stacked defects, and vite hides the first error"
area: build
severity: major
platform: windows
ready: live-gate
found_by: "Re-running quick 260922-nx4's installer-level check on the operator's Windows 11 machine after enabling Developer Mode, 2026-09-22"
files:
  - meta/downloadHelperBinaries.ts:173-175
  - meta/preserveRunnerSymlinks.ts:192
  - meta/pruneStaleHelperBinaries.ts
  - meta/assembleRendererDist.ts:114-118
  - vite.config.ts
status: completed
resolved: 2026-09-23
resolved_by: quick-260923-tip
---

# Windows packaged build breaks on the darwin runner symlinks

`pnpm download-helper-binaries` fetches the **darwin** onedir runners (`legendary`, `gogdl`, `nile`,
94 MB under `public/bin/arm64/darwin`) on every OS, and `pruneStaleHelperBinaries`' population guard
**requires** them to be present. So every Windows packaged build (`pnpm exec vite build`, then
`tauri build`, and therefore the Windows release leg) has to copy macOS `Python.framework` symlink
trees. On Windows that path fails in stacked layers. Each fix below only exposes the next one.

## Layer 0 -- no symlink privilege (environment, not code)

Without Developer Mode or elevation, `symlinkSync` fails with EPERM (quick 260922-nx4's original
blocker). The operator enabled Developer Mode on 2026-09-22. A CI Windows runner needs the same, or the
code needs to stop depending on it (see "Direction" below).

## Layer 1 -- directory symlinks extracted as FILE symlinks

`extractTarGz` (`meta/downloadHelperBinaries.ts:173-175`, `spawn('tar', ['-xzf', ...])`) extracted
`Python.framework/Versions/Current -> 3.12` and `Python.framework/Resources -> Versions/Current/Resources`
as Windows **file** symlinks (`dir /AL` shows `<SYMLINK>`, not `<SYMLINKD>`), dated 2026-09-06 12:49 on
this machine. Windows symlinks are typed. A file symlink pointing at a directory does not resolve as a
directory. vite's `copyDir` (`publicDir -> outDir`) `statSync`s each entry, fails on these, and aborts
the copy partway through. Observed: `build/bin/arm64/darwin/` held only `comet` and a partial `gogdl`,
with `legendary` and `nile` never copied.

Local repair applied 2026-09-22 (untracked, gitignored files only): the 6 links (2 per runner) were
recreated as directory symlinks with `mklink /D`. All 12 framework links were verified to resolve.

## Layer 2 -- `preserveRunnerSymlinks` recreates directory links as file links too

`restoreSymlinks` calls `symlinkSync(record.target, destPath)` (`meta/preserveRunnerSymlinks.ts:192`)
with **no type argument**. On Windows, Node defaults to a `'file'` link unless the target already
resolves at creation time, so `build/.../Versions/Current` and `Resources` also come out as dangling
file links. The NEXT build's `copyDir` then `copyFileSync`s through those dangling links in `build/`,
fails, and aborts the copy again. The plugin then reports
`skipped (destination parent missing): 9` and refuses to emit. Build output poisons the next build.

Local repair: deleted `build/bin/arm64/darwin` (generated output). The next build restored
12/12, skipped 0.

## Layer 3 -- the real error is masked

When `buildStart` or the copy fails, rollup still runs `closeBundle`. That is where
`assembleRendererDist` (`meta/assembleRendererDist.ts:114-118`, "bundleKeys is empty") or
`preserve-runner-symlinks` throw. `vite build` prints only that LAST error. The log shows
`0 modules transformed` and a misleading plugin message. The actual first error (for example
`pruneStaleHelperBinaries: refusing to prune ...`) was only visible by calling `build()` through vite's
JS API with a `buildEnd(err)` hook. Every future Windows build failure on this path will be misdiagnosed
the same way.

## Direction

- **Best:** do not ship or copy darwin runners into non-darwin builds at all. Scope
  `download-helper-binaries` and `pruneStaleHelperBinaries`' population guard to the host or target
  OS. The Windows NSIS bundle maps only `build/bin/{x64,arm64}/win32` (`tauri.windows.conf.json`), so
  the darwin trees are pure cost on Windows.
- Otherwise: pass the link type to `symlinkSync` (`'dir'`/`'junction'` when the target resolves to a
  directory, computed against the SOURCE tree), and fix extraction to produce directory links on
  Windows, or re-type them after extraction.
- Make the `closeBundle` guards (`assembleRendererDist`, `preserveRunnerSymlinks`) include or preserve
  the earlier build error, for example by skipping their own throw when `buildEnd` saw an error and
  rethrowing that error instead, so the first cause is what gets printed.
- Unit-test the Windows shapes without a Windows host where possible (the link-type decision is pure).

## Done when

On a fresh Windows checkout with Developer Mode on (and ideally without it), `pnpm download-helper-binaries`
then `pnpm exec vite build` succeeds twice in a row with no manual link repair or `build/` cleanup, and a
deliberately broken `buildStart` shows its own error message rather than a `closeBundle` one.

## Evidence from quick 260922-txw (2026-09-22)

Quick task 260922-txw forced a real `pnpm download-helper-binaries` re-download (public/bin moved
aside and restored around the run; see that task's SUMMARY and the now-closed tar todo
`2026-09-17-windows-release-leg-dies-in-install-deps-tar-reads-c-as-a-remote-host.md` for the full
procedure) on this same Windows 11 box, in Git Bash, GNU tar 1.35, against HEAD with BOTH tar
fixes (`-f` drive-letter and `-C` escape-unquoting) applied.

**Classification: T-SYMLINK (per that task's T-OK/T-TAR/T-SYMLINK/T-NET/T-DIGEST/T-OTHER
taxonomy).** `pnpm download-helper-binaries` exited 1. Verbatim:

```
Error: tar extraction failed (exit 2): tar: gogdl/_internal/Python: Cannot create symlink to
'Python.framework/Versions/3.12/Python': No such file or directory
tar: gogdl/_internal/Python.framework/Python: Cannot create symlink to
'Versions/Current/Python': No such file or directory
tar: gogdl/_internal/Python.framework/Resources: Cannot create symlink to
'Versions/Current/Resources': No such file or directory
tar: Exiting with failure status due to previous errors
```

**No `tar -tzf failed` line anywhere in the run** — `:89` listing passed for all three darwin
archives (legendary, gogdl, nile). Extraction (`:138`) also got past the `-f`/`-C` argv entirely:
the non-symlink entries in `gogdl` DID extract (`gogdl/gogdl` landed, 61 files total under
`gogdl/`) before GNU tar hit the 3 `Python.framework` symlink entries specifically and failed on
those. `legendary` and `nile` show 0 files extracted — the top-level `Promise.all` in `main()`
rejected as soon as `gogdl`'s extraction failed and the process exited before their downloads
completed; this is a race artifact of the forced-parallel run, not a separate failure mode.

**Link-type counts in the run tree, before restore:** `SYMLINK: 0`, `SYMLINKD: 0`, `JUNCTION: 0` —
a full CREATION FAILURE this time (zero links of any type were created), which is a DIFFERENT
observed shape from this todo's own Layer 1 (links extracted, but as the WRONG type — file
symlinks instead of directory symlinks). Both are consistent with "no privilege", just diverging in
how GNU tar's Windows symlink emulation fails without it: sometimes it creates a mistyped link
anyway (Layer 1, prior session), sometimes it refuses outright with an ENOENT-shaped message
instead of an EPERM-shaped one (this session). The `error taxonomy in the closed tar todo's Task 2
step still classifies both as T-SYMLINK — "'tar extraction failed' whose stderr names a symlink /
'Cannot create symlink' / EPERM / Operation not permitted" — this run's exact stderr contains
"Cannot create symlink to", which is the literal phrase in that rule.

**Developer Mode measurement (same session):**
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense`
= `0x1` — Developer Mode IS enabled in the registry, confirming this todo's "the operator enabled
Developer Mode on 2026-09-22" claim over the conflicting "no Developer Mode" note elsewhere.
However `whoami /priv` for the CURRENT process does NOT list `SeCreateSymbolicLinkPrivilege` at
all. The likely explanation: Developer Mode was enabled after this session's logon, and the
privilege has not propagated to this process's token — Developer Mode alone does not retroactively
grant it to already-running processes. This is offered as the most likely explanation for the T-SYMLINK
result above, not as a confirmed root cause; re-measuring `whoami /priv` after a fresh logon
(Layer 0's own open question) would settle it.

**Unmeasured by this note:** whether the Windows `install-deps` CI leg (a fresh `windows-latest`
runner, fresh process, Developer Mode's CI-runner-image default unknown) would hit this same class
— recorded as an open, unmeasured risk, consistent with this todo's existing "A CI Windows runner
needs the same [Developer Mode], or the code needs to stop depending on it" note under Layer 0.

## Resolution (2026-09-23, quick 260923-tip)

**All three layers fixed and the "Done when" gate PASSED on a genuine fresh Windows checkout.**
Code: `60db2ecfd`, `0df292bd0`, `1a75da601`. Gate evidence in "Live gate" below.

**Layer 1 — scoped, per this todo's own "Best" direction.** New
`resolveRunnerTargetPlatform(env, hostPlatform)` in `meta/releaseTags.ts`, host-keyed off
`process.platform` with a `GAMELIB_RUNNER_TARGET_PLATFORM` override mirroring the repo's existing
`GAMELIB_SIDECAR_TARGET_TRIPLE`/`resolveTriple` idiom. It deliberately does **not** live in
`downloadHelperBinaries.ts`: importing that module from `pruneStaleHelperBinaries.ts` would start a
real network download mid-`vite build`. Host keying is defensible because
`.github/actions/install-deps` runs `download-helper-binaries` on each matrix leg's own runner OS.
It gates the three `downloadOnedirAsset` calls, the `__darwin_layout` re-download branch and the
marker write. Only the symlink-bearing onedir archives are scoped; flat assets stay unscoped
because `.release_tags` is per-runner.

**The population guard was narrowed, not weakened** — the distinction this todo's "Direction"
implicitly required. `assessPublicBin`'s `__darwin_layout` (P1) and onedir exec-bit/file-count-floor
(P2) checks became darwin-only, and a **new P3 per-platform `FLAT_BINARY_TABLE`** took over on
win32/linux (exec bit demanded on linux, skipped on win32 where `.exe` carries no meaningful mode).
Failing-direction tests pin it: missing `.exe`, zero-byte `.exe`, stale tag.

**Layer 2 — typed symlinks, and MEASURED on this box.** New pure `symlinkTypeFor(sourceDir, record)`
resolves the target from the link's own directory inside the **SOURCE** tree and follows the
resolution chain, then is passed as `symlinkSync`'s third argument
(`meta/preserveRunnerSymlinks.ts:249`). `'junction'` was considered and **explicitly rejected**: it
requires absolute targets and every target here is relative by design.

`dir /AL /S build\bin` after a real build now shows, per runner (×3 = the 12 restored links):

| link | type now | was |
| ---- | -------- | --- |
| `Resources -> Versions\Current\Resources` | `<SYMLINKD>` | `<SYMLINK>` — the Layer 1/2 defect |
| `Current -> 3.12` | `<SYMLINKD>` | `<SYMLINK>` — incl. the chained case |
| `Python -> Python.framework\Versions\3.12\Python` | `<SYMLINK>` | `<SYMLINK>` — correct, target is a real file |

**Layer 3 — unmasked, and MEASURED.** Both `preserveRunnerSymlinksPlugin` and
`assembleRendererDistPlugin` record `buildEnd(err)` in a closure-local var and rethrow that error
**by identity** from `closeBundle`, doing none of their own work. A live probe (a `enforce: 'pre'`
plugin whose `buildStart` throws a sentinel, driven through vite's JS API) now surfaces
`[gamelib-assemble-renderer-dist] LAYER3_PROBE_FIRST_CAUSE_SENTINEL` — the **first cause**, where it
previously printed `bundleKeys is empty`. Note the cosmetic wart: vite tags a rethrown error with
the *rethrowing* plugin's name, so the tag names the wrong plugin while the message is right. That
is the part that was getting misdiagnosed, so it is good enough; do not read the tag as provenance.

### Live gate — PASSED, operator's Windows 11 box, 2026-09-23

Run in **two trees**, because they prove different things.

**Tree A — fresh checkout (this is the "Done when" gate).** A `git worktree` at `HEAD` in a short
path, sparse-checked-out without `.planning`, holding only the 4 tracked files under `public/bin`
(`.gitignore`, `legendary.LICENSE`, the two `vulkan-helper` binaries) — i.e. exactly the state a
clean clone lands in. The operator's own `public/bin` was **never moved or touched**; an attempt to
move it aside was refused, and the worktree approach that replaced it is both safer and a truer
reading of "a fresh Windows checkout".

| step | result |
| ---- | ------ |
| `pnpm download-helper-binaries` | **exit 0** — previously exit 1, `tar extraction failed … Cannot create symlink` |
| darwin onedir | `Skipping legendary/gogdl/nile darwin onedir download -- target platform is win32` (×3) |
| symlinks anywhere under `public/bin` | **0** (`dir /AL /S`) — the defect class is absent, not repaired |
| `npx vite build` run 1 | exit 0, `restored 0 symlink(s), skipped 0, rejected 0` |
| `npx vite build` run 2, no cleanup between | exit 0, identical — previously `skipped (destination parent missing): 9` and refused to emit |
| symlinks under `build/bin` | **0** |
| win32 payload the NSIS bundle maps | intact — `x64/win32`: legendary, gogdl, nile, comet, GalaxyCommunication, EpicGamesLauncher; `arm64/win32`: legendary, gogdl, comet |
| deliberately broken `buildStart` | surfaces its own error, not `bundleKeys is empty` |

**Tree B — the operator's working tree, darwin tree still present.** Proves Layers 2 and 3 on the
*harder* path, where the symlinks do exist and must be recreated correctly: two consecutive
`vite build` runs, both exit 0, both `restored 12 symlink(s), skipped 0, rejected 0`, link types
corrected as tabulated above. The second run is the meaningful one — it previously reported
`skipped (destination parent missing): 9` and refused to emit, because run 1 had poisoned `build/`
with dangling file links.

**Layer 0 is discharged, by the "stop depending on it" route this todo itself named.** Two findings:

1. **`whoami /priv` was the WRONG INSTRUMENT**, so the earlier note's conclusion does not hold.
   Developer Mode does not add `SeCreateSymbolicLinkPrivilege` to the token at all — it makes
   `CreateSymbolicLink` accept `SYMBOLIC_LINK_FLAG_ALLOW_UNPRIVILEGED_CREATE`. Measured directly:
   `AllowDevelopmentWithoutDevLicense = 0x1`, the privilege **still absent** from `whoami /priv`,
   and yet a `symlinkSync` probe creates **both** `'file'` and `'dir'` links successfully. The
   earlier "has not propagated to this process's token" hypothesis should not be carried forward.
2. **The win32 build path now creates zero symlinks**, so the privilege question is moot there by
   construction. The "(and ideally without it)" half of the Done-when was not tested by actually
   disabling Developer Mode, but against a measured symlink count of 0 there is nothing left to
   need it.

**Still unmeasured:** the `windows-latest` CI leg was not run. The risk is much smaller than when
this todo was written — that leg no longer downloads, extracts or copies any symlink-bearing archive
on win32 — but it is not zero and has not been observed.

**Noted in passing, not a regression:** `build/bin/arm64/win32` has no `nile.exe` because nile
publishes no win32-arm64 release (visible in the download log: nile ships linux x64, win32 x64,
linux arm64 only). Pre-existing and unrelated to this work.

### Pre-existing failures found while verifying (NOT caused by this work)

`meta/__tests__/pruneStaleHelperBinaries.test.ts` T10/T18/T19 fail on this box because
`chmodSync(path, 0o755)` sets no real POSIX exec bit on NTFS, in fixture code this work never
touched. **This was verified rather than asserted:** the pre-change tree at `84a44811d` was rebuilt
in a sparse worktree and reproduced the same three test names byte-identically. That suite went
19 passing → 26 passing. Five other Meta suites (`captureShellScrollback`, `genI18nGateScope`,
`loginWindowSeamPredicateRemoved`, `verifyRunnerBundle`, `runTsSignals`) also fail pre-existing
here and may deserve their own todo.

## Residual discharged 2026-09-24: the `windows-latest` CI leg RAN, and it is green

This file closed with one thing explicitly unmeasured — "the `windows-latest` CI leg was not run …
not zero and has not been observed". It has now been observed.

**Run 35942560790** (tag `v0.7.0-updater-test1`, commit `19b5e3a9e`, fired to score the macOS
updater todo) built all three matrix legs. The Windows leg finished **success** in 11m36s
(01:21:36 → 01:33:12) and uploaded `GameLib_0.7.0_x64-setup.exe` (112,309,170 B) plus its `.sig` —
**the first Windows artifact this project has ever produced.** `latest.json` gained
`windows-x86_64` and `windows-x86_64-nsis` keys alongside the linux and darwin ones.

For contrast, the last run before the fix (35841476015, 2026-09-23, commit `c946239ce`) died on
that leg at step 5 `Run ./.github/actions/install-deps` in 1m08s. Same workflow, same runner image
family, opposite outcome — so the green is attributable to this todo's fix rather than to runner
luck.

What this does NOT prove: nobody has installed or launched that `.exe`. Building is not running,
and the Windows updater payload has never been applied. Those remain untested.

Scored by the session actioning
`.planning/todos/completed/2026-09-24-macos-updater-entry-in-latest-json-is-unproven-until-a-release-run.md`.
