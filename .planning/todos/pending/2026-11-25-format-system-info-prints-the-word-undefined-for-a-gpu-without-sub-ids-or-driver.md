---
created: 2026-11-25T14:00:00.000Z
title: "formatSystemInfo prints the word undefined for a GPU without sub ids or a driver"
area: info
files:
  - src/backend/utils/systeminfo/index.ts:188-192 (formatSystemInfo interpolates gpu.subdeviceId, gpu.subvendorId and gpu.driverVersion without a fallback)
  - src-tauri/crates/gamelib-info/tests/fixtures/golden/sysinfo/expected/parselspcigpus-omits-driverversion-without-driver-lowercases-hex-toler*/text.json
severity: minor
platform: any
ready: code
---

## Problem

Recorded by the 88.1-05 system-information golden (D-20: kept as recorded, not fixed there).
`formatSystemInfo` writes each GPU's `SD=`, `SV=` and `Driver:` straight from optional fields, so a GPU lspci lists
with no subsystem ids or no kernel driver (and every Windows GPU whose PnP id carries no subsystem) prints
`IDs: D=2860 V=10de SD=undefined SV=undefined` and `Driver: undefined` in the System Information text a user pastes
into a bug report.

## Solution

Not part of the port. After the Rust formatter replays the golden, decide the wording (omit the field, or print
`unknown`) in the Rust formatter and the golden together, in one deliberate change recorded in `deltas.json`.
