# Phase 88.1 deferred items

Out-of-scope discoveries logged during execution; not fixed by the plan that found them.

## 88.1-16

- `src/backend/__tests__/infoShimSchedule.test.ts` fails on `every row is imported by exactly its listed callers`
  (rows `anticheatStatus` and `anticheatDownload`): `ANTICHEAT_CALLERS` lists `src/backend/launcher.ts`, which no longer
  imports `src/backend/info/anticheat.ts`. Introduced by 88.1-15 (commit 6a9669b06). Fix: remove `src/backend/launcher.ts`
  from `ANTICHEAT_CALLERS` (the comment above the rows names the launcher's `gameAnticheatInfo` lookup, which moved to Rust).

## 88.1-19

- `pnpm lint` reports one production-scope error, `src/backend/storeManagers/steam/depotErrors.ts` (`'optionalArg' is defined but
  never used`). The file is not touched by 88.1; it is another session's change (phase 87 worktree). Not fixed here.
- `RUST_WINE_DISCOVER_CROSSOVER` (`wine_discover_crossover`) and `RUST_INFO_WIKI_GET` (`info_wiki_get`) also have no non-test TS
  caller left (found by scanning every `RUST_*` constant in `sidecarTransport.ts` for importers outside the transport, zod args,
  sidecarRpc and tests). Neither was in the plan's list of eight (their callers went with 87-56 and 86, not 88.1), so both stay;
  the sweep that owns them is the 98 config phase or whichever phase next audits channels.
- `src/frontend/screens/Settings/components/DiscordRPC.tsx` still renders; filed as
  `.planning/todos/pending/2026-11-25-discord-rpc-setting-inert-after-88-1.md`.
