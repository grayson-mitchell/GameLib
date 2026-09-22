---
created: 2026-09-17T00:00:00.000Z
title: 'Windows release leg dies in install-deps: tar -tzf reads "C:\...\" as a remote host spec, exit 2, before signing is ever reached'
area: build
severity: major
platform: windows
ready: blocked
needs: run-the-negative-control-and-the-repro-on-a-windows-box-code-half-is-shipped
status: OPEN
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
