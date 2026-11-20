---
phase: quick-261120-elf
plan: 01
subsystem: steam-depot-download
tags: [depot, linux, exec-bit, elf, rust]
provides:
  - ELF +x fallback (gamelib-depot post.rs apply_elf_fallback)
  - Outcome.stats.elfExecApplied and elf=N in the [depot-rust] outcome log line
key-files:
  modified:
    - src-tauri/crates/gamelib-depot/src/post.rs
    - src-tauri/crates/gamelib-depot/src/download.rs
    - src-tauri/crates/gamelib-depot/src/delta.rs
    - src-tauri/crates/gamelib-depot/src/outcome.rs
    - src-tauri/crates/gamelib-depot/tests/post.rs
    - src/backend/storeManagers/steam/depotRust/types.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
status: complete
---

# Quick 261120-elf: ELF exec fallback for depot installs

Depot installs now give 0o755 to an unflagged file that starts `\x7fELF` with e_type ET_EXEC or ET_DYN
(both byte orders) and is not named `*.so` / `*.so.N`. Code commit `c3e6d3ae4`.

## Verification

- `tests/post.rs` `elf_fallback`: exec and PIE in both endians chmod; `.so`, ET_REL, text, truncated
  header and manifest-flagged files are left alone. `gamelib-depot` suite green except `golden`
  (`differs in ["mode"]`), which fails identically with the change stashed (pre-existing, not investigated).
- **Live (Linux, native Debian Steam):** ADOM (333300) reinstalled through GameLib with the fixed build
  came out `-rwxr-xr-x` and launched. Not run: Amnesia (57300) reinstall.

## Deviations and gotchas

- The first reinstall ran a stale `gamelib-shell`: `cargo build -p gamelib-shell` reported Finished
  without recompiling the depot crate (after a `git stash`/`pop`), so the binary lacked the fix.
  `grep -ac "ELF executable fallback" target/debug/gamelib-shell` is the check; touching `post.rs`
  forced the rebuild.
- No path gate beyond the `.so` name: the resolved dest is absolute with no install root to measure
  `lib/` against, and ELF content plus the `.so` rule is enough.
- ADOM also needed i386 libs on the host (SDL2_image/mixer/net/ttf, ncurses5, tinfo5, curl-gnutls); the
  Steam runtime here has only `amd64`. A machine issue, not a GameLib defect.
