---
created: 2026-09-30
title: 'The Linux AppImage bundles an arm64 comet binary whose NEEDED loader ld-linux-aarch64.so.1 is unresolved on an x86_64 image'
area: release
severity: major
platform: linux
ready: live-gate
source: quick-260930-9l9
files:
  - .planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n/evidence/census.txt
  - .planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n/evidence/census-control.txt
  - .github/workflows/release-tauri.yml
---

## What was observed

The static census (`appimage_smoke.ts --mode census`, `readelf -d` over every ELF in the extracted
AppImage) of the ubuntu-22.04-built AppImage found exactly one statically unresolved NEEDED soname
out of 865 NEEDED entries:

    STATIC_NEEDED_UNRESOLVED=1
    UNRESOLVED ld-linux-aarch64.so.1 usr/lib/GameLib/build/bin/arm64/linux/comet

That is the arm64 build of the GOG `comet` helper, shipped inside the x86_64 AppImage. The identical
line appears in the census of the sitting-10 artifact (`census-control.txt`), so it is not new with the
ubuntu-22.04 build. `FILES_ABOVE_HOST_GLIBC=0` of 182 ELF files for the new artifact.

Did the launch path load it? Not measured. An aarch64 executable cannot run on this x86_64 host, and
the scored launch and the diagnostic launch produced no missing-library line
(`MISSING_SO_LINES=0` in both), so it did not break either launch. It is most likely inert bloat, and
this todo is filed because the pre-registered rule fires mechanically on `STATIC_NEEDED_UNRESOLVED>0`;
triage should downgrade or close it once the bundle rules are checked.

## What is not known

Whether the runtime ever selects the arm64 `comet` (for example by architecture detection on an
aarch64 host, which does not apply to this x86_64 AppImage); whether excluding
`build/bin/arm64/linux/` from the Linux bundle is safe; and whether the NEEDED check missed
RPATH/RUNPATH or dlopen'd libraries (it ignores both).

## Evidence

`.planning/quick/260930-9l9-re-run-38-w05-smoke-launch-against-the-n/evidence/` (`census.txt`,
`census-control.txt`, `smoke-run.txt`, `smoke-run-diag.txt`).

## Resolution (2026-09-30, quick 260930-bif)

Closed as inert bloat and removed: the Linux CI leg now prunes `build/bin/arm64/linux` before bundling. Runtime arch selection cannot pick it on x86_64, so the RPATH/dlopen question no longer applies. CI-only and unverified until the next `release-tauri.yml` run plus census shows `STATIC_NEEDED_UNRESOLVED=0`. The equivalent `arm64/win32` on the Windows leg is unexamined.
