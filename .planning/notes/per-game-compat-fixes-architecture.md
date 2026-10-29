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
     `wikiLink`, plus `launchNotice` (UI text only), and `launchArgs`/`exeOverride` (quick
     261029-mbl; GameLib additions that Heroic ignores). Same launch hook as Heroic:
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
   | `launchNotice` | UI text, e.g. "first screen freezes ~25s while loading (x87 code under Rosetta)". **Tier 1** (decision 1); the tier-1 rows are `launchNotice`, `launchArgs` and `exeOverride`, the rest of this table is tier 2 | 033 |
   | `launchArgs` | `string[]` appended to the game's argv (protonfixes `append_argument`). Never parseable as a runner option (legendary/nile after `--`; gogdl drops `--` entries). **Tier 1**, implemented by quick 261029-mbl | — |
   | `exeOverride` | install-dir-relative exe launched instead of the default (protonfixes `replace_command`); realpath-contained to the install folder and must exist. **Tier 1**, implemented by quick 261029-mbl | — |
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
     `exeOverride` can only pick an existing file inside the install folder, so it stays within
     `runInPrefix`'s trust.
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

Update (debug/unclaimed-world-wmv-mf, 2026-10-26): Unclaimed World (284100) is a codec gap that no
current building block can close. CrossOver's bundled GStreamer has no WMV3/WMA9 decoder, so MF
`CreateObjectFromURL` fails with 0xC00D36BB for its main-menu `.wmv`. Tested on a bottle clone:
`winetricks wmv9vcm` (VfW only, no effect on MF) and `winetricks wmp11` (swaps in a native `mfplat`
without `MFCreateSourceResolver`, breaking MF) both fail, and a registry or env value cannot add a
codec. Recorded as a `does-not-run` knownBad entry. The route is tier 2: an `overlays` entry with
a second target kind. Today's overlays are Windows DLLs placed beside the exe; this payload is a
host-side macOS `.dylib` set (gst-libav plus LGPL-only ffmpeg: `avdec_wmv3`, `avdec_wmapro`) that
winegstreamer's unix side loads, so the overlay has to land in a GStreamer plugin directory, plus
the `GST_PLUGIN_PATH` that points at it. A binary payload stays tier 2 (bundled/local, never
remote). Unverified: whether CrossOver's GStreamer honours `GST_PLUGIN_PATH` and loads an
externally built 1.24.x plugin. A spike settles that before the key is designed. Detail in
`.planning/todos/pending/2026-10-25-unclaimed-world-mainmenu-wmv-fails-in-wine-media-foundation.md`.

## External formats (researched 2026-10-29)

Update (quick 261029-8ws, 2026-10-29): we looked at what other Wine launchers and tools publish as
per-game fix data. On macOS nobody else publishes structured, reusable per-game fix data;
umu-protonfixes is the one large open dataset.

| Format | What it is | Licence / reuse | Verdict |
| --- | --- | --- | --- |
| umu-protonfixes (Open-Wine-Components; used by Proton-GE, Lutris, Heroic on Linux) | One Python file per game keyed by Steam appId, in per-store dirs (gamefixes-steam, -gog, -egs, -amazon, -humble, -itchio, -ubisoft, -ea, -battlenet, -umu, -zoomplatform) | BSD-2-Clause | Offline seed source, not a runtime format. It is Python code targeting Proton on Linux, so it cannot be loaded as data and nothing in it is Mac-validated. |
| Lutris installers | YAML install scripts tied to Lutris's installer flow | Licence of the community installer database not found | Ideas only. |
| CrossTie (CodeWeavers) | CrossOver install recipes (application profile, pre-install dependencies, install, post-install) for installing apps, not launch-time game fixes | No reuse terms found | No. |
| Whisky (discontinued April 2025), Mythic (Swift launcher, engine on Apple GPTK plus a Whisky-derived Wine), Sikarugir (renamed Kegworks; hand-built per-game wrappers) | No shareable per-game fix database found | n/a | No. |

### protonfixes, measured

Measured from a master tarball on 2026-10-29: 314 files in gamefixes-steam and 490 across all
gamefixes-* dirs. Helper call tally across all 490 files, method `grep -ho 'util\.[a-z_]+'`:

| Helper | Calls | GameLib mapping |
| --- | --- | --- |
| protontricks | 413 | `winetricks` |
| winedll_override | 91 | `dllOverrides` (built, quick 261029-gow) |
| set_environment | 80 | `envVariables` |
| regedit_add | 54 | `registry` |
| replace_command | 49 | `exeOverride` (built, quick 261029-mbl) |
| append_argument | 39 | `launchArgs` (built, quick 261029-mbl) |
| protonprefix | 23 | — |
| set_cpu_topology_limit | 20 | expressible today as `envVariables` WINE_CPU_TOPOLOGY |
| disable_esync | 19 | does not apply on macOS |
| disable_fsync | 18 | does not apply on macOS |
| get_game_install_path | 17 | — |
| set_ini_options | 13 | proposed `configEdits` (set_xml_options also exists) |
| import_saves_folder | 10 | — |
| del_environment | 9 | — |
| disable_nvapi | 5 | does not apply on macOS |

### Lutris vocabulary

Runner `overrides` (DLL overrides n / b / n,b / b,n / disabled), `system.env`, tasks `set_regedit`,
`delete_registry_key`, `set_regedit_file`, `winetricks`, `winekill`, directives `write_config`
(INI), `write_json`, `merge`, `extract`, `execute`. docs/installers.rst documents no checksum
support for downloaded files.

### Proposed tier-2 (format) additions, in priority order

1. `dllOverrides`: built by quick 261029-gow (tier 2, registry-backed); second by protonfixes usage (91). Must be
   registry-backed (`AppDefaults\<exe>\DllOverrides`) because CrossOver's wine wrapper drops
   WINEDLLOVERRIDES (spike 031, decision 3).
2. `launchArgs` + `exeOverride` (append_argument 39 + replace_command 49 = 88): built by quick
   261029-mbl as **tier 1** (operator decision 2026-10-29).
3. `registryDelete`: Lutris has delete_registry_key; GameLib's `registry` only adds.
4. `configEdits` (INI/XML/JSON option edits). Conflicts with decision 4 ("never modify game
   files") unless scoped to config files and recorded in the decision-5 ledger. Operator decision.
5. `platforms` moves up in priority: imported Linux-origin fixes need scoping to the runtime
   (CrossOver / Wine / GPTK) they were validated on.

### Option: split tier 2 by risk

**Status: recorded, not decided.** Adopting it would revise quick 261025-thk's "tier 1 cannot set
registry values, drop DLLs or change the shim" (decisions 1 and 6). This section does not change
those decisions. The two halves:

- Remote-eligible with strict validation: settings-only keys, i.e. `dllOverrides` and `registry`
  scoped to `AppDefaults\<exe>` and `HKCU\Software\Wine`, argued as no riskier than tier 1's
  `runInPrefix` / `winetricks`.
- Bundled or signed-only: `overlays` (binary payloads) and `shimFeatures` (they change code
  running in the game process).

### Follow-ups

- `.planning/todos/pending/2026-10-29-known-fix-dlloverrides-key.md`
- `.planning/todos/completed/2026-10-29-known-fix-launchargs-exeoverride-keys.md`
- `.planning/todos/pending/2026-10-29-protonfixes-import-dev-tool.md`

### Sources

- https://github.com/Open-Wine-Components/umu-protonfixes
- https://raw.githubusercontent.com/lutris/lutris/master/docs/installers.rst
- https://codeweavers.helpjuice.com/en_US/crosstie-data-startpage
- https://github.com/Sikarugir-App/Sikarugir
- https://github.com/mythicapp
