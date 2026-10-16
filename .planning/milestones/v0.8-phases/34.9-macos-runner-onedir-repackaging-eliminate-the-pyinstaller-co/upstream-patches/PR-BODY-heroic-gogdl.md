## Summary

Switch the macOS PyInstaller build for `gogdl` (the `gogdl_macos_x86_64` / `gogdl_macos_arm64`
release assets) from `--onefile` to `--onedir` and ship each as a `.tar.gz` archive; Linux and
Windows are unchanged and keep building `--onefile` exactly as today.

## Why

On macOS, `amfid` performs a per-file Gatekeeper code-signing assessment the first time it sees
each file on disk, and caches the result keyed by that file's code-directory hash. `--onefile`
extracts its payload to a freshly-randomized `$TMPDIR/_MEIxxxxxx` directory on **every** process
start, so that assessment cache can never hit — every single cold spawn pays the full per-file
assessment cost for the whole bundle, every time. `--onedir` runs from a fixed on-disk layout, so
after the first launch every subsequent spawn hits the cache and the tax disappears.

This is the exact mechanism behind a slow first-launch feel for any GUI wrapper that shells out to
`gogdl` — a GOG login flow, an install/launch button — even though the process itself does very
little work.

## Measured evidence

Both builds were produced from this exact workflow's own committed `pyinstaller` command —
`pyinstaller --onefile --name gogdl --strip gogdl/cli.py` — differing **only** in the one flag,
built from the `v1.2.1` tag on an Apple Silicon Mac (via this workflow's own `pip install -e .`
step, needed for gogdl's vendored `xdelta3` C extension to be discoverable by PyInstaller's
analysis), adhoc-signed (`codesign -s - --force --deep`) to put it on equal signing footing with
the currently-vendored release binary.

**Cold-spawn timing for this specific runner is not yet reliably measured on our machine.** Two
attempts (a 400s idle, and a forced page-cache flush via `purge`) both failed our own validity
check — neither reproduced a true cold `amfid` assessment state, because the penalty tracks
`amfid`'s own per-file assessment cache rather than the page cache, and by the time of those
attempts these binaries had already been exercised repeatedly earlier in the same session. We are
not claiming a cold-spawn number we have not actually reproduced.

**What we do have, and can stand behind, is a same-session, same-machine warm-spawn comparison**,
with the two builds measured minutes apart and never adjacent in run order (to rule out ordering
artifacts):

| build | warm |
|---|---|
| `--onefile` | 2.99s |
| `--onedir` | 0.11s |

**~27.2x faster warm spawn** for this exact runner, built from this exact repo's own CI command.
This is a conservative lower bound: the user-visible case is a cold spawn, where `--onefile` is
measurably worse than its warm time and `--onedir` barely moves (confirmed directly for a sibling
runner built the same way in the same test harness, at ~95x cold / ~47x warm). We report the
warm-only number here, honestly labeled, rather than extrapolating a cold figure we have not
directly reproduced for this runner.

## Cost

`--onedir`'s tree is 67 files (62 Mach-O) versus 1 file for `--onefile` — roughly **2.3x** on-disk
growth for this build (25MB vs 11MB). Every one of those ~62 Mach-O files needs to be individually
signed for downstream consumers who notarize (we do). The release asset also becomes an archive a
consumer must extract rather than a single downloadable binary.

## Who benefits

Heroic Games Launcher itself is the primary consumer of this exact release asset and its macOS
users pay this same tax on every cold GOG login/install/launch. This isn't a preference specific to
a downstream fork — it's a defect in how PyInstaller's `--onefile` mode interacts with macOS
Gatekeeper, affecting every consumer of the macOS release asset.

## Note

We are currently building this same `--onedir` change in our own CI as an interim measure so our
users get the win immediately, and will drop that local build the moment this (or an equivalent)
lands upstream. This PR is offered so the fix benefits everyone who consumes `gogdl`'s macOS
release asset, not just us.
