## Summary

Switch the macOS PyInstaller build for `nile` from `--onefile` to `--onedir` and ship it as a
`.tar.gz` archive; Linux and Windows are unchanged and keep building `--onefile` exactly as today.

## Why

On macOS, `amfid` performs a per-file Gatekeeper code-signing assessment the first time it sees
each file on disk, and caches the result keyed by that file's code-directory hash. `--onefile`
extracts its payload to a freshly-randomized `$TMPDIR/_MEIxxxxxx` directory on **every** process
start, so that assessment cache can never hit — every single cold spawn pays the full per-file
assessment cost for the whole bundle, every time. `--onedir` runs from a fixed on-disk layout, so
after the first launch every subsequent spawn hits the cache and the tax disappears.

This is exactly why launching `nile` from a GUI wrapper (a login flow, a launcher button) feels
slow the first time in a session: the process itself is fast, `amfid` is not.

## Measured evidence

Both builds were produced from this exact CI workflow's own committed `pyinstaller` command —
`pyinstaller --onefile --name nile --strip nile/cli.py` — differing **only** in the one flag, built
from the `v1.1.2` tag on an Apple Silicon Mac, both adhoc-signed (`codesign -s - --force --deep`)
so onefile and onedir are on equal signing footing. Two independent measurement sessions:

**Session 1 — cold and warm, both builds, 400s idle separating cold samples, order reversed on
the second round to catch ordering artifacts** (this is the headline figure and the one this
change was proposed on the strength of):

| build | cold (avg) | warm |
|---|---|---|
| `--onefile` (control) | 20.84s | 6.61s |
| `--onedir` | 0.22s | 0.14s |

**~95x faster cold spawn, ~47x faster warm spawn.** The onefile control's cold reading also
independently reproduced the actually-vendored release binary's own measured cold time (21.27s),
which is what makes this figure trustworthy rather than an artifact of building differently from
what upstream ships.

**Session 2 — a later rerun, interleaving all three of nile/legendary/gogdl's onefile and onedir
builds so no two builds of the same runner ran adjacent in the sequence** (methodology: this repo's
own `--onefile`/`--onedir` command, both adhoc-signed). This rerun's own built-in validity check —
"if the onefile control's cold read comes in under 10s, the run did not reproduce a cold condition
and the cold numbers are void" — **failed on this attempt** (the control read 4.24s, and neither a
400s idle nor a forced page-cache purge (`purge`) reproduced the ~20s cold state, because the
penalty tracks `amfid`'s own assessment cache, not the page cache, and these binaries had already
been assessed dozens of times earlier that session). We report that failure here rather than
hiding it. **The warm-state comparison from that same rerun is unaffected and stayed valid:**

| build | warm |
|---|---|
| `--onefile` | 4.23s |
| `--onedir` | 0.13s |

**32.5x faster warm spawn**, an independent, same-session-scoped confirmation of the first session's
direction with a different binary build.

## Cost

`--onedir`'s tree is 108 files (103 Mach-O) versus 1 file for `--onefile` — roughly **3.6x**
on-disk growth for this build (29MB vs 8.1MB in our build; upstream's own release binary sizes will
vary slightly). Every one of those ~100 Mach-O files needs to be individually signed for
downstream consumers who notarize (we do). The release asset also becomes an archive a consumer
must extract rather than a single downloadable binary.

## Who benefits

Heroic Games Launcher vendors this exact binary to launch Amazon Games logins and installs, and its
macOS users pay this same tax on every cold spawn. This isn't a preference specific to our fork —
it's a defect in how PyInstaller's `--onefile` mode interacts with macOS Gatekeeper, and it affects
every consumer of this release asset on macOS.

## Note

We are currently building this same `--onedir` change in our own CI as an interim measure so our
users get the win immediately, and will drop that local build the moment this (or an equivalent)
lands upstream. This PR is offered so the fix benefits everyone who consumes `nile`'s macOS release
asset, not just us.
