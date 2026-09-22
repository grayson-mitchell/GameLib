---
created: 2026-09-17T00:00:00.000Z
title: 'Windows release leg dies in install-deps: tar -tzf reads "C:\...\" as a remote host spec, exit 2, before signing is ever reached'
area: build
severity: major
platform: windows
ready: code
needs: run-the-negative-control-and-the-repro-on-a-windows-box-code-half-is-shipped
status: completed
resolved: 2026-09-22
resolved_by: quick-260922-txw
found_by: 'GitHub Actions run 35223308954 on grayson-mitchell/GameLib, triggered by the throwaway annotated tag v0.7.0-notarize-test1 at commit cc2d66248. The tag was deleted from origin and locally after the run.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
files:
  - meta/downloadHelperBinaries.ts
  - meta/buildSidecarSea.ts
  - meta/downloadZig.ts
  - meta/buildRunnersOnedir.ts
  - .github/actions/install-deps
  - .github/workflows/release-tauri.yml
---

## Problem

Failed step: `Run ./.github/actions/install-deps`. Job duration ~1m47s.

Verbatim:

```
Error: tar -tzf failed (exit 2): tar (child): Cannot connect to C: resolve failed
tar: Error is not recoverable: exiting now
 ELIFECYCLE  Command failed with exit code 1.
##[error]Process completed with exit code 1.
```

## What this run does NOT tell us

Every subsequent step was skipped, so the Windows leg NEVER REACHED signing. This run gives
`2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md` no information either way.

## Hypothesis — NOT established

GNU tar parses a Windows absolute path `C:\...` as a REMOTE HOST spec (`host:path`) and tries to
"connect" to host `C`. Usual remedy is `--force-local` or a tar that understands drive letters.
Labelled as a hypothesis.

Refinement of the mechanism, also a hypothesis and NOT measured: `windows-latest` has **two**
tars. `C:\Windows\System32\tar.exe` is **bsdtar**, which handles drive letters correctly; Git for
Windows / msys ships **GNU tar**, which does not. The code calls bare `spawn('tar', ...)`, so the
winner is decided by PATH. The observed GNU-tar error string is evidence that msys won — most
likely because pnpm runs lifecycle scripts through a shell and the Actions Windows shell is Git
Bash. **Nobody has run `where tar` on the runner.** Do that first; it is one line and it decides
the whole remedy.

## The todo originally named ONE site. There are FIVE.

Census taken 2026-09-21 by grepping `meta/*.ts` for `spawn('tar'` / `spawnArgv('tar'`. There are
five sites. All five were re-audited 2026-09-21 (quick-260922-p57) by reading each operand's
construction rather than its argv shape.

> **RETRACTED 2026-09-21 — the sentence that stood here was wrong.** It read:
> *"Every one of these passes at least one ABSOLUTE path as a tar operand."* **False for three of
> the five.** `buildSidecarSea.ts:914`, `downloadZig.ts:117` and `buildRunnersOnedir.ts:708` each
> build their `-f` operand from a repo-RELATIVE constant. The claim was inferred from the argv
> *shapes* in the table below without opening the definition of each operand. It is left visible
> rather than deleted so the record shows what was believed and how it failed.

**The operative invariant is narrower than "no absolute operands anywhere."** GNU tar
remote-parses the `-f` ARCHIVE OPERAND ONLY — that is exactly the scope of `--force-local`
("archive file is local even if it has a colon"). A `-C` chdir target is passed through verbatim
and is never remote-parsed. So the requirement is:

> **PARTIAL RETRACTION 2026-09-22 (quick-260922-txw) — true as far as it goes, incomplete.** The
> "never remote-parsed" claim about `-C` above is still correct and is NOT what this note
> retracts. What it missed: GNU tar's default `--unquote` behaviour separately UNESCAPES
> backslash escape sequences (`\t \b \a \n \r \f \v`, octal, ...) inside EVERY operand before use
> — including `-C`, which is passed through verbatim only in the sense of not being remote-parsed,
> not in the sense of being used byte-for-byte. A real Windows destDir,
> `resolve('public/bin/arm64/darwin')`, contains `\b` (from `...\bin\...`) and `\a` (from
> `...\arm64\...`); GNU tar reads those as backspace/bell control characters instead of path
> separators and the chdir target stops naming the real directory. This is a SEPARATE mechanism
> from the `-f` drive-letter remote-parsing defect this todo names, found live on this Windows box
> during the verification this todo's Verification section calls for. See the Resolution section
> at the end of this file for the measured negative/positive pair and the fix
> (`toTarPathOperand()`, quick-260922-txw).

> **The `-f` operand must carry no drive letter. Every other path operand may stay absolute.**

This is why the remedy is NOT a uniform transform across five sites, and why three need no change.

| site                                 | `-f` archive operand                                                                          | absolute `-f`?   | Windows-reachable?                                                                                     | verdict                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| `meta/downloadHelperBinaries.ts:89`  | `tmpPath = join(tmpdir(), filename)` (`:209`)                                                  | **YES**          | **YES — the observed failure**                                                                              | **FIXED** (quick-260922-p57) |
| `meta/downloadHelperBinaries.ts:138` | same `tmpPath`                                                                                 | **YES**          | **YES — same call chain**                                                                                   | **FIXED** (quick-260922-p57) |
| `meta/buildSidecarSea.ts:914`        | `join(NODE_DIST_CACHE_DIR, archiveName)`, `NODE_DIST_CACHE_DIR = join('build','node-dist')` (`:303`) | **NO — relative** | **NO** — only reached via `obtainCrossNodeBinary()`, which **throws for any win32 triple** (`:856-863`), and is called (`:951`) only when `triple !== hostTriple()` | no change needed         |
| `meta/downloadZig.ts:117`            | `tarballPath = join('.build-tools', 'zig-${ZIG_VERSION}.tar.xz')` (`:163`)                     | **NO — relative** | **NO** — `ZIG_TARGET` is the hardcoded literal `'aarch64-macos'` (`:43`)                                    | no change needed         |
| `meta/buildRunnersOnedir.ts:708`     | `outPath = join(RUNNERS_OUT_DIR, ...)`, `RUNNERS_OUT_DIR = join('.build-tools','runners-onedir','out')` (`:65-67`, `:846`) | **NO — relative** | **NO** — its only workflow, `build-runners-onedir-macos.yml`, has the single-entry matrix `os: macos-14` (`:95-101`) | no change needed         |

The bottom three are no longer UNAUDITED. Each carries a measured verdict and a citable reason
above. Note the two reasons are independent: they carry no absolute `-f` operand **and** the
Windows leg does not execute them. Either alone would settle it.

`buildRunnersOnedir.ts:708` would in any case need a *different* transform, not the same one:
its archive (`-f outPath`) is the relative operand and its `-C distParentDir` comes from a parsed
upstream `workingDirectory` (`:829`, `:837`) of unverified absoluteness — the mirror image of
`:138`. Churning a macOS-only path into a shape nobody can test, for zero benefit, is how a
"mechanical" transform ships a regression.

**THE TRAP, WHICH IS REAL AND STILL STANDS: fixing only `:89` moves the failure to `:138`.** They
are in the same file, in the same call chain — `assertArchiveEntriesAreSafe()` calls
`listTarEntries()` (`:89`) and only then does `extractTarGz()` (`:138`) run. A run that gets past
`install-deps` after a one-line `:89` fix has not proven anything about `:138` unless extraction
actually happened. Both sites are now fixed together.

> **RETRACTED 2026-09-21 — the REASONING under that trap was wrong, though the conclusion was
> right.** The original text read: *"`:138` passes **two** absolute paths (`archivePath` and
> `-C destDir`), so it is strictly more exposed than the site that actually reported."* **False.**
> `destDir = join('public', 'bin', arch, 'darwin')` (`downloadHelperBinaries.ts:215`) is
> **repo-root-RELATIVE**. `:138` is exposed by exactly ONE operand — the same `tmpdir()` archive
> path as `:89`. And even had `destDir` been absolute it would not have mattered: `-C` is not
> remote-parsed.

**That error inverted the hazard.** The danger at `:138` is not a second drive letter; it is that
the cwd remedy, applied carelessly, **relocates the extraction**. Moving cwd to `tmpdir()` while
leaving `-C destDir` relative would extract the runner tree into the system temp directory and
leave `public/bin/` empty — `downloadOnedirAsset`'s `pathExists(binPath)` check (`:225`) would
then throw, and the failure would read as a bad archive rather than a bad path. The shipped fix
therefore computes `resolve(destDir)` in the PARENT, while `process.cwd()` is still the repo root,
and deliberately leaves `-C` absolute. `meta/__tests__/tarDriveLetterSafety.test.ts` pins that
with a real-tar extraction under a relative destDir; dropping the `resolve()` turns it red.

## Remedy — `--force-local` is a TRAP, do not reach for it first

`--force-local` is a **GNU tar** flag. **macOS ships bsdtar, which rejects it.** Adding it
unconditionally to any shared helper turns the currently-passing macOS leg red. Because these
five call sites are shared cross-platform code, not Windows-only code, the naive fix the
Hypothesis section suggests cannot be applied as written.

Three options, in preference order:

1. **Pass `cwd` + a RELATIVE ARCHIVE operand.** Works on GNU tar, bsdtar and Windows bsdtar with
   no platform branch and no flag sniffing. `spawn('tar', ['-tzf', path.basename(archivePath)],
   { cwd: path.dirname(archivePath) })`. This is the recommendation. **CHOSEN AND SHIPPED**
   2026-09-21 (quick-260922-p57) at `:89` and `:138`.
2. Resolve the tar binary explicitly to `%SystemRoot%\System32\tar.exe` on Windows, so bsdtar
   always wins regardless of PATH. Fixes the cause rather than the symptom, but hardcodes a
   system path. NOT taken. Note this leaves the PATH question in the Hypothesis section still
   unanswered — option 1 is deliberately PATH-agnostic, so which tar wins on the runner remains
   unmeasured rather than fixed.
3. Conditional `--force-local`, **gated on `process.platform === 'win32'` AND on having actually
   confirmed GNU tar is the resolved binary.** Last resort: it is correct only under the
   unmeasured half of the hypothesis above. NOT taken.

**Scoping note (corrects "apply it to all sites found reachable").** The invariant the remedy has
to establish is *"the `-f` operand carries no drive letter"*, NOT *"no absolute operands"*. `-C`
is therefore left ABSOLUTE on purpose at `:138` — GNU tar remote-parses the archive name only,
and making `-C` relative would have introduced the relocation bug described above. Only the two
reachable sites were changed; the other three carry no absolute `-f` operand and are not executed
on the Windows leg (see the corrected census).

## Secondary observation — RESOLVED 2026-09-21, still NOT a security finding

`assertArchiveEntriesAreSafe()` (`meta/downloadHelperBinaries.ts:114`) is the T-34.9-02
path-traversal guard. Its checks are POSIX-path-shaped: `entry.startsWith('/')` for absolute
(`:121`) and `entry.split('/').includes('..')` for traversal (`:122`). Neither sees a
backslash-separated or drive-lettered entry. These are our own archives built by
`buildRunnersOnedir.ts`, so there is no claim here of a live vulnerability — it was recorded only
so that whoever touched this function for the tar fix did not assume the guard is platform-neutral.
**Do not file it as a security finding on the strength of this paragraph.**

**Measured outcome of the tar fix (quick-260922-p57):** `assertArchiveEntriesAreSafe()` was **NOT
modified** — its body, both checks and its error message are unchanged. It never needed to be:
its inputs are archive-INTERNAL entry names read out of the tarball, and a child process's `cwd`
cannot affect them. The fix also deliberately did **not** pass `basename(archivePath)` down the
call chain from `downloadOnedirAsset` (`:213`), which would have looked like a tidy-up and would
have stripped the temp directory out of the guard's error message (losing provenance) and out of
`extractTarGz`'s `dirname()` input (silently re-pointing cwd at the repo root). The guard still
receives and still interpolates the FULL archive path.

The POSIX-shaped-checks observation itself is neither confirmed nor refuted by this work, because
nothing about it was exercised. It remains what it was: an unverified note, not a finding.

## Noise, not the cause

The job also emitted `##[warning]Node.js 20 is deprecated. The following actions target Node.js
20 but are being forced to run on Node.js 24: pnpm/action-setup@v4`. Not the cause; not expanded
on further.

## Verification

The original claim here — "a tag push is the only proof" — was **too pessimistic and is
withdrawn**. Unlike its macOS sibling (where only Apple's notary can see the defect), this one
reproduces on any Windows machine with no CI run at all. A tag push is the *last* step, not the
first.

### Ledger — what is PROVEN and where (updated 2026-09-21, quick-260922-p57)

**PROVEN on a macOS host (darwin 25.6.0, bsdtar 3.5.3):**

- The rewritten `:89` / `:138` call sites still list and still extract correctly under real tar.
  `meta/__tests__/tarDriveLetterSafety.test.ts` is an EXECUTED suite — it does not mock
  `child_process` — that builds a fixture `.tar.gz` and drives both functions over it. 5/5 green.
- Extraction honours `-C` independently of `cwd`: the archive dir and the destination dir are
  separate `mkdtemp` roots, and a third is used to pin the relative-destDir path.
- The argv pins in `meta/__tests__/downloadHelperBinaries.test.ts` are **mutation-proven, not
  merely present**. Against the pre-fix argv they go RED with
  `Received string: "/var/folders/…/T/nile_macOS_arm64_onedir.tar.gz"`. The pins that stood
  before this work (`expect(listArgs).toEqual(['-tzf', expect.any(String)])`) were green on both
  sides of the defect and proved nothing.
- `pnpm codecheck` clean; `pnpm lint` exit 0 (neither ceiling moved; the new test file
  contributes zero warnings); Meta project green, 1149 passed / 0 failed.

**NOT PROVEN, anywhere — do not read the green macOS run as a fix:**

- **That the Windows failure is fixed.** Nothing here has run on Windows. A macOS run is evidence
  about the WORKING path only — that the refactor did not break what already worked.
- Measured directly on this host: **macOS bsdtar 3.5.3 does not remote-parse a colon-bearing
  archive path** (`tar -tzf "$PWD/C:fakehost/a.tar.gz"` listed its entries and exited 0). So **no
  executed test on a Mac can ever go red for this defect.** The argv pins are its only detector in
  the repo, and an argv pin is an assertion about an argument vector, not about GNU tar's
  behaviour. Requires a Windows box or a CI Windows leg.
- Which `tar` wins PATH on `windows-latest` (the Hypothesis section's unmeasured half). The
  shipped remedy is deliberately PATH-agnostic, so this was side-stepped, not answered.

### On the Windows box — the negative control is STILL REQUIRED and STILL UNRUN

This is the first step and it has not been taken. The code half of this todo is shipped, which
makes this MORE important, not less: run the repro against the **pre-fix commit** (`fd7d085fb` or
earlier — anything before `fb9f0d458`) so the bug is seen to fail before the fix is seen to pass.
If it does NOT fail there, the bug is not reproduced and the fix is **unfalsifiable**.


Run from Git Bash, which is the shell that reproduces the CI conditions:

```bash
where tar                      # expect >1 hit: System32\tar.exe AND a msys/Git tar
tar --version                  # "bsdtar" vs "GNU tar" — THIS decides the remedy
pnpm install
pnpm exec tsx meta/downloadHelperBinaries.ts     # or the package script install-deps runs
```

**If this does NOT fail, STOP — you have not reproduced the bug**, and any fix you write next is
unfalsifiable. A green run here most likely means bsdtar won PATH, which is itself the finding:
it would mean the defect is PATH-order-dependent, not unconditional, and the remedy changes
accordingly. Record which tar resolved either way.

Compare against PowerShell/cmd (where System32 bsdtar normally wins) to confirm the shell is the
variable.

### After the fix (the fix is in tree as of `fb9f0d458`; these steps are UNRUN)

1. Re-run the same command in the **same Git Bash shell** — it must now pass.
2. Confirm extraction actually happened (`:138` ran), not merely listing (`:89`). Check the
   destination directory has files. A pass that only proves `:89` is the trap named above.
   **This requirement is unchanged and is the one most likely to be skipped** — `install-deps`
   going green is not by itself evidence that `extractTarGz` ran.
3. Re-run under PowerShell to confirm no regression where bsdtar was already winning.
4. Run the repo's own gates on the changed file(s): `pnpm codecheck`, `pnpm lint`, and the
   relevant jest suites (`meta/__tests__/downloadHelperBinaries.test.ts` exists — check whether
   it pins the argv, and pin the new form if it does).
5. **Only then** cut a throwaway tag. Delete it from origin and locally afterwards; `v*` also
   triggers `draft-release-mac.yml` and `draft-release-linux.yml`.

### What a green CI Windows leg does and does not prove

Getting past `install-deps` proves `:89` and `:138` — and, per step 2 above, only proves `:138`
if extraction is separately confirmed. It proves nothing about Windows **signing**, which this
pipeline has never reached — see the sibling todo below.

The other three sites are no longer UNAUDITED (see the corrected census), so a green leg neither
adds nor subtracts information about them; they are not executed on the Windows leg at all.

## Local Windows measurements (2026-09-22, quick 260922-toc)

`ready: blocked` -> `ready: code`. Vocabulary reasoning: the remaining work here — run the negative
control on `fd7d085fb` and the post-fix repro in Git Bash, confirm `:138` extraction — is desk work
an agent can run on this box. It is not a live app launch (so not `live-gate`, which this project
defines as a run on the Mac), it needs no decision or credential (so not `human`), and the hardware
is now to hand (so no longer `blocked`). The `code` tag's "no other OS" clause is carried
separately by `platform: windows`, the same pairing used for the pre-push-hook precedent
(`.planning/todos/completed/2026-09-22-pre-push-hook-cannot-pass-on-a-windows-checkout.md`).
`needs:` is left unchanged — it still accurately names the next concrete step.

**Local `where tar` / `tar --version` (this session, local Git Bash):**

```
where tar
C:\Program Files\Git\usr\bin\tar.exe
C:\Windows\System32\tar.exe
tar --version
tar (GNU tar) 1.35
```

GNU tar (Git for Windows / msys) resolves FIRST in local Git Bash PATH order, ahead of the
System32 bsdtar. **Explicit scope caveat: this answers the Hypothesis section's "Nobody has run
`where tar`" for THIS LOCAL GIT BASH ONLY. It is NOT a measurement of the `windows-latest` CI runner** —
Actions' Windows shell setup, pnpm's lifecycle-script shell selection, and this operator's local
Git-for-Windows install/PATH configuration are not guaranteed to match. This result is consistent
with (not proof of) the msys-GNU-tar-wins-PATH hypothesis; the CI runner's PATH order remains
NOT measured by this task.

**Task 2 plain-run note (this session):** `pnpm download-helper-binaries` was run plain (no forced
re-download). It exited 0 and printed `Nothing to download, binaries are up-to-date` — the runTs
bundle+run phase started and completed successfully, but `public/bin/.release_tags` already matched
the pinned tags, so the darwin-onedir extraction branch (`extractTarGz`, `:138`) was never reached.
**Tar extraction was NOT exercised by this task.** The forced run needed to actually exercise `:89`
/ `:138` under real tar on this box (with `public/bin` state backed up and restored around it) is
still the next concrete step named by `needs:` above and remains unrun. This todo is NOT closed by
this task.

**Pre-existing `public/bin` state (uninterpreted, dates only, carried over from planning):**
`.release_tags` mtime 2026-09-06 12:49 +1200 and `public/bin/x64` 12:48 — roughly 14 minutes before
`8ed7b8ccd` (13:03 same day); `public/bin/arm64/darwin/{gogdl,legendary,nile}` are onedir
directories with archive mtimes 2026-08-27. Provenance of that earlier populate is unknown (could be
a copy, a PowerShell/bsdtar run, or tsx) — recorded as an open observation only, not as evidence of
anything about the tar defect.

## Related

- `2026-09-17-notarization-rejects-253-unsigned-binaries-under-contents-resources.md` — sibling
  failure from the same run, unrelated cause.
- `2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md` — sibling
  failure from the same run, unrelated cause.
- `2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md` — the existing Windows
  signing todo. This run gained it no information either way, since signing was never reached.

Shared provenance: this was the FIRST tag push `release-tauri.yml` has ever completed — its
header comment says "UNPROVEN LIVE: this pipeline has never completed a real tag-push run" — all
three matrix legs failed, for three UNRELATED reasons, and all three defects are pre-existing.

## Resolution (2026-09-22, quick 260922-txw)

**Host:** Windows 11 10.0.26200, Git Bash (`C:\Program Files\Git`), node v24.19.0. PowerShell was
NOT used this session (no PowerShell tool available to this agent) — the Layer A PowerShell leg
and Task 3's PowerShell jest leg named by the plan are NOT DONE, see below.

**Decision rule applied:** close WITH A RESIDUAL iff ALL of (1) Layer A Git Bash negative control
reproduced (tar=GNU, `pre_list` FAILED with "Cannot connect to C: resolve failed"); (2) Layer A
Git Bash `post_list`/`post_extract_abs`/`post_extract_rel` all PASS; (3) Layer B is NOT T-TAR. All
three held — see the verdict table below — so this todo is closed with the residuals listed at the
end carried forward rather than held open for them.

**A second, NEW defect was found and fixed during this verification, not merely the one this todo
names.** The `-f` drive-letter remote-parsing defect (`fb9f0d458`) was confirmed fixed exactly as
designed. But re-running the fixed code on this Windows box surfaced a SEPARATE mechanism at the
same `:138` `-C` operand: GNU tar's default `--unquote` behaviour unescapes backslash sequences
(`\t \b \a \n \r \f \v`, octal) inside every operand before use, including `-C`. The real
`destDir`, `resolve('public/bin/arm64/darwin')`, contains `\b` (from `...\bin\...`) and `\a` (from
`...\arm64\...`); GNU tar reads those as control characters and the chdir target no longer names
the real directory — measured exit 2, "Cannot open: No such file or directory", nothing extracted.
See the PARTIAL RETRACTION note inline above (near "passed through verbatim") — the "`-C` is never
remote-parsed" claim there is still correct; what it did not anticipate is `--unquote`. Fixed this
session in `meta/downloadHelperBinaries.ts` (commit `86ed30f42`) by adding `toTarPathOperand()`, a
small pure PATH-agnostic helper that forward-slashes the resolved `-C` operand (no-op on POSIX).
Not `--no-unquote` (GNU-only, bsdtar rejects it, same reason `--force-local` was rejected for `-f`
above) and not a hardcoded System32 tar path.

**A THIRD, pre-existing defect was found and fixed in the test harness itself, not in product
code.** `meta/__tests__/tarDriveLetterSafety.test.ts`'s own `buildFixtureArchive` helper spawned
`tar -czf <absolute C:\... path> -C <fromDir> <entry>` with no `cwd` — the exact pre-fix `-f` shape
this todo's remedy exists to avoid. Measured directly (mutation-proof, reverted after): under GNU
tar on this box it fails in `beforeAll` with `fixture tar -czf failed (exit 2): tar (child):
Cannot connect to C: resolve failed`, taking all 6 tests in the file down with it — a defect in the
harness, not evidence against the fix. Fixed to the same `cwd` + `basename` shape as the functions
under test (commit `86ed30f42`, same commit as the `-C` fix). No new pending todo was filed for
this — unlike the plan's default assumption, the defect was fixed in the same session it was
measured, so there is nothing left to track as open work.

**Developer Mode / symlink privilege (planner finding 2, measured, not assumed):**
`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock\AllowDevelopmentWithoutDevLicense`
= `0x1` (Developer Mode IS enabled in the registry, confirming
`2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`'s claim over the
conflicting "no Developer Mode" brief). However `whoami /priv` for the CURRENT session does NOT
list `SeCreateSymbolicLinkPrivilege` at all — Developer Mode was very likely enabled after this
session's logon and has not yet propagated to this process's token. This is exactly the shape that
produced the Layer B T-SYMLINK result below.

**Two-profile rule (CLAUDE.md):** does NOT apply. Every command run this session (`tar`,
`node meta/runTs.cjs ...`, `pnpm download-helper-binaries`) is a `meta/` build script reading no
HOME/APPDATA/XDG profile and creating no session. No fake HOME was used.

**Commands (from repo root, Git Bash), Layer A:**

```
git show fd7d085fb:meta/downloadHelperBinaries.ts > meta/_txw_prefix_downloadHelperBinaries.ts
# + one appended re-export line; meta/_txw_harness.ts drives both the pre-fix copy and HEAD
# over a self-built symlink-free fixture archive. Both temp files deleted at the end of the task,
# never staged.
JEST_WORKER_ID=txw node meta/runTs.cjs --bundle --platform=node --target=node21 meta/_txw_harness.ts
```

**Verdict table:**

| Check | Result |
|---|---|
| Layer A Git Bash `where`/`tar --version` | `C:\Program Files\Git\usr\bin\tar.exe` resolves first, `C:\Windows\System32\tar.exe` second; `tar (GNU tar) 1.35`. Confirms the Hypothesis section's "nobody has run `where tar`" for this local Git Bash, again (also measured 2026-09-22, quick-260922-toc, same result) — still NOT a measurement of `windows-latest` CI. |
| Layer A Git Bash `pre_list` (pre-fix `fd7d085fb` code, real functions, real tar) | FAIL: `tar -tzf failed (exit 2): tar (child): Cannot connect to C: resolve failed` — negative control REPRODUCED verbatim. |
| Layer A Git Bash `pre_extract` | FAIL: `tar extraction failed (exit 2): tar (child): Cannot connect to C: resolve failed` — same mechanism, same site pairing this todo's TRAP section describes. |
| Layer A Git Bash `post_list` | PASS. |
| Layer A Git Bash `post_extract_abs` (separate absolute destDir, not beside the archive) | PASS. |
| Layer A Git Bash `post_extract_rel` (destDir resolved against caller cwd, not archive dir) | PASS — the `:138` relocation trap this todo names is specifically proven closed. |
| Layer A Git Bash exit code | 0 (all required conditions met). |
| Layer A PowerShell | NOT DONE this session (no PowerShell tool available). Previously measured 2026-09-22 (quick-260922-toc) for the SIBLING `runTs.cjs` defect only, not for this one. |
| Layer B (`pnpm download-helper-binaries`, forced re-download, Git Bash, HEAD incl. both fixes) | **T-SYMLINK.** Exit 1. Verbatim: `tar: gogdl/_internal/Python: Cannot create symlink to 'Python.framework/Versions/3.12/Python': No such file or directory` (+2 more, same file, same cause). No `tar -tzf failed` line anywhere in the run — `:89` listing passed for all three archives; extraction reached `:138` and got past the `-f`/`-C` argv entirely (non-symlink entries DID extract — `gogdl/gogdl` landed, 61 files under `gogdl/`) before failing on the 3 `Python.framework` symlink entries specifically. NOT T-TAR — closure condition (3) holds. |
| Layer B run-tree link types (before restore) | `SYMLINK: 0`, `SYMLINKD: 0`, `JUNCTION: 0` — a full creation FAILURE this time (0 links created), a DIFFERENT shape from the pre-existing hand-repaired tree's Layer 1 (created, but mis-typed). Appended as new evidence to the symlink todo. |
| Layer B restore | Four-way check (sha256 of `.release_tags`, full `find public/bin` listing, `dir /AL /S` link listing, `git status --porcelain`) — all four matched the pre-run snapshot exactly. `public/bin`, including the hand-repaired links, is untouched. |
| jest, Git Bash, both Meta suites (`tarDriveLetterSafety` + `downloadHelperBinaries`) | 2 suites / 59 tests, all PASS, post-fix. `toTarPathOperand` pure unit tests mutation-proven (identity mutant observed RED, reverted). The new "bin"/"arm64"-segment extraction case (the real `-C` hazard shape) measured RED against the pre-fix `-C` argv (verbatim: `tar: C\:\...\public\bin\arm64\darwin: Cannot open: No such file or directory`, exit 2) and GREEN after, in the same Git Bash / GNU tar 1.35. |
| jest, PowerShell | NOT DONE this session (no PowerShell tool available). |
| `pnpm codecheck` (`tsc --noEmit`) | Exit 0, no output. Scope note: `tsconfig.json`'s `include` is `["src"]` only (per quick-260922-n7s) — `meta/` is NOT typechecked by this gate at all; `meta/`'s only type coverage is `ts-jest` inside the Meta jest project, exercised by the suite run above. |
| `pnpm lint` (`node meta/lintScoped.cjs`) | 0 errors, 638 pre-existing warnings (none new, none in the touched files beyond the ones already counted pre-change) — `meta/` files ARE covered by this gate (17 warning lines under `meta/` in the full run, none touching the files this task changed). `production: PASS | tests: PASS`. |
| `pnpm planning-gates` (`python meta/runPlanningGates.py`; `python3` is the WindowsApps Store stub on this box, `python` used instead, both recorded) | 11/12 passed. The one failure, `planning-envelope-tag-gate.py` on `.planning/quick/260922-p57-make-tar-invocations-drive-letter-safe-o/260922-p57-PLAN.md`, is the pre-existing known finding named in the plan — not touched, not fixed by this task. |

**NOT DONE / NOT MEASURED by this task, unchanged from before:**
- The throwaway tag-push step (Verification step 5) — not done.
- Which `tar` wins PATH on the `windows-latest` CI runner — not measured. The remedy (both the
  original `-f` fix and this session's `-C` fix) is deliberately PATH-agnostic, so this remains an
  unmeasured fact rather than an open risk to the fix itself. Given `\a`/`\b` sit inside the exact
  segment names GitHub Actions would also use (`D:\a\...\public\bin\arm64\darwin` also contains
  `\a` and `\b`), a `windows-latest` run would very likely have hit the SAME `-C` defect this
  session found, had it reached `:138` before this fix landed — recorded as an inference, not a
  measurement.
- Windows code signing — never reached; unrelated to this todo, tracked in the sibling todo below.
- The other three `spawn('tar', ...)` sites named in the census above — unchanged, not executed on
  the Windows leg, not exercised by this task.
- Layer A PowerShell and the PowerShell leg of Task 3's jest run — no PowerShell tool available to
  this agent this session.

**Related, carried forward:**
- `2026-09-14-windows-releases-ship-unsigned-no-windows-cert-enrolled.md` — carried residual
  appended: the first real Windows tag push must also confirm `install-deps` passes and that
  `public/bin/arm64/darwin/{legendary,gogdl,nile}/{name}` exist on the runner.
- `2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md` — evidence appended: this
  session's T-SYMLINK Layer B result, as a NEW instance of that todo's Layer 0/1 mechanism (full
  creation failure, not mis-typed-but-created), not a new todo.

## ADDENDUM 2026-09-22 (orchestrator, quick 260922-txw) — the PowerShell leg, and a third defect it exposed

The executor had no PowerShell tool, so the orchestrator ran the PowerShell leg itself. PowerShell
resolves `C:\Windows\system32\tar.exe` (bsdtar 3.8.8). Under it,
`tarDriveLetterSafety.test.ts` went **1 failed / 5 passed**: the absolute-archive listing test
received `["fixture-runner/\r", …]`. **Windows bsdtar ends `-tzf` lines with CRLF**, and
`listTarEntries` split on `'\n'` only, so every entry carried a trailing `\r`. This is older than
both `fb9f0d458` and `86ed30f42`. Git Bash's GNU tar emits LF, which is why the executor's
Git-Bash-only runs were green.

**The secondary observation above is now partly a real finding.** The T-34.9-02 traversal check
`entry.split('/').includes('..')` does not match a final segment of `..\r`, so a listing
entry `nile/..` passed the guard under bsdtar. The prefix check still held, and the archives
are our own pinned-digest builds, so this is not a live vulnerability. It was still a real
weakening of the guard on the shell a Windows developer uses by default.

Fixed in `e24acc402`: `stdout.split(/\r?\n/)`. A new traversal-gate case
(`'nile/\r\nnile/..\r\n'` must throw before extraction) runs on every OS because the spawn
is mocked. **Mutation-proven:** reverting to `split('\n')` gives 1 failed / 53 passed; with
the fix restored it is 60/60. That commit also applies the prettier formatting that
`86ed30f42` left undone in `downloadHelperBinaries.test.ts`.

**Both shells after the fix:** `tarDriveLetterSafety` + `downloadHelperBinaries` are
**59/59 under PowerShell (bsdtar)** before the new case was added, and **60/60 under Git Bash
(GNU tar)** after it. Of the 43 Meta suites, 9 others fail under PowerShell on this box
(`runTsSignals`, `verifyRunnerBundle`, `preserveRunnerSymlinks`, `pruneStaleHelperBinaries`,
`isTauriRemoved`, `isIntelMacRemoved`, `captureShellScrollback`,
`loginWindowSeamPredicateRemoved`, and before the fix `tarDriveLetterSafety`). They were not
investigated. None of the other eight is touched by this task. They record that the Meta project
has never been run on Windows before, not that this task regressed anything.
