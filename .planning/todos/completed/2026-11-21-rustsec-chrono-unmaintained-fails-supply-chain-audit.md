---
created: 2026-11-21T00:00:00.000Z
title: 'Supply-chain audit red: RUSTSEC-2026-0543 chrono is unmaintained'
area: build
severity: medium
platform: any
ready: code
status: CLOSED
resolution: FIXED in 8fcadab94 (2026-11-22) — chrono replaced with jiff in gamelib-log
---

## Problem

Supply-chain audit runs 44853952571 (8af71cd3f) and 44872994926 (5bd0c0b72) fail the cargo
advisories check: `error[unmaintained]: chrono is unmaintained`, RUSTSEC-2026-0543. External
advisory, not caused by a GameLib change.

## Solution

Find which crates pull chrono (`cargo tree -i chrono`), then either move to a maintained
alternative or record a reasoned, dated ignore in the advisory config. Do not blanket-ignore the
unmaintained class.

## Resolution (2026-11-28) — already fixed; this todo was left open

`8fcadab94` ("fix(deps): replace chrono with jiff in gamelib-log (RUSTSEC-2026-0543)", 2026-11-22)
moved `gamelib-log`, the only workspace crate that depended on chrono directly, onto **jiff**.
The fix took the todo's first option (a maintained alternative). No ignore was added to
`src-tauri/deny.toml`, and the unmaintained class is still checked (`unmaintained = "workspace"`).

Checked 2026-11-28:

- `grep '^chrono' src-tauri/Cargo.toml src-tauri/crates/*/Cargo.toml` finds nothing.
- `cargo tree -i chrono --target all` prints nothing: chrono is not in the build graph. It is still
  listed in `Cargo.lock` because `serde_with` has it as an optional dependency, but that feature is
  not enabled, so cargo-deny does not report it.
- `cargo deny check advisories` (cargo-deny 0.22.0, current advisory DB with RUSTSEC-2026-0543)
  prints `advisories ok`. Only yanked-crate warnings remain (async-executor, clipboard-win).
- CI's Supply-chain audit has been green on main since run 45778198751 (2026-11-26). The failures
  between 2026-11-25 and 2026-11-26 were RUSTSEC-2026-0594 (cookie), not chrono. `c0e66d30e`
  fixed those.
