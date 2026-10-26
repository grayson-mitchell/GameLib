---
created: 2026-10-26
title: "Show a GameLib compatibility row in Install info when a known-fix exists, with a rating that defaults to 4"
source: operator idea after the Mining Mechs (1603180) DXVK fix passed its live gate
area: gamepage-compat-rows
files:
  - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
  - src/backend/knownFixes.ts
  - src/common/types.ts
  - public/locales/en/gamepage.json
severity: minor
platform: any
ready: code
---

A GameLib known-fix for a game means GameLib has made it run, so it carries an implied Wine
rating of about 4/5. Install info has no way to show that today. `AppleWikiInfo.tsx` renders three
independently gated emulation rows: CrossOver (`showCrossover`, macOS), Proton (`showProton`) and
Wine (`showWine`, the AppleGamingWiki/WineHQ rating). None of them knows a fix was applied, so
Mining Mechs still shows whatever the third-party sources say, even though GameLib now launches it
cleanly.

**Idea:** add a fourth row, "GameLib", shown when a known-fix exists for the game, with a 1–5
`<Rating>` like the Proton row (`AppleWikiInfo.tsx:172-185`). The rating comes from an optional
`rating` key in the fix file and defaults to 4 when that key is missing: if it is fixed, it should
run.

**Decided (operator, 2026-10-26):**

- **Bundled and local fixes only.** A fix found only in the remote layer (`fixes/`) never shows the
  row or implies a rating.
- **Separate row.** "GameLib" is its own row beside CrossOver, Proton and Wine, not a badge on the
  Wine row.

- **A fix existing is enough.** A bundled or local fix shows the row with its `rating`, or 4 when
  the file has none. No evidence key or census result is required.
- **Keep the other rows.** CrossOver, Proton and Wine render exactly as they do now. The GameLib
  row sits beside them and overrides nothing.

All four decisions below are settled by these, so this is `ready: code`. The list is kept as the
record of what was weighed.

**Decisions weighed (all settled above):**

1. **Which fixes count.** Tier 1 (`<id>-<store>.json`) is also read from the remote layer
   (`fixes/`, Heroic's download). A Heroic remote fix is not GameLib-validated, so its presence
   should probably not imply a 4. Options: count bundled and local fixes only, or put `rating` in
   tier 2 (`TIER2_PROFILE_KEYS`, bundled and local only) and leave `TIER1_KNOWN_FIX_KEYS` alone. That
   allow-list exists so that new keys cannot reach the remote layer.
2. **Whether "fix exists" is enough.** A fix that has not passed its live gate is a hypothesis.
   Should the default 4 require evidence, such as the tier-2 `evidence` key, or a bridge-verified
   census result for Steam?
3. **Placement and naming.** Is it a separate row or a badge on the Wine row? Wording: "GameLib",
   "GameLib fix applied", or similar.
4. **Interaction with the other rows.** Keep the CrossOver and Wine rows beside it, or let the
   GameLib row override them?

Related: tier-1 already has `launchNotice` ("UI text only. Nothing renders it yet", in
`common/types.ts` `KnowFixesInfo`). The same row could render it, for example as a tooltip that
says what the fix does.

First candidate to try it on: Mining Mechs (`public/fixes/1603180-steam.json`). It passed its
live gate on 2026-10-26.
