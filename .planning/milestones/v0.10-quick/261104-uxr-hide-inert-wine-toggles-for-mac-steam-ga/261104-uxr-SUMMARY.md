---
phase: quick-261104-uxr
plan: 01
status: complete
---

# Quick 261104-uxr: Hide inert Wine toggles for macOS Steam titles

Status: incomplete. Task 1 is done and committed. Task 2, the live check, is pending.

## Commits
- test: RED placement test (Tests A-C failed, D passed). Commit message `test(quick-261104-uxr): add failing placement test for inert Wine toggles`.
- feat: 2a94e2856, `feat(quick-261104-uxr): hide inert Wine toggles for macOS Steam titles`.

## Change
In the Wine TabPanel in `index.tsx`, the eleven toggles are now wrapped in `{!isMacSteamTitle && (...)}` inside the `!isCrossover` block. `<Tools />` stays outside that gate, under `!isCrossover` as before. A JSX comment explains the gate.

## Verification (observed)
- RED run: 3 failed (A, B, C), 5 passed.
- GREEN run: `jest .../GamesSettings/__tests__/` gave 2 suites and 18 tests, all passing.
- `tsc --noEmit` printed nothing.
- `prettier --check` over the two paths: clean.

## Per-toggle evidence
| Toggle | Key | Per-game value reaches bridged launch? | Notes |
|---|---|---|---|
| AutoDXVK | autoInstallDxvk | No | Also calls toggleDXVK, which installs into an unused per-game prefix. |
| AutoDXVKNVAPI / AutoVKD3D | autoInstallDxvkNvapi / autoInstallVkd3d | No | Already Linux-only. Gated for uniformity. |
| EnableEsync | enableEsync | No | launcher.ts:1247, global-spread object only. |
| EnableFsync | enableFsync | No | Linux-only. |
| EnableWineWayland | enableWineWayland | No | Linux-only. |
| EnableWoW64 | enableWoW64 | No | Linux-only. |
| EnableMsync | enableMsync | No | launcher.ts:1253. |
| AdvertiseAvxForRosetta | advertiseAvxForRosetta | No | launcher.ts:1383. |
| EnableFSR | enableFSR | No | launcher.ts:1241. |
| EnableDXVKFpsLimit | enableDXVKFpsLimit | No | launcher.ts:1238. |

Tools is kept. It acts on the shared Steam bottle via callTool, SteamGame.getSettings and getSteamBottleSettings.

## Deviations
None.

## Pending: Task 2 live check
See the plan's how-to-verify steps. Run `pnpm tauri:dev`. On a CrossOver host the block was already hidden, so the check shows only that nothing regressed.

## Live check
Approved by the user on 2026-11-04 (regression check only: on a Mac with CrossOver the `!isCrossover` block was already hidden for Steam titles; the placement test is the real gate). Commits: 8b1423837 (red test), 2a94e2856 (change).
