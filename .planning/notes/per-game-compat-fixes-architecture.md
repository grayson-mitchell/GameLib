---
title: Per-game compatibility fixes — architecture (extend known-fixes)
date: 2026-10-23
context: /gsd-explore session after spikes 030–033 (Hoard) — how to carry per-game fixes as data rather than bespoke code in the app
related_spikes: [030, 031, 032, 033, 034]
---

# Per-game compatibility fixes — architecture

## Problem

Debugging Hoard (spikes 030–033) produced working fixes in five different places: the prefix
registry, the launch environment, files beside the exe, inside the game process (the shim), and the
UI. Building each one into the app per game would turn GameLib into a pile of bespoke cases. We want
**data per game, plus a small set of generic building blocks**, so debugging a new broken game is
"write a JSON file and relaunch", not "change the app".

## Decisions

1. **Extend Heroic's existing known-fixes format.** Do not start a separate format.
   - Same files: `fixes/<appName>-<store>.json`, read by `readKnownFixes()` in
     `src/backend/knownFixes.ts`.
   - Same type: `KnowFixesInfo` gains new **optional** keys, so existing files stay valid.
   - Same launch hook: `prepareWineLaunch()` → `installFixes()` (winetricks, `runInPrefix`) plus
     `getKnownFixesEnvVariables()`.
2. **The prefix is where some fixes are applied, never where they are stored.** A bottle is opaque
   binary state: not diffable, reviewable or shareable, lost on rebuild, and mixed with the game's
   own state. Many fixes can't live there anyway (see the table below). The manifest is the source
   of truth, and GameLib *applies* it to the prefix, the launch and the shim.
3. **Building-block vocabulary.** Existing keys: `envVariables`, `winetricks`, `runInPrefix`,
   `notes`, `wikiLink`. New keys:

   | key | acts on | evidence |
   |---|---|---|
   | `registry` | prefix registry, scoped to `AppDefaults\<exe>` where possible | 031 |
   | `dllOverrides` | shorthand for `AppDefaults\<exe>\DllOverrides`. **CrossOver's `wine` wrapper drops `WINEDLLOVERRIDES`**, so env-var overrides silently do nothing | 031 |
   | `overlays` | sha-pinned components placed beside the exe (e.g. Mesa 26.2.4 x86 `opengl32.dll` + `libgallium_wgl.dll`); add-only, recorded, removable | 031 |
   | `shimFeatures` | generic, data-parameterised capabilities in the steam_api shim, passed through the per-app `gamelib_bridge.cfg`, e.g. `"wgl.hideExtensions": ["WGL_ARB_create_context*"]` | 033 |
   | `launchNotice` | UI text, e.g. "first screen freezes ~25s while loading (x87 code under Rosetta)" | 033 |
   | `platforms` | scoping per OS, runtime version range (`crossover>=26.3`), and an exe sha guard | 030 |
   | `evidence` | link to the spike or debug artifact that justifies the profile | — |

   **The only code is the shim feature catalogue**, and every entry is generic from day one: any
   game, any parameters. Never "the Hoard fix".
4. **Never modify game files.** No exe patches; 030's byte patch was a proof only. Overlays only
   *add* files and are removed when the profile is turned off.
5. **Apply idempotently and reversibly.** Each building block records what it changed in an
   applied-fix ledger kept with the prefix, so turning a profile off or changing it restores the
   previous state.
6. **Layers and trust: curated only, plus local overrides, for now.**
   - **Bundled:** curated profiles in-repo, reviewed, each linking to its evidence.
   - **Local override:** `GameLib/fixes/local/<appName>-<store>.json`. It wins over the others and
     is used for debugging.
   - **Remote (Heroic's known-fixes feed, still downloaded for Epic/GOG/Amazon by
     `downloadFixesFor()`):** stays limited to the fields it uses today. **The new keys
     (`registry`, `dllOverrides`, `overlays`, `shimFeatures`) are honoured only from bundled or
     local sources and ignored from remote ones.** Nothing fetched can drop DLLs or change what
     code runs.
   - A community or remote feed for the new keys is deferred. It would need signed, sha-pinned
     components from a source we control.
7. **Diagnostic launch mode** is the debugging companion to local overrides. It turns on what
   spikes 030–033 built by hand:
   - `CX_DEBUGMSG`/`CX_LOG` channels (CrossOver ignores `WINEDEBUG`)
   - the shim's frame-gap meter and freeze-only sampling profiler
   - crash capture

   Output is one report per launch. When a profile works, promote it from local to bundled in a PR
   with the evidence attached.

## Where each Hoard finding lands

| Finding | Building block |
|---|---|
| GL 3.3-compat request; hide `WGL_ARB_create_context` | `shimFeatures.wgl.hideExtensions` (033, proven on the unmodified exe) |
| Alternative: Mesa softpipe gives a real 3.3 compat context | `overlays` (Mesa x86) + `dllOverrides {opengl32: native}` + `envVariables {GALLIUM_DRIVER: softpipe}` (031) |
| ~24s splash freeze is x87 code under Rosetta | `launchNotice`. Not fixable by any building block (033) |
| `DisabledExtensions` registry, `CX_FWD_COMPAT_GL_CTX` | Proven useless for this case; listed so they aren't retried (030) |

## Facts established in the session

- **The Steam bridge launch path does not use known-fixes today.** `steam/games.ts` calls
  `runWineCommand` directly. It skips `prepareWineLaunch()` (so no `installFixes`) and never merges
  `getKnownFixesEnvVariables()`, unlike `gog/`, `legendary/` and `nile/games.ts`. Wiring this up is
  the first step and needs no format change (todo).
- Heroic's feed: https://github.com/Heroic-Games-Launcher/known-fixes (raw path
  `main/<store>/<appName>-<store>.json`).

## Open

- How overlays are distributed: download on demand from pinned upstream URLs with a sha check
  (preferred, keeps the app small), or a GameLib-hosted mirror.
- Ledger format and location (inside the bottle vs GameLib's own config dir).
- Whether `shimFeatures` belong in `gamelib_bridge.cfg`'s existing `key=value` grammar or in a
  separate section.
- How the diagnostic mode reaches the user: a per-game settings toggle vs a launch-menu item.

## Next

Spike 034 (registered in `.planning/spikes/MANIFEST.md`) prototypes the schema end-to-end with
Hoard, using two alternative profiles from one local override file.
