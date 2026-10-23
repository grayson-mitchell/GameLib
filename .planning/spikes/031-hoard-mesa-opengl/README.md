---
spike: 031
name: hoard-mesa-opengl
type: standard
validates: "Given unpatched Hoard needs a GL 3.3 compatibility context macOS cannot provide (030), when Mesa's Windows opengl32.dll is dropped beside the exe in the bottle, then the game gets a 3.3 compat context and runs — first via llvmpipe (CPU), then via zink (Vulkan→MoltenVK→Metal)"
verdict: PARTIAL
related: [030, 008, 032]
tags: [steam, macos, crossover, opengl, mesa, softpipe, llvmpipe, zink, moltenvk, compatibility-profile, hoard, game-fix]
---

# Spike 031: Replace Apple's OpenGL with Mesa for Hoard

## What This Validates

Spike 030 showed that Hoard asks for an **OpenGL 3.3 compatibility** context, which Apple's OpenGL
cannot provide (it offers legacy 2.1 or core 4.1 only). **Given** that, **when** Mesa's Windows
`opengl32.dll` replaces wine's built-in one for this game only, **then** the **unpatched** exe should
get its 3.3 compat context and run. The plan was llvmpipe first (software rendering), then zink (GPU).

## Research

- **Mesa build:** pal1000/mesa-dist-win **26.2.4** `release-mingw` (2026-10-04). The x86 directory
  has `opengl32.dll` (a small loader) plus `libgallium_wgl.dll` (all gallium drivers). The driver is
  selected with `GALLIUM_DRIVER=llvmpipe|softpipe|zink`. Download sha256 is in `evidence.txt`.
- **Install shape:** copy both DLLs next to `Reuben.exe` and force them native. Nothing is
  installed system-wide, and the game's own files are untouched.

| Driver | Path | Compat profile | Expected |
|---|---|---|---|
| llvmpipe | CPU, LLVM JIT | 4.5 | Should work, moderate speed |
| softpipe | CPU, interpreted (no JIT) | 3.3 | Works, slowest |
| zink | Vulkan → winevulkan → MoltenVK → Metal | 4.6 in principle | Fast, risky |

## Investigation Trail

1. **`WINEDLLOVERRIDES` is ignored.** CrossOver's `bin/wine` wrapper drops it (`<undefined>` in
   the env dump), so wine loaded its builtin opengl32 and hit the same `0x004454B3` crash as 030.
   **Fix:** a per-app registry override,
   `HKCU\Software\Wine\AppDefaults\Reuben.exe\DllOverrides`, `opengl32=native`. It is scoped to this
   exe only, and `run.sh` adds and removes it.
2. **llvmpipe ✗.** The game shows `wglChoosePixelFormatARB failed. (Hardware 3D acceleration likely
   not working.)`. In one run it was `ChoosePixelFormat failed` instead. Mesa logs nothing
   explaining it. `LP_NATIVE_VECTOR_WIDTH=128` and `LP_NUM_THREADS=0` don't help.
   - Since softpipe works through the same WGL code, the suspect is llvmpipe screen creation, i.e.
     LLVM code generation in a 32-bit process under wow64 + Rosetta 2.
   - **Unconfirmed.** Next probe: Mesa's `x64` llvmpipe against a 64-bit GL test app, to split
     "32-bit" from "Rosetta".
3. **softpipe ✓.** **0 faults.** The game logs
   `GL_VERSION 3.3 (Compatibility Profile) Mesa 26.2.4`, GLSL 3.30, and takes its **full** render
   path: `Using Frame buffer/SSAO/deferredlighting: hardware does`. On Apple's 2.1 in 030 it was
   `hardware does not`. This is the exact context Apple cannot provide, running on the unpatched exe.
4. **zink ✗.** Mesa loads wine's `vulkan-1.dll` → `winevulkan.dll`, creates an instance (API
   1.4.290-class version `0x402122`), and enumerates MoltenVK's device. Then it **calls a null
   function pointer** (`eip=00000000`) during init.
   - winevulkan also logs core-1.1 instance functions such as `vkEnumeratePhysicalDeviceGroups` as
     `not found`. The likely cause is an unchecked Vulkan entry point missing in the 32-bit
     wine-Vulkan → MoltenVK chain.
   - **Unconfirmed:** the caller of the null pointer was not identified.

## Results

**Verdict: PARTIAL ⚠**

- ✓ **The core question is answered: yes, we can give macOS an OpenGL 3.3 compatibility profile.**
  Swapping Apple's GL for Mesa inside the bottle gives the unpatched game exactly what it asks for,
  including its higher-quality render path. It touches no game files and needs only a per-exe
  registry override and two DLLs beside the exe. That makes it a cleaner shipping shape than 030's
  steering fix.
- ⚠ **Only softpipe works, and softpipe is the slowest Mesa renderer** (interpreted, on the CPU).
  Whether Hoard is *playable* on it is unmeasured: no FPS figure, and the session couldn't
  screenshot.
- ✗ **llvmpipe** (the fast CPU path) fails at pixel-format selection. **zink** (the GPU path) crashes
  on a null call during Vulkan init. Both are fixable in principle, but both are their own
  investigations.

**Signal for the build:**
- A "Mesa GL" per-game compatibility option is viable: two DLLs beside the exe plus a per-exe
  `AppDefaults\<exe>\DllOverrides` key. **Never rely on `WINEDLLOVERRIDES` under CrossOver's `wine`.**
- Use Mesa for games that *need* compat GL with no fallback. For games with a legacy fallback (like
  Hoard), 030's steering fix keeps Apple's GPU-backed 2.1, which is probably faster than softpipe.
- Zink on MoltenVK is the prize (GPU-speed compat GL). It is worth its own spike, starting with
  64-bit to rule out the 32-bit thunk path.

## How to Run

```bash
./run.sh <label> <llvmpipe|softpipe|zink|none> [ENV=VAL…]     # 25s watch, logs -> logs/
INTERACTIVE=1 ./run.sh play softpipe                           # play it; quit the game to clean up
```

`MESA=` points at an extracted `mesa-dist-win/x86` directory (it defaults to this session's
scratchpad). Cleanup always removes the DLLs and the registry key.
