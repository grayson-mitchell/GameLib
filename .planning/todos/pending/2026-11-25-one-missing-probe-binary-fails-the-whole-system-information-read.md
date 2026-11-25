---
created: 2026-11-25T14:00:00.000Z
title: "One missing probe binary (free, sysctl, the Windows OS PowerShell query) fails the whole System Information read"
area: info
files:
  - src/backend/utils/systeminfo/memory/linux.ts (getMemoryInfo_linux lets a spawn failure of `free` escape)
  - src/backend/utils/systeminfo/memory/macos.ts (getPageSize lets a spawn failure of `sysctl` escape)
  - src/backend/utils/systeminfo/osInfo/windows.ts (osInfo_windows lets a spawn failure of `powershell` escape)
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/sysinfo/expected/system-information-probes-spawn-through-the-runner-free-rejects-on-eno*/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/sysinfo/expected/mac-sysctl-spawn-failure-rejects-the-whole-read/result.json
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/sysinfo/expected/windows-os-info-powershell-missing-rejects-the-whole-read/result.json
severity: medium
platform: any
ready: code
---

## Problem

Recorded by the 88.1-05 system-information golden (D-20: kept as recorded, not fixed there).
The GPU probe catches every failure and yields no GPUs, but the memory probes (`free -b` on Linux, `sysctl` on macOS)
and the Windows OS query do not: a missing binary makes `getSystemInfo` reject with `spawn free ENOENT` (or the
equivalent), so the boot log line, the frontend's System Information and `isMacSonomaOrHigher` all lose their answer
because of one absent helper (a minimal container without procps has no `free`). A timeout or a non-zero exit is
tolerated (zero memory, default page size), so only a spawn failure is fatal.

## Solution

Not part of the port. After the Rust probes replay the three error goldens, decide the fallback (zero memory with a
warning, as a timeout already gives) in the Rust probe and the golden together, in one deliberate change recorded in
`deltas.json`.
