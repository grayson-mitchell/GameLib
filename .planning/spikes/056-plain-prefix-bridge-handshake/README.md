---
spike: 056
name: plain-prefix-bridge-handshake
type: standard
validates: "Given a fresh WINEPREFIX made by Wine-Staging-macOS's own `wineboot -i` (no cxbottle), when a game-shaped x86 and x64 PE loads the SHIPPED bridge shim with a per-run helper, then the helper logs HELLO, SteamAPI is ready, and the real SteamID64 round-trips through the MSVC vtable"
verdict: VALIDATED
related: [005b, 005c, 006, 034, 035]
tags: [steam, macos, bridge, wine, wine-staging, dxmt, wineprefix, crossover, engine]
---

# Spike 056: plain-prefix-bridge-handshake

## What This Validates

Given a fresh `WINEPREFIX` created by Wine-Staging-macOS (Gcenx build) with its own
`wineboot -i` — no `cxbottle`, no CrossOver anywhere in the process tree — when a game-shaped
x86 **and** x64 PE loads GameLib's **shipped** `steam_api.dll` / `steam_api64.dll` beside a
per-run `steam-bridge-helper`, then:

- the helper logs `HELLO shim attached` and `SteamAPI ready`,
- `SteamAPI_Init()` returns 1,
- `SteamAPI_SteamUser_v023()` → vtable slot 2 (`GetSteamID`, MSVC sret) returns the real
  signed-in SteamID64.

This is the kill-question for "Steam bridge on non-CrossOver engines": if the shim cannot
reach the helper from a plain prefix, there is nothing to build.

## Research

No external research needed — every component is GameLib's own and already proven on CrossOver
(005b TCP from bottle to host, 005c/006 shim + vtable ABI, 034 probe-PE pattern). What was
established by reading the code first:

| Coupling point | Where | CrossOver-specific? |
|---|---|---|
| Bridge bottle creation | `provisionBridgeBottle` (`bottle.ts:1938`) — `cxbottle --create --template win10_64`, then nothing else (no Steam client, R6) | **Yes** — the only CX-specific step |
| Bottle settings / runner | `stockBridgeBottleSettings` → `resolveCrossoverWine(...)` + `wineCrossoverBottle` | **Yes** |
| Launch env | `launcher.ts:1205` — `crossover` → `CX_BOTTLE`; `toolkit` → `WINEPREFIX` | Already engine-aware |
| Shim ↔ helper | `gamelib_bridge.cfg` (`port`/`appid`/`secret`) beside the exe → TCP `127.0.0.1` | No |
| Helper | native arm64 `steam-bridge-helper --appid N --port 0`, `GAMELIB_BRIDGE_SECRET` env | No |

Wine-Staging-macOS-latest (11.20, Gcenx `macOS_Wine_builds`) ships `lib/wine/{i386-windows,
x86_64-windows,x86_64-unix}` — the new-WoW64 layout, so 32-bit PEs run in a win64 prefix with no
separate 32-bit unix side.

**Chosen approach:** the 034 positive-control pattern, extended to both arches and two engines:
run the probe in an APFS clone of a real CrossOver bridge bottle **first** (control), then in a
fresh Wine-Staging prefix. Use the production shim binaries from `public/bin/arm64/darwin`
unmodified — only their import libs are built here.

## How to Run

```bash
./build.sh                      # probe32.exe + probe64.exe against the shipped .def files
./run.sh cx staging dxmt        # control + both Wine-Staging engines, x86 + x64 each
BAD_SECRET=1 ./run.sh staging   # negative control: cfg secret the helper never issued
```

Needs native Mac Steam running and signed in. Prefixes are created under `prefixes/` (gitignored,
~330 MB each); the CX control clones `GameLibSteamBridge-206060` to `GameLibSpike056` and never
touches the real bottle.

## What to Expect

Each case appends one line to `logs/events.log`: probe result + helper evidence. Per-case
`logs/<engine>-x<arch>.{probe.txt,helper.log,wine.out}`.

## Investigation Trail

1. **Control, attempt 1 — `SteamUser()` null on CrossOver too.** The legacy unversioned
   `SteamUser` export returned NULL after a successful `SteamAPI_Init`. Not an engine fact — the
   probe used an accessor modern SDK games don't call. Switched to `SteamAPI_SteamUser_v023`.
2. **Control, attempt 2 — x86 crash (rc=5), x64 hang (90 s alarm).** Reading the generated shim
   (`steam_api_shim.c:5659`): `vt_SteamUser023_GetSteamID(void *self, void *sretOut)` — CSteamID
   is returned through an MSVC hidden sret pointer, not EDX:EAX/RAX. The probe's
   `uint64_t (*)(void*)` signature was wrong. (Note: `grep` reports the 48 k-line generated
   shim as a binary file — use `grep -a`.)
3. **Control, attempt 3 — PASS both arches** with the sret signature: real SteamID64, HELLO,
   `SteamAPI ready`. Probe now matches how real MSVC-built games call the vtable.
4. **Wine-Staging — PASS both arches on first run.** Fresh prefix from `wineboot -i` in 26 s
   (`WINEDLLOVERRIDES="mscoree,mshtml="` suppresses the Mono/Gecko prompts). Identical
   SteamID64 to the control.
5. **"system.reg=no" scare.** The first readiness check ran before the wineserver had flushed —
   `system.reg` is written only on wineserver exit. After `wineserver -w` the prefix is complete:
   `#arch=win64`, 857 files in `syswow64`. The 5 `scmdatabase_autostart_services ... 1115`
   fixmes are services racing `wineboot`'s own shutdown (ERROR_SHUTDOWN_IN_PROGRESS) — benign.
   **Build implication:** a readiness gate for a plain prefix must wait for the wineserver,
   not just for `wineboot` to return.
6. **Wine-Staging-macOS-latest-DXMT — PASS both arches** in its own fresh prefix (21 s).
7. **Negative control (`BAD_SECRET=1`) — fails closed under Wine-Staging.** Helper logs
   `AUTH refused unauthenticated frame ... secret=required` twice, no HELLO, probe gets
   `init=0`. The WR-03 auth layer is engine-independent.

## Results

**VALIDATED.** The bridge shim, helper, TCP loopback and MSVC vtable path work unchanged in a
plain Wine-Staging prefix — x86 (via WoW64) and x64, plain and `-DXMT` engines, positive
control and negative control all behaving as on CrossOver.

| Case | init | HELLO | SteamID64 | Notes |
|---|---|---|---|---|
| cx-x32 / cx-x64 (control) | 1 | yes | 76561197995867096 | clone of GameLibSteamBridge-206060 |
| staging-x32 / staging-x64 | 1 | yes | 76561197995867096 | fresh `wineboot -i` prefix |
| dxmt-x32 / dxmt-x64 | 1 | yes | 76561197995867096 | fresh prefix, `-DXMT` engine |
| staging-x32/x64 badsecret | 0 | **no** | — | `AUTH refused`, fail-closed |

`bloggedon=0` in **every** case, CrossOver included — not an engine difference. **Resolved in
058 (2026-10-31):** an immediate re-run of staging + cx returned `bloggedon=1` everywhere; it
tracks Mac Steam's logon state at the time of the run.

**Addendum (058):** `./run.sh gptk` adds a GPTK 3.0-3 engine (`wine64`, `WINEMSYNC=1
WINEESYNC=1` per `launcher.ts`) — PASS both arches (x86 via wine32on64).

**What this does NOT prove:** a real game. The probe has no graphics, no game-side Steam-init
log, no `steam_appid` beyond 480, no shared redists. That is spike 057.

**Surprises:** none at the engine level — the CrossOver coupling really is confined to bottle
creation and runner selection. The two failures along the way were both probe-ABI mistakes,
caught by running the CrossOver control first.

**Impact on 057–059:** go. 057 can use `prefixes/staging` (and `prefixes/dxmt`) directly with a
shadow tree of a real install.
