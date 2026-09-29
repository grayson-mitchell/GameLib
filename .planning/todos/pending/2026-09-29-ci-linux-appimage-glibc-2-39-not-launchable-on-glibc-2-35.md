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
  - src/backend/__tests__/releaseWorkflow.test.ts
  - .planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/
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

## Change made 2026-09-29 (quick 260929-vyi)

Commit `09aab2b97` (`fix(quick-260929-vyi)`) is the first candidate above, taken. It changes
`.github/workflows/release-tauri.yml` and `src/backend/__tests__/releaseWorkflow.test.ts` only:

- The Linux matrix leg moved from `ubuntu-24.04` (glibc 2.39) to `ubuntu-22.04` (glibc 2.35). The
  `Install Ubuntu system dependencies` guard now equals it exactly, and its apt package list is
  unchanged.
- `swatinem/rust-cache` is now keyed on `matrix.platform`. Its default key is only OS type and
  architecture (Linux-x64) plus a rustc/env/lockfile hash, and it restores by prefix, so it could not
  tell 22.04 from 24.04 and could have restored a `target/` compiled against the newer glibc.
- A dated header entry in the workflow states why, and what is unproven live.
- Four parsed-YAML tests replace the raw-text `ubuntu-(24\.04|latest)` regex test, which a comment
  alone could satisfy: one Linux leg on 22.04; the apt guard equals the leg's platform; the apt list
  equals the jammy-censused set; the rust-cache key.

Why this candidate and not the alternative. Stating a minimum supported glibc of 2.39 and no longer
advertising the AppImage below it would leave every 22.04-era user with a download that does not
start, including this project's own target host, the operator's Pop!_OS 22.04. Tauri's guidance is
to build on the oldest supported base that provides WebKitGTK 4.1, and it names Ubuntu 22.04.

Census: all 5 apt packages are FOUND in the real Ubuntu jammy archive indexes (six `Packages.xz`
files, each with size and sha256), evidence
`.planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/jammy-apt-census.txt`.
Premise correction, stated plainly: on this host `apt-cache policy` lists only the installed
version (its sole source is `/var/lib/dpkg/status`, and `/var/lib/apt/lists` holds a stale `noble`
cache), so it cannot answer "is it in jammy". The census therefore reads the archive indexes.

Negative controls, evidence
`.planning/quick/260929-vyi-fix-glibc-todo-move-linux-release-leg-to/evidence/negative-control.txt`:

    test                                       red arm
    (a) one Linux leg on ubuntu-22.04          A: pre-edit workflow
    (b) apt guard equals the leg's platform    B: guard-only half-edit
    (c) apt list equals the censused set       C: one extra package appended
    (d) rust-cache keyed on matrix.platform    A: pre-edit workflow

Each arm failed exactly the expected test(s), and the workflow was restored byte-identical to HEAD
after B and C.

### UNVERIFIED -- until a CI run on the new base produces an AppImage and it is smoke-launched on this host

1. No `release-tauri.yml` run has executed on `ubuntu-22.04`. The apt install, the Rust compile, the
   SEA sidecar build, and AppImage bundling (linuxdeploy/appimagetool on the 22.04 image) are all
   unobserved.
2. The rebuilt AppImage's maximum `GLIBC_` reference being at most 2.35 is expected by construction,
   not measured. Re-run the 260929-v1v static census method (its `evidence/census.txt`) on the new
   artifact.
3. Launch on this Pop!_OS 22.04 host is the `38-W05` re-run, which is out of scope here. A default
   `workflow_dispatch` dry run is the SAFE way to prove item 1 without touching any release, but it
   yields a build log and no binary. Only a real `v*` tag push yields an AppImage, and that writes
   into the shared draft release `v0.7.0`, so it is the operator's call.
4. Launch on a glibc 2.39 or newer host, the open item above, is unchanged.
5. The first run after this change is a cold Rust cache on all three legs. The 60-minute
   `tauri-action` bound has never been measured against a cold build.
6. GitHub's `ubuntu-22.04` hosted image is on a deprecation path, and no date is asserted here. When
   it retires, the floor must be re-decided.
7. Helper binaries fetched by `pnpm download-helper-binaries`, and the SEA sidecar's official
   nodejs.org Node, carry their own glibc floors that do not depend on the build base. The earlier
   "What is not known" items (minisign provenance, sidecar exit in the packaged layout) are
   untouched.
