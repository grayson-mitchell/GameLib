---
spike: 032
name: zink-moltenvk-64bit
type: standard
validates: "Given zink crashed for 32-bit Hoard (031), when Mesa's own WGL test runs as x64 and x86 under each Gallium driver in the bottle, then we learn whether zink-on-MoltenVK fails only on the 32-bit path or on macOS's Vulkan itself"
verdict: INVALIDATED
related: [031, 030]
tags: [macos, crossover, opengl, mesa, zink, moltenvk, vulkan, llvmpipe, robustness2, nullDescriptor, wow64]
---

# Spike 032: Zink on MoltenVK, 64-bit vs 32-bit

## What This Validates

In 031, Zink (Mesa's OpenGL on top of Vulkan) crashed with a null call when used by 32-bit Hoard,
and llvmpipe failed at pixel-format selection. **Given** that, **when** Mesa's own WGL test
(`test_wgl.exe`, `wgl.basic_create`) runs as **x64 and x86** under softpipe, llvmpipe and Zink in the
same bottle, **then** we can tell whether each failure is 32-bit-specific or comes from macOS's
Vulkan (MoltenVK).

## Research

- **Test app:** mesa-dist-win 26.2.4 `tests-mingw.7z` ships `test_wgl.exe` (a gtest of
  `src/gallium/targets/libgl-gdi/tests/wgl_tests.cpp`) for **both** x64 and x86. It's the same
  Mesa build as 031, so no compiler is needed.
- **Silent fallback:** a passing test doesn't say which renderer ran. The second check is whether
  `vulkan-1.dll` was loaded. Mesa's own log is silent in this release build: `MESA_LOG=*` and
  `MESA_LOG_LEVEL=debug` produced nothing.
- **Zink source:** `zink_screen.c` at tag `mesa-26.2.4`, read to map the failure point in the
  Vulkan call trace onto a concrete check.

## Investigation Trail

1. **Matrix** (`./run.sh <arch> <driver>`):

   | | softpipe | llvmpipe | zink |
   |---|---|---|---|
   | x64 | ✓ | ✓ | ✗ `wnd.valid()` false |
   | x86 | ✓ | ✗ `wnd.valid()` false | ✗ `wnd.valid()` false |

   `wnd.valid()` false means the test's window never got a usable pixel format, i.e. the Mesa
   screen for that driver failed to come up.
2. **llvmpipe: 32-bit only.** 64-bit llvmpipe passes under Rosetta, which rules out 031's
   Rosetta-JIT guess. The x86 llvmpipe cause is still unknown: Mesa logs nothing.
3. **Zink fails on x64 too**, so it isn't a 32-bit-thunk problem.
   - In the test it fails cleanly. In Hoard (031) the *game* called the WGL entry point Mesa left
     NULL, hence the `eip=0` crash there. Same root cause, different symptom.
4. **Vulkan trace (x64):** create instance → enumerate devices → properties, queue families,
   formats, memory, device extensions → `Features2` → `Properties2` → **`vkDestroyInstance`**.
   `vkCreateDevice` is never called. In `zink_internal_create_screen`, the only hard-fail checks
   between "read device info" and "create logical device" are:
   - `!rb2_feats.nullDescriptor` → `"Zink requires the nullDescriptor feature of KHR/EXT robustness2."`
   - missing timeline semaphores
   - driver-string and flush-queue setup (environmental, not device features)
5. **Extension list:** winevulkan sees 92 MoltenVK device extensions. `VK_EXT_robustness2` and
   `VK_KHR_timeline_semaphore` are **present**. `VK_EXT_custom_border_color` and
   `VK_EXT_line_rasterization` are absent, but those are only warnings in `check_base_requirements`.
   winevulkan also **hides `VK_KHR_portability_subset`** from Windows apps, so Zink can't see it is
   on a non-conformant device.
6. **Native feature probe** (`mvk_probe.c`): dlopens CrossOver's *own* `lib64/libMoltenVK.dylib`
   (x86_64, the one winevulkan uses) and declares the structs by hand.
   - Result: `Apple M5 Ultra`, API **1.2.290**, **`nullDescriptor: 0`**, `robustBufferAccess2: 0`,
     `robustImageAccess2: 1`, `timelineSemaphore: 1`, `logicOp: 0`, `customBorderColors: 0`.
   - `MVK_CONFIG_USE_METAL_ARGUMENT_BUFFERS` = 0, 1 or 2 doesn't change `nullDescriptor`.

## Results

**Verdict: INVALIDATED ✗.** Zink can't run on CrossOver's MoltenVK at any bitness.

- **Root cause (high confidence):** MoltenVK 1.2.290 advertises `VK_EXT_robustness2` but reports
  **`nullDescriptor = false`**, and Zink 26.2.4 hard-requires it. The trace stops exactly at that
  check, the native probe shows the feature off, and timeline semaphores, the only other device
  hard-fail, are on.
  - Caveat: the feature value was read natively, not through winevulkan. winevulkan passes
    features through, so this is very likely the same value Zink saw, but it wasn't directly
    observed on the wine side.
- **Not a wine/32-bit problem**, so a 64-bit game would hit the same wall.
- **Bonus: llvmpipe works in 64-bit.** For 64-bit games needing compat GL, llvmpipe is the usable
  CPU path, much faster than softpipe. For 32-bit games like Hoard it fails, and only softpipe works
  (031).

**Signal for the build:**
- GPU-speed compatibility OpenGL on macOS via Zink is **blocked on MoltenVK**, not on GameLib or
  wine. Possible unblockers, none verified:
  - a MoltenVK release that implements `nullDescriptor`
  - Mesa's own Vulkan-on-Metal driver (KosmicKrisp), reached through wine, if its feature set covers
    Zink's needs
  - a Zink patch that tolerates `nullDescriptor = false` (it binds dummy descriptors elsewhere)
- `test_wgl.exe` + `mvk_probe` make a cheap regression check to rerun whenever CrossOver bumps
  MoltenVK.

## How to Run

```bash
./run.sh <x64|x86> <softpipe|llvmpipe|zink> [ENV=VAL…]   # TAG=name to keep variants apart
clang -arch x86_64 -O1 -o mvk_probe mvk_probe.c && ./mvk_probe /Applications/CrossOver.app/Contents/SharedSupport/CrossOver/lib64/libMoltenVK.dylib
```

`SCR=` points at a directory holding the extracted `mesa-dl/x` (release) and `mesa-tests/x` (tests)
archives. It defaults to the spike session's scratchpad. Cleanup always removes `C:\spike032` and the
`AppDefaults\test_wgl.exe` key.
