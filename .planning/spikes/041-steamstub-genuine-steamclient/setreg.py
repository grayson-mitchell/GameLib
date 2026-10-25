#!/usr/bin/env python3
"""Spike 041: point the CLONE's HKCU ActiveProcess\\SteamClientDll64 at a given Windows path.
Only ever edits GameLibSpike041/user.reg, and only while its wineserver is down."""
import os, re, sys
reg = os.path.expanduser("~/Library/Application Support/CrossOver/Bottles/GameLibSpike041/user.reg")
assert "GameLibSpike041" in reg
win = sys.argv[1].replace("\\", "\\\\")
src = open(reg, encoding="utf-8").read()
new, n = re.subn(r'^"SteamClientDll64"=".*"$', lambda m: f'"SteamClientDll64"="{win}"', src, flags=re.M)
assert n == 1, f"expected exactly one SteamClientDll64 value, found {n}"
open(reg, "w", encoding="utf-8").write(new)
print([l for l in new.splitlines() if l.startswith('"SteamClientDll64"')][0])
