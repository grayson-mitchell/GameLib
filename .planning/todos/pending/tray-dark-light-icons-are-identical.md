---
created: 2026-07-25T14:20:00.000Z
title: "Tray dark/light icons are byte-identical — icon swap is a visual no-op"
area: branding
needs: artwork
files:
  - public/icon-dark.png
  - public/icon-dark@2x.png
  - public/icon-dark@3x.png
  - public/icon-light.png
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
