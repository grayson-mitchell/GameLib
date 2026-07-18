# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes follow these unless the
question requires otherwise.

## Stack

- **Executable experiments (depot/download line, 001–003):** standalone Node **ESM `.mjs`**
  scripts, run with `node`, no build step, no bundler. Reuse the project's existing deps
  (`steam-user`, `@node-steam/vdf`) rather than adding new ones — the project's no-native-modules
  constraint holds (pure-JS LZMA proven acceptable in 002).
- **Feasibility / reconnaissance spikes (bridge line, 004):** no code build. Deliverable is a
  grounded README backed by (a) a **web survey** of prior art and (b) **local binary inspection**
  of the real install — `file`, `nm -gU`, plist/config reads — captured inline as evidence.
  Appropriate when the question is a fact ("does this native surface exist / can this cross the
  boundary"), not a feeling.
- **Native handshake spikes (bridge line, 005):** single-file `clang -arch arm64` helper that
  **`dlopen`s the on-disk Steam dylib and `dlsym`s only the symbols found via `nm -gU`** — no SDK
  headers, no link-time Valve dependency. Emit an ISO-timestamped forensic event log (stderr +
  `run.log`) plus a final JSON verdict on stdout; exit code encodes pass/fail. `.gitignore` the
  compiled binary + transient `steam_appid.txt`; commit source + scripts + README + `run.log`.
  Requires the live signed-in Steam client (user launches it).

## Structure

- One directory per spike: `.planning/spikes/NNN-descriptive-name/`. Sub-probes of a single
  feasibility question may share a number with a letter suffix (`004a/004b/004c`) — reserved here
  for *facets of one question*, distinct from the "comparison variant" meaning of the suffix.
- Every spike has a `README.md` with YAML frontmatter (`spike`, `name`, `type`, `validates`,
  `verdict`, `related`, `tags`), an **Investigation Trail**, and a **Results** section with the
  verdict and evidence.
- `MANIFEST.md` groups spikes by **idea line** (Idea A = native install; Idea B = macOS Steam
  bridge). Requirements that emerge live under their idea line.

## Patterns

- **Depth over speed / no single-happy-path VALIDATED.** Follow surprises (001's vdf 64-bit
  corruption; 002's steam-user filename truncation; 004b's "the working path avoids the hard
  part").
- **Ground verdicts in observed evidence** — real installs, real binaries, real byte-comparison —
  not just docs or reasoning.
- **Carry findings forward as MANIFEST Requirements** the moment a design decision is proven, so
  the real build inherits them.

## Tools & Libraries

- `steam-user` (CM auth, PICS, raw manifests, depot keys) — but reimplement its `getManifest()`
  filename handling and chunk download by hand (broken; see 002).
- `@node-steam/vdf` — corrupts 64-bit GIDs; treat 64-bit IDs as strings end-to-end (001).
- macOS inspection: `file`, `nm -gU`, `find`, plist reads. CrossOver runtime at
  `/Applications/CrossOver.app/...` ships **no** winelib build toolchain (winegcc/winebuild) — a
  from-scratch winelib build is out of scope for a feasibility spike (004a).
- **Windows PE cross-compilation (bridge line, 005b/005c):** `brew install` does **not** work in
  this environment (Homebrew only dry-runs — "Would install"). Use **`zig cc -target
  x86-windows-gnu`** instead — zig is a self-contained tarball (bundles a mingw-w64 sysroot), no
  brew/root. Download via `ziglang.org/download/index.json` → the `aarch64-macos` tarball; scripts
  take `ZIG=/path/to/zig`. Produces `PE32 … Intel 80386`. Force exact DLL export names with a
  `.def` file (Steamworks S_API is `__cdecl` on i386).
- **Running a PE in a GameLib bottle:** `CX_BOTTLE=<bottle> /Applications/CrossOver.app/Contents/
  SharedSupport/CrossOver/bin/wine "C:\prog.exe"`. Wine on macOS **shares the host network
  namespace**, so `127.0.0.1` in the bottle is the host loopback. The real bottle is
  `GameLibSteam` (Phase 17); its `drive_c` is at `~/Library/Application Support/CrossOver/Bottles/
  GameLibSteam/drive_c`. Have PEs also write results to `C:\*.txt` (recoverable host-side) in case
  the bottle detaches stdout.
