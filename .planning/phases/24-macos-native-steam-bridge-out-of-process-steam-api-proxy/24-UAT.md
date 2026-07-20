---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 10
artifact: uat
status: in_progress
requirements: [R1, R5, R6]
total_gates: 4
pending_gates: 3
passed_gates: 1
failed_gates: 0
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

**Status: NOT YET RUN.** This document is the prepared gate list + recording template (mirroring the
`21-UAT.md`/`23-UAT.md` precedent). Every `Result` below is `PENDING` until a human runs the
corresponding flow on real hardware and records the outcome here.

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

**Steps:**
1. Launch the PACKAGED `.app` (not a dev `yarn`/`vite` run).
2. Launch an allowlisted game (Avernum 6 or Hoard) so the bridge helper is spawned.
3. In Activity Monitor / logs, inspect the running `steam-bridge-helper` process's executable path.

**Expected result:** The running helper's path resolves **inside** the packaged `.app` bundle
(`…/app.asar.unpacked/build/bin/arm64/darwin/steam-bridge-helper`), NOT a dev/staged path. No
externally staged helper is present or used.

**Result:** PENDING
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

**Result:** PENDING
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

**Result:** PENDING
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
| 2 | R5 packaged bundled-helper | R5 | PENDING | Helper path inside the `.app` bundle; no staged binary. |
| 3 | R6 Avernum 6 | R6 | PENDING | Substituted for Avernum 4 (206020→206060; Avernum 4 doesn't run in CrossOver). Playable via bridge; init-through-bridge; Part B may be N/A (min imports); no steam.exe in bottle. Needs rebuilt packaged app (allowlist inlined at build). |
| 4 | R6 Hoard | R6 | PENDING | Playable via bridge; init + identity served (7 imports); no steam.exe in bottle. |

**Gate status:** 4 human-HW gates PENDING. Phase 24 is not complete until Gates 1–4 all PASS
(21-UAT.md/23-UAT.md precedent). Any FAIL → `/gsd-plan-phase 24 --gaps`.

---
*Prepared: 2026-07-21 by Plan 24-10 (Wave 5, `--interactive`). Automated pre-req (Gate 0a/0b) recorded
by the orchestrator; Gate 0c + Gates 1–4 await human execution on real Apple-Silicon hardware.*
