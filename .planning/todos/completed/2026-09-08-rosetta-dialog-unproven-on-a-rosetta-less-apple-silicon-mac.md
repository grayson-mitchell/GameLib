---
created: 2026-09-08
title: "Live gate: confirm the Rosetta warning dialog actually paints on a Rosetta-less Apple Silicon Mac"
area: tauri-sidecar
status: "RESOLVED 2026-09-08 by the live gate itself (quick-260908-k3x residue). The dialog PAINTS. Proven on real Apple Silicon hardware with the failure condition forced by a PATH shadow of `arch`, run as an isolated second app instance so the operator's live dev session was never disturbed. Negative control ran first and discriminated. See the Gate Run section below, including the measurement that was WRONG and how it was caught."
severity: minor
platform: macos
ready: live-gate
source: "quick-260908-k3x, Task 3 residue -- the one hop that could not be proven on the machine that did the work"
files:
  - src/backend/sidecar/bootstrap.ts (checkRosettaWhenMac, Block F call site)
  - src/backend/utils.ts:1402 (checkRosettaInstall)
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


---

# GATE RUN 2026-09-08 -- PASSED

## Method

The true condition (a Rosetta-less Mac) is unreproducible here: `arch -x86_64 /usr/sbin/sysctl
sysctl.proc_translated` exits 0 with `sysctl.proc_translated: 1` on this machine. Forced it the
way this todo prescribed -- a fake `arch` earlier on `PATH` that exits 1 with the authentic
`arch: posix_spawnp: /usr/sbin/sysctl: Bad CPU type in executable`. The probe shells bare `arch`
(not an absolute path), so `PATH` resolution reaches it.

A live `pnpm tauri:dev` session was already running, and this app holds a single-instance socket
(`gamelib-single-instance.sock`), so a second launch would have forwarded args to the existing
instance and measured nothing. Ran each trial as `./src-tauri/target/debug/gamelib-shell` under
its own `HOME`, which gives it its own app-support dir, its own socket and its own log. The
operator's session (pid 91552) was never touched, and was verified still alive afterwards.

## Negative control FIRST (normal PATH)

`Rosetta is available on this system.` -- one `GameLib` window, zero dialogs. The gate can tell
the two states apart; a dialog appearing in the positive trial is therefore attributable.

## Positive trial (arch shadowed)

- `16:28:39` `Rosetta is not available on this system.` -- failure branch entered live.
- Dialog **painted**, verified by screenshot: title "Rosetta not found", body carrying the
  `"softwareupdate --install-rosetta"` guidance, single OK button.
- `16:32:01` `Rosetta is not available, install it with: softwareupdate --install-rosetta from
  the terminal` -- emitted only after OK was pressed, proving the `await
  dialog.showMessageBox(...)` round trip through `RUST_DIALOG_MESSAGE` completes and returns.

## Boot not blocked, not crashed

`Frontend Ready` at `16:28:39` -- the same second the probe failed, and ~3.5 minutes before the
dialog was dismissed. The library UI rendered behind the dialog and a dxmt tool download ran to
completion at `16:28:57` with the dialog still up. The floated, non-awaited call in Block F
behaves as designed.

## THE MEASUREMENT THAT WAS WRONG

`System Events` accessibility queries against the app reported `0` sheets, no OK button, and an
empty window sweep -- **while the dialog was plainly on screen**. AX is blind to this panel. A
gate scored on AX alone would have reported "no dialog painted", manufacturing a false defect
against correct code. The screenshot is what corrected it. Sibling of the existing
`measure-colour-before-scoring-a-ui-contract` finding: for the Rust-side native dialog,
**measure pixels, not the accessibility tree**.

Second thing that looked like a defect and is not: between the probe and the click, the sidecar
sat inside `await dialog.showMessageBox(...)` with no second log line and no timeout warning for
127s+. That is correct -- `dialog_message` is deliberately exempt from the `requestRustInvoke`
timeout (human-in-the-loop; no wall-clock value is ever right for a panel a person is reading).

## Limits of this run, stated rather than implied

- Rosetta absence was **simulated** by a `PATH` shadow. What is proven is the code path taken
  when the probe fails, not the behaviour of a genuinely Rosetta-less macOS install.
- Ran against the **debug** shell binary with the current Block F sidecar bundle, not a freshly
  packaged `.app` (both bundles on disk predate Block F). The Rust dialog path is identical; the
  packaging layer is not exercised.
