---
created: 2026-10-27
title: "Bridge helper's launch secret stays readable through ps eww after unsetenv"
severity: minor
platform: macos
ready: code
area: steam-bridge
found_by: "bridge HELLO secret live gate, 2026-10-27"
files:
  - native/steam-bridge/helper/bridge_helper.c
---

## Problem

The backend passes the per-launch secret to the helper in `GAMELIB_BRIDGE_SECRET`, not argv,
because argv is visible in `ps`. The helper copies the secret and then calls `unsetenv()`
(`bridge_helper.c:887-904`). On the 2026-10-27 live gate, `ps eww -p <helper pid>` still printed
`GAMELIB_BRIDGE_SECRET=<64 hex>`, and that value matched the cfg secret. `unsetenv()` only removes
the entry from libc's `environ`. The original env strings stay in the process's startup memory,
and macOS serves that block to `ps` through `KERN_PROCARGS2`.

## Exposure

This adds no new exposure today. Only the same uid (or root) can read another process's env block,
and the same uid can already read the 0600 `gamelib_bridge.cfg`. But the comment "never argv --
visible in ps" implies more protection than the code gives.

## Fix

Before `unsetenv()`, overwrite the string `getenv()` returned in place with
`memset_s(envSecret, BRIDGE_SECRET_HEX_LEN, 0, ...)` or a volatile loop. It points into the startup
block, so the overwrite clears what `ps eww` reads. Then correct the comment. To verify, launch a
bridge game and confirm `ps eww -p <pid> | grep -c GAMELIB_BRIDGE_SECRET=` finds no hex value. A
jest arm against the compiled helper could assert the same thing by running `ps eww` on its own
spawn.

## Resolution

Closed by quick 261027-l61, commit d6918189c. `bridge_helper.c` now overwrites the `getenv()` string in place (volatile, full strlen, valid or not) before `unsetenv()`. A live `ps eww` jest arm in `helperIntegration.test.ts` went RED to GREEN: before the fix it found the full secret in `ps eww` output; after, no hex follows `GAMELIB_BRIDGE_SECRET=`. A second arm covers an over-long malformed secret. The 0600 cfg stays readable by the same uid (accepted).
