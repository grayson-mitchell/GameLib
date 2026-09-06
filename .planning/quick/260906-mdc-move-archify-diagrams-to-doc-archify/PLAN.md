---
quick_id: 260906-mdc
slug: move-archify-diagrams-to-doc
date: 2026-09-06
status: in-progress
---

# Quick task: publish the archify architecture diagrams under `doc/archify/`

## Goal

Move four validated archify architecture diagrams out of the session scratchpad
(which is ephemeral) into the repo so they survive and can be re-rendered.

## Scope

Copy into `doc/archify/`:

- `gamelib-overview.html` — static layer/module map
- `gamelib-topology.html` — process & transport topology
- `gamelib-runners.html` — runner store-manager polymorphism
- `gamelib-capability.html` — Tauri capability trust boundary
- `spec/*.architecture.json` — the four source specs, so each HTML can be regenerated
- `README.md` — what each diagram covers, the pinned revision, the re-render command

## Constraints

- Specs pin `meta.repository.revision` to `36832a3df02bfdbd329c1aa856219c5a52676df5`.
  Every `sources[].path` was verified to exist at that revision by archify.
- HTML artifacts are self-contained (inlined viewer runtime), ~720 KB each.
  ~2.9 MB total is added to the repo — a deliberate trade for offline-openable docs.

## Tasks

1. Create `doc/archify/` and `doc/archify/spec/`.
2. Copy the four HTML artifacts and four specs.
3. Write `doc/archify/README.md`.
4. Commit atomically, scoped to `doc/archify/` and this planning directory only.

## Out of scope

- No source changes. No build/CI wiring. No regeneration on commit.
