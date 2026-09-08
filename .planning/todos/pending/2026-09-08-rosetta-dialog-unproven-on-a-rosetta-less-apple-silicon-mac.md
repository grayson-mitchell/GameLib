---
created: 2026-09-08
title: "Live gate: confirm the Rosetta warning dialog actually paints on a Rosetta-less Apple Silicon Mac"
area: tauri-sidecar
status: OPEN
severity: minor
platform: macos
ready: live-gate
source: "quick-260908-k3x, Task 3 residue -- the one hop that could not be proven on the machine that did the work"
files:
  - src/backend/sidecar/bootstrap.ts (checkRosettaWhenMac, Block F call site)
  - src/backend/utils.ts:1395 (checkRosettaInstall)
  - src/backend/platform/index.ts (dialog.showMessageBox -> RUST_DIALOG_MESSAGE forward)
resolves_phase: null
---

# Live gate: confirm the Rosetta warning dialog actually paints on a Rosetta-less Apple Silicon Mac

## What quick-260908-k3x proved, and what it explicitly did not

Quick task 260908-k3x wired `checkRosettaInstall()` into the sidecar's `init()` boot path
(`checkRosettaWhenMac()`, Block F in `bootstrap.ts`) and proved, via jest, that:

- the boot path invokes the probe (`rosettaBootWiring.test.ts` Test 1, driven through `init()`
  with a mocked `exec` failure);
- a failed probe reaches `dialog.showMessageBox` with the loaded i18next catalog title, not a
  raw key or a statement-order coincidence (same test, ordering-discriminator assertion);
- the probe never shells off macOS (`rosettaPlatformGate.test.ts`);
- the forward from `dialog.showMessageBox` to `RUST_DIALOG_MESSAGE` is the existing, already-live,
  total Phase 33 Plan 03 channel -- this change adds one more caller, no new channel.

What it did NOT prove, and could not prove on the machine that did the work: this Mac HAS
Rosetta, so the actual failing condition (`arch -x86_64 /usr/sbin/sysctl` genuinely failing
because Rosetta is absent) cannot be reproduced locally. Every test above simulates the failure
via a mocked `exec` rejection. No test observes the Rust shell actually rendering the dialog on
real Apple Silicon hardware without Rosetta installed.

## The gap

One hop is unproven: that the Rust shell paints the "Rosetta not found" dialog when
`dialog.showMessageBox` forwards a real `RUST_DIALOG_MESSAGE` call for THIS caller, under real
conditions. The RPC channel itself is already audited elsewhere; what is untested is this
specific call site reaching it end-to-end on hardware where the underlying probe genuinely fails.

## How to close this

On a Rosetta-less Apple Silicon Mac (or by making the `arch` binary fail locally, e.g. removing
exec permission or shadowing it on `PATH` ahead of the real binary), boot the packaged app and
confirm the "Rosetta not found" dialog actually paints with the correct title/message, without
delaying or crashing boot. This requires a live app run and cannot be done from a desk.
