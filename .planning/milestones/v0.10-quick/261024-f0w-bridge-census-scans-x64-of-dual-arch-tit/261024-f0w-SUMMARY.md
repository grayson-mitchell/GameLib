---
quick_id: 261024-f0w
status: complete
date: 2026-10-24
commits:
  - 4f65448a4
  - 376c41e11
  - 1b2f315b3
---

# Quick 261024-f0w: bridge census scans the x64 exe of dual-arch titles

`pnpm bridge-census` now scans the exe whose arch matches the persisted `steam_metadata.json` `<appId>.bridge.scan.arch` verdict, and "verified" means a gamelib.log HELLO for the appid plus a clean Unity Player.log in the per-game bottle.

## What changed

- `meta/bridgeCensus.ts`: `readPersistedScanArch` (total over malformed input), `selectCensusExe` (pure), `chooseExe` now objdumps every candidate. With no verdict on a dual-arch install the first importer is kept and the detail says the arch is unconfirmed.
- `classifyBridgeEvidence` (pure) plus driver reads of `gamelib.log` / `gamelib.log.old` and `Player.log`. Rows carry `playRecorded`, `evidence`, `evidenceDetail` in place of `verified`. Shared bottles read `unverified (no per-game bridge bottle)`.
- Output columns are `Class (static scan) | Play recorded (allowlist) | Evidence`. The summary line still matches the 51-30 regex.
- Dual-arch todo moved to `.planning/todos/completed/` with a `## Closed` section. The flat-API todo's measurement caveat now points at the census Evidence column.

## Live `pnpm bridge-census` (real profile, read-only)

230070 row, verbatim:

```
| 230070 | The Age of Decadence | Age of Decadence | x64 | bridge | yes | unverified (no HELLO) |  |
```

1691190 row, verbatim:

```
| 1691190 | Rogue Waters | RogueWaters | none | no-steam-api | no | init-failed (SteamAPI_ISteamClient_GetISteamUser) | launch exe imports no steam_api and none ships in the install tree |
```

Summary line, verbatim:

```
18 of 19 routed to the bridge; 0 of 19 verified running through the bridge (HELLO + clean game log; 1 init-failed, 18 unverified); 2 of 19 play recorded in the allowlist; 15 of 19 symbols covered by the shim (static scan) (bridge=3, known-bad=3, missing-symbols=1, no-steam-api=12)
```

Result against the plan's expectations:

- 230070 reads arch x64 and class `bridge`, not `x86 | missing-symbols`. Matches.
- 1691190 reads `init-failed (SteamAPI_ISteamClient_GetISteamUser)`. Matches. Its class is `no-steam-api` with arch `none` (the exe imports no steam_api), a static-scan fact separate from the evidence.
- K is 0 of 19 verified: no title has both a HELLO in the current gamelib.log / gamelib.log.old and a found clean game log. 230070 has no HELLO in those logs. This is the honest consequence of the criterion, lower than the old playVerified-driven count, not a regression.
- For 51-30: its key_link "seed[].playVerified drives the census verified count" is stale; K now comes from the Evidence column.

## Verification

- `npx jest meta/__tests__/bridgeCensus.test.ts`: 41 passed.
- `pnpm codecheck`: clean. `npx prettier --check` on both changed source paths: clean. eslint on both: clean.
- `pnpm lint` exits 1 on 2 `no-regex-spaces` errors in `meta/__tests__/gen_vtables.test.ts` (not touched by this task; pre-existing, out of scope).
- `pnpm planning-gates`: 12/12 passed. Todo files are prettier-ignored (`--file-info` confirmed), so no prettier check was run on them.

## Deviations from Plan

- The first commit (4f65448a4) carried a fixture typing error that `tsc` flagged; fixed in follow-up 376c41e11. No other deviations.

## Self-Check: PASSED

Commits 4f65448a4, 376c41e11, 1b2f315b3 exist; the todo is only in completed/.
