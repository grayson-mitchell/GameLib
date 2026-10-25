# 53-19 NvAPI override experiment: Overlooting 3410180

## Method

Bottle `GameLibSteamBridge-3410180`, CrossOver's `wine --bottle <name>` run from the game directory
with `CX_DEBUGMSG=+loaddll,+seh,+process` and `CX_ROOT`, each run bounded by `perl -e 'alarm 45'`
and followed by a `wineserver -k` scoped to this bottle (`WINEPREFIX` + `CX_ROOT`), the same
invocation shape as 53-15. GameLib, the helper and any Overlooting process were confirmed stopped
first. `user.reg` and `cxbottle.conf` were backed up and hashed before the arms.

Real-profile arm (fake-HOME convention): the subject is the operator's real bottle under the real
HOME, because the defect is what that bottle's Wine provides. No hand-rolled HOME/XDG env literal;
only `CX_DEBUGMSG` and `CX_ROOT` were set. The game exe basename `Overlooting.exe` was re-confirmed
in `steamapps/common/Overlooting/`.

HELLO is not expected: no GameLib helper was running, so the shim cannot connect.

## Arms

| Arm | Mechanism | nvapi64 loaded | rip=0 fault | godot.log |
| --- | --------- | -------------- | ----------- | --------- |
| A | baseline, no override | yes (builtin, mapped at 0x6ffffccd0000) | yes: access violation addr=0, return rva 607f1 | 0 bytes (no progress) |
| B | per-exe `AppDefaults\Overlooting.exe\DllOverrides` nvapi64="" | no (`Failed to load module "nvapi64.dll"; status=c0000135`, Godot skips the block) | no (0 access violations at addr 0) | 614 bytes: GLES3 renderer line, then GodotSteam init lines (`Steam is running!`, `getFriendPersonaName`), game keeps running to the 45 s bound |

Arms C and D were not run, because B cleared the fault.

## Result

Arm B works: per-exe registry override, run through the bottle's wine.

`reg add "HKEY_CURRENT_USER\Software\Wine\AppDefaults\Overlooting.exe\DllOverrides" /v nvapi64 /t REG_SZ /d "" /f`

As commandParts: `['reg','add','HKEY_CURRENT_USER\\Software\\Wine\\AppDefaults\\Overlooting.exe\\DllOverrides','/v','nvapi64','/t','REG_SZ','/d','','/f']`.

The override is scoped to `Overlooting.exe` only, so other titles' D3DMetal NvAPI use is unaffected.

## Restore proof

`user.reg` and `cxbottle.conf` were restored from the backups and `cmp` reported identical.
sha256 before and after:

- user.reg `5aa19947d60a8d10ff8b39efbec06819a3979d75b20668d51b34fd189226f1f6` (equal)
- cxbottle.conf `e47b222dbaa73e5410569719bf35ca6c743afd14b162e2812f5308f7189ab8af` (equal)

`pgrep` for overlooting and wineserver is empty. Raw traces were deleted from the scratchpad. The
live override must come from the Task 2 code path, not from this experiment.
