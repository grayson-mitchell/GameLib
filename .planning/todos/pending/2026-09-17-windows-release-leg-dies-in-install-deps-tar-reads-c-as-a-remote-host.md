---
created: 2026-09-17T00:00:00.000Z
title: 'Windows release leg dies in install-deps: tar -tzf reads "C:\...\" as a remote host spec, exit 2, before signing is ever reached'
area: build
severity: major
platform: windows
ready: code
needs: fix-tar-invocation-then-retag
status: OPEN
found_by: 'GitHub Actions run 35223308954 on grayson-mitchell/GameLib, triggered by the throwaway annotated tag v0.7.0-notarize-test1 at commit cc2d66248. The tag was deleted from origin and locally after the run.'
source: '.planning/todos/pending/2026-09-04-macos-releases-ship-unsigned-and-unnotarized.md'
files:
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

## Noise, not the cause

The job also emitted `##[warning]Node.js 20 is deprecated. The following actions target Node.js
20 but are being forced to run on Node.js 24: pnpm/action-setup@v4`. Not the cause; not expanded
on further.

## Verification

A tag push reaching a green Windows leg (or at least past `install-deps` into signing) is the
only proof.

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
</content>
