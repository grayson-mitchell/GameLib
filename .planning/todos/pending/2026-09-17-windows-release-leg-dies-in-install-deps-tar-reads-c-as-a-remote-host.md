---
created: 2026-09-17T00:00:00.000Z
title: 'Windows release leg dies in install-deps: tar -tzf reads "C:\...\" as a remote host spec, exit 2, before signing is ever reached'
area: build
severity: major
platform: windows
ready: code
needs: reproduce-on-windows-box-then-fix-all-reachable-tar-sites
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

Census taken 2026-09-21 by grepping `meta/*.ts` for `spawn('tar'` / `spawnArgv('tar'`. Every one
of these passes at least one ABSOLUTE path as a tar operand:

| site                                 | argv                                            | Windows-reachable?                  |
| ------------------------------------ | ----------------------------------------------- | ----------------------------------- |
| `meta/downloadHelperBinaries.ts:89`  | `-tzf <archivePath>`                            | **YES — this is the observed fail** |
| `meta/downloadHelperBinaries.ts:138` | `-xzf <archivePath> -C <destDir>`               | **YES — same function, same run**   |
| `meta/buildSidecarSea.ts:914`        | `-xzf <archivePath> -C <cacheDir> <innerPath>`  | UNAUDITED                           |
| `meta/downloadZig.ts:117`            | `-xJf <tarballPath> -C <destDir> --strip-...`   | UNAUDITED                           |
| `meta/buildRunnersOnedir.ts:708`     | `-czf <outPath> -C <distParentDir> <runnerDir>` | UNAUDITED                           |

**THE TRAP: fixing only `:89` moves the failure to `:138`.** They are in the same file, in the
same call chain — `assertArchiveEntriesAreSafe()` calls `listTarEntries()` (`:89`) and only then
does `extractTarGz()` (`:138`) run. `:138` passes **two** absolute paths (`archivePath` and
`-C destDir`), so it is strictly more exposed than the site that actually reported. A run that
gets past `install-deps` after a one-line `:89` fix has not proven anything about `:138` unless
extraction actually happened.

The bottom three are marked UNAUDITED deliberately: their Windows reachability was NOT
determined. Do not record them as fixed, and do not record them as broken, until someone checks
whether the Windows leg runs them.

## Remedy — `--force-local` is a TRAP, do not reach for it first

`--force-local` is a **GNU tar** flag. **macOS ships bsdtar, which rejects it.** Adding it
unconditionally to any shared helper turns the currently-passing macOS leg red. Because these
five call sites are shared cross-platform code, not Windows-only code, the naive fix the
Hypothesis section suggests cannot be applied as written.

Three options, in preference order:

1. **Pass `cwd` + RELATIVE operands.** Works on GNU tar, bsdtar and Windows bsdtar with no
   platform branch and no flag sniffing. `spawn('tar', ['-tzf', path.basename(archivePath)],
   { cwd: path.dirname(archivePath) })`. This is the recommendation.
2. Resolve the tar binary explicitly to `%SystemRoot%\System32\tar.exe` on Windows, so bsdtar
   always wins regardless of PATH. Fixes the cause rather than the symptom, but hardcodes a
   system path.
3. Conditional `--force-local`, **gated on `process.platform === 'win32'` AND on having actually
   confirmed GNU tar is the resolved binary.** Last resort: it is correct only under the
   unmeasured half of the hypothesis above.

Whichever is chosen, apply it to all sites found reachable — see the trap above.

## Secondary observation, NOT the reported defect and NOT verified

`assertArchiveEntriesAreSafe()` (`meta/downloadHelperBinaries.ts:114`) is the T-34.9-02
path-traversal guard. Its checks are POSIX-path-shaped: `entry.startsWith('/')` for absolute
(`:121`) and `entry.split('/').includes('..')` for traversal (`:122`). Neither sees a backslash-separated or
drive-lettered entry. These are our own archives built by `buildRunnersOnedir.ts`, so there is no
claim here of a live vulnerability — it is recorded only so that whoever touches this function
for the tar fix does not assume the guard is platform-neutral. **Verify before acting on it; do
not file it as a security finding on the strength of this paragraph.**

## Noise, not the cause

The job also emitted `##[warning]Node.js 20 is deprecated. The following actions target Node.js
20 but are being forced to run on Node.js 24: pnpm/action-setup@v4`. Not the cause; not expanded
on further.

## Verification

The original claim here — "a tag push is the only proof" — was **too pessimistic and is
withdrawn**. Unlike its macOS sibling (where only Apple's notary can see the defect), this one
reproduces on any Windows machine with no CI run at all. A tag push is the *last* step, not the
first.

### On the Windows box, BEFORE changing anything — establish the negative control

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

### After the fix

1. Re-run the same command in the **same Git Bash shell** — it must now pass.
2. Confirm extraction actually happened (`:138` ran), not merely listing (`:89`). Check the
   destination directory has files. A pass that only proves `:89` is the trap named above.
3. Re-run under PowerShell to confirm no regression where bsdtar was already winning.
4. Run the repo's own gates on the changed file(s): `pnpm codecheck`, `pnpm lint`, and the
   relevant jest suites (`meta/__tests__/downloadHelperBinaries.test.ts` exists — check whether
   it pins the argv, and pin the new form if it does).
5. **Only then** cut a throwaway tag. Delete it from origin and locally afterwards; `v*` also
   triggers `draft-release-mac.yml` and `draft-release-linux.yml`.

### What a green CI Windows leg does and does not prove

Getting past `install-deps` proves `:89` and `:138`. It proves NOTHING about the three UNAUDITED
sites unless the Windows leg actually executes them, and nothing about Windows **signing**,
which this run has never reached — see the sibling todo below.

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
