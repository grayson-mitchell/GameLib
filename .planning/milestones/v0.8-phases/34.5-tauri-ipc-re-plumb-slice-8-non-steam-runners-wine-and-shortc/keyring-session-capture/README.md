# Keyring-arm session capture — 2026-08-14

Preserved evidence from the operator session that surfaced `F-34.5-G6-26`.

`gamelib-current.log` was copied from `~/Library/Logs/GameLib/gamelib.log` before any
relaunch could rotate it. It is the primary artifact: a genuine `keyring`-arm run whose log
contains **no keyring line of any kind**.

## What the log proves

| Check | Result |
|---|---|
| `[bootstrap] secret stores: keyring` | present (line 10) — the real arm, not the dev vault |
| `[dev-secret-vault]` lines | 0 |
| `Steam TokenStore implementation set to SidecarKeyringTokenStore` | present (line 7) |
| Steam login outcome | succeeded — `[refreshLibrary] runner=steam origin=steam-login`, 377+ titles |
| `SidecarKeyringSlotStore` / `keyring_get` / timeout / unavailable lines | **none** |

So `U-34.5-01`'s conditions (1)(2)(3) hold and (4) has no evidence either way — not because
the read failed, but because success was unobservable. That is `F-34.5-G6-26`.

## Operator observations (uninstrumented, item names not recorded)

- 2 Keychain prompts at launch
- 2 Keychain prompts during Steam sign-out
- 0 prompts on signing back in

**Not scorable, and deliberately not scored.** Without item names the launch prompts cannot be
attributed — 2 slots x 1 each (which would satisfy `U-34.5-10`) and 1 slot x 2 (which would
fail it) are indistinguishable. The log could not disambiguate either, since it recorded no
read attempts at all.

**The 0-on-re-login is NOT evidence the timeout/memo fix works.** `getToken()` short-circuits
on `this.cachedToken` before issuing any `keyring_get`, so a warm in-memory cache raises no
prompt by an entirely different mechanism. Commit `e76820d8d` adds the DEBUG `served from
cache` line precisely so a future run cannot conflate the two.

## Status

This session is a PILOT, not plan 34.5-58's run. It predates the session record 34.5-58 Task 1
must author, and it was not captured under the dual-sink standard. Its value is the finding.
`U-34.5-01` and `U-34.5-10` both stay OPEN.
