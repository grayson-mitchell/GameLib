---
created: 2026-10-23
title: "Bridge-backed steamclient(64).dll that forwards ISteamClient to the native Mac client, so SteamStub (.bind) titles pass their launch check"
source: spike 038 (Grim Dawn 219990); spikes 035–037 (CEG contrast)
area: steam-bridge
files:
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/generated/steam_api_shim.c
  - meta/gen_vtables.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/importScan.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/bottle.ts
severity: major
platform: macos
ready: live-gate
---

**Problem.** Games wrapped with Steamworks DRM ("SteamStub", a `.bind` PE section in the exe)
cannot run through the bridge today. In a bridge bottle the stub finds no Steam client, falls back
to `ShellExecute("steam://run/<appid>//")` (no handler in the bottle) and exits silently after
about 2 s. Grim Dawn (219990) is the reproducer: both GameLib launches on 2026-10-23 (22:14:22,
22:15:09) did this.

**What spike 038 established** (`.planning/spikes/038-steamstub-grimdawn-probe/`):

- The stub's check is on the **public client surface**: it reads
  `HKCU\Software\Valve\Steam\ActiveProcess\SteamClientDll64` (`SteamClientDll` for x86), loads that
  DLL, and calls `CreateInterface("SteamClient017")`, then `("SteamClient014")`. With a registered
  probe DLL returning NULL, it loaded the DLL, made those two calls and exited with code 53.
- `ISteamClient` is a standard versioned Steamworks interface. The native Mac `steamclient.dylib`
  exports `CreateInterface` (spike 004c), and Proton's `lsteamclient` forwards exactly this
  surface on Linux. A forwarding client means the **genuine signed-in Mac client** answers the
  ownership question. This is interop, the same as the `steam_api` shim → helper path one layer
  lower.
- **Not yet known:** which `ISteamClient017` methods and child interfaces the stub calls after
  `CreateInterface`. Find out by forwarding to the real client and logging what passes through,
  **not** by a stand-in that answers on its own. Every answer must come from the native client.

**Contrast with CEG (do not merge the two):** CEG (XCOM 200510, spikes 035–037) is serviced by a
Windows-Steam-only DIPC handler that the Mac client lacks. It stays `drm-wrapped` → bottled Steam.
SteamStub is in scope for the bridge.

**Shape of the work.**

1. **`steamclient.dll` / `steamclient64.dll` (PE, zig-built like the shims)** exporting
   `CreateInterface` (plus the `Steam_*` exports as stubs; the real DLL has 41, list in
   `spikes/038-.../exports64.txt`). `CreateInterface("SteamClient017"|"014")` returns an MSVC-ABI
   vtable whose methods marshal over the existing helper channel to the native client's own
   `ISteamClient`. Generate vtables from the pinned SDK the way spike 006 / `gen_vtables` did for
   `ISteamUser`. Child interfaces handed out by `GetISteam*` reuse the shim's existing per-version
   proxies where they already exist.
2. **Helper side:** obtain the native `ISteamClient` (`CreateInterface` on `steamclient.dylib`, or
   via `libsteam_api`) and serve the forwarded calls. Keep the helper's existing identity, no
   new auth.
3. **Bottle setup at launch:** write `ActiveProcess\SteamClientDll`/`SteamClientDll64`/`Universe`
   (and a live `pid`) in the per-game bridge bottle, and place the DLLs. Do **not** create
   `HKLM\Software\Valve\Steam`: in spike 036/o1 its presence diverted a game into
   `steam.exe -applaunch`. The proven setup code is `spikes/036-.../dipc_responder.c`
   (`DIPC_CLIENTDLL`/`DIPC_CLIENTDLL64`).
4. **Detection:** flag `.bind` at install/scan time (one PE section name) so a SteamStub title is
   known before launch, and until this lands, show a "Steam DRM wrapper not yet supported through
   the bridge" notice instead of "game stopped after 2s of play".

**Dependency.** For Grim Dawn specifically, once SteamStub passes, `Engine.dll` next hits the five
missing modern-SDK exports in
`2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`.
Both are needed for it to run.

**Done when:** Grim Dawn (219990) launches from GameLib through its per-game bridge bottle, gets
past SteamStub (no `steam://run` in a `--cx-log` trace), reaches its main menu, and Mac Steam
shows it In-Game. No Windows Steam client is in the bottle and the exe is unmodified.

**Update from spike 039 (2026-10-23).** A thin `steamclient64.dll` whose `CreateInterface` returns
the game's own shim interfaces works as plumbing: the stub took the shim's `SteamClient017`. It
still fell back to `SteamClient014` and exited 51, and the helper saw no `HELLO`. The shim's
generated `SteamClient017` methods are local `HELPER FALLBACK`/`STUB` constants
(`CreateSteamPipe` → 1, `GetISteam*` → only compiled versions, else the null object), so nothing
reached the native client. Step 1 therefore shrinks to the forwarder (spike 039's ~30 lines). The
weight moves to `meta/gen_vtables.ts`: make `SteamClient017`/`014` genuinely forward (pipe/user
handles served helper-side), log requested `GetISteam*` versions on the real path, and add
forwarding proxies for whatever the stub asks for.

## Recurrence: Raft (648800), 2026-10-24 10:38

Raft is the second SteamStub title in the 51-29 sample. The scan logged
`SteamStub .bind section present in the exe for appId 648800 (informational, no routing change)`,
so the game routed to the bridge. The helper reached `INIT SteamAPI ready`. Raft.exe ran for
about 4 s, there was no `HELLO`, and the log shows
`launcher exited before any game process matched — stopping`. Mac Steam's brief In-Game was the
helper's own `SteamAPI_Init` and it ended when the helper was killed. This is the same signature
as Grim Dawn: the stub fails its Steam check and exits before the game loads steam_api.

With two of eight sampled titles behind SteamStub, the forwarder matters. Until it lands, the
"informational, no routing change" choice sends every SteamStub title to a launch that cannot
succeed. Interim option: treat a `.bind` hit as a scan miss that also needs the forwarder, and
surface it as "not yet supported" rather than a silent ~4 s exit.

## Evidence from the Phase 52 live gate (52-12, 2026-10-24) -- NOT resolved

Items 6-8 of 52-UAT.md all scored `issue`; both Phase 52 todos stay pending. The forwarding path
works in the scratch harness (52-11 round 1: HELLO, FWD SteamClient017/014 native=present, no
steam://run, alive at 60 s) but the product launch never reaches it: the quick 261024-j4l withhold
guard classifies Grim Dawn as `withheld` (unservable SteamUser023, SteamNetworking006,
STEAMREMOTESTORAGE_INTERFACE_VERSION016, named by Engine.dll) and direct-launches with no
forwarder, no helper, no drmWrapper and no notice; the game exits after 2 s (operator: failing
silently). The stale 223744-byte shim stays in the bottle. See 52-UAT.md Gaps 1-4; a gap-closure
plan (`/gsd-plan-phase 52 --gaps`) should make the withhold decision SteamStub-aware.

## Re-gate evidence (52-17/52-18, 2026-10-24)

Not closed: items 9 and 10 are `issue`, so the strict rule is not met. See `52-UAT.md` in
`.planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/`.

- Item 9 (issue): Grim Dawn, forwarder placed, HELLO plus `FWD CreateInterface` SteamClient017/014
  native=present, yet the operator saw Application Load Error 3 twice and no main menu. No notice shown.
- Item 10 (issue): game Steam init logged `SteamAPI_IsSteamRunning() did not locate a running
  instance of Steam` after two reads of the absent ActiveProcess `pid`. Not bridge-verified.
- Item 11 (pass): bottle hygiene clean.
- Item 12 (issue): ELEX (411300) reached its loading screen and hung (baseline), HELLO present, no
  `[bridge-steamstub]` line, no error dialog; but the operator's Mac Steam Friends was signed in
  before and signed out after. Cause unknown. Not bridge-verified.
- Item 13: operator chose option-c, investigate first, no pid writer yet (what the stub does with the
  `pid` value, plus the ELEX Friends sign-out). Next step: `/gsd-plan-phase 52 --gaps`.

## Re-gate 2 evidence (52-23/52-24), 2026-10-24
Stays pending: items 17-19 skipped (Gap 5 not closable within the locked boundary).
- Item 14 (pass): relay trace of the SteamStub check window; the stub reads all 186368 bytes of the forwarder before the MessageBox.
- Item 15 (pass): Friends sign-out attributed to the steam-user logon, outside phase 52.
- Item 16 (pass): option-other, no code change; next step `/gsd-plan-phase 52 --gaps`.
- Items 17-19 (skipped): no Grim Dawn launch, trace or hygiene read.
- Item 20 (pass): ELEX HELLO present, FWD 0, `[bridge-steamstub]` 0, loading screen baseline, not bridge-verified.

## Re-gate 3 evidence (52-25..52-28), 2026-10-24
Stays pending: items 23 and 24 failed.
- Item 21 (pass): static + relay diagnosis; the stub reads the whole forwarder file (52-25-DIAGNOSIS.md).
- Item 22 (pass): option-versioninfo, GameLib VS_VERSIONINFO on the forwarder (commit 979c3b0e3).
- Item 23 (issue): Application Load Error persists, game did not launch, runtime 37 s; HELLO and 2 FWD lines present. In-Game: no, cleared: no.
- Item 24 (issue): `[S_API] Loaded ... OK` present but IsSteamRunning 1, MSGBOX 1, not alive at 90 s. Not bridge-verified.
- Item 25 (pass): bottle hygiene clean.
- Item 26 (skipped): change limited to the forwarder (steamstub path only).
Next step: `/gsd-plan-phase 52 --gaps`.

## Round 4 evidence (52-29..52-32), 2026-10-24
- 52-29: review hardening WR-01 (.rc existence guard), WR-02 (argv-order test pin), IN-01 (doc comment); forwarder bytes untouched.
- Item 27 (pass), arm A, no pid: dialog `Application load error 3:0000065432` recaptured, same as 52-25 R1; two `pid` reads absent; W 1 M 1 L alive 91s S 0 H 1 R 2 P 2 K 0.
- Item 28 (pass), arm B, clone-only pid to a live process: W 0, everything else unchanged, same dialog after the same whole-file forwarder read. Classified O1: the file/forwarder check is the blocker; a product pid writer is not indicated.
- Item 29 (pass): operator chose option-closeout and approved the amended ROADMAP done-when. Grim Dawn main menu is deferred to a separate operator-owned static-RE decision.
- Remaining: implement the honest SteamStub notice (not done in this plan). Next step: `/gsd-verify-phase 52`.
