---
quick_id: 261127-wa3
status: complete
---

# Quick 261127-wa3 summary

**Already fixed. No code change.** 1c70a61c1 (84-14, G-84-1, 2026-11-22) fixed the golden test's
`tokenise`. It used to end a `${LOGDIR}` path at the first whitespace, and the space in
`Game Name_gog` left `\launch.log` un-normalised. It now ends the path at a line break or a quote.
The Rust writer logs the native path, which is correct. The todo was filed a day before the fix
and never closed.

Evidence:
- `cargo test -p gamelib-log --test golden` on Windows 11: 4/4 passed.
- CI windows-latest: `rust_writer_matches_the_ts_golden ... ok` in runs 46052246559, 46047359466
  and 45956464586. The Windows reds in the last two are gamelib-launch tests, not gamelib-log.

Closed: `.planning/todos/completed/2026-11-21-gamelib-log-golden-fails-on-windows-path-separator.md`.
