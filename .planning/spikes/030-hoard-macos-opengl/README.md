---
spike: 030
name: hoard-macos-opengl
type: standard
validates: "Given Hoard (63000, CrossOver rating 2) crashes on launch in its GameLib bridge bottle but is ProtonDB platinum, when we identify what Proton has that the Mac lacks and steer the game around it, then Hoard runs on macOS"
verdict: PARTIAL
related: [008, 007]
tags: [steam, macos, crossover, opengl, wgl, compatibility-profile, glew, hoard, game-fix]
---

# Spike 030: Why Hoard runs on Proton but not on the Mac

## What This Validates

**Given** Hoard (Steam 63000) has CrossOver rating 2 ("won't run") and crashes when launched in its
`GameLibSteamBridge-63000` bottle, yet ProtonDB rates it platinum, **when** we find what the Proton
environment provides that macOS doesn't and route the game around it, **then** Hoard should run on
the Mac.

## Research

- **ProtonDB:** platinum (2 reports, `confidence: inadequate`).
- **umu-protonfixes:** no `gamefixes-steam/63000.py`. **Proton `default_compat_config`:** no entry
  for 63000 in `proton_9.0` or `proton_10.0`.
- **Conclusion:** the Proton prefix holds **no custom config** for Hoard. It runs out of the box on
  Linux, so the difference is in the platform, not the prefix.
- **Engine:** `Reuben.exe` is PE32 i386, Big Sandwich's "Ladybug" engine, **OpenGL** with GLSL, and
  GLEW for extension loading. Its minimum spec is OpenGL 2.0.

## Investigation Trail

1. **Baseline** (`./run.sh baseline`): `Unhandled page fault on read access to 00000000 at address
   004454B3` right after start. Note that `pgrep` still sees the process because winedbg holds it.
   **This means spike 008's "Reuben alive at t=10s → ran" was very likely the same crash**, so
   alive-by-pgrep is not evidence of running.
2. **`WINEDEBUG` is ignored by CrossOver's `wine`.** Use `CX_DEBUGMSG=+wgl,+seh` and
   `CX_LOG=<file>` instead.
3. **wgl trace** (`trace-dll2`): the game makes a dummy legacy context, runs GLEW's `wglewInit`, and
   finds `WGL_ARB_create_context` in the WGL extension string. It then calls
   `wglCreateContextAttribsARB` with **3.3, `PROFILE_MASK=COMPATIBILITY` (0x9126=2), `FLAGS=DEBUG`**.
   winemac refuses with `OS X only supports forward-compatible 3.2+ contexts`. The game never checks
   the NULL context and faults on the first `SwapBuffers`.
4. **Why Linux works:** Mesa and NVIDIA provide a 3.3 compatibility profile. macOS has only two
   kinds of context: **legacy 2.1** (all fixed-function features) and **core 3.2–4.1**
   (forward-compatible, deprecated features removed). There is no compat context above 2.1, so the
   request cannot be satisfied.
5. **Disassembly** of the context branch at `0x435740`: `call 0x4c1760` (GLEW's
   `WGLEW_ARB_create_context` flag). If the flag is set, the game builds the 3.3-compat attribs;
   if not, it logs `"creating a default OpenGL context (WGL_ARB_create_context unsupported)"` and
   calls plain `wglCreateContext`. So the engine has a working legacy path.
6. **Try: `HKCU\Software\Wine\OpenGL\DisabledExtensions`** = the `WGL_ARB_create_context*` names →
   **no effect.** CrossOver's opengl32 filters only GL extensions, not the WGL extension string GLEW
   reads. The key was removed afterwards, so the bottle is back to its original state.
7. **Try: `CX_FWD_COMPAT_GL_CTX=1`** (an undocumented CodeWeavers switch found in `winemac.so`
   strings). It skips the forward-compat check, then hits the next one:
   `Compatibility profiles for GL version >= 3.2 not supported` → still crashes. **Dead end. That
   limit is Apple's, not wine's.**
8. **Proof: flip one byte**, `je`→`jmp` at VA `0x43575e` (file offset `0x34b5e`, `74 76`→`eb 76`),
   to force the legacy branch (`./patch-test.sh`, which always restores; sha verified identical
   after). Results: **0 page faults**, alive 25 s, a GL **2.1 Metal** context on M5 Ultra, and the
   engine logs its renderer and degrades on its own (`Not using Frame buffer/SSAO/deferredlighting:
   hardware does not`).

## Results

**Verdict: PARTIAL ⚠**

- ✓ **Root cause identified and proven:** Hoard asks for a GL 3.3 *compatibility* context, which
  macOS cannot provide. It doesn't check the failure and crashes. Proton has no special config; it
  works only because Linux drivers support compat profiles.
- ✓ **Hoard runs on the Mac on its own legacy GL 2.1 path** once `WGL_ARB_create_context` is hidden
  from it. Evidence: no crash, real context, engine output (`evidence.txt`).
- ✗ **No config-only fix exists.** Neither the wine registry nor the CrossOver env switch works.
  The fix must hide `WGL_ARB_create_context` from the game.
- ⏳ **Not yet verified by eye:** this session couldn't capture screenshots ("could not create image
  from window"). Gameplay and rendering quality need a human run of `./play.sh`.
- ⏳ **Not built: a no-file-modification fix.** The patch above modifies the game exe, so Steam
  verify would revert it. It is a proof, not a shipping approach. Recommended route: GameLib already
  places its own `steam_api.dll` shim (loaded before the exe's entry point). Add an opt-in per-app
  "GL fix" that, in the shim's `DllMain`, wraps Reuben.exe's IAT entry for `wglGetProcAddress`. When
  asked for `wglGetExtensionsStringARB`/`EXT`, the wrapper returns a version that strips
  `WGL_ARB_create_context*`. This leaves files on disk untouched, applies to any GLEW-era game with
  a legacy fallback, and gets keyed per appid. It was blocked here only because zig/mingw-w64 are not
  installed (brew links dangling).

**Signal for the build:**
- A CrossOver rating ≤2 is not the last word. "Crashes on launch, platinum on ProtonDB" is a
  fingerprint for **compat-profile GL games** worth an automated probe: look for the
  `Compatibility profiles…`/`forward-compatible 3.2+` warnings in a `CX_DEBUGMSG=+wgl` log.
- Launch-health checks must not rely on `pgrep` alone; winedbg keeps a crashed process "alive".

## How to Run

```bash
./run.sh <label> [ENV=VAL…]   # unpatched launch, 15s watch, logs -> logs/
./patch-test.sh <label>       # patched launch (auto-restores Reuben.exe)
./play.sh                     # interactive: patch, play, quit -> restore.  ./play.sh --unpatched for control
```

Requires CrossOver and the `GameLibSteamBridge-63000` bottle with Hoard installed. Do not use
`cxstart` (007 landmine).
