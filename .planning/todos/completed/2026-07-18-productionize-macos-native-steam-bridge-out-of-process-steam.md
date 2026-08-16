---
created: 2026-07-18T01:50:44.561Z
title: Productionize the macOS native Steam bridge (out-of-process steam_api proxy)
area: steam
files:
  - .planning/seeds/macos-steam-native-bridge-lsteamclient.md
  - .planning/spikes/MANIFEST.md
  - .planning/spikes/005c-min-steam_api-shim/
  - .claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md
---

## Problem

GameLib on macOS today bottles a **full Windows Steam client** inside each CrossOver bottle, which
forces a separate one-time Steam login per bottle (the cost Phase 22 "Steam Game Families"
accepts). The preferred long-term architecture is a Proton-style bridge: ONE native macOS Steam
client + lightweight per-game bottles that proxy Steamworks IPC out to it → one login, cheap
per-game prefixes.

**Feasibility is no longer the question — it's PROVEN end-to-end on this stack** (spikes 004+005,
2026-07-18):
- 005a — a native arm64 helper `dlopen`s the on-disk `libsteam_api.dylib` and reads the real
  signed-in SteamID/persona from the running Mac Steam.
- 005b — a Windows PE inside the real `GameLibSteam` bottle round-trips that identity to the host
  over loopback (Wine shares the host network namespace).
- 005c — a **drop-in replacement `steam_api.dll`** that a game-like caller loads returns the real
  SteamID via shim → TCP → host helper → native Mac Steam. Zero Windows Steam client in the bottle.

This is Phase 22's credible successor; if shipped it likely supersedes much of the multi-bottle
machinery. Deferred, not urgent — capturing so it isn't lost. Phase 22 remains the ship-now answer.

## Solution

Not a weekend task; scope a dedicated phase when resourced. The out-of-process `steam_api` TCP
bridge is the path (NOT the in-process `lsteamclient` thunk — blocked/Valve-scale, see spike 004a).
Follow the blueprint in `spike-findings-gamelib/references/macos-steam-bridge.md`. Remaining
productionization work (all beyond the proven backbone):

1. **C++ vtable ABI** — the hard next step. Unmodified games call `SteamUser()->GetSteamID()` via
   the C++ vtable, not the flat export 005c proved. Generate vtable layouts + `__thiscall`/`ret N`/
   sret marshaling from pinned SDK headers (L4D2-launcher's `gen_vtables.py` approach). This is the
   right next **frontier spike** before committing a phase.
2. **API/callback breadth** — full flat + COM surface, callback dispatch with pack(4)→pack(8) repack.
3. **P2P multiplayer join** — known-hard gap (`InitRelayNetworkAccess()` + `AcceptP2PSessionWithUser`;
   only partially fixed upstream). Single-player/auth/persona/listen-server hosting already work.
4. **Persistent channel** — replace connect-per-call; host helper holds inited interface pointers.
5. **Packaging/portability** — generate the shim per bottle; validate across Apple-Silicon variants
   (L4D2 validated only on M4). Toolchain: build PEs with `zig cc -target x86-windows-gnu` (brew
   only dry-runs in this env). Bottle run: `CX_BOTTLE=<bottle> <CrossOver>/bin/wine "C:\prog.exe"`.

Prior art: samdotson61/L4D2-launcher (working shallow bridge), natbro/kaon (deep lsteamclient, stuck).

## Resolution 2026-08-16 — SUPERSEDED by Phase 24 (quick task 260816-i8a)

This todo asked for a dedicated phase "when resourced". That phase was scoped, planned and
executed as **Phase 24 — macOS native Steam bridge (out-of-process steam_api proxy)**, whose
ROADMAP entry cites *this file by name* as one of its own sources. 16/17 plans shipped;
implementation lives at `src/backend/storeManagers/steam/bridge/` and `native/steam-bridge/`.

Mapping this todo's own numbered productionization list to what closed it:

| # | This todo's item | Closed by |
|---|---|---|
| 1 | **C++ vtable ABI** — called "the right next frontier spike" | Spike 006, then plan 24-01 (vtable+flat shim generator, GameLib-authored manifest, `__thiscall`/`ret N`/sret marshaling). Spike 007 ran a real commercial game (Avernum 4) on it. |
| 2 | API/callback breadth | **Deliberately scoped to 2 interfaces** — see residual below |
| 3 | P2P multiplayer join | Not attempted; still the known-hard gap this todo describes |
| 4 | Persistent channel | 24-02 (native helper, InitFlat-once, loopback-only **persistent** channel) |
| 5 | Packaging/portability | 24-07 (pinned zig download, clang helper, `zig cc` PE shim into `public/bin/${arch}/darwin`); per-bottle shim placement via 24-05 |
| — | Routing/lifecycle (not in the list) | 24-08 `isBridgeEligible` + install/launch/uninstall branches; 24-04 CrossOver-only bridge bottle with no Windows Steam client (R6) |

**On "16/17":** the plan without a SUMMARY.md is 24-10, the *human UAT gate* (`autonomous: false`),
whose artifact is `24-UAT.md` rather than a summary. That UAT is `status: complete` — 3 gates
passed, 0 failed, 1 blocked out-of-scope. The bridge mechanism is proven end-to-end (vtable
round-trip + Avernum 6 playable through the bundled helper).

**Residual, tracked elsewhere — do not reopen this todo to carry it.** Item 2 (API/callback
breadth) is the one blocked gate, recorded as **D-UAT-24-09**: Hoard imports 8 bare old-style
interface accessors, while the phase-24 shim + helper deliberately cover only `ISteamUser` +
`ISteamFriends`. Full coverage needs 6 more interface proxies (Utils / Apps / UserStats /
RemoteStorage / Matchmaking / Networking) in both the 24-01 generator and the 24-02 helper —
explicitly dispositioned as a follow-on milestone, not a gap-cycle tweak. Hoard was removed from
the bridge allowlist (`30cdda6a`) so no user is handed a title that installs then crashes.
Item 3 (P2P) remains untouched and unclaimed.

Closed as superseded. A future bridge-coverage effort should start from `24-UAT.md`'s D-UAT-24-09
disposition, which quantifies exactly what is missing — not from this note, which predates the
phase and treats the vtable ABI as still unproven.
