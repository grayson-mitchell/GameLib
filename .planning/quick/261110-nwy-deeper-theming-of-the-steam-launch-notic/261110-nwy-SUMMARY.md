# Quick 261110-nwy: Deeper theming of the Steam launch notice toast

Per-theme token mapping for the shared toast surface and Steam notice parts (SCSS only), plus a source gate.

## Commits
- 3e5546299 style: NoticeStack/index.scss (surface `--background`, 1px `--input-background` frame before the 3px `--status-warning` stripe), SteamEngineLaunchNotice/index.scss (icon `--accent`, title heading font + `--text-title`, body secondary font, dismiss `--action-icon`/`--action-icon-hover` with accent 16% hover fill; bar unchanged)
- f94b22971 test: launchNoticeThemeTokens.test.ts (source gate with self-test)

## Verification
- prettier --check: clean on all three paths
- eslint on the new test: clean
- jest Frontend src/frontend/components/UI: 316 suites, 5441 tests pass

## Deviations
Prettier wrapped the `background` declaration over several lines, so the gate regex allows whitespace after `var(`. No other deviations.

## Notes
- `.claude/skills/sketch-findings-gamelib/references/notices-and-toasts.md` token table is now stale (not edited, out of plan scope).
- The shared surface change also applies to the Humble and ReadOnly notices, on purpose.

## Pending (operator)
Live 10-theme check in `pnpm tauri:dev`: rename /Applications/CrossOver.app to trigger the notice, cycle all themes, confirm per the plan's `<human_verify>`. Todo stays `ready: live-gate` until reported.
