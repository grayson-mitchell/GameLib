---
created: 2026-09-22T09:00:00.000Z
title: "Windows packaged build (`vite build`) breaks on the darwin runner `Python.framework` symlinks -- three stacked defects, and vite hides the first error"
area: build
severity: major
platform: windows
ready: code
found_by: "Re-running quick 260922-nx4's installer-level check on the operator's Windows 11 machine after enabling Developer Mode, 2026-09-22"
files:
  - meta/downloadHelperBinaries.ts:173-175
  - meta/preserveRunnerSymlinks.ts:192
  - meta/pruneStaleHelperBinaries.ts
  - meta/assembleRendererDist.ts:114-118
  - vite.config.ts
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
