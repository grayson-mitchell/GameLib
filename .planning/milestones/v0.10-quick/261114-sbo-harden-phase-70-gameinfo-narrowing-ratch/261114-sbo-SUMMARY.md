---
status: complete
quick_id: 261114-sbo
commits:
  - b5caab662
  - 166469b4f
  - b8ada008e
  - ec28c90ae
---

# Quick Task 261114-sbo: Harden Phase 70 GameInfo narrowing and schemas

Closes WR-02, WR-03, WR-06, WR-07, IN-01, IN-02 and the stale `phase70Passthrough` JSDoc.

## Commits

- b5caab662 fix: addNewApp sideload-only schema, Partial gameSettings + default-filling handler, strict no-wine arm, GOG launch option name, JSDoc
- 166469b4f fix: SteamGame.findGameInfo() (`SteamGameInfo | undefined`); getGameInfo() keeps the `{}` sentinel typed `GameInfo`
- b8ada008e todo moved to completed/ (rename only)
- ec28c90ae test: ratchet bypass forms, src/common scan, re-frozen baseline (20 -> 45 entries), todo Resolution section

## Deviations

- Task 1 changed two ratchet baseline entries early (dispatch.ts, gameDetailsFlowRegistration.ts, 1 each) because typing addNewApp as `SideloadGameInfo` counts; Task 3 reviewed them.
- gameDetailsFlowRegistration.ts (cast to `SideloadGameInfo`) and gameplay callers in library/index.ts were touched because tsc required it.
- `src/common/types.ts` added to the exempt list (it defines the GameInfo union).
- GamePage/index.tsx baseline is 4: it matches the working tree, where an uncommitted change removes one `isStore(gameInfo, 'steam')`. HEAD alone would count 5.
- Four steam jest failures (shimCoverage, shimGenerate x2, libraryReplay) are in native/Rust-replay code untouched by this task.
