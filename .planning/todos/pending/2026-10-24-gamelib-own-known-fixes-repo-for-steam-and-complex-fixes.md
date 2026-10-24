---
created: 2026-10-24
title: "GameLib's own known-fixes repo for Steam profiles and the complex fix keys"
source: quick 261024-tny, D1
area: steam-launch
files:
  - src/backend/downloadmanager/utils.ts
  - src/backend/knownFixes.ts
  - src/backend/utils/uninstaller.ts
severity: minor
platform: any
ready: human
---

GameLib needs its own known-fixes repo, both for Steam profiles and for the complex keys
(registry, dllOverrides, overlays, shimFeatures).

`downloadFixesFor` now skips `steam` on purpose (quick 261024-tny). Until this repo exists, Steam
fixes come only from a hand-placed `fixes/<appId>-steam.json`.

Decision 6 of `.planning/notes/per-game-compat-fixes-architecture.md` applies: the new keys are
honoured only from bundled or local sources, and any remote feed needs signed, sha-pinned
components from a source GameLib controls.

Ready is `human` because the operator must create the repo and decide its trust and signing model.

Done-when: the repo exists with a documented layout, `downloadFixesFor` (or a GameLib-specific
fetcher) pulls Steam profiles from it, and its trust rule is enforced in code.

When the fetcher lands, also revisit `removeFixFile` in `src/backend/utils/uninstaller.ts`. It
skips `steam` today only because a Steam fixes file has no other copy. Once profiles are
re-downloaded at install, deleting the downloaded copy on uninstall is safe again, as for the other
stores. Hand-placed debugging profiles should then live in `fixes/local/` (decision 6), which
uninstall never touches.
