---
spike: 004a
name: wine-mach-o-thunk
type: standard
validates: "Given a Wine/CrossOver PE process, when it loads and calls a native macOS .dylib exposing a C ABI function (the winelib/builtin-DLL thunk lsteamclient relies on), then the cross-boundary call returns correct data"
verdict: PARTIAL
related: [004b, 004c]
tags: [steam, macos, bridge, wine, crossover, winelib, thunk, lsteamclient, phase-22]
---

# Spike 004a: Wine PE → native Mach-O thunk (the lsteamclient mechanism)

> Part of the **004 macOS native Steam bridge feasibility** investigation. This is the
> make-or-break question the seed leads with. Answered largely by evidence surfaced in 004b
> plus a local toolchain check, rather than a full winelib build (see Investigation Trail for
> why that was the right call).

## What This Validates

**Given** a Wine/CrossOver PE process, **when** it loads and calls a native macOS `.dylib`
exposing a C ABI function — the in-process winelib/builtin-DLL thunk that Linux `lsteamclient`
relies on — **then** the cross-boundary call returns correct data.

## Research

On Linux, `lsteamclient` is a Wine builtin DLL (`.dll.so`): a native ELF that Wine loads in
place of the game's `steamclient.dll`, marshaling the Windows Steamworks ABI **in-process**
across the PE↔ELF boundary to native `steamclient.so`. Reproducing that on macOS means a
`.dll.so`/`.dll.dylib` builtin that thunks PE↔Mach-O.

Two hard prerequisites for that in-process thunk:
1. **macOS-aware Wine build tooling** (`winegcc`/`winebuild` targeting Mach-O builtins).
2. A clean PE→Mach-O ABI marshal, complicated on Apple Silicon by **Rosetta 2** (the bottle
   side runs x86 under Rosetta while the native dylib is arm64) and **protobuf packing**
   differences in Steam's interconnect (per kaon, 004b).

## How to Run

```bash
# Toolchain-availability probe (what this spike actually ran):
ls /Applications/CrossOver.app  # -> present, CrossOver 26.2.0
find /Applications/CrossOver.app -type f \( -name winegcc -o -name winebuild -o -name winedump \)
# -> (empty) : CrossOver ships the wine RUNTIME only, no winelib build toolchain
"/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine" --version  # -> 26.2.0 runtime
```

## Investigation Trail

1. Framed 004a as the killer question and *intended* to build a minimal winelib thunk: a
   native `.dylib` C function + a PE stub that calls it via a Wine builtin.
2. **Local toolchain check killed that plan cheaply:** CrossOver 26.2.0 bundles `wine`,
   `wineserver`, `wineloader` — but **no `winegcc`/`winebuild`/`winedump`/`winemaker`**. There
   is no way to compile a winelib builtin `.dll.so` with the installed stack; it would require
   standing up a full macOS-aware Wine source build (winebuild targeting Mach-O) — exactly the
   "macOS-aware Wine tools" kaon (004b) names as an unsolved blocker.
3. **004b then made the full thunk build unnecessary to answer the real question.** The working
   L4D2 bridge does **not** perform an in-process PE→Mach-O thunk at all — it marshals over
   **TCP to a separate native helper process**. So the bridge goal is reachable without ever
   solving 004a's literal in-process thunk.
4. Concluded: attempting a from-scratch winelib Mach-O build here would be a large yak-shave to
   re-confirm a blocker the community has already documented, for a mechanism the proven path
   avoids. Depth was better spent grounding 004c.

## Results

**Verdict: PARTIAL ⚠ — the literal premise is effectively INVALIDATED, but routed around.**

- **In-process winelib PE→Mach-O thunk (the true lsteamclient mechanism): UNPROVEN on macOS
  and blocked.** No installed toolchain can build it (confirmed locally); the community's own
  attempt (kaon) is stuck on macOS-aware Wine tools + Rosetta/protobuf interconnect. Treat this
  path as Valve/CodeWeavers-scale, matching the seed.
- **The bridge does not require it.** The proven approach (004b, L4D2) replaces the in-process
  thunk with an **out-of-process TCP marshal** between a PE32 `steam_api.dll` shim and a native
  Mach-O helper. The "cross the boundary" problem is solved by a socket, not a thunk.

**Signal for the build:** do **not** anchor a GameLib bridge on building a macOS `lsteamclient`.
Anchor on the out-of-process `steam_api` TCP bridge (see 004c for the native surface it targets).
Only revisit the in-process thunk if/when a macOS-aware Wine builtin toolchain and a solved
overlay/injection story appear.

Sources: see 004b (kaon, L4D2-launcher). Local: CrossOver 26.2.0 bundle contents.
