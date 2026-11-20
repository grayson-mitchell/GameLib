---
phase: quick-261025-thk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/notes/per-game-compat-fixes-architecture.md
  - .planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md
  - .planning/todos/pending/2026-10-25-two-tier-known-fixes-split.md
autonomous: true
---

# Record the two-tier known-fixes design (docs only)

Operator decisions, 2026-10-25 conversation:

1. GameLib's own known-fixes repo covers **every store**, not just Steam. macOS fixes apply to
   Epic/GOG/Amazon games too. GameLib's repo is read first; Heroic's feed is the fallback for the
   stores it covers.
2. Complex keys live in a **separate file** (`<appName>-<store>.profile.json`), not a block inside
   the simple file.
3. A remote feed for complex profiles is **deferred**.

<task type="auto">
  <name>Task 1: Architecture note — decisions 1 and 6</name>
  <files>.planning/notes/per-game-compat-fixes-architecture.md</files>
  <action>Rewrite decision 1 (two tiers: Heroic format unchanged for tier 1, separate profile
  file for tier 2) and decision 6 (per-tier layering, allow-list on remote tier 1, GameLib repo
  for every store with Heroic fallback, tier 2 local + bundled only, remote tier 2 deferred).
  Note that runInPrefix/winetricks are code-executing, so tier 1 is "trust the repo's
  mergers", not "safe". Move `launchNotice` into tier 1. Add a dated revision line.</action>
  <verify>All paths are under `.planning/`, which `npx prettier --file-info` reports as
  ignored; the formatter check is omitted as vacuous. `pnpm planning-gates` passes.</verify>
</task>

<task type="auto">
  <name>Task 2: Todos</name>
  <files>.planning/todos/pending/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md, .planning/todos/pending/2026-10-25-two-tier-known-fixes-split.md</files>
  <action>Rewrite the repo todo: scope becomes the tier-1 repo for every store plus the fetcher;
  the trust/signing question is gone; ready stays `human` (operator creates the repo). File a
  new `ready: code` todo for the loader split, allow-list, bundled 284100 rename, and the Steam
  bridge applying tier-1 keys. Both carry severity/platform/ready in order.</action>
  <verify>`pnpm planning-gates` passes. Prettier omitted: `.planning/` is ignored.</verify>
</task>
