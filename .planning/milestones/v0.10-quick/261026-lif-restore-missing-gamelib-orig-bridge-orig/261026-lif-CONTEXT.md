# Quick Task 261026-lif: Restore missing `.gamelib-orig` bridge originals via depot repair - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning
**Source todo:** `.planning/todos/pending/2026-10-25-bridge-shims-placed-without-gamelib-orig-backup.md`

<domain>
## Task Boundary

15 placed bridge shims across 12 bridge bottles have no `.gamelib-orig` backup of the game's
original `steam_api*.dll` (284100 already fixed by hand on 2026-10-25, leaving 11 bottles). For
those titles placement falls back to the persisted verdict's stale `interfaceVersions` (possibly
`{}`), and the withhold/restore path has nothing to restore. `SteamGame.repair()` is a stub
(`src/backend/storeManagers/steam/games.ts` ~3362) and the "Verify integrity" hint in
`shimGenerate.ts` ~628 points at nothing.

</domain>

<decisions>
## Implementation Decisions (locked by the user, 2026-10-26)

### Scope
- Restore originals on **all 11** remaining bottles, not just failing ones. Each restored title is
  then relaunched to re-verify, since a fresh scan can change pins, coverage or class.

### Mechanism — Option A
- GameLib depot single-file restore: a filtered `buildDepotPlan` + the existing chunk download path
  (`depot.ts`), restricted to the game's `steam_api*.dll` files (the reconciler already re-downloads
  size-mismatched files). Writes the original into place / as `.gamelib-orig` so the next placement
  behaves as it does for a title that always had a backup.
- `SteamGame.repair()` gets a real body that does this restore (at minimum for bridge titles'
  steam_api originals; broader full-depot verify may be scoped explicitly).
- The shimGenerate.ts ~628 hint is reworded to point at GameLib's repair, not Steam's
  "Verify integrity of game files".
- Option B (Mac Steam console `download_depot`) is NOT the mechanism; it may be mentioned as a
  manual fallback only.

### Stale verdict invalidation
- Record the original's size + sha1 in the persisted verdict. When a `.gamelib-orig` appears or its
  fingerprint differs from the recorded one, discard the persisted verdict and rescan — including on
  an `already-placed` relaunch (the 284100 case that reused `{}`).

### Done-when
- Every placed bridge shim has a `.gamelib-orig`, or a recorded reason why not; `repair()` restores
  originals.

### Claude's Discretion
- Exact module placement of the restore helper, IPC/UI surface for invoking repair, and how the
  11-bottle backfill is driven (app action vs. a `meta/` script). The live backfill needs a signed-in
  Steam session and the operator's machine, so the plan should end with an operator checkpoint for
  running it and relaunching titles, rather than claiming it done from tests alone.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/todos/pending/2026-10-25-bridge-shims-placed-without-gamelib-orig-backup.md`
- `.planning/quick/*261025-t7i*` (research that found the 15 shims / 12 bottles)
- `Skill("gamelib-conventions")` — fake-HOME isolation for any spawn, sidecar exit contract,
  `<verify>` prettier rule, todo frontmatter
- `Skill("spike-findings-gamelib")` — Steam native depot install + bridge patterns
- Memory: bridge "verified" is strict (HELLO + clean game Steam-init log)

</canonical_refs>
