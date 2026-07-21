---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 10
artifact: uat
status: pending_retest
requirements: [R1, R5, R6]
total_gates: 4
pending_gates: 3
passed_gates: 1
failed_gates: 0
blocked_gates: 0
blocked_reason: "RESOLVED by gap-closure plans 24-11/24-12/24-13 (shim overwrite-by-identity, bridge AcfSource install poll, install-poll wiring + sticky-flag clear + launch existence-gate). Gates 2-4 (R5/R6) re-pointed to PENDING by 24-14 for a fresh human-hardware retest citing the specific fix per gate. Gate 1 (R1) PASS; low-level bridge mechanism proven."
run_via: "/gsd-execute-phase 24 --wave 5 --interactive"
prepared: 2026-07-21
last_updated: 2026-07-21
---

# Phase 24 — macOS Native Steam Bridge: Real-Machine UAT

**Plan:** 24-10 (Wave 5, final plan of Phase 24 — the out-of-process Steam API proxy)
**Purpose:** Record the human-hardware-gated acceptance for **R1** (runtime vtable round-trip),
**R5** (packaged build runs an allowlisted game via the bundled helper), and **R6** (Avernum 4 +
Hoard reach playable single-player through the bridge with real Steam identity, no bottled Windows
Steam client). Per `24-VALIDATION.md`'s Manual-Only Verifications table, these four cannot be
automated: they require a packaged `.app`, a live signed-in native Mac Steam, real owned games, and
the developer's own Apple-Silicon hardware.

**Status: Gate 0/1 PASS; Gates 2-4 PENDING RETEST.** This document is the prepared gate list +
recording template (mirroring the `21-UAT.md`/`23-UAT.md` precedent). Gates 2-4 were originally
BLOCKED on a bridge install→shim→launch integration bug cluster (D-UAT-24-02/03/04/05); gap-closure
plans 24-11/24-12/24-13 closed that cluster, and gap-closure plan 24-14 re-pointed Gates 2-4 back to
`PENDING` here for a fresh human-hardware retest. Every `Result` below is `PENDING` until a human runs
the corresponding flow on real hardware (on a rebuilt `.app`, after a clean reinstall — see each
gate's "Retest preconditions") and records the outcome here.

**Requirements gated by this document:** R1, R5, R6 (per 24-10-PLAN.md frontmatter). The phase is not
complete until all four gates PASS. Any FAIL routes to `/gsd-plan-phase 24 --gaps`.

---

## How to read this document

Each gate has:
- **Preconditions** — what must be true before starting.
- **Steps** — the exact sequence to run.
- **Expected result** — what "pass" looks like.
- **Result** — `PENDING` until run; then `PASS` / `FAIL` / `DIVERGENCE` with evidence (observed
  SteamID64, persona, helper process path, bottle listing, log excerpts referenced by path).

Do not silently mark a gate passed. Capture divergences here — per the plan's `<verification>`
clause, any FAIL routes to a follow-up gap plan.

---

## Gate 0 — Automated pre-requisite (`pnpm test:ci` + `pnpm codecheck` + packaged build)

**This is the automatable Task 1 gate that MUST clear before the four human gates run.** Recorded by
the orchestrator on 2026-07-21 (build ref `724b4337`, branch `fix/steam-native-install-stability`).

### 0a. `pnpm codecheck` (tsc --noEmit)

**Result:** ✅ PASS — exit 0, clean (2026-07-21).

### 0b. Full jest suite

**Result:** ✅ PASS for Phase 24 scope, with two pre-existing/out-of-scope exceptions (see below).

**Evidence (parallel run, `pnpm exec jest`):** `Test Suites: 1 failed, 102 passed, 103 total`;
`Tests: 1813 passed, 1813 total`. **Every test that executes passes (1813/1813)**, including every
Phase 24 suite: `gen_vtables`, `protocol`, `allowlist`, `bottle`, `importScan`, `shimGenerate`,
`helperProcess`, `launchTarget`, `games`, `buildSteamBridgeShims`, plus the Steam depot/library suites.

**Two known red signals — NEITHER caused by Phase 24 (Phase 24 modified none of the involved files):**

1. **`src/backend/sidecar/__tests__/bootstrap.test.ts` — suite fails to load** (0 tests) with
   `TypeError: library_6.default is not a constructor` at `storeManagers/index.ts:20`
   (`new SteamLibraryManager()`). Root cause: a **circular-import / module-load-order** issue — when
   the sidecar's `bootstrap.ts → handlers.ts → steamFlowRegistration.ts → steam/library.ts` chain
   loads first, the logger→config→utils chain re-enters `storeManagers/index.ts` and evaluates
   `new SteamLibraryManager()` before `steam/library.ts` has finished defining its default export. The
   other 102 suites import in an order that never triggers it. **This is a Phase 27 workstream artifact**
   (introduced by commits `27-02`/`27-04`; `sidecar/` does not exist on `main`), unrelated to the
   macOS bridge. Tracked for Phase 27, not a Phase 24 gap.
2. **`src/backend/storeManagers/steam/library.ts` leaked `setTimeout`** — a `pollInstallOnce` retry
   timer fires post-teardown (`getSteamLibraries()` undefined → `.map` throws). In `--silent
   --runInBand` (`test:ci` as scripted) this crashes node with exit 1 after ~22 suites, before jest
   prints a summary; in parallel-worker mode it degrades to a non-fatal "worker force exited" warning
   and the full 1813/1813 summary prints. Pre-existing/known (see project memory
   `sync-require-alias-unresolved-in-build` sibling note), not introduced by Phase 24.

**Disposition:** Phase 24's automated suite is green (all Phase 24 tests pass; 1813/1813 total). The
literal `pnpm test:ci` command exits 1 due to the library.ts leaked-timer crashing `--runInBand`;
the honest green signal is the parallel-worker run above. Fixing the library.ts timer and the Phase 27
`bootstrap.test.ts` circular import are separate, out-of-scope follow-ups — they do not gate Phase 24
acceptance because neither touches nor regresses any bridge code path.

### 0c. Packaged `.app` produced by `dist:mac` with bundled helper present

**Result:** ✅ PASS — packaged `.app` produced with the bundled helper present (2026-07-21).
**Evidence:** `dist:mac` ran `build-steam-bridge` (arm64 helper `Mach-O … arm64`, PE shim
`steam_api.dll` `PE32 (DLL) … Intel 80386`, `steam_appid.txt` = `480`) then `electron-vite build`
(✓ built in 6.94s) and `electron-builder --mac` (ad-hoc signed; DMG + zip produced). Output:
`dist/mac-arm64/GameLib.app` (plus `dist/GameLib-0.7.0-macOS-arm64.dmg` / `.zip`).
Bundled helper confirmed at:
`dist/mac-arm64/GameLib.app/Contents/Resources/app.asar.unpacked/build/bin/arm64/darwin/steam-bridge-helper`
— `Mach-O 64-bit executable arm64`, mode `755`, 53696 bytes; `steam_api.dll` + `steam_appid.txt`
present in the same directory (electron-builder.yml line 56 packs `build/bin/${arch}/darwin/*`,
`asarUnpack: build/bin/**/*` unpacks it). This is the artifact under test for Gates 1–4.
**Rebuilt 2026-07-21 after the Avernum 4 → Avernum 6 allowlist swap** (commit `9bcfb6c0`): the inlined
bridge allowlist in the packaged bundle (`app.asar` → `build/main/chunks/index-*.js`) was verified to
contain exactly two active entries — `appId:"206060"` (Avernum 6) and `appId:"63000"` (HOARD); `206020`
survives only as descriptive note text, not as an entry. The bundled helper remains present after rebuild.
**REBUILT AGAIN 2026-07-21 15:01 post-gap-cycle (HEAD `8afd58e9`)** — this is the artifact for the
Gates 2-4 RETEST. `dist:mac` re-ran `build-steam-bridge` + `electron-vite build` + `electron-builder`
off a tree whose `shimGenerate.ts`/`library.ts`/`games.ts` are last-touched by the three gap-fix commits
(`88d20973`/`e07e85b3`/`b4bc94e8`), so the 24-11/24-12/24-13 fixes are compiled in. Verified in the
packaged bundle: main chunk `build/main/chunks/index-o7jUYCjZ.js` contains `GameLibSteamBridge` + the
bridge poll-source wiring; allowlist inlined = **`206040` (Avernum 5) + `206060` (Avernum 6) + `63000`
(HOARD)** — three active entries; bundled helper `Mach-O arm64`
53696 B + bridge shim `steam_api.dll` PE32 **805888 B** + `steam_appid.txt`=480 all present at
`…/app.asar.unpacked/build/bin/arm64/darwin/`. NOTE: this build bakes in 4 still-uncommitted working-tree
changes (the `bridge/allowlist.ts` packaged-JSON-import fix — keep; and a `downloadqueue.ts`/`launcher.ts`/
`utils.ts` packaged-`require()`-resolution crash fix from a concurrent debug session, status
awaiting_human_verify) — both are packaged-bundle fixes, appropriate for a UAT build, flagged for provenance.

---

## Gate 1 — R1 runtime vtable round-trip (006-style: GENERATED shim → PRODUCTION helper)

Source: 24-10-PLAN.md Task 2 (review findings #5b/#13). Closes R1's **runtime** ABI acceptance.

**Why this gate exists:** it is the ONLY thing that proves the hand-authored ABI (`__thiscall`, `ret N`,
sret, vtable slot offsets, EDX:EAX 64-bit return) is correct at RUNTIME through a real C++ virtual
call — independent of whether Avernum 4 (2 imports) or Hoard ever exercise the vtable identity path.
A FAIL here localizes an ABI/generator bug BEFORE the game gates.

**Preconditions:**
- Apple-Silicon Mac with the native Steam client **signed in**.
- The **GENERATED** shim from 24-07's build (`public/bin/arm64/darwin/steam_api.dll`, PE32 DLL) — the
  generator output from 24-01, cross-compiled by 24-07's zig-cc gate. (Do NOT hand-build a fresh shim;
  use the one under test.)
- The **PRODUCTION** helper from 24-02/24-07 (`public/bin/arm64/darwin/steam-bridge-helper`, Mach-O
  arm64), running or startable.
- The 006-style harness at `.claude/skills/spike-findings-gamelib/sources/006-cpp-vtable-abi/`
  (`harness.c`, `steam_api_vt.c`, `build.sh`, `run.sh`).

**Steps:**
1. Ensure the packaged/built bridge helper is running (or start it) against the live signed-in Mac
   Steam session.
2. Run the 006-style round-trip harness so it loads the **GENERATED** `steam_api.dll`, obtains the
   `ISteamUser` interface, and makes a C++ **virtual** `GetSteamID()` call **through the vtable**
   (slot 2, MSVC `__thiscall`) — NOT a flat `SteamAPI_*` export.
   - The spike's `run.sh` targets the old 005b bridge_server + `GameLibSteam` bottle. For this gate,
     point the harness's shim at the **production** helper (24-02) so the identity is served by the
     shipping bridge, not the spike server. Record exactly how the harness was pointed at the
     production helper.
3. Confirm the returned SteamID64 equals your REAL signed-in SteamID64 — **string-compared end to end,
   never parsed through a JS number**.
4. (Optional) Repeat for `ISteamFriends::GetPersonaName()` to confirm a second slot / `ret N` is correct.

**Expected result:** A C++ virtual `GetSteamID()` through the GENERATED shim's vtable returns the real
signed-in SteamID64 (proves slot offset + `__thiscall` + `ret N` + EDX:EAX 64-bit return at runtime),
served through the production helper. Value matches the live account's SteamID64 exactly (string equality).

**Result:** ✅ PASS — 2026-07-21, real Apple-Silicon Mac, native Steam signed in.
**Observed SteamID64:** `76561197995867096` (via `ISteamUser::GetSteamID`, slot 2, MSVC `__thiscall`,
through the GENERATED shim's vtable) — **string-equal** to the real signed-in SteamID64 from
`config/loginusers.vdf` (`MostRecent "1"` account). Auto-compared by the runner → PASS.
**Observed persona (if run):** not run — the harness exercises only the `GetSteamID` (slot 2) leg;
`GetPersonaName` was not dispatched here. (Identity persona is separately covered by Gate 4 Part B.)
**How harness was pointed at the production helper:** the unmodified 006 `harness.c` was built to
`harness.exe` (`zig cc -target x86-windows-gnu`) and paired with the PRODUCTION generated
`public/bin/arm64/darwin/steam_api.dll` (24-01 source, 24-07 zig-built) inside the `GameLibSteam`
bottle; the PRODUCTION `public/bin/arm64/darwin/steam-bridge-helper` (24-02) was started standalone
(cwd carries `steam_appid.txt`=480) and reached `LISTEN 127.0.0.1:54550`. Shim + helper agree on port
54550 and slot 2 = `GetSteamID`, so no harness edits were needed — the round-trip crossed the real
loopback channel to the shipping helper.
**Evidence:** harness stdout `VTABLE_GAME_PATH ISteamUser::GetSteamID (slot 2, MSVC __thiscall) =
76561197995867096`; bottle `C:\vtable_out.txt` = `GetSteamID=76561197995867096`; helper reached
`LISTEN 127.0.0.1:54550`. Runner: `scratchpad/gate1-vtable-roundtrip.sh` (adapts spike 006 to the
production artifacts).

---

## Gate 2 — R5 packaged build spawns the BUNDLED helper (no staged binary)

Source: 24-10-PLAN.md Task 3. Trust boundary T-24-11 (bundled helper provenance).

**Preconditions:**
- Apple-Silicon Mac, native Steam installed + signed in.
- The packaged `.app` produced in Gate 0c.
- Any dev GameLib instance quit; **any externally staged `steam-bridge-helper` removed from PATH /
  working dirs** (so a staged binary cannot masquerade as the bundled one).
- **Retest preconditions (post gap-cycle):** the packaged `.app` MUST be REBUILT after 24-11
  (shim overwrite-by-identity), 24-12 (bridge AcfSource for install poll), and 24-13
  (install-poll wiring + sticky-flag clear + launch existence-gate) have landed — a pre-fix
  build does not contain any of the three fixes. Before retest, clear the messy pre-fix install
  state left by the earlier BLOCKED run: remove the `GameLibSteamBridge` bottle's stale
  install record for the acceptance appId (and the bottle itself if it contains a half-installed
  game with the game's own `steam_api.dll` still in place) so the retest exercises a CLEAN
  reinstall through GameLib, not a resume of the broken pre-fix state.

**Steps:**
1. Launch the PACKAGED `.app` (not a dev `yarn`/`vite` run).
2. Launch an allowlisted game (Avernum 6 or Hoard) so the bridge helper is spawned.
3. In Activity Monitor / logs, inspect the running `steam-bridge-helper` process's executable path.

**Expected result:** The running helper's path resolves **inside** the packaged `.app` bundle
(`…/app.asar.unpacked/build/bin/arm64/darwin/steam-bridge-helper`), NOT a dev/staged path. No
externally staged helper is present or used.

**Per-fix verification hooks (attribute pass/fail to a specific gap-cycle fix):**
- **D-UAT-24-04 (24-11, shim overwrite-by-identity):** after the install this gate depends on,
  confirm the `steam_api.dll` next to the game exe in the bridge bottle is the 805888-byte bridge
  shim, NOT the game's own ~118368-byte copy. **Authoritative check = file size** (`stat -f %z` →
  805888 = bridge shim; ~118368 = game's own). Secondary: `grep -ac 127.0.0.1 <dll>` — the bridge
  shim embeds the loopback address (count 1), the game's own dll does not (count 0). (NOTE: the
  earlier `grep 54550` port check is a false negative — the port is not stored as ASCII in the shim;
  use size or 127.0.0.1.)
- **D-UAT-24-05 (24-12, bridge AcfSource):** the install badge for the acceptance game STAYS
  "Installed" after the poll grace window and does not revert to "Install" (proves the poll read the
  bridge-bottle StateFlags=4 manifest, not the wrong root).
- **D-UAT-24-02/03 (24-13, install-poll wiring + launch existence-gate):** Play launches the real
  `steam-bridge-helper` process (this gate's own subject) without a prior single failure poisoning
  the session — i.e. this is the first Play attempt in a fresh session AND it succeeds without
  needing a restart.

**Result:** PENDING (retest after gap cycle 24-11/24-12/24-13)
**Observed helper process path:** _(record — must be inside the `.app` bundle)_
**Evidence:** _(Activity Monitor screenshot path / log line)_

---

## Gate 3 — R6 Avernum 6 single-player launch through the bridge

Source: 24-10-PLAN.md Task 4. **Substitution (2026-07-21, user decision):** the plan named **Avernum 4**
(206020), but Avernum 4 does not run under CrossOver, so it can never reach playable single-player
through the bridge on macOS. It is replaced by its Spiderweb engine sibling **Avernum 6** (206060,
Windows-only per the Steam store API — `mac:false`), which occupies the same minimal-`steam_api`-footprint
role (expected `SteamAPI_Init`/`Shutdown`, like Avernum 4's spike-007 set). The allowlist was updated
accordingly (`bridge-allowlist.json`: 206020 → 206060). See finding #6 for why a minimal-import game's
identity proof leans on Gate 1 rather than the game itself.

**Import-coverage pre-check (do at install, before judging the gate):** because Avernum 6 has no prior
spike, confirm its `steam_api` imports are a subset of the shim's exports. At install, GameLib's 24-05
`importScan` (`objdump --private-headers` on `Avernum6.exe`) enumerates its imports; if `shimGenerate`
reports an uncovered symbol, that is a *coverage* gap (regenerate the shim to add it), NOT an ABI/bridge
FAIL. Record the enumerated import set here.

**Preconditions:**
- Packaged GameLib **rebuilt after the allowlist change** (so the bundled, inlined allowlist contains
  206060 — the pre-swap build has Avernum 4 baked in and will not route Avernum 6 to the bridge); native
  Mac Steam signed in; Avernum 6 owned on the account.
- Bridge bottle path (no bottled Windows Steam client).
- **Retest preconditions (post gap-cycle):** the packaged `.app` MUST be REBUILT after 24-11
  (shim overwrite-by-identity), 24-12 (bridge AcfSource for install poll), and 24-13
  (install-poll wiring + sticky-flag clear + launch existence-gate) have landed. Before retest,
  clear the messy pre-fix install state for Avernum 6 (and the Avernum 5 exploration artifacts noted
  in D-UAT-24-03/04/05): remove any stale `GameLibSteamBridge` bottle install record and the bottle's
  on-disk game directory for the acceptance appId, so the retest is a CLEAN reinstall THROUGH GameLib
  (provision → depot into bridge bottle → shim → badge → launch), not a resume of broken pre-fix state.

**Steps:**
1. From the packaged GameLib, install (if needed) and launch **Avernum 6** on macOS.
2. Confirm the game reaches main menu / playable single-player.
3. **Part A (init through the bridge):** confirm logs show `SteamAPI_Init` / `SteamAPI_InitFlat`
   succeeded THROUGH the bridge (the flat init crossed the loopback channel to the helper).
4. **Part B (identity served):** IF Avernum 6 makes an identity call, confirm logs show the real
   signed-in SteamID64 + correct persona crossed the bridge. **NOTE (finding #6):** a minimal-import game
   may NEVER request SteamID/persona — in that case Part B is legitimately **N/A** here, and the
   real-identity proof is Gate 1 (the vtable round-trip, which does not depend on the game calling the
   vtable). Do NOT record FAIL for Part B solely because a minimal-import game never asked for identity.
5. Inspect Avernum 6's bridge bottle: confirm **NO** `steam.exe` / Windows Steam client is present
   (e.g. `ls` the bottle's `drive_c/Program Files (x86)/Steam/`).

**Expected result:** Avernum 6 reaches playable single-player via the bridge; Part A init-through-bridge
logged; Part B identity served if requested (else N/A per finding #6); bottle has no Windows Steam client.

**Per-fix verification hooks (attribute pass/fail to a specific gap-cycle fix):**
- **D-UAT-24-04 (24-11, shim overwrite-by-identity):** the `steam_api.dll` next to `Avernum6.exe` in
  the bridge bottle is the 805888-byte bridge shim, NOT Avernum 6's own ~118368-byte copy.
  **Authoritative check = file size** (`stat -f %z` → 805888 = bridge shim; ~118368 = game's own);
  secondary `grep -ac 127.0.0.1 <dll>` (bridge shim = 1, game's own = 0). (`grep 54550` is a false
  negative — port not stored as ASCII.)
- **D-UAT-24-05 (24-12, bridge AcfSource):** the Install badge STAYS "Installed" after the install
  poll grace window and does not revert to "Install" (proves the poll read the bridge-bottle
  StateFlags=4 manifest for 206060, not the native/Phase-17-bottle root).
- **D-UAT-24-02/03 (24-13, install-poll wiring + launch existence-gate):** Play launches the real
  `Avernum6.exe` (non-empty `launch.log`, game reaches main menu) on the FIRST attempt in a fresh
  session — a prior single bridge failure elsewhere in the session must not have poisoned this launch
  (sticky-flag clear verified working).

**Result:** PENDING (retest after gap cycle 24-11/24-12/24-13)
**Enumerated `steam_api` imports (24-05 importScan):** _(record — confirm subset of shim exports)_
**Part A (init through bridge):** _(PASS/FAIL — log excerpt)_
**Part B (identity served):** _(PASS / N/A — SteamID64 + persona if served)_
**Bottle listing (no steam.exe):** _(record `ls` output)_
**Evidence:** _(log paths, screenshots)_

---

## Gate 4 — R6 Hoard single-player launch through the bridge

Source: 24-10-PLAN.md Task 5. Hoard exercises a larger accessor surface (7 imports) than the
minimal-import gate game (Avernum 6, expected 2) — a real vtable `ret N` regression would surface here
first (Pitfall 2), corroborating Gate 1.

**Preconditions:**
- Packaged GameLib (Gate 0c); native Mac Steam signed in; Hoard owned on the account.
- Bridge bottle path (no bottled Windows Steam client).
- **Retest preconditions (post gap-cycle):** the packaged `.app` MUST be REBUILT after 24-11
  (shim overwrite-by-identity), 24-12 (bridge AcfSource for install poll), and 24-13
  (install-poll wiring + sticky-flag clear + launch existence-gate) have landed. Before retest,
  clear the messy pre-fix HOARD install state (D-UAT-24-01/02 found HOARD "installed" only as an
  unusable native 32-bit Mac build, never through the bridge, plus a stray Windows copy in the old
  Phase 17 `GameLibSteam` bottle): remove the stale HOARD install record and any bottle artifacts for
  appId 63000 so the retest is a CLEAN reinstall THROUGH GameLib's bridge path.

**Steps:**
1. From the packaged GameLib, install (if needed) and launch **Hoard** on macOS.
2. Confirm the game reaches main menu / playable single-player.
3. **Part A:** confirm logs show `SteamAPI_Init` succeeded THROUGH the bridge. **Part B:** Hoard's
   7-import surface makes an identity call likely — confirm logs show the real signed-in SteamID64 +
   correct persona served through the bridge. If Hoard exercises a vtable identity accessor, a `ret N`
   regression would surface here first (Pitfall 2), corroborating Gate 1.
4. Inspect Hoard's bridge bottle: confirm **NO** `steam.exe` / Windows Steam client is present.

**Expected result:** Hoard reaches playable single-player via the bridge; Part A init-through-bridge;
Part B real SteamID64 + persona served (Hoard is the game most likely to actually exercise identity —
finding #6); bottle has no Windows Steam client.

**Per-fix verification hooks (attribute pass/fail to a specific gap-cycle fix):**
- **D-UAT-24-04 (24-11, shim overwrite-by-identity):** the `steam_api.dll` next to `Reuben.exe` in the
  bridge bottle is the 805888-byte bridge shim, NOT HOARD's own ~118368-byte copy.
  **Authoritative check = file size** (`stat -f %z` → 805888 = bridge shim; ~118368 = game's own);
  secondary `grep -ac 127.0.0.1 <dll>` (bridge shim = 1, game's own = 0). (`grep 54550` is a false
  negative — port not stored as ASCII.)
- **D-UAT-24-05 (24-12, bridge AcfSource):** the Install badge STAYS "Installed" after the install
  poll grace window and does not revert to "Install" (proves the poll read the bridge-bottle
  StateFlags=4 manifest for 63000, not the native-32-bit-Mac or Phase-17-bottle record).
- **D-UAT-24-02/03 (24-13, install-poll wiring + launch existence-gate):** Play launches the real
  `Reuben.exe` — not the fire-and-forget no-op at a non-existent bridge-bottle path originally
  reported (D-UAT-24-02) — and does so on the first attempt without a prior session failure poisoning
  this launch (sticky-flag clear verified working).

**Result:** PENDING (retest after gap cycle 24-11/24-12/24-13)
**Part A (init through bridge):** _(PASS/FAIL — log excerpt)_
**Part B (identity served):** _(PASS/FAIL — SteamID64 + persona)_
**Bottle listing (no steam.exe):** _(record `ls` output)_
**Evidence:** _(log paths, screenshots)_

---

## UAT Findings

### D-UAT-24-01 (BLOCKER — found + FIXED 2026-07-21, real macOS) — bridge helper ENOENT: `publicDir` mis-resolved by electron-vite chunking

**Reported (Gate 4 / HOARD attempt):** clicked Play on already-installed HOARD → "steam bridge
unavailable" error; the D-05 fallback offered but the game did not run; a second Play showed no error
but also did not start.

**Root cause (from `~/Library/Logs/GameLib/gamelib.log`):**
```
spawnHelperIfNeeded: spawning the shared bridge helper from .../build/public/bin/arm64/darwin/steam-bridge-helper (D-03)
bridge helper process error Error: spawn .../build/public/bin/arm64/darwin/steam-bridge-helper ENOENT
ensureBridgeHelperReady: bridge helper unreachable within the poll budget for appId 63000 (D-06)
SteamGame: bridge helper not ready for appId 63000 (status=unreachable) — not launching (D-05/D-06)
```
The helper binary is fine (Gate 1 proved it end-to-end). The bug was purely path resolution:
`constants/paths.ts` computed `publicDir = resolve(__dirname, '..', …)`, which assumes `__dirname`
is `build/main`. electron-vite code-splits the main bundle into `build/main/chunks/*`, so `__dirname`
is `build/main/chunks` (one level deeper) and every hop shifted — `public` became `build/public` (dev),
and the packaged path pointed at `build/main/bin` instead of `build/bin`. This silently mis-resolved
**every** bundled asset (helper, shim, icon, preload, locales), and the packaged app (Gate 2) would
have failed identically. The "unreachable" gate then correctly refused to launch (no no-identity
launch, D-05/D-06) — so the D-05/D-06 failure surface behaved as designed; the defect was upstream.

**Fix (commit `87c0ef82`):** anchor `publicDir` on `app.getAppPath()` (project root in dev, asar root
when packaged) + the `build/` output root — depth-independent, mirroring the existing
`main_window.ts:72` `build/preload` lookup. Helper now resolves to `<repo>/public/bin/…` (dev) and
`<asar>.unpacked/build/bin/…` (packaged), both of which exist. 3 steam test suites had inline electron
mocks missing `getAppPath` (real Electron always has it); added a plain-method `getAppPath` to each.

**Verification:** full jest suite back to baseline (1813/1813 tests, 102/103 suites — only the unrelated
Phase 27 `bootstrap.test.ts` red); `codecheck` clean. Packaged app **rebuilt** — the built chunk now
computes `resolve(app.getAppPath()…)`, and the resolved helper path
(`app.asar.unpacked/build/bin/arm64/darwin/steam-bridge-helper`) exists; no stale `build/main/bin`.
**Gates 2–4 retest PENDING** on the rebuilt app (fully quit + relaunch `dist/mac-arm64/GameLib.app`
first — a session that already hit the not-ready gate may have marked the AppID bridge-failed for that
run; `markBridgeFailedThisSession` clears on restart).

### D-UAT-24-02 (MAJOR — found 2026-07-21, real macOS) — bridge launch no-ops when the game is "installed" via a NON-bridge path (bridge bottle never provisioned)

**Reported (HOARD / Gate 4, on the D-UAT-24-01-fixed build):** clicking Play shows no error; the button
greys for <1s then reverts; game never starts.

**What works now (D-UAT-24-01 fix confirmed end-to-end):** the bridge helper spawns from the correct
path, `SteamAPI_Init` loads `steamclient.dylib`, caches the real SteamID `76561197995867096`, and
`LISTEN`s on `127.0.0.1:54550`. `resolveBridgeLaunchExe` resolves HOARD → `Reuben.exe`. So the bridge
infrastructure is alive.

**Root cause:** HOARD's GameLib record is `is_installed: true`, `mac_arch: "32"`, `platform: "Mac"`,
`install_path = ~/Library/Application Support/Steam/steamapps/common/Hoard` — i.e. it is "installed" only
as the **32-bit native Mac** build (unusable on Apple Silicon, which is why it is correctly
bottle/bridge-eligible). It was **never installed through the bridge**, so the `GameLibSteamBridge` bottle
does not exist (`~/…/CrossOver/Bottles/` has only Epic/GOG/GameLibSteam) and there is no Windows depot +
placed shim. `launch()` routes to the bridge, builds the bridge-bottle exe path
(`…/GameLibSteamBridge/…/Hoard/win32/Reuben.exe`), and fire-and-forgets `runWineCommand({ wait:false })`
at a **non-existent exe in a non-existent bottle** → wine exits instantly, empty `launch.log`, button
reverts. (A stray Windows HOARD copy also exists in the old Phase-17 `GameLibSteam` bottle, unrelated to
the bridge path.)

**Two gaps:** (1) "installed" for a bridge-eligible game is satisfied by a non-bridge install (native
32-bit Mac, or old bottle) that the bridge cannot launch — the install-state model and the bridge launch
target disagree; (2) `launch()` does not verify the resolved exe / bridge bottle exists before firing
wine — it should provision+install into the bridge bottle (24-08 inline-provision contract) or surface
the D-05 `steamBridgeSetupRequired` dialog, not silently no-op.

**Immediate workaround for gate testing:** exercise the bridge with a game that has **no** competing
native/old-bottle install — install **Avernum 6** (Windows-only, 206060, not yet installed) fresh from
GameLib so the full bridge install path runs (provision `GameLibSteamBridge` → download Windows depot →
`importScan` → place shim → launch). Route the two gaps to `/gsd-plan-phase 24 --gaps`.

### D-UAT-24-03 (MAJOR — found 2026-07-21, real macOS; root fix landed, full recovery needs a gap cycle) — bridge fails for Windows-only titles with an UNTAGGED launch entry; sticky bridge-failed flag then cascades

**Reported (Avernum 5, 206040, installed fresh to exercise the bridge):** install threw "steam bridge
unavailable"; retry "installed fine"; pressing Play does nothing (button greys <1s, reverts).

**Root cause (fixed, commit `f0b7e82c`):** `resolveBridgeLaunchExe` required `config.oslist === 'windows'`
exactly. Avernum 5's PICS `config.launch` entry has **no oslist tag** (old Spiderweb Windows-only title),
so `find()` returned nothing → `no windows launch entry found` → the bridge install could not place the
shim → install failed. Fix: prefer an explicit windows-tagged entry, else fall back to a single UNTAGGED
entry (never a mac/linux-tagged one). Avernum 4/Hoard never caught this — both tag `oslist=windows`.

**Cascade (still open → gap cycle):**
1. **Sticky bridge-failed flag.** The failed first install called `markBridgeFailedThisSession(206040)`;
   `isBridgeEligible()` consults that set, so for the rest of the session both install AND launch skip the
   bridge. The retry install therefore ran the **native depot** path (StateFlags=4), and Play ran the
   **bottled-Steam** path (`steam.exe -applaunch 206040` in `GameLibSteam`, where the game isn't) → no-op
   (`raiseFrontmostBottledProcess: no matching process`). A single recoverable failure poisons the whole
   session until restart; it should clear on a successful (re)install.
2. **Wrong install record.** The native fallback recorded `install.install_path = …/GameLibSteam/…`
   (wrong bottle) while the files actually landed in `…/GameLibSteamBridge/…`.
3. **Shim not placed.** The `steam_api.dll` next to `Avernum 5.exe` is the **game's own** (118368 bytes,
   no `54550`), NOT GameLib's bridge shim (805888 bytes) — because shim placement only happens on the
   bridge install path, which failed.

**Verified working underneath all this:** bridge helper spawn + `SteamAPI_Init` + real SteamID + `LISTEN`
54550 (from the HOARD/Avernum attempts), bridge-bottle provisioning (`GameLibSteamBridge` created), depot
download into the bridge bottle. The mechanism is sound; the **appinfo-launch resolution + failure
recovery + install/launch routing** are what broke.

**Recovery to retest:** rebuild (done, `electron-vite build`), fully **restart GameLib** (loads the fix +
clears the sticky flag), then do a **clean reinstall** of Avernum 5 so the bridge path re-runs and places
the real shim — the current install is messy (game's dll, wrong record) and uninstall is itself broken
(D-UAT-24-02), so the messy state must be cleared manually first. **Route the cascade (sticky-flag
recovery, install-record correctness, D-UAT-24-02 launch/uninstall) to `/gsd-plan-phase 24 --gaps`.**

### D-UAT-24-04 (BLOCKER — found 2026-07-21, real macOS) — bridge shim NEVER overwrites the game's own `steam_api.dll` (existence-guarded placement)

**Found** after the D-UAT-24-03 resolver fix let the install reach shim placement. Log:
`placeShimForGame: shim already present at "…/Avernum 5/steam_api.dll" … (idempotent, no-op)` — but the
file there is the **game's own** `steam_api.dll` (118368 bytes, no `54550`), not GameLib's shim (805888).

**Root cause:** `shimGenerate.ts:148` guards placement with `if (existsSync(shimPath)) return` — pure
file **existence**. The game's depot ships its own `steam_api.dll` at exactly `shimPath`, and the depot
download runs **before** `placeShimForGame`, so the guard **always** short-circuits and the real bridge
shim is never copied over the game's copy. The entire purpose of the shim is to **replace** the game's
`steam_api.dll`; the existence guard makes it a no-op for every game that bundles one (≈ all of them).
The acceptance spikes placed the shim by hand, so this never showed until the real GameLib install flow.
**Fix direction:** place by identity, not existence — overwrite unless the target is already byte-identical
to `builtBridgeShimPath` (compare size/hash), after the coverage check. This is the fundamental
"does the bridge engage at all" bug.

### D-UAT-24-05 (MAJOR — found 2026-07-21, real macOS) — bridge install reverts to "Install" (install-poll doesn't detect the bridge-bottle manifest)

**Reported:** clicking Install on Avernum 5 completes, then the button reverts to **Install** (not
installed). **Log:** `Writing StateFlags=4 full-ownership manifest for appId 206040` (ACF **is** written
to the bridge bottle, confirmed on disk: `StateFlags "4"`, `installdir "Avernum 5"`) — yet
`install polling for appId 206040 stopped after grace window (20 ticks) — no manifest detected; user may
have cancelled`. The post-install poll looks for the manifest in the wrong location (native Steam library
vs the `GameLibSteamBridge` bottle steamapps), so it concludes not-installed and the badge reverts.
**Fix direction:** the bridge/bottle install's readiness poll must read the bridge-bottle ACF it just
wrote (`getBottleSteamappsDir(bridgeBottle)`), not the native library path.

### VERDICT (2026-07-21, updated by gap-closure plan 24-14): bridge mechanism proven; install→shim→launch integration cluster CLOSED — Gates 2-4 re-pointed to PENDING retest

Gate 1 (R1 vtable round-trip) **PASS**. The low-level bridge is sound (helper spawn + `SteamAPI_Init` +
real SteamID + `LISTEN` 54550; bridge-bottle provisioning; depot download all verified live). The
GameLib integration layer had a **cluster** of defects the two hand-picked acceptance games never
exposed: D-UAT-24-01 (publicDir, FIXED `87c0ef82`), D-UAT-24-02 (launch no-op / install-state for
already-installed, **CLOSED by 24-13** — `launchBridgeGame` existence-gate before `runWineCommand`),
D-UAT-24-03 (untagged launch entry — root FIXED `f0b7e82c`; sticky-flag cascade + install-record
**CLOSED by 24-13** — `clearBridgeFailedThisSession` un-poisons on success), D-UAT-24-04 (shim never
overwrites the game's dll, BLOCKER, **CLOSED by 24-11** — byte-identity overwrite guard replaces the
existence guard), D-UAT-24-05 (install-poll wrong manifest location, **CLOSED by 24-12/24-13** — new
`'bridge'` AcfSource + `getBridgeBottleSteamappsRoot()`, wired into `installBridgeGame`'s
`pollerSource`). All three gap plans (24-11/24-12/24-13) landed with green `codecheck` + jest and
individual task commits (`88d20973`, `e07e85b3`, `b4bc94e8`). **This plan (24-14) does not re-run the
gates** — it re-points Gates 2/3/4 (R5/R6) from ⛔ BLOCKED back to `PENDING (retest after gap cycle
24-11/24-12/24-13)` with rebuild + clean-reinstall preconditions and per-fix verification hooks, so a
fresh human-hardware run on real Apple-Silicon hardware can attribute each result to a specific fix.
Any FAIL on retest routes to a further gap cycle.

### RETEST RUN 1 (2026-07-21 ~16:03, packaged .app rebuilt at 15:01, HEAD 8afd58e9) — gap-cycle fixes CONFIRMED working; two NEW blockers surfaced

Fresh install of **Avernum 5 (206040)** through GameLib's bridge path on real Apple-Silicon hardware.

**✅ Gap-cycle fixes verified LIVE (gamelib.log 16:03:00–16:03:13):**
- **D-UAT-24-04 (24-11 shim overwrite) PASS** — `placeShimForGame: overwrote steam_api.dll for appId 206040 at ".../GameLibSteamBridge/.../Avernum 5/steam_api.dll" (2 imported symbol(s) covered)`. On-disk confirm: shim = **805888 bytes**, `grep -ac 127.0.0.1` = 1 (bridge shim, not the game's own).
- **D-UAT-24-05 (24-12 bridge install poll) PASS** — `starting install polling … source bridge` → `install polling complete … badge flipped to installed`. `Writing StateFlags=4 … manifest` into the bridge bottle.
- **24-13 launch existence-gate PASS** — exe existed → launched via bridge instead of no-op: `launching appId 206040 via the Steam bridge (.../Avernum 5/Avernum 5.exe)`.
- Depot download into the bridge bottle, full `Data/` dir + real 7.8MB PE32 exe present. Bridge helper alive + `LISTEN 127.0.0.1:54550`.

**⛔ NEW-1 (BLOCKER) D-UAT-24-06 — bridge launch uses GPTK, not CrossOver → game exits instantly.**
`launchBridgeGame` calls `runWineCommand({ gameSettings: getBridgeBottleSettings(), wait:false })`.
`getBridgeBottleSettings()` (bottle.ts:286-287) returns `wineVersion: storedWineVersion ?? globalSettings.wineVersion`; no bridge CrossOver wine is stored, so it falls back to the GLOBAL default `Game-Porting-Toolkit-latest` (GPTK) — logged `Checking if wine version exists: Game-Porting-Toolkit-latest` right before launch. The bridge bottle was CREATED by `cxbottle` (CrossOver) and `Avernum 5.exe` is **32-bit (PE32 Intel 80386)**; GPTK running a CrossOver bottle + 32-bit exe fails instantly. Evidence: launch.log EMPTY (`wait:false` swallows output), no game process alive (only `winedevice.exe` + helper), helper logged ZERO connection activity for the 16:03 launch (shim never reached `SteamAPI_Init`).

**CONFIRMED via standalone runtime probe (2026-07-21):** GPTK ships ONLY `wine64` + `wine64-preloader` (64-bit-only toolkit, `type:"toolkit"`, `bin=.../wine/bin/wine64`); it has NO 32-bit `wine` loader. Running the 32-bit `Avernum 5.exe` (PE32 Intel 80386) directly under GPTK `wine64` aborts instantly with `Assertion failed: (end <= pages_vprot_size << pages_vprot_shift), function alloc_pages_vprot, virtual.c:1032` → `err:seh:NtRaiseException Exception frame is not in stack limits` — the exact instant-exit / empty-log signature. **Positive control:** the SAME exe under CrossOver's multi-arch `wine` (`/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine --bottle GameLibSteamBridge`) did NOT abort — it loaded and kept running 2+ min (the bottle has `syswow64`, WoW64-capable). Root cause is definitive: **GPTK `wine64` cannot execute the 32-bit bridge games; the bridge must launch with CrossOver's `wine`.**

**Fix direction:** the bridge launch must resolve a CrossOver WineInstallation (the runtime that created the bottle via `cxbottle`), the way Phase 17's bottled-Steam launch resolves its runtime (`checkWineBeforeLaunch` / `persistBottleWineVersion`), NOT inherit `globalSettings.wineVersion` (GPTK). `getBridgeBottleSettings()` (bottle.ts:286-287) is the fix locus — its `wineVersion` fallback must be a CrossOver install, not the global default.

**⚠ NEW-2 (MAJOR) D-UAT-24-07 — periodic library sync clobbers the bridge-installed badge.**
Install poll correctly flips the badge to "installed", but the periodic Steam library sync (`fetched 378 owned games` / `Steam library sync complete`, fires again post-launch at 16:03:18) re-derives install state WITHOUT reading the bridge-bottle ACF, resetting `is_installed:false` → button flashes Play→Install→Play and ultimately reverts to **Install**. 24-12 taught the install POLL to read the bridge bottle; the periodic SYNC / library-load path still doesn't. **Fix direction:** the Steam library install-state derivation (not just the install poll) must consult the bridge-bottle ACF (`getBridgeBottleSteamappsRoot`) for bridge-eligible titles.

**Also observed:** `steam_appid.txt` is absent next to `Avernum 5.exe` (helper carries identity 480; unclear yet if the game's own path needs it — revisit after NEW-1). Uninstall of a bridge game succeeds on the backend (`removed bridge install … Finished uninstalling`) but the frontend "Uninstalling" pill doesn't clear because `markBridgeGameUninstalled` emits `pushGameToLibrary` but no `gameStatusUpdate: done` (cosmetic; folded into D-UAT-24-07 sync/status family).

**Disposition:** the install→shim→poll cluster (24-11/12/13) is CLOSED and hardware-verified. Gates 3/4 remain **BLOCKED** on NEW-1 (bridge launch runtime) — no game has yet reached playable single-player through the bridge. Route NEW-1/NEW-2 to a follow-up gap cycle (`/gsd-plan-phase 24 --gaps`) or `/gsd-debug`.

### RETEST RUN 2 (2026-07-21 ~17:16, packaged .app rebuilt at 17:01 with gap cycle 2) — bridge LAUNCH now works end-to-end

Launched **Avernum 5 (206040)** from the rebuilt .app.

**✅ D-UAT-24-06 (24-15 CrossOver runtime) CLOSED — hardware-confirmed.** gamelib.log 17:16:52: `Checking if wine version exists: CrossOver (bridge bottle runtime)` → `Running Wine command: .../Avernum 5/Avernum 5.exe`. The game LAUNCHED under CrossOver wine (no GPTK `alloc_pages_vprot` abort) and reached its initial dialog THROUGH THE BRIDGE. Avernum 5 then crashed post-dialog — **its own CrossOver-compat issue (same family as Avernum 4), NOT a bridge defect** (user-confirmed; Avernum 6/HOARD expected to run fine). This is the first game to reach in-bridge UI on macOS — the launch-runtime blocker is gone.

**✅ D-UAT-24-07 (24-16 badge durability):** badge behaved (user proceeded to launch without the Play→Install flapping observed in Run 1).

**⚠ NEW D-UAT-24-08 (MAJOR, non-blocking) — shared bridge helper is not killed on app quit; lingers and blocks new binds.** gamelib.log 17:16:51: the app spawned a fresh helper which hit `bridge helper: FATAL bind 127.0.0.1:54550 failed` → `bridge helper exited (code=4)`. Root: the D-03 shared helper **PID 42319, spawned at 15:24, survived every subsequent app quit/relaunch** and still holds `127.0.0.1:54550 (LISTEN)` (confirmed via `lsof`). The game still worked because its shim connected to that lingering helper — but this is fragile: a new session's helper can never bind while a stale one lives, and if the stale one had died there'd be no helper. **Fix direction:** kill the shared helper on app quit (lifecycle teardown) AND/OR have `ensureBridgeHelperReady()`/`spawnHelperIfNeeded` detect a healthy existing helper on 54550 and REUSE it instead of spawning a duplicate that FATALs on bind. **Mitigation for remaining gates:** `pkill -f steam-bridge-helper` before each cold launch. Route to a follow-up gap cycle / `/gsd-debug`.

### Environment issues (separate from Phase 24 acceptance — tracked, not bridge defects)

Surfaced 2026-07-21 during Gate 2–4 setup; **not caused by Phase 24 and not Phase 24 acceptance items.**
User decision: set aside, run the gates on the packaged app, revisit separately.

- **E-01 — Steam login lost when switching builds (app-identity split).** Two parallel userData stores
  exist: `~/Library/Application Support/gamelib/` (dev build — Electron app name `gamelib`) and
  `.../GameLib/` (packaged app — electron-builder `productName: GameLib`). `package.json` has no
  `productName`, so the dev and packaged builds use different identities → the safeStorage-encrypted
  Steam refresh token saved under one is unreadable under the other → appears logged out on switch.
  **Mitigation for gate testing:** use ONLY the packaged `dist/mac-arm64/GameLib.app` and log into Steam
  once there. Candidate real fix (project-wide, out of Phase 24 scope): set `productName` so both builds
  share one identity/userData.
- **E-02 — Crash during Steam re-login.** No crash dump written; `gamelib.log` had no login-flow lines
  before it stopped, so cause is uncaptured. Steam auth path (Phase 17 area), pre-existing, unrelated to
  the bridge. Needs the error text + stack from the launch console to diagnose → route to `/gsd-debug`
  if it recurs.

## Summary Table (fill in after all gates are run)

| # | Gate | Requirement | Result | Notes |
|---|------|-------------|--------|-------|
| 0a | codecheck (tsc) | — | ✅ PASS | Clean, exit 0 (2026-07-21). |
| 0b | Full jest suite | — | ✅ PASS (Phase 24 scope) | 1813/1813 tests pass; 102/103 suites. 2 out-of-scope reds: Phase 27 `bootstrap.test.ts` circular import + pre-existing `library.ts` leaked timer. Neither is a Phase 24 regression. |
| 0c | Packaged `.app` + bundled helper | R5 | ✅ PASS | `dist/mac-arm64/GameLib.app`; helper `Mach-O arm64` at `…/app.asar.unpacked/build/bin/arm64/darwin/steam-bridge-helper`. |
| 1 | R1 vtable round-trip | R1 | ✅ PASS | Generated shim vtable slot 2 `GetSteamID()` → production helper → real SteamID64 `76561197995867096` (string-equal). 2026-07-21. |
| 2 | R5 packaged bundled-helper | R5 | PENDING (retest) | Gap cycle 24-11/24-12/24-13 closed D-UAT-24-02/03/04/05 (shim overwrite, bridge AcfSource poll, launch existence-gate, sticky-flag clear). Re-pointed for fresh retest by 24-14. |
| 3 | R6 Avernum 5/6 | R6 | PENDING (retest) | Shim-overwrite (24-11) + install-poll (24-12) + install/launch wiring (24-13) fixes landed for D-UAT-24-04/05/03-cascade. Re-pointed for fresh retest by 24-14. |
| 4 | R6 Hoard | R6 | PENDING (retest) | Launch no-op (D-UAT-24-02) closed by 24-13's existence-gate; shim/poll fixes (24-11/24-12) also apply. Re-pointed for fresh retest by 24-14. |

**Gate status:** Gate 0 PASS, Gate 1 (R1) PASS. Gates 2–4 (R5/R6) PENDING retest — re-pointed from
BLOCKED by gap-closure plan 24-14 now that 24-11/24-12/24-13 closed the install→shim→launch
integration cluster. Phase 24 is not complete until Gates 1–4 all PASS (21-UAT.md/23-UAT.md
precedent). Any FAIL on retest → a further `/gsd-plan-phase 24 --gaps` cycle.

---
*Prepared: 2026-07-21 by Plan 24-10 (Wave 5, `--interactive`). Automated pre-req (Gate 0a/0b) recorded
by the orchestrator; Gate 0c + Gates 1–4 await human execution on real Apple-Silicon hardware.*
