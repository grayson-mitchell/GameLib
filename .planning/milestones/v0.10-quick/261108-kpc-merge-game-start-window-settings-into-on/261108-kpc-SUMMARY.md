---
quick: 261108-kpc
status: complete
completed: 2026-11-08
commits: [see below]
---

# Quick 261108-kpc: merged "When a game starts" setting

One General-settings select ("Keep GameLib open" / "Hide GameLib for shortcut launches" / "Hide GameLib for every launch") replaces the minimize toggle and the Advanced protocol toggle, defaults to shortcut-hide, and the hiding now works in the Tauri build via a new `main_window_hide` Rust channel.

## Commits
1. feat: main_window_hide channel + raise-before-dialog hook (Rust arm, transport const, `app.hideMainWindow` / `raiseMainWindowIfHiddenByGameLib`, dialog hooks)
2. fix: register main_window_hide args schema (missed in 1; typecheck/schema test caught it)
3. feat: cold-start link hide, shortcut default, every-launch hide (protocol.ts, launcher.ts, steamFlowRegistration.ts, config default, markFrontendReady)
4. feat: merged select, mapping module, i18n, manifests

## Deviations
- [Rule 3] `rustInvoke.ts` schema map + `rustInvokeSchemas.test.ts` channel count (44 -> 45) + regenerated `ipc_contract.rs` (the generator, not hand edits, owns that file; my hand-mirrored Args struct was replaced by the generated one). Not in plan file list.
- [Rule 1] `useSettingsContext.ts`: `createSettingSetter` read a stale render-closure config, so the select's two back-to-back writes would have left the local view with only the second change. Now reads a live ref. Not in plan file list.
- i18n: 6 keys under `settings.gameStartWindow` (label, help, keep, shortcut, every, everyNeedsTray), not 4; the three option labels need keys too.
- protocol.test.ts cold-start case uses `jest.isolateModulesAsync` (no `require`; eslint forbids it).
- tauriShellSource.test.ts: only extended the declared-arm list; no count pin existed.

## Verification (real results)
- cargo test ipc_contract: 4 passed. cargo clippy: 14 warnings, none in the new arm; clippy-ratchet failure pre-existing.
- jest src/backend + src/common + src/frontend/screens/Settings + hooks: all pass except pre-existing: `tauriShellSource` (STORE_EMBED link popup `.title(format!` gate) and `macArchKnownFixRouting` (Intel) - both reproduced FAILING at baseline commit 4a435506e in a clean worktree.
- meta jest: failures are genI18nGateScope A-17 anti-rot, gamelibCatalogParity (sl, Humble glossary), logSecretGate, x86CallbackWineHarness - all in the known pre-existing list; no new failures (A0/A2/A3/A4 count assertions updated to 271/324 and pass).
- pnpm codecheck: clean. pnpm lint: 2 errors, both in files I did not touch (an unused `join`, `absolutePathArg` in src/common/types/ipc/shellFiles.ts); 0 in my files.
- pnpm lint-translations:gamelib: 0 hard failures. Prettier --check clean on every non-ignored path written (gamelib.json is prettier-ignored, so omitted).
- Not live-checked: needs `pnpm tauri:dev` restart (sidecar not rebuilt). UAT steps 1-4 in the plan remain for the operator. F6 (macOS may briefly activate GameLib on a warm link) unaddressed by design.
- Note: `git checkout`/`git worktree add` post-checkout hooks ran `pnpm install` in the main repo once (pruned 168 stale packages from node_modules); tests still run.
