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

1. **Two tiers, two files** (revised 2026-10-25, quick 261025-thk; this used to read "extend
   Heroic's format, do not start a separate format").
   - **Tier 1, simple fixes:** Heroic's known-fixes format, **unchanged**:
     `fixes/<appName>-<store>.json` with `envVariables`, `winetricks`, `runInPrefix`, `notes`,
     `wikiLink`, plus `launchNotice` (UI text only). Same launch hook as Heroic:
     `prepareWineLaunch()` → `installFixes()` plus `getKnownFixesEnvVariables()`. A file written
     for Heroic's feed stays valid here, and the reverse.
   - **Tier 2, complex profiles:** a **separate** file, `<appName>-<store>.profile.json`, carrying
     the new keys in decision 3 (`registry`, `dllOverrides`, `overlays`, `shimFeatures`,
     `steamSharedRedists`, `platforms`, `evidence`). Separate files make the trust boundary
     visible on disk instead of a per-key list inside one file.
   - **Both tiers apply to every store's games**, not just Steam. The macOS fixes these carry
     (CrossOver/Wine behaviour, overlays, registry) are about the runtime, not the storefront.
   - The two tiers resolve their layers independently (decision 6), so a game can take its
     simple fixes from remote and its complex profile from bundled at the same time.
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
   | `shimFeatures` | generic, data-parameterised capabilities in the steam_api shim, e.g. `"wgl.hideExtensions": ["WGL_ARB_create_context*"]`. **Implemented** (spike 034, quick 261026-ng9). Transport: `fix.<feature>=<value>` lines in the per-app `gamelib_bridge.cfg` written by `writeBridgeConfig`, read by `native/steam-bridge/shim/shim_features.c` at `DLL_PROCESS_ATTACH`. Tier 2 only (bundled/local), never remote | 033, 034 |
   | `launchNotice` | UI text, e.g. "first screen freezes ~25s while loading (x87 code under Rosetta)". **Tier 1** (decision 1); the rest of this table is tier 2 | 033 |
   | `platforms` | scoping per OS, runtime version range (`crossover>=26.3`), and an exe sha guard | 030 |
   | `evidence` | link to the spike or debug artifact that justifies the profile | — |

   **The only code is the shim feature catalogue**, and every entry is generic from day one: any
   game, any parameters. Never "the Hoard fix".
4. **Never modify game files.** No exe patches; 030's byte patch was a proof only. Overlays only
   *add* files and are removed when the profile is turned off.
5. **Apply idempotently and reversibly.** Each building block records what it changed in an
   applied-fix ledger kept with the prefix, so turning a profile off or changing it restores the
   previous state.
6. **Layers and trust, per tier** (revised 2026-10-25, quick 261025-thk). Each tier resolves
   local → bundled → remote on its own; the first layer with a file wins for that tier.
   - **Local override:** `GameLib/fixes/local/`. Wins, used for debugging. Uninstall never
     touches it.
   - **Bundled:** `public/fixes/`, shipped inside the signed app release, reviewed in a PR, each
     tier-2 profile linking to its evidence.
   - **Remote, tier 1 only:** GameLib's own known-fixes repo, covering **every store**, in Heroic's
     layout (`<store>/<appName>-<store>.json`). GameLib's repo is tried first; Heroic's feed is the
     fallback for the stores it covers (Epic/GOG/Amazon). A remote file is filtered through an
     **allow-list** of the tier-1 keys; anything else is dropped with a warning. (An allow-list,
     not a block-list: a new tier-2 key cannot reach the remote path by being forgotten.)
   - **Tier 2 is local and bundled only.** It is never fetched. A remote tier-2 feed is
     **deferred**; if it is ever built it needs signed, sha-pinned components from a source we
     control (e.g. an ed25519-signed manifest whose key is pinned in the app). Until then, shipping
     a profile means shipping a release.
   - **Tier 1 is not "safe", it is "trust the repo's mergers".** `runInPrefix` runs an executable
     from the install directory and winetricks verbs download and run installers. That is the same
     trust Heroic users already extend to Heroic's feed, and it is acceptable for a repo GameLib
     controls. What tier 1 cannot do is set registry values, drop DLLs or change the shim.
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
| GL 3.3-compat request; hide `WGL_ARB_create_context` | `shimFeatures.wgl.hideExtensions`: implemented, bundled (`public/fixes/63000-steam.profile.json`; spike 034, quick 261026-ng9) |
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
- ~~Whether `shimFeatures` belong in `gamelib_bridge.cfg`'s existing `key=value` grammar or in a
  separate section.~~ Decided (quick 261026-ng9): the existing grammar, with a `fix.` key prefix.
- How the diagnostic mode reaches the user: a per-game settings toggle vs a launch-menu item.

## Next

Spike 034 (registered in `.planning/spikes/MANIFEST.md`) prototypes the schema end-to-end with
Hoard, using two alternative profiles from one local override file.

Update (quick 261026-ng9): spike 034 ran option (a) only (data-only `shimFeatures`) and is
productionised. Option (b) (`overlays`, `dllOverrides`, ledger) remains open, as does the
packaged-build retest of Hoard with the bundled profile, which must pass before Hoard's
does-not-run entry in `bridge-allowlist.json` is lifted.
