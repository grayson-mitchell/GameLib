---
quick_id: 261029-ge1
status: complete
type: docs
---

# Quick 261029-ge1 summary

Closed `2026-10-25-depot-selection-ignores-realm-steamdeck-and-optional-depot-config.md` into
`completed/` with no code change, and filed
`pending/2026-10-29-depot-selection-installs-config-optionaldlc-opt-in-dlc.md`
(`minor`/`any`/`blocked`).

**Verdict:** keep selecting depot-level `optional: 1` depots. Witcher EE 20902 (Director's Cut DLC)
and Oblivion GOTY 22333 (GOTY DLC) are legacy `systemdefined` edition content. Neither carries
Steam's real opt-out (`config.optionaldlc` on the depot, `extended.optionaldlc` on the DLC app),
and Valve documents that owned DLC installs by default. The evidence came from anonymous
`getProductInfo` over 14 titles plus the native libraries on the operator's Windows box. None of
those installed apps has an `optional` depot, so no installed ACF could be observed directly.

**Follow-up:** `select.ts` does not filter `config.optionaldlc` (Dota 2 Workshop Tools, OpenGL,
Vulkan). The new todo is blocked on whether free opt-in DLC is owned before opt-in. It records the
D-02 census at `depot.test.ts:1763` that a fix would trip.

**Process note:** the orchestrator wrote the plan and executed it inline rather than spawning a
planner and an executor. The task was two `.planning/` files with no source change.

**Verify:** `pnpm planning-gates` 12/12. Every path written is prettier-ignored
(`{ "ignored": true, "inferredParser": null }`), so no formatter check was run.
