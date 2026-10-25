---
created: 2026-10-24
title: "GameLib's own known-fixes repo (tier 1, every store) and its fetcher"
source: quick 261024-tny, D1; scope revised by quick 261025-thk
area: steam-launch
files:
  - src/backend/downloadmanager/utils.ts
  - src/backend/knownFixes.ts
  - src/backend/utils/uninstaller.ts
severity: minor
platform: any
ready: human
---

GameLib needs its own known-fixes repo for **tier-1 (simple) fixes for every store**. The design
is settled in decisions 1 and 6 of `.planning/notes/per-game-compat-fixes-architecture.md`
(revised 2026-10-25):

- Heroic's format and layout, unchanged: `<store>/<appName>-<store>.json`.
- Covers every store, because the macOS fixes it carries apply to Epic/GOG/Amazon games too.
- Remote carries **tier 1 only**. Tier-2 profiles (`registry`, `dllOverrides`, `overlays`,
  `shimFeatures`, `steamSharedRedists`, …) are local and bundled only; a remote tier-2 feed is
  deferred. There is no signing model to decide for this todo.

`downloadFixesFor` skips `steam` today on purpose (quick 261024-tny). It fetches only Heroic's feed
for the other stores.

Ready is `human` because the operator must create the repo (name, org, who can merge). Everything
after that is code.

Depends on `2026-10-25-two-tier-known-fixes-split.md` (the loader split and the tier-1 allow-list),
which is `ready: code` and can land first.

Done-when:

- The repo exists, with a README documenting the layout and the tier-1 key list.
- `downloadFixesFor` fetches every store from GameLib's repo first, falling back to Heroic's feed
  for epic/gog/amazon when GameLib's has no file. Steam is no longer skipped.
- `removeFixFile` in `src/backend/utils/uninstaller.ts` deletes the downloaded tier-1 copy for
  Steam too, as for the other stores: it is re-downloaded at install. It skips Steam today only
  because a Steam fixes file had no other copy. Local (`fixes/local/`) and bundled files are never
  touched.

## Closed 2026-10-26 (quick 261026-avw)

- New `src/backend/knownFixesFetcher.ts`: `fetchRemoteKnownFixes(appName, runner)` tries
  `grayson-mitchell/known-fixes` first for every store with a store dir, and falls back to Heroic's
  feed only on a GameLib 404 and only for epic/gog/amazon. Steam and zoom never ask Heroic.
- Bodies are filtered through `filterTier1KnownFixes` at write (and still at read), written
  atomically (`.tmp-<pid>` then rename). A network error, timeout, 5xx, 403 or malformed body
  writes nothing, deletes nothing and does not fall back. A stale downloaded file is deleted only
  when every applicable source answers 404.
- `downloadFixesFor` is now a fire-and-forget call to the fetcher; the Steam skip is gone.
  `removeFixFile` is exported and covers Steam (and skips runners with no store dir, e.g.
  sideload); `fixes/local/`, bundled and `.profile.json` files are never touched.
- README source of record: `.planning/quick/261026-avw-gamelib-known-fixes-repo-fetcher-downloa/known-fixes-README.md`.
  Pushing it to `grayson-mitchell/known-fixes` is **pending - handled by the orchestrator with
  user confirmation** (the orchestrator will amend this line once pushed).
