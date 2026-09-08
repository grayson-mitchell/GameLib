---
created: 2026-09-06
title: "checkRosettaInstall never runs under Tauri — Apple Silicon Macs without Rosetta fail opaquely at launch instead of being told"
area: tauri-sidecar
status: "RESOLVED 2026-09-08 by quick 260908-k3x. This was a PORT into the sidecar's own boot path, not a re-wire of an existing call site -- the todo's framing ('the old caller was main.ts:241') is not actionable as written because src/backend/main.ts no longer exists (deleted by Phase 35-14). Added an exported `checkRosettaWhenMac()` beside `reconcileStoreUsersWhenOnline()` in bootstrap.ts, called once from `init()` (Block F) behind a `rosettaCheckInitialized` guard, gated `if (!isMac) return` so the probe never shells off macOS. The call is chained off a NEW module-scope `i18nReady` promise -- the caught result of the i18next `.init()` call, which was previously floated with nothing holding it -- rather than relying on statement order: `i18next.use(Backend).init()` is asynchronous (i18next 22.5.1 + i18next-fs-backend reads catalogs off disk), so ordering alone would only prove `init()` had been CALLED, not that the catalog had LOADED, and a non-English user would silently get the inline English defaults. `rosettaBootWiring.test.ts` Test 1(c) is the discriminating assertion: it captures `i18next.t('box.warning.rosetta.title')` called with NO default argument at the moment the dialog stub fires, which distinguishes a loaded catalog ('Rosetta not found') from an unloaded one (the raw key echoed back) -- a default-carrying t() call cannot make this distinction because the en catalog string and the inline default are byte-identical. `icon: windowIcon` on the dialog call is dropped by the Rust `RUST_DIALOG_MESSAGE` forward (backend/platform/index.ts), which only passes message/title/kind/buttons through -- named here, not fixed, since fixing it is out of this todo's scope. checkRosettaInstall() itself (src/backend/utils.ts) is byte-unchanged; its own function-level test suite stays green untouched. RED-proven per quick-260908-k3x's own non-negotiable: reverting bootstrap.ts's tree to commit d627fd223's blob (git show, HEAD held constant at b5b277abe) turned rosettaBootWiring.test.ts Test 1 red with a genuine assertion failure (`Expected: true, Received: false`, naming the exec probe call that never ran), not a module-resolution error. WHAT WAS NOT PROVEN, stated plainly: no test here, and no test that can run on this machine, observes the dialog actually rendering on an Apple Silicon Mac that lacks Rosetta -- this machine HAS Rosetta, so the true failing condition is unreproducible locally, and the probe's failure is only simulated via a mocked `exec` rejection. What IS proven: the boot path invokes the probe, a failed probe reaches `dialog.showMessageBox`, and the forward to `RUST_DIALOG_MESSAGE` behind it is already live and total (Phase 33 Plan 03). The unproven residue is exactly one hop -- that the Rust shell paints that particular dialog -- scoped to a new pending todo (`ready: live-gate`)."
severity: medium
platform: macos
ready: code
source: "quick-260906-gej, sweep FINDINGS.md section A row A6"
files:
  - src/backend/utils.ts:1395 (checkRosettaInstall definition, referenced only by its own test file)
  - src/backend/sidecar/bootstrap.ts (Block F: checkRosettaWhenMac(), call site, i18nReady)
resolves_phase: null
---

# checkRosettaInstall never runs under Tauri — Apple Silicon Macs without Rosetta fail opaquely at launch instead of being told

## The unported side effect

Old `main.ts` called `checkRosettaInstall()` on macOS at startup (`main.ts:241`).

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

**0 occurrences** in the bundle; in-tree it is defined at `utils.ts:1395` and referenced only by
its own test file.

## Consequence

Apple Silicon is now the only supported Mac target, and every Steam title GameLib runs is a
Windows binary under Wine/GPTK — all of which need Rosetta. The boot-time probe and its "install
Rosetta" guidance dialog are gone, so a machine without Rosetta fails opaquely at launch instead
of being told.

## Resolution (quick-260908-k3x)

See `status:` above for the full narrative. Summary: `checkRosettaInstall()` is now called from
`bootstrap.ts`'s `init()` via a new `checkRosettaWhenMac()` (macOS-gated, once-guarded, chained
off the caught i18next init promise so the dialog's strings wait for the real catalog rather than
racing it). Proven in both directions by `rosettaBootWiring.test.ts` (positive: the probe runs
from boot and reaches the dialog with the loaded title) and `rosettaPlatformGate.test.ts`
(negative: the probe never shells off macOS). The one hop this closure could not prove on this
machine — the Rust shell actually painting the dialog on a Rosetta-less Apple Silicon Mac — is
scoped to a new pending todo (`ready: live-gate`).
