---
created: 2026-07-25T14:20:00.000Z
title: "Tray dark/light icons are byte-identical (Windows/Linux) — icon swap is a visual no-op there"
area: branding
needs: artwork
status: "RESOLVED 2026-08-22 on ALL platforms. macOS closed 2026-08-14 via the AppKit template; Windows/Linux closed 2026-08-22 by generating a real dark/light pair. The remaining work is a live OBSERVATION on Windows/Linux hardware, which is not a todo — it is Phase 38 item 38-W02."
resolves_phase: "34.1"
files:
  - public/icon-tray-source.png
  - public/icon-tray-dark.png
  - public/icon-tray-light.png
  - meta/trayIconVariants.ts
  - src-tauri/src/main.rs:70,74
  - src/backend/tray_icon/tray_icon.ts:15-16,91
  - src/backend/sidecar/__tests__/appShellFlows.test.ts:697,708
  - src/backend/__tests__/tauriShellSource.test.ts:103-104
---

## Problem

Toggling the dark-tray-icon setting does nothing visible. Found during Phase 34.1 live UAT
on 2026-07-25 (test 6, sub-item 4).

**Root cause is a data defect, not a code defect.** `public/icon-dark.png` and
`public/icon-light.png` are byte-identical:

```
MD5 (public/icon-dark.png)  = e754404b2dfd8cb4181a20555175bb47
MD5 (public/icon-light.png) = e754404b2dfd8cb4181a20555175bb47
cmp → IDENTICAL BYTES
```

The `@2x` pair is likewise identical (`5b97b5bd…`), as is the `@3x` pair (`9557f196…`).

The whole swap chain works correctly — frontend → sidecar `changeTrayColor` →
`requestRustInvoke('tray_set_icon')` → `tray.set_icon()`. It succeeds and installs a
pixel-identical image. That is exactly "does nothing".

## Origin — predates Phase 34.1 by ~1 month

| rev | dark | light | |
|---|---|---|---|
| `ba0a2a06` (upstream Heroic 2.5.0) | `328ebd15` | `8289b074` | distinct |
| `34fc2f5f` "rebrand app identity from Heroic to GameLib" (2026-06-27) | `273e9039` | `273e9039` | **flattened** |
| `0d81f046` "gamer-cat artwork" | `e754404b` | `e754404b` | flattened again |

The rebrand overwrote both tray slots with one image. Upstream Heroic genuinely had two.

## Not Tauri-specific

`src/backend/tray_icon/tray_icon.ts:15-16,91` — the **Electron** path selects between the
same two identical files, so Electron has the identical no-op. Phase 34.1's "Electron
parity" UAT item passed only because nobody toggled this setting there. Parity is intact;
the shared data is wrong. Fixing the assets fixes both builds at once.

## Why every test missed it

All three relevant tests assert on the **selector**, never the **payload**:

- `appShellFlows.test.ts:697,708` — asserts `requestRustInvoke` called with `[{dark:true}]`
  vs `[{dark:false}]`. The *flag* differs.
- `tauriShellSource.test.ts:103-104` — asserts the Rust source contains two different
  `include_bytes!` *path strings*.
- `tray_icon.test.ts:277,282` — asserts `getIcon()` returns two different *paths*.

Each proves the two branches are *distinguished*. Nothing asserts the two images are
*different*. A one-line byte comparison would have caught this a month ago. This is the
generalizable lesson: when a feature's whole observable effect is "these two assets differ",
a test on the selector proves nothing.

## Fix

1. Regenerate `icon-dark.png`, `icon-dark@2x.png`, `icon-dark@3x.png` as a genuinely distinct
   dark/inverted treatment of the gamer-cat artwork. **Needs a design pass — do not
   auto-invert branded artwork.**
2. Re-sync into `build/` (and note the copies under `dist/mac-arm64/GameLib.app/…`).
3. Add a regression test asserting the dark and light tray assets are NOT byte-identical,
   covering the `@2x`/`@3x` pairs too.
4. On macOS, consider a template image for correct menu-bar rendering. Note
   `src-tauri/src/main.rs` uses `include_bytes!`, which is compile-time — the asset must be
   correct at build time, so a stale `build/` copy will not be caught at runtime.

## Residual uncertainty

Because the two images are identical, a *successful* `set_icon` and a *silently failing* one
are indistinguishable from the observed symptom. The rustInvoke leg was verified statically
but never observed round-tripping live. `main.rs:718-722` forwards sidecar stderr to the
**shell's** stderr (the `tauri:dev` terminal), not to `~/Library/Logs/GameLib/gamelib.log`,
so the absence of errors in that log proves nothing.

**After fixing the assets, re-run Phase 34.1 UAT test 6 sub-item 4.** If it still does
nothing, the remaining candidates are the rustInvoke leg or `tray_by_id` returning `None` —
both of which print to the `tauri:dev` terminal.

Positive evidence the chain does run: `~/Library/Logs/GameLib/gamelib.log.old:43` shows
`Changing Tray icon Color...` logged from a Tauri **sidecar** run, so the frontend leg and
the `send` transport leg are proven live.

## Reference

Full diagnosis: `.planning/debug/tray-icon-swap-noop.md`
Discovered in: `.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-HUMAN-UAT.md` (test 6)

## Resolution — macOS half CLOSED, Windows/Linux half OPEN (2026-08-14, plan 34.1-15)

**macOS is fixed, but not by making the two assets differ.** Plan 34.1-13 (2026-08-13) tried the
originally-proposed fix first — regenerate `icon-light*.png` as an RGB inversion of
`icon-dark*.png` — and it was **rejected at a human checkpoint**: the artwork is a full-colour
magenta gamer-cat over a starburst, so inverting RGB produced a full-colour *green* cat, equally
illegible at 22px. The mean-luminance-delta gate that had passed (65.8/70.9/75.4 at the three
scales) was non-vacuous and correctly computed, and still guarded nothing, because brightness is
not the property menu-bar legibility depends on. Superseded with the fix this todo's own "Fix"
section (item 4) named as worth considering: `public/icon-tray-template.png`, a monochrome AppKit
template image (solid black RGB, glyph carried entirely in alpha) hue-segmented from
`icon-dark.png`, applied via `TrayIcon::set_icon_with_as_template` (`src-tauri/src/main.rs`,
`cfg(target_os = "macos")`-gated). AppKit auto-tints the template per the EFFECTIVE menu-bar
appearance, so **`darkTrayIcon` is now vestigial on macOS by design** — the setting still
round-trips through the sidecar unchanged, it simply has no visible effect there anymore, and
that "nothing visibly changes" result is the CORRECT one, not the original defect recurring.

**Live-confirmed 2026-08-14** (plan 34.1-14, operator, real hardware): glyph legible as a
monochrome cat silhouette at menu-bar size (D4, "can see the silhoutte"); glyph auto-tints to
match the effective menu-bar appearance, confirmed indistinguishable in tinting behaviour from
the system's own template icons — "like all the others" (D5), the discriminating evidence that
`set_icon_with_as_template` is honoured at runtime; toggling the setting produces no visible
change, the expected vestigial-by-design result (D5b, "Nothing visibly changes"). New MD5s:
`public/icon-tray-template.png` = `443da45470166e50d80fcbecadca14a8` (new, distinct from both
dark/light). Residual, stated rather than glossed: the DARK/opaque-menu-bar rendering was never
directly observed on this hardware, only the light/translucent-effectively-dark rendering — see
`34.1-VERIFICATION.md`'s `human_verification` entry for the direct-observation follow-up
(System Settings > Accessibility > Display > Reduce Transparency forces it).

**Windows/Linux — UNCHANGED, still genuinely open.** `public/icon-dark.png`/`icon-light.png`
(+ `@2x`/`@3x`) remain byte-identical at all three scales — plan 34.1-13's redirect explicitly
did not touch this path; those platforms still select between the two (still-identical) colour
files via the original `tray_icon.ts` mechanism, unchanged. **This todo stays OPEN and PENDING
for that reason** — do not close it on the strength of the macOS fix. Needed: a genuinely
distinct dark treatment of the gamer-cat artwork for `icon-dark*.png` (a design pass — do not
auto-invert branded artwork, per the RGB-inversion rejection above), then re-sync into `build/`.
The live swap behaviour there is adjudicated separately by `34.1-HUMAN-UAT.md` UAT item 6d
(Windows/Linux half), which this asset work alone will not close without also confirming on real
Windows/Linux hardware.


## RESOLVED 2026-08-22 (Windows/Linux half — the last one)

`meta/trayIconVariants.ts` now emits `icon-tray-{dark,light}{,@2x,@3x}.png` from the SAME
hue-segmented mask that already produced the macOS template, differing only in fill (black for a
light taskbar, white for a dark one). The hard part — separating the cat glyph from its orange
starburst — was already solved by the 2026-08-14 macOS work and was simply reused at a second
fill colour.

Measured before writing anything, rather than assumed: the segmentation holds at all three
scales with the EXISTING `HUE_SPLIT_DEGREES` (opaque fraction 32.6% / 31.8% / 31.6%), so the
constant did not need re-deriving from a fresh histogram.

Two structural changes made the fix safe rather than just present:

1. **`icon-dark.png` was renamed to `icon-tray-source.png`** (commit `e485b0acb`, pure R100
   rename). It had been serving as BOTH the generator's full-colour input and the Windows/Linux
   "dark" variant. Emitting a dark variant would have overwritten the generator's own source, and
   the next run would have had no colour left to segment.
2. **The generator refuses to write an identical pair at any scale**, and `trayIconAssets.test.ts`
   asserts the same on the committed assets, with the three former `it.failing` tripwires flipped
   to plain `it`. Both are RED-proven against known-bad input (copying dark over light fails 2 of
   10 tests; forcing both fills equal makes the generator exit non-zero) — a distinctness gate
   that cannot fail on an identical pair would guard nothing.

Also deleted `icon-light*.png`, unreferenced once the consumers moved, and updated
`electron-builder.yml`'s `asarUnpack` list — `nativeImage.createFromPath` reads from disk, so a
missing entry there breaks the tray icon in PACKAGED builds only.

**What is NOT done, and is deliberately not tracked here:** nobody has SEEN the swap. That needs
a Windows or Linux tray to render into, and macOS cannot substitute — `tray_image` returns the
AppKit template regardless of the `dark` argument, so the toggle is correctly invisible there.
That observation is Phase 38 item **38-W02**.
