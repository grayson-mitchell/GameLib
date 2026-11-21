---
phase: quick-261121-ley
plan: 01
type: diagnosis
autonomous: true
files_modified:
  - .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
---

# Quick 261121-ley: where Cat Quest 593280's Steam start-up dies on the x86 bridge

Desk diagnosis only (no code change), so it ran inline rather than through a planner and executor.

## Task 1: decide between three hypotheses
1. The game loads its own `Plugins/steam_api.dll` instead of the shim.
2. The shim loads, but its `SteamAPI_Init` fails before connecting.
3. Steamworks.NET P/Invokes an export the x86 shim lacks.

Evidence to gather: the bottle's steam_api files and their hashes against the built shim; the persisted bridge verdict; the classifier re-run on that verdict's inputs; the init-path names in `Assembly-CSharp-firstpass.dll`.

## Task 2: record the findings in the todo (a dated section) and adjust its scope

<verify>`.planning/` paths are prettier-ignored (`--file-info` reports `ignored: true`), so there is no formatter check. `pnpm planning-gates` covers the todo frontmatter, which is unchanged.</verify>
