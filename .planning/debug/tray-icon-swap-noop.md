---
status: diagnosed
trigger: "1-3 yes, dark tray icon does nothing"
created: 2026-07-25T00:00:00Z
updated: 2026-07-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — `public/icon-dark.png` and `public/icon-light.png` are byte-identical
  (MD5 `e754404b2dfd8cb4181a20555175bb47`). The entire `changeTrayColor` -> `tray_set_icon`
  chain executes correctly and `tray.set_icon()` succeeds — it just installs a pixel-identical
  image, so nothing visibly changes.
test: `md5`/`cmp` on both assets at every scale; `git show <rev>:public/icon-*.png | md5`
  across history to find the flattening commit.
expecting: identical digests => the swap is a visual no-op regardless of transport correctness.
next_action: DIAGNOSIS ONLY — no fix applied per task constraints. Report to caller.

reasoning_checkpoint:
  hypothesis: "Toggling darkTrayIcon does nothing visible because tray_image(true) and
    tray_image(false) decode from byte-identical PNG assets, so the icon swap installs the
    same image."
  confirming_evidence:
    - "cmp public/icon-dark.png public/icon-light.png => IDENTICAL BYTES; both MD5 e754404b2dfd8cb4181a20555175bb47, both 2129 bytes, both mtime Jun 28 10:40."
    - "Same identity holds at @2x (5b97b5bd...) and @3x (9557f196...) — all three pairs collapse."
    - "git show 34fc2f5f~1 shows the pair WAS distinct (328ebd15... vs 8289b074...); at 34fc2f5f both are 273e9039... — the rebrand commit overwrote both slots with one image."
    - "The sidecar DID receive the send: gamelib.log.old:43 `(17:01:11) [INFO] [Backend]: Changing Tray icon Color...` in the Tauri session (same log has src-tauri/public/bin paths), emitted by appShellFlowRegistration.ts:296."
    - "Transport leg is structurally sound: RUST_TRAY_SET_ICON is in RUST_INVOKE_CHANNELS (sidecarTransport.ts:238), registered as ipcMain.on (correct `send` kind), Rust arm exists at main.rs:568 ahead of the catch-all, tauri features include `image-png`, tray built with_id(TRAY_ICON_ID) matching tray_by_id(TRAY_ICON_ID)."
    - "GlobalConfig read is fresh: setSetting is registered in the SAME sidecar process (settingsFlowRegistration.ts:144) and config.ts:392 assigns `this.config = config`, so the 500ms-later getSettings() sees the new value."
  falsification_test: "Replace public/icon-dark.png with a visibly different image (e.g. an
    inverted/white-on-transparent variant), rebuild, toggle the setting. If the tray image
    still does not change, this hypothesis is wrong and the fault is downstream in the
    rustInvoke leg or tray_by_id."
  fix_rationale: "The root cause is a DATA defect, not a code defect. The swap machinery is
    correct end to end; it is being handed two copies of one image. Restoring a genuinely
    distinct dark variant makes the existing code produce the intended visible effect."
  blind_spots: "Because the assets are identical, a successful `tray.set_icon()` and a silently
    failing one are INDISTINGUISHABLE from the observed symptom. I have verified the rustInvoke
    leg statically but NOT observed a live `tray_set_icon` round-trip. Rust's eprintln! and the
    sidecar's console.warn both go to the `tauri:dev` terminal (main.rs:718-722 forwards sidecar
    stderr to shell stderr), NOT to gamelib.log — so their absence from gamelib.log is expected
    and proves nothing. A second latent fault downstream cannot be excluded until the assets
    are fixed and test 6 sub-item 4 is re-run."

## Symptoms

expected: Toggling the dark-tray-icon setting swaps the tray image within ~500ms (the collapsing settle-timer window `changeTrayColor` uses)
actual: Toggling the dark-tray-icon setting does nothing — the tray image never visibly changes
errors: none reported by the user (NOTE: sidecar `send` channels fail SILENTLY; absence of an error is zero evidence)
reproduction: |
  1. `pnpm tauri:dev` on macOS
  2. Tray icon appears (PASSES), clicking it shows/focuses window (PASSES), both menu items work (PASSES)
  3. Toggle the dark-tray-icon setting in Settings
  4. Tray image does not change
started: Never worked on this branch. NOT a Phase 34.1 regression — the underlying asset
  defect dates to commit `34fc2f5f` (2026-06-27, "rebrand app identity from Heroic to GameLib"),
  which predates the Tauri tray port entirely and affects the Electron build identically.

## Eliminated

- hypothesis: "The frontend never calls changeTrayColor (settle timer cleared every time / toggle not wired)"
  evidence: "UseDarkTrayIcon.tsx:11 calls `window.api.changeTrayColor()` unconditionally on
    every toggle, and gamelib.log.old:43 proves the sidecar's handler actually ran and logged
    `Changing Tray icon Color...` during the live Tauri session at 17:01:11. The frontend leg fires."
  timestamp: 2026-07-25

- hypothesis: "changeTrayColor is unregistered or registered with the wrong transport kind
    (ipcMain.handle instead of ipcMain.on), so the send is silently dropped"
  evidence: "appShellFlowRegistration.ts:295 registers it via `ipcMain.on` — the correct kind
    for a `send` channel — and the handler demonstrably executed (log line above). The
    silent-send failure mode does not apply here."
  timestamp: 2026-07-25

- hypothesis: "tray_set_icon is not in the rustInvoke allowlist, so requestRustInvoke rejects immediately"
  evidence: "sidecarTransport.ts:218 defines RUST_TRAY_SET_ICON and line 238 includes it in
    RUST_INVOKE_CHANNELS, which is exactly the list sidecarRpc.ts:286 checks before emitting."
  timestamp: 2026-07-25

- hypothesis: "The `image-png` Cargo feature is missing, so Image::from_bytes fails and the tray
    falls back to the blank 1x1 transparent pixel"
  evidence: "src-tauri/Cargo.toml:15 — `tauri = { version = \"2\", features = [\"tray-icon\",
    \"image-png\"] }`. The feature is present. Independently, UAT sub-item 1 confirms a VISIBLE
    tray icon at startup, which the blank-pixel fallback would not produce."
  timestamp: 2026-07-25

- hypothesis: "The icon assets are missing or unresolvable at runtime (the recurring
    publicDir/getAppPath path-resolution family)"
  evidence: "The Rust side uses `include_bytes!` at COMPILE time (main.rs:70/74), so no runtime
    path is resolved at all; a missing file would be a build failure, and the build succeeded.
    Both files exist on disk. This deliberately sidesteps that bug family."
  timestamp: 2026-07-25

- hypothesis: "The sidecar's GlobalConfig cache is stale, so syncTrayIcon always reads the OLD
    darkTrayIcon value and sends an unchanged `dark` flag"
  evidence: "`setSetting` is registered in the SAME sidecar process (settingsFlowRegistration.ts:144)
    and calls GlobalConfig.get().setSetting(), which at config.ts:391-392 mutates and reassigns
    `this.config`. The read at appShellFlowRegistration.ts:141, 500ms later, therefore sees the
    fresh value. Same-process write-then-read, ordered sends, ample delay."
  timestamp: 2026-07-25

- hypothesis: "tray_by_id(TRAY_ICON_ID) returns None, so the arm logs and skips"
  evidence: "The tray is built with `TrayIconBuilder::with_id(TRAY_ICON_ID)` (main.rs:944) and
    looked up with the same `TRAY_ICON_ID` constant (main.rs:574) — one shared const, no string
    duplication, no indirection mismatch. UAT sub-items 1-3 independently prove the tray built
    successfully. NOTE: this is eliminated as the PRIMARY cause but not fully observed live —
    see blind_spots."
  timestamp: 2026-07-25

## Evidence

- timestamp: 2026-07-25
  checked: .planning/phases/34.1-.../34.1-HUMAN-UAT.md test 6
  found: Sub-items 1-3 (tray creation, tray click, both menu items) PASS in the same live session. Only sub-item 4 (icon swap) fails.
  implication: Tray object creation and the Rust tray event path are functional. The defect is isolated to the icon-swap path.

- timestamp: 2026-07-25
  checked: ~/Library/Logs/GameLib/gamelib.log.old line 43, and surrounding lines 35-58
  found: "(17:01:11) [INFO]: [Backend]: Changing Tray icon Color..." — and the same log's
    surrounding lines reference `/Users/.../GameLib/src-tauri/public/bin/x64/darwin/legendary`,
    identifying this as the TAURI SIDECAR session (16:59:57-17:06:46), not the Electron run.
  implication: DECISIVE. The `changeTrayColor` send reached the sidecar and
    appShellFlowRegistration.ts:296's handler executed. The frontend leg and the send transport
    leg are both proven working live. The failure is downstream of that log line.

- timestamp: 2026-07-25
  checked: `md5` and `cmp` on public/icon-dark.png vs public/icon-light.png
  found: Byte-identical. Both MD5 `e754404b2dfd8cb4181a20555175bb47`, both 2129 bytes, both
    mtime Jun 28 10:40. `cmp` reports no differences.
  implication: ROOT CAUSE. `tray_image(true)` and `tray_image(false)` decode two copies of the
    SAME image. `tray.set_icon()` succeeds and installs a pixel-identical icon — the user sees
    absolutely nothing change, which is precisely the reported symptom.

- timestamp: 2026-07-25
  checked: All icon-*.png assets repo-wide via `find ... -exec md5`
  found: The collapse is total across every scale — icon-dark.png == icon-light.png
    (e754404b), icon-dark@2x.png == icon-light@2x.png (5b97b5bd), icon-dark@3x.png ==
    icon-light@3x.png (9557f196). The same identical pair is also mirrored into build/ and into
    the packaged dist/mac-arm64 app bundle.
  implication: Not a single-file accident and not a build/copy artifact — the source assets
    themselves are duplicates at every resolution, and the duplication propagates to packaged builds.

- timestamp: 2026-07-25
  checked: git history of both assets (`git show <rev>:public/icon-*.png | md5`)
  found: |
    47e1caa9 — dark d2e7ee65 / light 77ed8cf3   (DISTINCT)
    14dab13a — dark 6e44e779 / light 117fcc87   (DISTINCT)
    ba0a2a06 — dark 328ebd15 / light 8289b074   (DISTINCT)
    34fc2f5f~1 — dark 328ebd15 / light 8289b074 (DISTINCT)
    34fc2f5f — dark 273e9039 / light 273e9039   (IDENTICAL — flattened here)
    0d81f046 — dark e754404b / light e754404b   (IDENTICAL — re-flattened with new artwork)
  implication: Commit `34fc2f5f` ("rebrand app identity from Heroic to GameLib", 2026-06-27)
    overwrote BOTH the dark and light tray slots with one image, destroying the distinction that
    upstream Heroic had. `0d81f046` ("replace app icon with GameLibSticker1 gamer-cat artwork")
    repeated the same mistake with the current artwork. This defect is ~1 month older than
    Phase 34.1 and is NOT a regression introduced by the Tauri port.

- timestamp: 2026-07-25
  checked: src/backend/tray_icon/tray_icon.ts:15-16, 86-96 (the Electron implementation)
  found: Electron's `getIcon()` does `nativeImage.createFromPath(darkTrayIcon ? iconDark : iconLight)`
    against the same two identical files in publicDir.
  implication: The Electron build has the IDENTICAL no-op. UAT test 10 ("Electron parity")
    passed only because the tester never toggled the dark-tray setting there. The Tauri port is
    faithfully reproducing pre-existing broken behavior — parity is intact; the shared data is wrong.

- timestamp: 2026-07-25
  checked: src-tauri/Cargo.toml:15; src-tauri/src/main.rs:70-99, 568-586, 944-992;
    src/common/types/sidecarTransport.ts:218/225-238; src/backend/sidecar/sidecarRpc.ts:282-296;
    src/backend/sidecar/settingsFlowRegistration.ts:144-173; src/backend/config.ts:289-292/385-397
  found: Every other link in the chain is structurally correct — `image-png` feature present;
    the `tray_set_icon` arm exists once, sits ahead of the unknown-channel catch-all, and reads
    `args[0].dark`; the channel is allowlisted; the tray build id and lookup id are one shared
    constant; the config write and the config read happen in the same process with the write
    updating the in-memory cache.
  implication: No second defect is visible by static reading. The asset identity is a complete
    and sufficient explanation on its own.

- timestamp: 2026-07-25
  checked: src-tauri/src/main.rs:718-722 (`start_stderr_forwarder`) and grep for
    "appShellFlowRegistration"/"[shell]"/"tray_set_icon" in both gamelib.log files
  found: Zero matches in either log. The sidecar's stderr is forwarded to the SHELL's stderr —
    i.e. the `tauri:dev` terminal — not into gamelib.log. `logSendFailure` uses `console.warn`
    and Rust's skip path uses `eprintln!`; neither can ever reach gamelib.log.
  implication: The absence of any tray error in gamelib.log is EXPECTED and non-probative. It
    neither supports nor refutes a downstream rustInvoke failure. Recorded explicitly so a later
    reader does not misread this silence as evidence the invoke succeeded.

- timestamp: 2026-07-25
  checked: src/backend/sidecar/__tests__/appShellFlows.test.ts:664-753;
    src/backend/__tests__/tauriShellSource.test.ts:103-104, 129-171;
    src/backend/tray_icon/__tests__/tray_icon.test.ts:267-282
  found: Every test asserts on the SELECTOR, never on the PAYLOAD. The sidecar suite asserts
    `requestRustInvoke` was called with `[{dark: true}]` vs `[{dark: false}]`. The Rust-source
    suite asserts the source text contains two different `include_bytes!` PATH strings. The
    Electron suite asserts `getIcon()` returns a path matching `icon-dark.png` vs `icon-light.png`.
  implication: The tests verify that the two branches are DISTINGUISHED, and they all pass —
    but nothing anywhere asserts that the two images are DIFFERENT. A test comparing the two
    files' bytes would have caught this at any point in the last month. This is the exact
    "tests prove wiring, not the pixels on screen" gap 34.1-HUMAN-UAT.md warns about in its
    closing section.

## Resolution

root_cause: |
  `public/icon-dark.png` and `public/icon-light.png` are byte-identical (MD5
  e754404b2dfd8cb4181a20555175bb47), as are their @2x and @3x variants. The
  `changeTrayColor` -> 500ms settle timer -> `GlobalConfig.darkTrayIcon` read ->
  `requestRustInvoke('tray_set_icon', [{dark}])` -> `tray.set_icon(tray_image(dark))` chain is
  correct end to end and almost certainly succeeds; it simply installs a pixel-identical image,
  so the swap is invisible. Introduced by commit 34fc2f5f (2026-06-27 rebrand) and repeated by
  0d81f046; both overwrote the dark and light slots with the same artwork. This predates Phase
  34.1 and affects the Electron build identically — it is a data defect, not a port regression.

fix: NOT APPLIED (diagnosis-only task). Would require restoring a genuinely distinct dark tray
  variant at all three scales; no code change is needed.

verification: NOT PERFORMED (diagnosis-only task).

files_changed: []
