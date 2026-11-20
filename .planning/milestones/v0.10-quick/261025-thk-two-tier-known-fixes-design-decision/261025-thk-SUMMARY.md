---
phase: quick-261025-thk
plan: 01
status: complete
---

# 261025-thk — two-tier known-fixes design recorded

Docs only. Operator decisions (2026-10-25): the GameLib known-fixes repo covers every store,
complex keys go in a separate `<appName>-<store>.profile.json`, and a remote tier-2 feed is deferred.

- `.planning/notes/per-game-compat-fixes-architecture.md`: decisions 1 and 6 rewritten (two tiers,
  two files; per-tier layering; remote tier 1 from GameLib's repo with Heroic fallback, filtered by an
  allow-list; tier 2 local + bundled only). Corrected the old claim that nothing fetched can change
  what code runs: `runInPrefix`/winetricks already do.
- Repo todo rescoped to tier 1 for every store plus the fetcher; no signing model left to decide.
  Still `ready: human` (operator creates the repo).
- New `ready: code` todo `2026-10-25-two-tier-known-fixes-split.md` for the loader split,
  allow-list, 284100 profile rename and Steam bridge applying tier-1 keys.

Verify: `pnpm planning-gates` 12/12. Prettier omitted: every path is under the ignored `.planning/`.
