---
created: 2026-11-26T13:00:00.000Z
title: "A launch waits on the pci.ids DNS lookups with no overall deadline"
area: launch
files:
  - src-tauri/crates/gamelib-info/src/sysinfo/dns.rs:325-340,371-395 (LOOKUP_TIMEOUT and PER_SERVER_TIMEOUT, no overall bound)
  - src-tauri/crates/gamelib-info/src/sysinfo/pci_ids.rs:136-168 (the serial per-name lookups)
  - src-tauri/crates/gamelib-launch/src/prepare/deps.rs:246-251 (system_info_text awaits get_system_info)
severity: medium
platform: any
ready: code
---

## Problem

`prepare_launch` awaits `system_info_text()` before it returns, and that read runs one lookup per name serially: with
sub-ids a GPU costs a sub-key lookup, a plain-key lookup and a vendor lookup. Each is bounded at `LOOKUP_TIMEOUT` (5 s),
and a black-holed resolver (a firewall dropping UDP/53, a captive network) reaches the bound every time, so one GPU can
hold the launch for about 15 s and two GPUs for 30 s. The per-server 2 s across three servers is 6 s, so the third
server never gets its slot. `ServerFailed` results are not remembered, so every fresh process repeats this. After the
read the GPU list is cached in memory for the life of the process, so a first read with no network leaves the GPU list
empty and `steamDeckInfo` at `isDeck:false` until restart.

Found by 88.1-REVIEW.md WR-03, confirmed by 88.1-VERIFICATION.md (by reading the code: a black-holed resolver can hold a
launch for several seconds per GPU; a warning, not a correctness gap).

## Solution

Put one deadline over the whole GPU naming step (for example 5 s total in `populate_device_and_vendor_name`, falling
back to the names already cached), and do not cache a `SystemInformation` whose GPU list was emptied by a resolver
failure (return it, but skip `cached = Some(...)` so the next read retries).
