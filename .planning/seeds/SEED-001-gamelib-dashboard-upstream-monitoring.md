---
id: SEED-001
status: dormant
planted: 2026-11-15
planted_during: v0.10 Foundations / Phase 79 (rust-cm-client-replacing-steam-user-and-steam-session)
trigger_when: when an upstream change (store API, Steam protocol, Wine/CrossOver/DXVK release, or umu-protonfixes data) breaks or silently degrades GameLib, or when the protonfixes importer todo is picked up
scope: large
---

# SEED-001: GameLib-Dashboard — upstream change and integration-health monitoring

A **separate project** (`GameLib-Dashboard`, its own repo) that watches everything GameLib
depends on but does not control, and reports what changed since the last run.

## Why This Matters

GameLib integrates five stores plus Steam's CM protocol, Wine/CrossOver and a third-party fix
dataset. Today we learn about upstream changes when something breaks for a user. A scheduled
watcher turns that into an early signal, and gives the umu-protonfixes importer a trigger:
re-run it on the fix files that actually changed instead of the whole 314-file set.

It is a separate repo because it never ships in the app, runs on a cron cadence rather than a
release cadence, needs store test-account credentials that should not live in the launcher
repo, and does not need GameLib's CI gates, sidecar contract or fake-HOME convention.

## Shape

1. **Repo / release watch** (no credentials)
   - Path-scoped commits: umu-protonfixes `gamefixes-steam/`.
   - Proto / schema changes: steam-user, steam-session, SteamKit, steam-vent.
   - Releases: CrossOver, Wine-Staging, DXVK.
   - legendary / gogdl / nile as early warning for Epic / GOG / Amazon API breakage.
2. **Store / integration probes** (needs test accounts)
   - Endpoint health: Steam Web API, Epic, GOG, Amazon, Humble.
   - Response-shape snapshots, diffed per run, to catch silent API changes.
3. **First consumer: the umu-protonfixes importer** — changed fix file → translate to
   candidate local fix → open a candidate PR against GameLib. Still Mac-tested by hand and
   promoted through the Phase 57 flow; nothing reaches the app automatically.

Start as a scheduled GitHub Action writing dated JSON/Markdown diff reports. Build the
dashboard UI only once there is history worth looking at.

## When to Surface

**Trigger:** an upstream change breaks or silently degrades an integration, or the
protonfixes importer todo is picked up. Bootstrap with `/gsd-new-project` in a new
`GameLib-Dashboard` directory, not as a GameLib milestone.

## Scope Estimate

**Large** — a new project. The repo/release watch alone is small; probes, snapshot diffing
and the importer-to-PR pipeline make it a full project.

## Open Questions

- Where probe credentials live; whether a dedicated test account per store is acceptable.
- Whether the importer lives in the dashboard repo, or stays in GameLib `meta/` and reads
  the dashboard's output.

## Breadcrumbs

- `.planning/todos/pending/2026-10-29-protonfixes-import-dev-tool.md` — the importer.
- `.planning/notes/per-game-compat-fixes-architecture.md` — "External formats (researched
  2026-10-29)", the protonfixes field mapping.
- `.planning/ROADMAP.md` Phase 57 — opt-in known-fix sharing; the promotion path.
- `.planning/research/STEAM-STACK.md` — the Steam dependencies the protocol watch covers.
