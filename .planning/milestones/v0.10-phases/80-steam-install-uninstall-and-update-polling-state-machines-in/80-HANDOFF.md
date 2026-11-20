# Phase 80 orchestrator handoff (2026-11-16, after 80-28)

Resume with `/gsd-execute-phase 80`. Plans 80-01..80-28 have SUMMARYs and are skipped. The rest
run sequentially (worktrees are off): 80-29 (wave 16), 80-30, 80-31, 80-32, 80-33 (wave 20,
autonomous: false, live smoke).

## State

- Delete gate MET (80-HUMAN-UAT.md, 2026-11-16): all six live items pass, rust-test.yml green on
  windows/macos/ubuntu (run 43813887944 on f078c2762), 80-PARITY.md APPROVED.
- Polls default to `rust` on both sides (80-26). 80-28 deleted the steam `__tests__` that drove the
  TS loops and moved the stays-TS cases onto the rust arm.
- `main` is pushed through d6f314aec..f078c2762 plus later local commits (80-27, 80-28 are local,
  unpushed). Pushes so far used `--no-verify` at the operator's direction because the pre-push hook
  stays red on items in `.planning/todos/pending/2026-11-16-pre-push-hook-red-gameLaunch-and-jest-mock.md`.
  Do not push without asking the operator.
- Another session commits unrelated work on `main` in this same checkout.

## Executor brief additions (pass these in every executor prompt)

- Stage explicit paths only; never `git add -A/./-a`; never `gsd-sdk query commit` (it sweeps all
  dirty `.planning` files). Commit STATE/ROADMAP only after checking their diff is phase-80 progress.
- Never run workspace-wide `cargo fmt` (it reformats ~24 unrelated shell files); rustfmt only
  touched files or `cargo fmt -p <phase-80 crate>`.
- Rust tests must pass on Windows: never build an expected path with `join("a/b")`; join segment
  by segment. (`ScriptedRunner` keys and replay output already fold separators.)
- Keep green for anything touched: `pnpm lint` (0 errors; tests-scope ceiling 661), `pnpm
  find-deadcode` (no new knip findings), `pnpm backend-di-ceilings` (no new jestMock; lower/remove
  baseline entries for deleted/shrunk files in the same commit), `pnpm gameinfo-narrowing-ceiling`,
  `pnpm i18n --fail-on-update`, `pnpm codecheck`, prettier on edited paths.
- Do not label a failure pre-existing without `git log` on the file.

## Known red, not phase 80 (do not chase)

flowRegistrationCensus, ipcDomainCensus, shimCoverage, shimGenerate, tauriShellSource (WR-07, UOK
Gate 4), callbackRegistryHost, x86CallbackWineHarness, epicOfflineMode, themeTokens,
gamelibCatalogParity, lintTranslations, genI18nGateScope; steam-line-ceiling on `gameLaunch.ts`;
jestMock entries for the three `GameStatus.*` tests and `steamPollProfileFixtures` (todo above).
`steamPollParity` / `steamPollTsDriver` jestMock entries should disappear in 80-29 (it retires the
TS parity harness) — confirm.

## Open carry-forwards

- 80-24/80-28: `steampoll_status` is invoked with `[{}]` against an empty-tuple schema; tidy to
  `[]` at the production call site in 80-30/80-31.
- 80-28 left for 80-29: `steamPollParity`, `steamPollTsDriver`, `gameDetailsFlows`, `skeletonFlows`
  and the replay tests. For 80-30: the `jest.mock('../library/resume')` in
  `library.updates.test.ts`. For 80-31: `.polls.` / `uninstallPolls` reads in
  `pollsRustBranch.install`, `pollsRustBranch.uninstallRunning`, `steamInstallRuntime`,
  `games.test.ts`.
- Verifier should check: 80-25 bridge-bottle removal compares Rust's per-game name to the default
  instead of calling `resolveBridgeBottleName` (80-05 asked for the latter); 80-13
  `copy_source_label` is English-only; 80-23 init-rearm-skip and refresh status query have no
  dedicated rust-arm tests.

## 80-33 live smoke (operator)

Launch with `pnpm tauri:dev` (never `tauri:dev:run`); run `pnpm build:sidecar` first. Network off
only for the action itself. Restart hold applies to GameLib depot installs with InstallApp off,
not to Steam-driven handoffs. Bridge "verified" stays strict.
