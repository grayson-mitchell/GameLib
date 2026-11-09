# NotProton report: evidence notes

These are notes for writing the report yourself. NotProton's `CONTRIBUTING.md` asks for issue and
PR text written by hand, so this is a fact sheet, not text to paste. Nothing here names a Steam
account. Account names and SteamIDs in the raw logs stay out of the report.

## Where

A PR to `github.com/NotProtonNot/NotProton`, since the fix is one line. Their guide asks you to
check closed PRs first, so search issues and PRs for "ACK", "CEG" or "EVENT_MODIFY_STATE",
because `gh` wasn't logged in when this was written. Write the description by hand. The change
needs no code comment.

## The bug

`steam-shim/steam.cpp`, in the function that finds the ACK event (line 1708 at `b2f49e4`,
2026-10-24):

```c
ret = OpenEventW(SYNCHRONIZE, FALSE, di->ObjectName.Buffer);
```

Proton's `steam_helper/steam.c:848` (ValveSoftware/Proton `bc89621`), where this code was ported
from:

```c
ret = OpenEventW(SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE, di->ObjectName.Buffer);
```

`steam_drm_thread` then calls `SetEvent(start_ack)` without checking the result. Without
`EVENT_MODIFY_STATE`, wineserver rejects the `SetEvent`, the game's 30s wait on
`STEAM_START_ACK_EVENT_<pid>_<n>` times out, and a CEG title exits 0 with no window.

**Fix:** add `| EVENT_MODIFY_STATE` to the mask.

## Repro

- NotProton 1.2.1, CrossOver 26.3.0.39832 runner, macOS 27.0, Apple Silicon (Rosetta x86_64 wine).
- XCOM: Enemy Unknown (200510), Windows build, which is CEG. Launch from Steam on the NotProton
  compat tool. The dock icon appears, no window opens, and the game exits 0 after about 35s.
- With `WINEDEBUG=+sync %command%`:

```
00f0:trace:sync:sysv_NtCreateEvent access 0x1f0003, name L"STEAM_START_ACK_EVENT_236_14811188", type 0, state 0
00f0:trace:sync:NtWaitForSingleObject handle 0xd4, alertable 0, timeout -29.-9990000
00f4:trace:sync:NtOpenEvent access 0x100000, name L"STEAM_START_ACK_EVENT_236_14811188"
00f4:trace:sync:sysv_NtSetEvent handle 0xfc, prev_state 0x0
00f0:trace:sync:NtWaitForSingleObject -> 0x102
```

(`00f0` is the game and `00f4` is steam.exe's DIPC thread. `0x102` is STATUS_TIMEOUT.)

## Confirmation

A separate helper in the same prefix opened the same event twice and called `SetEvent` on each
handle:

```
SetEvent(SYNCHRONIZE handle)                      -> FALSE, GetLastError() = 5 (ACCESS_DENIED)
SetEvent(SYNCHRONIZE|EVENT_MODIFY_STATE handle)   -> TRUE
```

With the second ACK, the game's wait returned 0 (signalled) instead of timing out.

End-to-end test in NotProton's own shipped `steam.exe`: in `find_ack_event`, the
`mov ecx, 0x100000` before `OpenEventW` was binary-patched to `0x100002`. That's the one-flag
change, made without a rebuild. The trace then shows
`NtOpenEvent access 0x100002` → `NtSetEvent` → the game's `NtWaitForSingleObject -> 0`. The
session ends after 6s, not 35s. So in the PR description you can say it was tested by patching
the shipped binary, not by building from source.

## Be upfront about

With the ACK fixed, XCOM still exits 0 right after the ACK. So this fix is needed for CEG titles,
but it doesn't make XCOM start on its own. The step after the ACK (genuine Windows Steam answering
the `STEAMSTART` request) isn't handled. Say so, so it isn't read as "this fixes CEG games".

SteamStub titles are unaffected. Grim Dawn (219990) reached its menu on 1.2.1 as shipped.
