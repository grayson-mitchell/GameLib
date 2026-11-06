---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
verified: 2026-10-25T15:10:00Z
status: passed
score: "done-when MET (10 of 18 measured 2026-10-25; 11 of 18 derived 2026-10-26 with Overlooting, majority: yes); Overlooting now verified live (53-UAT item 36), Ranch Simulator passed by override (deferred, accepted by user 2026-10-25)"
overrides_applied: 1
retired_overrides:
  - must_have: "Modern-SDK named title Overlooting 3410180 reads verified"
    retired_at: "2026-10-26"
    reason: "No longer needed: quick 261026-rqb fixed the shim's string-return decoding, and the live gate on the rebuilt packaged bundle (53-UAT item 36, 2026-10-26 20:09) read census `verified` for 3410180: HELLO, GINIT ok=1, 2 distinct game CALLs incl. identity (SteamUser023.GetSteamID, SteamFriends018.GetFriendPersonaName), no NOVER, no reroute. Todo closed: .planning/todos/completed/2026-10-25-overlooting-godot-null-call-before-shim.md."
    originally_accepted_by: "user (Grayson Mitchell)"
    originally_accepted_at: "2026-10-25T15:20:00+13:00"
overrides:
  - must_have: "Modern-SDK named title Ranch Simulator 1119730 reads verified"
    reason: "Deferred to SteamStub / Phase 52 work. The title is SteamStub-wrapped (no HELLO), and the phase text scopes the SteamStub forwarder out (Phase 52)."
    accepted_by: "user (Grayson Mitchell)"
    accepted_at: "2026-10-25T15:20:00+13:00"
re_verification:
  previous_status: "gaps_found"
  previous_score: "9 of 18 verified (1/4 roadmap truths)"
  gaps_closed:
    - "Done-when majority: now 10 of 18 (majority: yes), re-run in this verification"
    - "D-53-15 init-only rule implemented (shim CONTROL slot 5 REPORT_INIT, helper GINIT, census branch) and Avernum 6 206060 verified"
    - "WR-01 emitHiddenFallback fail-closed for non-scalar dropped returns (meta/gen_vtables.ts)"
    - "WR-02 bottleDllOverrides success requires code === 0"
    - "Overlooting 3410180 verified (2026-10-26, after this verification): quick 261026-rqb string-return decode; 53-UAT item 36 census `verified`, 2 distinct game CALLs incl. identity"
  gaps_remaining:
    - "Ranch Simulator 1119730: no HELLO (SteamStub DRM)"
  regressions: []
gaps:
  - truth: "Modern-SDK named title Ranch Simulator 1119730 reads verified"
    status: failed
    reason: "Census: 'unverified (no HELLO)'. SteamStub DRM wrapped; the phase text itself scopes the SteamStub forwarder to Phase 52."
    artifacts:
      - path: "meta/bridgeCensus.ts"
        issue: "Measured: no HELLO for 1119730"
    missing:
      - "SteamStub handling (Phase 52 territory)"
human_verification: []
---

# Phase 53: Steam bridge coverage (modern-SDK exports, flat API) Verification Report (third verification)

**Phase Goal:** Engine-wrapper titles using the native Steam bridge get Steam initialised inside the game (HELLO + clean game-side init log; no log = unverified; In-Game never counts). Done when the census Evidence column reads `verified` for a majority of Steamworks-using titles in a re-run sample containing the seven named titles.
**Verified:** 2026-10-25
**Status:** gaps_found (done-when met; two named-title roadmap truths still fail; deferral candidates listed for the user)
**Re-verification:** Yes (third)

## Census (run by me, `pnpm bridge-census`)

```
17 of 18 routed to the bridge; 10 of 18 verified running through the bridge (HELLO + clean game log; 0 init-failed, 8 unverified); 2 of 18 play recorded in the allowlist; ...
10 of 18 Steamworks-using rows verified (majority: yes)
```

Row 206060: `| 206060 | Avernum 6 | Avernum 6 | x86 | bridge | yes | verified |  |`

Verified rows (10): 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 206060, 230070, 427410, 648410. The criterion was not relaxed; nothing was rerouted to bottled Steam. The count matches the quick-kax SUMMARY.

Unverified (8): 200510 (no bottle, known-bad), 206020 (no bottle), 1119730 (no HELLO), 284100 (no HELLO), 219990 (no game-originated call), 3410180 (1 call), 411300 (1 call, known-bad), 648800 (no game log).

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Done-when: majority verified in re-run sample containing the seven | VERIFIED | 10 of 18, "majority: yes". Margin is exactly one row (Avernum 6), see risk note |
| 2 | Flat-API three (Vampire's Fall, Planet Crafter, Rogue Waters) verified | VERIFIED | all `verified` in census |
| 3 | Modern-SDK four (Hell Clock, Mining Mechs, Overlooting, Ranch) verified | FAILED (2 of 4); 3 of 4 as of 2026-10-26 | Hell Clock, Mining Mechs verified; Overlooting 1 game call (verified 2026-10-26, see addendum); Ranch no HELLO (override) |
| 4 | Census verdict honest and strict (D-53-13, D-53-15 narrow) | VERIFIED | code and tests read, see below |

Of the seven named titles: five verify; Overlooting and Ranch do not. As of 2026-10-26, six verify; only Ranch does not.

## D-53-15 confirmed in code

- `meta/bridgeCensus.ts` `isInitOnlyImportSet(symbols)`: true only if non-empty AND every symbol is in {SteamAPI_Init, InitSafe, InitFlat, SteamInternal_SteamAPI_Init, SteamAPI_Shutdown}. A `<dll>@runtime-loaded` marker or any interface accessor makes it false. Caller (line ~2021) also forces false for unscanned IL2CPP (`managed?.kind !== 'il2cpp'`).
- `classifyBridgeEvidence`: no HELLO -> unverified first; then, only when `initOnlyImports === true`, verdict is strictly `findGameInit`: returns verified only for a `GINIT` line with `ok=1` AND `session=1`, scanned after the first HELLO, anchored at payload start (forged GINIT inside a FWD payload is rejected), fn restricted to a closed set. Missing line -> `unverified (no game init line)`; ok=0 or session=0 -> `unverified (game init failed)`. Init-only rows never fall through to engine logic. Without the flag GINIT verifies nothing.
- Producer side: shim reports via CONTROL slot 5 from the game's own SteamAPI_Init / SteamInternal_SteamAPI_Init (generated from `meta/gen_vtables.ts`); helper logs `GINIT` only from the wire handler, capped per process; the helper's own in-process InitFlat logs under `INIT`, so it cannot forge GINIT. In-Game status is not an input.
- Tests (`meta/__tests__/bridgeCensus.test.ts`, describe "quick 261025-kax (D-53-15)"): isInitOnlyImportSet, success, session=0 / ok=0, HELLO-alone / no HELLO / GINIT-before-HELLO / other appid / unknown fn, forged FWD payload, helper INIT never evidence, flag-off godot/unknown. I ran jest on bridgeCensus, gen_vtables and bottleDllOverrides: 3 suites, 324 tests pass.

## WR-01 / WR-02 confirmed in code

- WR-01: `emitHiddenFallback` in `meta/gen_vtables.ts` now throws at generation for any dropped RAX-form version whose `returnKind` is not int32/int64/pointer/string (plus the existing params>0 throw). Tests added in gen_vtables.test.ts (passing). IN-01 stale "not dispatched" comment also fixed via `isHiddenFallbackDispatched`.
- WR-02: `bottleDllOverrides.ts` now treats `result?.code !== 0` (missing, null, nonzero) as failure and logs code and truncated stderr; log-secret gate exemption comment added; test added (passing).

## Requirements / decisions

D-53-01..D-53-15 all implemented. D-53-11 remains partial only because Ranch Simulator does not verify. No REQUIREMENTS.md (not a failure). Advisory IN-02..IN-04 unchanged. Known full-suite failures (findDeadcode, testContainment, genI18nGateScope, machineFillGamelib) originate outside phase 53; not attributed here.

## Risk note

The majority margin is one row. Avernum 6 verifies by the D-53-15 init-only rule, which is a deliberately narrow, user-decided criterion (init success only, no call evidence). If that rule were reversed the count returns to 9 of 18.

## Deferral candidates (for the user to decide; NOT accepted by me)

1. Overlooting 3410180 -> `.planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md`. Rationale: crash fixed (53-19), HELLO present; second call blocked by a Godot null-call before the shim. Strict D-53-13 needs 2 calls. **Retired 2026-10-26**: verified live, see addendum; todo now in `.planning/todos/completed/`.
2. Ranch Simulator 1119730 -> SteamStub / Phase 52 work. Rationale: no HELLO under SteamStub DRM; phase text excludes "the SteamStub forwarder (Phase 52)".

If the user accepts both (e.g. via `overrides:` entries), status would become `passed`. Until then these two named-title truths are reported as failing, so status stays `gaps_found`.

## Addendum 2026-10-26 — Overlooting override retired

Quick task 261026-rqb found that the "Godot null-call before the shim" had a different cause: the
generated shim mis-decoded `[u32 len][bytes]` string returns. The fix decodes them, and
`meta/__tests__/stringReturnRoundTrip.test.ts` pins it. On the rebuilt packaged bundle, the live
gate read census `verified` for 3410180 at 2026-10-26 20:09 (53-UAT item 36), with these results:

- nvapi64 override applied, and no `page fault on read access to 0x0`
- HELLO, then `GINIT fn=SteamInternal_SteamAPI_Init ret=0 ok=1`
- 2 distinct game CALLs including an identity call: SteamUser023.GetSteamID and SteamFriends018.GetFriendPersonaName
- no NOVER, and no reroute to bottled Steam
- the operator reached the menu

The Overlooting override is retired, and Ranch Simulator is the only override left.

**The count is derived, not re-measured.** 11 of 18 is the 10 measured above plus 3410180. The
same rqb session re-ran 1691190, 1167950 and 1603180, and all three still pass (53-UAT items 37,
38, 41). A fresh `pnpm bridge-census` on 2026-10-26 21:5x printed `1 of 19 ... (majority: no)`.
That number measures log retention, not a regression. The census reads `~/Library/Logs/GameLib/gamelib.log*`,
and those files now only reach back to 2026-10-26 21:28 plus one 2026-10-25 15:10 file. Both the
phase-53 sessions and the rqb session have rotated out, and no archive was kept. To get a measured
number, run a fresh live session over the sample and then `pnpm bridge-census`.

_Verified: 2026-10-25_
_Verifier: Claude (gsd-verifier)_
_Addendum: 2026-10-26_
