---
created: 2026-11-25T14:00:00.000Z
title: "os-release: a quoted VERSION_ID and any single-quoted value keep their quotes in the System Information OS line"
area: info
files:
  - src/backend/utils/systeminfo/osInfo/linux.ts:45-54 (stripQuotes is applied to NAME, PRETTY_NAME and VERSION but not to VERSION_ID or VERSION_CODENAME, and only strips double quotes)
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/sysinfo/expected/os-release-quoted-version-id-keeps-its-quotes/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/sysinfo/expected/os-release-single-quotes-are-kept/result.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-05 system-information golden (D-20: kept as recorded, not fixed there).
When an os-release file has no `VERSION=` line, the OS version is built as `VERSION_ID VERSION_CODENAME` without
stripping quotes, so `VERSION_ID="22.04"` reads `"22.04" jammy`. `stripQuotes` also only knows double quotes, so
`NAME='X'` keeps its single quotes. The spec allows both quoting styles.

## Solution

Not part of the port. After the Rust parser replays the golden, decide the quoting rule (strip both quote styles on
every field) in the Rust parser and the golden together, in one deliberate change recorded in `deltas.json`.
