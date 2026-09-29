---
created: 2026-09-29
title: 'The CI-produced Linux AppImage (0.7.0, ubuntu-24.04 build, glibc 2.39) does not launch on Pop!_OS 22.04 (glibc 2.35): GLIBC_2.39 not found, exit 1 after 65 ms, no window'
area: release
severity: major
platform: linux
ready: live-gate
source: quick-260929-v1v
files:
  - .github/workflows/release-tauri.yml
  - .planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/
---

## What was observed

Phase 38 item `38-W05`, sitting 10, 2026-09-29. `GameLib_0.7.0_amd64.AppImage`
(192399864 bytes, sha256 `ac849f1b41204358f2d4689e10eda654edab5e25b47344ddc5640a6355b072c9`),
from the DRAFT release `v0.7.0` that `release-tauri.yml` run `35942560790` uploaded (commit
`19b5e3a9e`), was made executable and launched directly on Pop!_OS 22.04 (glibc 2.35, X11), under a
fresh fake HOME. The type-2 runtime self-mounted through FUSE and ran `usr/bin/gamelib-shell`, and the
process exited with code 1, 65 ms after spawn, with no window. First stderr line, verbatim:

    gamelib-shell: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.39' not found (required by gamelib-shell)

It was followed by 46 more not-found lines (45 for `GLIBC_2.38`, 1 for `GLIBC_2.36`) naming 37
bundled libraries, for example `libgtk-3.so.0`, `libwebkit2gtk-4.1.so.0`, `libglib-2.0.so.0`.

Static census taken before the launch (`--appimage-extract`, nothing executed): the maximum glibc
reference is `GLIBC_2.39` in `usr/bin/gamelib-shell`; 50 of 175 ELF files reference glibc above
2.35; no libc is bundled; the `GLIBCXX` maximum (3.4.30) equals the host's, so libstdc++ is not the
problem. The Linux leg of `release-tauri.yml` builds on `ubuntu-24.04` (glibc 2.39), and an AppImage
does not bundle glibc, so it cannot run on a host with an older glibc. The prediction and the
observation agreed.

## Candidate fix, not a decision

Build the Linux leg on the oldest supported base (for example `ubuntu-22.04`, glibc 2.35), or state a
minimum supported glibc and refuse to advertise the AppImage below it. Either one needs a decision
about which distributions the project supports. No CI change was made in this plan. The item that
found this, `38-W05`, stays open until an AppImage that launches on the intended hosts exists.

## What is not known

- Whether the same artifact launches on a host with glibc 2.39 or newer. Only one host was tried, so
  that half of the claim is open.
- Whether a rebuilt AppImage on an older base would still pull in a webkit2gtk-4.1 that runs on
  22.04, since the bundled libraries were also built against 2.38 and 2.39.
- The provenance of the file: the `.sig` and `latest.json` were not supplied, so the minisign
  signature was never checked and the tie to run `35942560790` and commit `19b5e3a9e` rests on the
  operator's account.
- Whether the sidecar exits cleanly in the packaged Linux layout. The shell died before spawning it.

## Evidence

- `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/census.txt`
- `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/smoke-run.txt`
- `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/app-output-excerpt.txt`
- `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/verdict.txt`
- `.planning/quick/260929-v1v-run-phase-38-item-38-w05-live-on-linux-s/evidence/provenance.txt`
