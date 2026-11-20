---
phase: quick-261114-obu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx
  - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss
  - src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts
  - public/locales/*/gamelib.json
  - public/locales/*/gamelib.mt.json
autonomous: true
requirements: [OPERATOR-FEEDBACK-261114-nxb-livecheck]

must_haves:
  truths:
    - "On a stale bridge Steam game the status line reads 'Installed - New Version Available! · Download about <size>' with no click needed"
    - "While the size is being computed the line reads 'Installed - New Version Available! · Checking update size…'"
    - "The action dock has no SteamUpdateInfo row: no extra height, no icon line above the buttons"
    - "The inline label carries only the download size, never the 'needs X free during update (estimate)' clause"
    - "A cached estimate (backend per-boot cache) is shown without a computeSize call, so repeat visits do not re-log-on"
    - "A failed size computation shows nothing extra (no error text) and is not retried for the same app+targetBuild in this renderer session"
    - "Registered, unknown and current states add nothing inline; non-Steam runners are unchanged"
    - "The update confirmation dialog (steamUpdateConfirm.ts) is untouched and still shows download + peak"
  artifacts:
    - path: "src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx"
      provides: "Inline async update-size label (auto-compute, once, cancellable)"
      exports: ["default"]
    - path: "src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx"
      provides: "Auto-compute, cache reuse, failure, cancellation, state gates"
    - path: "src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts"
      provides: "Source gates: no SteamUpdateInfo in the dock; it lives in GameStatus"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/components/GameStatus.tsx"
      to: "SteamUpdateInfo"
      via: "Steam hasUpdate branch returns a fragment: status text followed by <SteamUpdateInfo appName={gameInfo.app_name} hasUpdate={hasUpdate} />"
      pattern: "<SteamUpdateInfo"
    - from: "src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx"
      to: "window.api.getSteamUpdateInfo"
      via: "plain read on mount, then { computeSize: true } only when bridge+stale and no estimate"
      pattern: "computeSize: true"
---

<objective>
Follow-up to quick 261114-nxb (commits 0c18fac18, 7dc211ab5). The operator live-checked a stale
Hell Clock (1782460) and gave three LOCKED decisions:

- D-01 "For the download size, make this an async label." The size is computed automatically when
  the page shows a stale bridge Steam game. No "Show update size" click. While computing, show the
  existing 'Checking update size…' text, then the result. A failure shows nothing.
- D-02 "Don't want the extra height in the bottom panel." Remove the `SteamUpdateInfo` row from the
  action dock entirely.
- D-03 "Just have the size (download about n), can have that text follow installed status." Append
  the size inline to the GameStatus line: "Installed - New Version Available! · Download about 916 MB".
  Download size only, no peak clause. The confirm dialog keeps download + peak and is NOT touched.

**OPERATOR DECISION 2026-11-14 (record verbatim in the SUMMARY):** D-01 deliberately reverses the
Phase 74-12 click-only gate (D-09/D-15, threat T-74-39 "no silent authenticated logon") at the
operator's explicit request. Mounting the game page for a stale bridge game with no cached estimate
now takes one authenticated steam-user lease automatically.

Claude's discretion (choices made here):
- Keep the file and component name `SteamUpdateInfo` (repurposed as the inline label). Renaming it
  would churn `meta/i18nForkTouchedFiles.json` and the i18n gate scope for no user benefit.
- Inline output only for `kind: 'bridge'` + `state: 'stale'`. Registered, unknown, current and null
  render nothing (keep it minimal).
- One label for both estimate shapes: "Download about {{download}}". The fallback case
  (`oldManifestAvailable: false`) uses the same label; the confirm dialog still explains it.
- Separator " · " lives in the component's template literal, not the catalog (same pattern as the
  existing `${installed} - ${hasUpdates}` literal in GameStatus).

Backend facts (verified at planning time, no backend change needed):
- `src/backend/storeManagers/steam/updateInfo.ts`: a plain `getSteamUpdateInfo(appId)` returns the
  per-boot cached estimate (`state.estimate`, written by `estimateBridgeUpdate` via
  `updateStates.setEstimate`) when its `targetBuild` matches. It never authenticates.
- `{ computeSize: true }` ALWAYS re-runs `estimateBridgeUpdate` (authenticated lease, bounded by
  `ESTIMATE_TIMEOUT_MS` = 60 s, lease released in `finally`) when bridge+stale. So the frontend must
  call it only when the plain read returned bridge+stale with no `estimate`. That is what makes
  repeat visits free.
- Failure surfaces as `sizeError` set and `estimate` absent, or `null` on a thrown error. Neither is
  cached by the backend, so the frontend memoises failures per `appName@targetBuild`.

Purpose: the size is visible at a glance with no click and no added dock height.
Output: repurposed `SteamUpdateInfo` inline label, GameStatus wiring, dock row removed, SCSS deleted,
dead i18n keys removed, one new key, updated tests and gates.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261114-nxb-steam-game-page-update-button-and-update/261114-nxb-SUMMARY.md
@src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx
@src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx
@src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx
@src/backend/storeManagers/steam/updateInfo.ts

<interfaces>
common/types/steam.ts:
  export interface SteamUpdateInfo {
    kind: 'bridge' | 'registered'
    state: 'stale' | 'current' | 'unknown'
    installedBuild: string; targetBuild?: string; branch: string; reason?: string
    estimate?: { downloadBytes: number; peakBytes: number; oldManifestAvailable: boolean; isEstimate: true; freeBytes?: number }
    sizeError?: string
  }
window.api.getSteamUpdateInfo(appName: string, opts?: { computeSize: boolean }): Promise<SteamUpdateInfo | null>

GameStatus.tsx (Steam branch today, ~line 225):
  if (hasUpdate) {
    // quick 261114-nxb: Steam has the explicit SteamUpdateButton instead.
    if (isStore(runner, 'steam')) {
      return `${t('status.installed')} - ${t('status.hasUpdates','New Version Available!')}`
    }
    return (<span onClick=... className="updateText">...(Click to Update)</span>)
  }
  The returned label is rendered as a child of the italic status <p> (~line 368).
  This branch is only reached when not installing/updating/importing/queued.

GamePage/index.tsx dock today (~591-606):
  <div className="actionDock">
    <GameStatus gameInfo progress handleUpdate hasUpdate />
    {isStore(gameInfo, 'steam') && is_installed && (<SteamUpdateInfo appName={appName} hasUpdate={hasUpdate} />)}
    <div className="buttons"> <MainButton/> <SteamUpdateButton/> <LaunchOptionSelector/> ...
  Import at line 27: import SteamUpdateInfo from './components/SteamUpdateInfo'

gamePageActionDock.test.ts ~lines 177-218: describe 'Steam update controls in the dock (nxb)' with
three L7 tests: order incl. '<SteamUpdateInfo'; one mount each + before extraInfoWrapper; SCSS
tokens-only read of components/SteamUpdateInfo.scss. `tsx` there is the comment-stripped index.tsx;
`stripSourceComments`, `readFileSync`, `join` are already in scope.

i18n (gamelib namespace, gamelib.json, key prefix gamepage.update.*):
  used ONLY by SteamUpdateInfo.tsx today: showSize, registered, unknown
  also used by src/frontend/helpers/steamUpdateConfirm.ts (KEEP): checkingSize, sizesEstimate,
  fallback, anyway, cancel, confirmButton, confirmTitle, notEnoughDisk
  `sizes` is pre-existing and appears unused already; out of scope, leave it, mention in SUMMARY.
  All 48 non-en locales carry translations of these keys, and each `gamelib.mt.json` lists them in
  its `keys` array. meta/__tests__/gamelibCatalogParity.test.ts fails on any locale key absent from
  en/gamelib.json (orphan), so removing a key from en means removing it from every locale too.
  i18next-parser runs with keepRemoved: true, so it never deletes keys itself.
  All public/locales/** JSON is prettier-ignored (`npx prettier --file-info` -> ignored:true).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Inline async size label in GameStatus; remove the dock row and SCSS; tests and gates</name>
  <files>src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx, src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss, src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx, src/frontend/screens/Game/GamePage/components/GameStatus.tsx, src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx, src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts</files>
  <behavior>
    SteamUpdateInfo.test.tsx (keep the existing hook harness: slot useState, collected useEffect,
    re-render on dirty; drop the SCSS and CloudDownload mocks once those imports are gone; make
    `render()` take appName so tests can use distinct appNames, since the failure memo is
    module-level; capture the cleanup returned by each effect fn):
    - plain read returns bridge+stale with no estimate -> exactly one call with { computeSize: true };
      while that promise is pending the output text is ' · Checking update size…' (catalog value);
      after it resolves with an estimate of 960495616 bytes the text is ' · Download about ' + size(960495616)
      and contains neither 'needs' nor 'free during update'.
    - plain read already carries an estimate -> label shown, and the mock was never called with computeSize.
    - oldManifestAvailable false estimate -> same 'Download about' label (no fallback sentence).
    - compute resolves with sizeError and no estimate -> renders null; compute rejects -> renders null.
    - after a failure, a fresh mount of the SAME appName with the same targetBuild makes no second
      computeSize call (failure memo); a different targetBuild does compute.
    - cleanup before the compute resolves -> no state update after it resolves (dirty stays false).
    - registered, unknown, current, and null results -> null and no computeSize call.
    - libraryStatus change still triggers a fresh plain read (existing refetch test, adapted).
    GameStatus.steamUpdate.test.tsx (mock '../SteamUpdateInfo' to a named stub function):
    - steam: text still contains 'New Version Available!', no 'Click to Update', no onClick, AND the
      tree contains exactly one element whose type is the stub with props appName '1'.
    - legendary: unchanged clickable assertions, and NO stub element in the tree.
    gamePageActionDock.test.ts, rewrite the nxb describe:
    - order gate without '<SteamUpdateInfo': actionDock, <GameStatus, className="buttons", <MainButton,
      <SteamUpdateButton, <LaunchOptionSelector, actionDockSpacer.
    - index.tsx has zero '<SteamUpdateInfo' and does not match /import SteamUpdateInfo/; exactly one
      '<SteamUpdateButton'.
    - comment-stripped GameStatus.tsx contains exactly one '<SteamUpdateInfo'.
    - components/SteamUpdateInfo.scss does not exist (existsSync false); replace the old SCSS token test.
    The L6 dock-order test stays unchanged and green.
  </behavior>
  <action>
    Per D-01/D-03, rewrite `SteamUpdateInfo.tsx` as an inline label component, same default export
    and props `{ appName: string; hasUpdate: boolean }`. Remove the CloudDownload, SCSS import, the
    `loading`-gated button and the `showSize` handler. Keep `useTranslation('gamelib')`, `size` from
    'frontend/helpers', and the `useLibraryState` libraryStatus selector. Hooks run unconditionally
    before any early return.
    Module scope: `const sizeRequests = new Map<string, Promise<SteamUpdateInfoData | null>>()`
    (in-flight dedupe, keyed `${appName}@${targetBuild}`, entry deleted when it settles) and
    `const failedSizes = new Set<string>()` (same key). State: `info` and `computing` (boolean).
    One `useEffect` on `[appName, hasUpdate, libraryStatus]`: `let cancelled = false`; reset info and
    computing; plain `getSteamUpdateInfo(appName)`; if cancelled stop; set info; then if
    `result?.kind === 'bridge' && result.state === 'stale' && !result.estimate` and the key is not in
    `failedSizes`, set computing true and await the shared request (reuse the map entry or create it
    with `getSteamUpdateInfo(appName, { computeSize: true })`). On resolve with an estimate, set info
    to it (if not cancelled). On resolve without an estimate, or on rejection, add the key to
    `failedSizes`. Always clear computing if not cancelled. Every `.catch` swallows: never throw, never
    surface an error string. Cleanup sets cancelled. This fires once per mount/state change and never
    loops (no state it sets is in its deps).
    Render: null unless info is bridge+stale. If `info.estimate` return the string
    `` ` · ${t('gamepage.update.downloadAbout', 'Download about {{download}}', { download: size(info.estimate.downloadBytes) })}` ``.
    Else if computing return `` ` · ${t('gamepage.update.checkingSize', 'Checking update size…')}` ``.
    Else null. Rewrite the header comment: quick 261114-obu, operator decision 2026-11-14 reverses
    74-12 D-09/D-15/T-74-39 (auto-compute), plus the cache/memo reasoning above.
    `git rm` `SteamUpdateInfo.scss` (D-02: no styling of its own; the text inherits the status <p>).
    In `GameStatus.tsx` Steam `hasUpdate` branch (per D-03) return a fragment: the existing
    `${t('status.installed')} - ${t('status.hasUpdates', ...)}` text followed by
    `<SteamUpdateInfo appName={gameInfo.app_name} hasUpdate={hasUpdate} />`. Import SteamUpdateInfo
    from './SteamUpdateInfo'. Update the branch comment to cite 261114-obu. Non-Steam branch untouched.
    In `GamePage/index.tsx` (D-02) delete the `{isStore(gameInfo, 'steam') && is_installed && (<SteamUpdateInfo .../>)}`
    block from the actionDock and the `import SteamUpdateInfo` line. Leave `isStore`/`is_installed`
    alone if still used elsewhere (tsc/eslint will tell you).
    Write/adjust tests first (RED), then implement (GREEN). Do not touch steamUpdateConfirm.ts.
    Before running prettier, confirm with `npx prettier --file-info <path>` (one path per call) that
    each written .ts/.tsx path is not ignored; they were not at planning time.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Game/GamePage src/frontend/helpers/__tests__/steamUpdateConfirm.test.ts && npx tsc --noEmit && npx eslint src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx src/frontend/screens/Game/GamePage/components/GameStatus.tsx src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts && npx prettier --check src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx src/frontend/screens/Game/GamePage/components/GameStatus.tsx src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateInfo.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts && test ! -e src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss</automated>
  </verify>
  <done>All GamePage suites plus steamUpdateConfirm pass, including the rewritten SteamUpdateInfo, GameStatus.steamUpdate and dock L7 gates (L6 unchanged); tsc, eslint and the scoped prettier check pass; the SCSS file is gone; index.tsx has no SteamUpdateInfo mount or import.</done>
</task>

<task type="auto">
  <name>Task 2: i18n catalogs (add downloadAbout, drop dead keys in all locales), gates, commit</name>
  <files>public/locales/*/gamelib.json, public/locales/*/gamelib.mt.json</files>
  <action>
    First grep `src/` for `gamepage.update.showSize`, `gamepage.update.registered` and
    `gamepage.update.unknown` (also bare `update.showSize` etc.). Expect zero hits after Task 1. Only
    remove keys with zero hits; keep anything still referenced.
    Add `gamepage.update.downloadAbout` = "Download about {{download}}" to `public/locales/en/gamelib.json`
    only, keeping the `update` object's keys alphabetically sorted (it sits between `confirmTitle` and
    `fallback`). Other locales fall back to English; note in the SUMMARY that the key is English-only
    until the next `pnpm machine-fill-gamelib` run. Do not hand-translate.
    Remove `showSize`, `registered`, `unknown` from `gamepage.update` in EVERY `public/locales/*/gamelib.json`
    (en + 48), and remove the matching dotted entries from each `public/locales/*/gamelib.mt.json`
    `keys` array. Use a small node script in the scratchpad that reads, edits and writes with
    `JSON.stringify(obj, null, 2) + '\n'`. Then check `git diff --numstat public/locales`: every
    non-en gamelib.json must show exactly 0 added / 3 deleted, each mt.json 0 / 3, en 1 / 3. If any file
    shows more churn, the serialiser changed the formatting: revert it and edit by line instead.
    Do not touch translation.json / gamepage.json / login.json (the churn guard forbids it).
    All public/locales JSON is prettier-ignored (`npx prettier --file-info` -> ignored:true), so no
    prettier check applies to these files. Say so in the SUMMARY rather than running a check that
    proves nothing.
    Commit. The working tree has unrelated dirty files and a concurrent phase-70 executor commits
    on main. Stage only this plan's files with explicit `git add <file>` (plus `git rm` for the SCSS)
    and `git commit`. Never use `gsd-sdk query commit`: it sweeps every dirty .planning file. Two
    commits are fine (Task 1 code, Task 2 catalogs). Afterwards run `graphify update .`.
    In the SUMMARY record the operator decision (2026-11-14, reverses 74-12 D-09/D-15/T-74-39) and
    the dead `sizes` key left in place.
  </action>
  <verify>
    <automated>npx jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts src/frontend/screens/Game/GamePage src/frontend/helpers/__tests__/steamUpdateConfirm.test.ts && test -z "$(grep -rn 'gamepage.update.showSize\|gamepage.update.registered\|gamepage.update.unknown' src)" && node -e "const c=require('./public/locales/en/gamelib.json').gamepage.update; if(c.downloadAbout!=='Download about {{download}}'||c.showSize||c.registered||c.unknown) process.exit(1)"</automated>
    <human-check>Operator live check (not blocking): restart `pnpm tauri:dev` (renderer-only change, no sidecar rebuild needed) and open stale Hell Clock (1782460). Confirm the status line shows 'Installed - New Version Available! · Checking update size…' and then '· Download about N MB' with no click; the dock has no extra row; navigating away and back shows the size immediately (cached, no second logon in the log); Mac Steam's Friends list stays signed in; the Update button's confirm dialog still shows download + peak.</human-check>
  </verify>
  <done>The en catalog has downloadAbout and none of showSize/registered/unknown; no locale or mt manifest carries those three; parity, hardcoded-string and churn-guard gates pass; diffs are deletion-only outside en; only this plan's files are committed; graphify updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC | existing `getSteamUpdateInfo` call; no new IPC surface |
| sidecar -> Steam CM (authenticated) | `estimateBridgeUpdate` takes a steam-user authenticated lease; now reachable from page mount |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-obu-01 | Information disclosure / unwanted session | SteamUpdateInfo auto computeSize (reverses T-74-39) | accept | Operator decision 2026-11-14. Bounded: only bridge+stale with no cached estimate; backend per-boot cache makes repeat visits free; lease bounded by ESTIMATE_TIMEOUT_MS and released in finally |
| T-obu-02 | Denial of service (logon loop) | SteamUpdateInfo effect | mitigate | Module-level in-flight Map dedupes concurrent mounts; failedSizes Set stops retries per appName@targetBuild; effect deps exclude state it sets; cleanup cancels |
| T-obu-03 | Information disclosure (error text) | inline label | mitigate | sizeError and rejections render nothing; no error string reaches the UI |
</threat_model>

<verification>
- `npx jest src/frontend/screens/Game/GamePage` and the meta i18n gates green.
- `npx tsc --noEmit` clean; scoped eslint and prettier green on every written .ts/.tsx path.
- `src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss` deleted; index.tsx has no SteamUpdateInfo.
</verification>

<success_criteria>
A stale bridge Steam game's status line shows "Installed - New Version Available! · Download about N"
computed automatically, with a short pending text first and nothing on failure; the action dock has
no extra row; repeat visits reuse the cached estimate; dead i18n keys and SCSS are gone.
</success_criteria>

<output>
Create `.planning/quick/261114-obu-steam-update-size-as-async-label-after-i/261114-obu-SUMMARY.md` when done
</output>
