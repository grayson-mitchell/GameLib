---
phase: quick-261108-anw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/common/types/steam.ts
  - src/backend/utils/uninstaller.ts
  - src/backend/utils/__tests__/uninstaller.test.ts
  - src/backend/storeManagers/steam/gameUninstall.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/state/SteamRequestNotice.ts
  - src/frontend/state/__tests__/SteamRequestNotice.test.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
  - public/locales/en/gamelib.json
  - meta/i18nCatalogPresenceBaseline.json
autonomous: true
requirements: [QUICK-261108-anw]

must_haves:
  truths:
    - "When a Steam uninstall's file delete errors (bridge bottle removal error, bridge rm error, native rm error, either bottle rm error), GameLib keeps the game's settings, logs, prefix and fix file, and shows no 'Error uninstalling' OS notification and no 'Game Uninstalled' toast."
    - "After such a failure the tile leaves 'Uninstalling' and returns to done, on every failure route (bridge, native, bottle), with exactly one done sent for the failure."
    - "The in-app notice stack shows \"Couldn't finish uninstalling {{game}}. Some files may remain; try uninstalling again.\" for every failure route."
    - "Refusals (td5) and successful uninstalls behave exactly as before."
  artifacts:
    - path: "src/common/types.ts"
      provides: "ExecResult.failed flag, distinct from refused"
      contains: "failed?: boolean"
    - path: "src/backend/utils/uninstaller.ts"
      provides: "uninstallGameCallback honours failed"
      contains: "result?.failed"
    - path: "src/backend/storeManagers/steam/gameUninstall.ts"
      provides: "failed:true + uninstall-failed notice on every caught delete error"
      contains: "uninstall-failed"
    - path: "public/locales/en/gamelib.json"
      provides: "steam.uninstall.failed string"
      contains: "\"failed\":"
  key_links:
    - from: "src/backend/storeManagers/steam/gameUninstall.ts"
      to: "steamRequestNotice push"
      via: "sendFrontendMessage('steamRequestNotice', { kind: 'uninstall-failed', seq: nextSteamRequestNoticeSeq() })"
      pattern: "uninstall-failed"
    - from: "src/backend/utils/uninstaller.ts"
      to: "ExecResult.failed"
      via: "if (result?.failed) keep everything, send done, return"
      pattern: "result\\?\\.failed"
    - from: "src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx"
      to: "gamelib:steam.uninstall.failed"
      via: "requestBody switch case 'uninstall-failed'"
      pattern: "steam\\.uninstall\\.failed"
---

<objective>
Close the case quick 261107-td5 left open. A Steam uninstall whose delete errors (a caught rm error, so possibly a partial delete) returns a plain `{ stdout: '', stderr: 'Failed to remove …' }`. `uninstallGameCallback` treats that as success: it removes the prefix, settings, logs and fix file, and shows nothing. The bridge and bottle failure returns also never send `done`, and the callback suppresses `done` for steam (`installManagedExternally`), so the tile can stick on "Uninstalling".

Purpose: a failed delete must leave GameLib's own state in place, clear the status, and tell the user in-app to retry.
Output: `ExecResult.failed`, callback handling, flagged failure routes with an `uninstall-failed` notice, frontend validator and renderer support, one new locale key.

Design is decided by the orchestrator (items 1-4 in the task actions). Follow it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/261107-td5-fix-steam-delete-check-d-defects/261107-td5-SUMMARY.md
@src/backend/utils/uninstaller.ts
@src/backend/storeManagers/steam/gameUninstall.ts

Pattern source: `git show 3c0f4f12e` (backend refused flag, callback, refusal pushes) and `git show 015befa7d` (frontend kinds, renderer, locale, baseline). Mirror them.

Load `Skill("gamelib-conventions")` before writing `<verify>` steps (prettier rule).

<interfaces>
From src/common/types.ts (L195-207):
  export type ExecResult = { stderr: string; stdout: string; fullCommand?: string; error?: string; abort?: boolean; /** td5 doc */ refused?: boolean }

From src/common/types/steam.ts (~L254-268):
  export interface SteamRequestNoticePayload { appId: string; title: string; kind: 'install-not-started' | 'uninstall-not-started' | 'uninstall-refused-running' | 'uninstall-steam-error' | 'uninstall-check-failed'; code?: number; seq: number }

From src/backend/storeManagers/steam/library/pollState.ts L173:
  export function nextSteamRequestNoticeSeq(): number   (already imported in gameUninstall.ts L26 from './library/pollState' — NOT library.ts)

gameUninstall.ts imports already present: sendFrontendMessage ('../../ipc'), library ('./state'), rmSync ('node:fs'), removePerGameBridgeBottle ('./bridgeBottleLifecycle').

Failure sites in src/backend/storeManagers/steam/gameUninstall.ts (verified 2026-11-08; the only `Failed to remove` returns in the file, and the file is the only uninstall path — every route is reached solely via uninstall() -> uninstallGameCallback, uninstaller.ts is the sole caller of game.uninstall):
  - L186-196 uninstallBridgeGame: removePerGameBridgeBottle result.status === 'error' -> `Failed to remove bridge bottle: ${result.error}`
  - L258-272 uninstallBridgeGame: catch around rmSync(installRoot)/rmSync(manifestPath) -> `Failed to remove bridge install: …`
  - L406-435 removeNativeInstallDirectly: catch around removeSteamInstallCopy -> `Failed to remove native install: …`; currently sends gameStatusUpdate done for both refused and failure, comment L433 "may be a partial delete: no flag"
  - L680-696 uninstallBottleGameDirectly shared-installdir branch: catch around rmSync(manifestPath) -> `Failed to remove bottle install: …`
  - L701-716 uninstallBottleGameDirectly main branch: catch around the two rmSync calls -> `Failed to remove bottle install: …`

uninstallGameCallback (uninstaller.ts) td5 branch: `if (result?.refused) { logInfo(\`Uninstall refused; keeping settings (${result.stderr})\`, LogPrefix.Backend); sendGameStatusUpdate({ appName, runner, status: 'done' }); return }`

Frontend (from 015befa7d): SteamRequestNotice.ts has `REQUEST_KINDS: ReadonlySet<string>`; SteamEngineLaunchNotice/index.tsx has `type RequestKind`, `const REQUEST_KINDS: readonly string[]`, and `requestBody(req, game)` switch with one case per kind.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — ExecResult.failed, callback keeps state on failure, every failure route flagged and noticed</name>
  <files>src/common/types.ts, src/common/types/steam.ts, src/backend/utils/uninstaller.ts, src/backend/utils/__tests__/uninstaller.test.ts, src/backend/storeManagers/steam/gameUninstall.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - uninstaller.test.ts (extend the td5 describe or add a sibling `uninstallGameCallback failure (quick 261108-anw)`): uninstall resolves `{ stdout:'', stderr:'Failed to remove x', failed:true }` with shouldRemovePrefix=true, shouldRemoveSetting=true, runner 'steam' -> settings file and fix file still exist, getSettings (prefix path) not called, notify not called, statuses() equals ['uninstalling','done'] (exactly one done).
    - Same with a non-steam runner (e.g. 'legendary' via libraryManagerMap mock) -> statuses ['uninstalling','done'], files kept, no notify. Proves done is sent for every runner, not only steam.
    - Existing td5 cases (refused, unflagged success, throw) still pass unchanged.
    - games.test.ts, one case per failure site; each asserts result.failed === true, result.refused is undefined, stderr contains the site's `Failed to remove …` text, pollUninstallOnce not called, and sendFrontendMessage called with ('steamRequestNotice', objectContaining({ appId, kind: 'uninstall-failed' })) once, with a numeric seq:
      a) bridge per-game bottle: removePerGameBridgeBottle mockResolvedValue({ status:'error', error:'busy' }) (describe 'Phase 24 Plan 08 bridge routing', ~L11050).
      b) bridge install rm: make rmSync throw for the install root (see action for the throw technique) in the legacy shared-bottle path (~L11178 '261017-bqw' describe).
      c) native: in the s3n ON describe (~L10024), decision { route:'fallback', why:'signed-out' } and removeCopySpy.mockRejectedValue(new Error('EACCES')); additionally assert sendFrontendMessage was NOT called with ('gameStatusUpdate', done) — the callback owns done for failures. Notice title 'Dota 2'.
      d) bottle shared-installdir manifest rm and e) bottle main rm: in the direct-deletion describe (~L10331) / SharedDepots real-fs describe (~L10605), make rmSync throw.
    - The existing s3n test 'fallback with a refused copy: nothing polled, status cleared, stderr set' still passes (refused native path still sends its own done, unchanged from td5).
  </behavior>
  <action>
Per design item 1: in src/common/types.ts add `failed?: boolean` to ExecResult directly after `refused`, with a doc comment: set by an uninstall whose delete errored and may be partial; uninstallGameCallback keeps settings/prefix/fix file and clears the status so the user can retry (quick 261108-anw); distinct from `refused` (nothing changed). In src/common/types/steam.ts add `'uninstall-failed'` to SteamRequestNoticePayload.kind.

Per design item 3, in gameUninstall.ts add one private helper near the top-level route functions, e.g. `failUninstall(steamGame: SteamGame, stderr: string): ExecResult`, which pushes `sendFrontendMessage('steamRequestNotice', { appId: steamGame.appId, title: library.get(steamGame.appId)?.title ?? '', kind: 'uninstall-failed', seq: nextSteamRequestNoticeSeq() })` and returns `{ stdout: '', stderr, failed: true }`. Read the title from the raw `library` Map, NOT getGameInfo() — the bottle route's comments forbid getGameInfo()'s fire-and-forget side effect on this path, and the callback's resolveGameTitle already self-healed the Map for this appId. Keep each site's existing logWarning. Replace the five failure returns with `return failUninstall(steamGame, <same stderr text>)`: the two in uninstallBridgeGame, the two in uninstallBottleGameDirectly, and in removeNativeInstallDirectly. For removeNativeInstallDirectly restructure so that the refused branch is byte-for-byte td5 behavior (logWarning, gameStatusUpdate done, `{ stdout:'', stderr, refused: true }`) and the catch branch does logWarning then `return failUninstall(...)` WITHOUT sending gameStatusUpdate done. Replace the L433 "no flag" comment with one stating the caught error may be a partial delete, so it returns `failed` and uninstallGameCallback sends the one done. Do not add notify() anywhere. Before editing, grep the file for any other caught-delete return (`catch (error)` followed by a stderr return) and flag it the same way if found; record the grep result in the SUMMARY.

Per design items 2 and 4, in uninstaller.ts add, right after the td5 `result?.refused` block, an `if (result?.failed)` block: `logInfo(\`Uninstall failed; keeping settings (${result.stderr})\`, LogPrefix.Backend)`, `sendGameStatusUpdate({ appName, runner, status: 'done' })` for every runner (including steam, where the route sent none), then return. No notify (the route owns the in-app message). Comment: quick 261108-anw; the delete errored, possibly partially; keep GameLib state so a retry is possible; the failing route sends no done, so this is the single done (decision for item 4: the callback is the sole owner of done for `failed`; routes never send it on failure; tests assert exactly one).

Throw technique for rmSync in games.test.ts: gameUninstall.ts calls `rmSync` from 'node:fs' via a CJS property access after ts-jest transpilation, so `jest.spyOn(require('node:fs'), 'rmSync').mockImplementationOnce(() => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }) })`, restored in the test (`mockRestore`), should reach it. The file also imports a real rmSync used for temp-dir cleanup, so always restore before cleanup. If the spy does not intercept (verify by asserting the spy was called), fall back to a real-filesystem failure: chmod the parent of the delete target to 0o555 inside the existing mkdtemp tree, and restore 0o755 in finally. Reuse each describe's existing fixtures and mocks; do not build new harnesses.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/utils/__tests__/uninstaller.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/removeCopies.test.ts src/backend/storeManagers/steam/__tests__/nativeDelete.test.ts && npx prettier --check src/common/types.ts src/common/types/steam.ts src/backend/utils/uninstaller.ts src/backend/utils/__tests__/uninstaller.test.ts src/backend/storeManagers/steam/gameUninstall.ts src/backend/storeManagers/steam/__tests__/games.test.ts && pnpm codecheck</automated>
  </verify>
  <done>All five failure sites return failed:true and push one uninstall-failed notice; the native failure sends no route-level done; uninstallGameCallback keeps settings, prefix and fix file, does not notify, and sends exactly one done for steam and non-steam runners. Any games.test.ts failure outside the new cases counts as pre-existing only if it fails identically with this task's changes stashed; record it in the SUMMARY.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Frontend — accept and render the uninstall-failed notice; locale key and i18n baseline</name>
  <files>src/frontend/state/SteamRequestNotice.ts, src/frontend/state/__tests__/SteamRequestNotice.test.ts, src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx, src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx, public/locales/en/gamelib.json, meta/i18nCatalogPresenceBaseline.json</files>
  <behavior>
    - SteamRequestNotice.test.ts: add 'uninstall-failed' (no code) to the td5 `accepts kind %s` table; latest.kind is 'uninstall-failed'. A payload with kind 'uninstall-failed' and a non-numeric appId is still dropped.
    - SteamEngineLaunchNotice.test.tsx: add rows to the td5 `renders refusal notice %j` table: { kind:'uninstall-failed', title:'WazHack' } -> "WazHack Couldn't finish uninstalling WazHack. Some files may remain; try uninstalling again."; and title '' -> "Steam Couldn't finish uninstalling Steam. Some files may remain; try uninstalling again."
  </behavior>
  <action>
Per design item 3, mirroring 015befa7d exactly. SteamRequestNotice.ts: add 'uninstall-failed' to the closed REQUEST_KINDS set (T-pvk-01 still holds; no code required for this kind). SteamEngineLaunchNotice/index.tsx: add 'uninstall-failed' to `RequestKind` and to the `REQUEST_KINDS` array, and add a `requestBody` case returning `t('steam.uninstall.failed', "Couldn't finish uninstalling {{game}}. Some files may remain; try uninstalling again.", { game })`. Extend the td5 comment on the request-slot effect to mention quick 261108-anw's failed-delete notice. Icon and slot unchanged.

public/locales/en/gamelib.json: add `"failed": "Couldn't finish uninstalling {{game}}. Some files may remain; try uninstalling again."` under `steam.uninstall`, in alphabetical position (after `directConfirmNoSize`, before `gameRunning`), matching the file's 4-space indentation. Then run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`, and confirm with `git diff meta/i18nCatalogPresenceBaseline.json` that the diff adds only `steam.uninstall.failed` per locale (plus timestamp/total fields). Then `pnpm lint-translations:gamelib` and `pnpm lint-translations` must show 0 hard failures.

Prettier: public/locales/en/gamelib.json is prettier-ignored (`--file-info` reports ignored:true), so it is left out of the check; meta/i18nCatalogPresenceBaseline.json is not ignored and is included.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/state/__tests__/SteamRequestNotice.test.ts src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx && npx prettier --file-info public/locales/en/gamelib.json && npx prettier --check src/frontend/state/SteamRequestNotice.ts src/frontend/state/__tests__/SteamRequestNotice.test.ts src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx meta/i18nCatalogPresenceBaseline.json && pnpm lint-translations:gamelib && pnpm lint-translations && pnpm codecheck</automated>
  </verify>
  <done>The uninstall-failed push is accepted and renders the catalogue string under the game title (fallback "Steam"). Baseline diff adds only steam.uninstall.failed. Translation lint 0 hard failures, codecheck clean, scoped prettier clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend -> renderer push | steamRequestNotice payload crosses into the renderer |
| filesystem -> uninstall result | an rm error (EACCES, EBUSY, partial delete) decides whether GameLib's own state is deleted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-anw-01 | Tampering (data loss) | uninstallGameCallback | mitigate | `failed: true` skips removePrefix, removeSettingsAndLogs and removeFixFile; uninstaller.test.ts asserts the files survive and getSettings is never called |
| T-anw-02 | Spoofing | steamRequestNotice renderer | mitigate | 'uninstall-failed' joins the closed kind set; body is a catalogue string; backend stderr (which carries the raw error) is never rendered (T-pvk-01) |
| T-anw-03 | Denial of Service (stuck UI) | failure routes | mitigate | the callback sends exactly one done for `failed` on every runner; tests assert ['uninstalling','done'] and that the native failure route sends no extra done |
| T-anw-04 | Information Disclosure | notice title | accept | title is the library entry's own game title already shown on the tile |
</threat_model>

<verification>
- Both tasks' `<verify>` commands pass. `pnpm codecheck` clean.
- `grep -n "Failed to remove" src/backend/storeManagers/steam/gameUninstall.ts` lines all sit in `failUninstall(` calls.
- `git diff` of uninstaller.ts shows the td5 refused block and the success/throw paths unchanged.
- Live gate: none required. A failed rm is hard to provoke live (it needs a permission or busy-file error mid-delete). Optional operator note, NOT run and NOT claimed: restart `pnpm tauri:dev` (it does not rebuild the sidecar), `chmod 555` the parent of a bottle game's install folder, uninstall it, and expect the in-app "Couldn't finish uninstalling …" notice, the tile back to done, `gamelib.log` showing "Uninstall failed; keeping settings", no "Removing <appId>.json" line; then restore permissions and uninstall again successfully.
</verification>

<success_criteria>
- No failed Steam delete removes GameLib settings, logs, prefix or fix file, or raises an OS notification.
- Every failure route clears "Uninstalling" with exactly one done.
- The user sees an in-app retry message for every failure route.
- td5 refusals and successful uninstalls unchanged.
</success_criteria>

<output>
Create `.planning/quick/261108-anw-keep-settings-on-failed-steam-uninstall/261108-anw-SUMMARY.md` when done. Record the grep for other caught-delete returns, the rmSync throw technique that worked, and the optional live note as NOT run.
</output>
