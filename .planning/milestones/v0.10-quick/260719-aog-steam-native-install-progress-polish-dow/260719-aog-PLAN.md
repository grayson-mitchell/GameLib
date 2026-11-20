---
phase: quick-260719-aog
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/frontend/hooks/constants.ts
  - public/locales/en/gamepage.json
autonomous: true
requirements: [QUICK-260719-AOG]
must_haves:
  truths:
    - "During an active native steam:// install, the progressUpdate payload carries a non-empty download rate (downSpeed > 0)"
    - "ETA is populated (non-empty string) and decreases as the download progresses while speed > 0"
    - "A paused Steam download (BytesDownloaded frozen across N ticks) surfaces a distinct 'steam-paused' state instead of a frozen 'installing' bar"
    - "The bottle install path (source:'bottle') still emits its GAP-17-BOTTLE-PROGRESS percent — no regression"
    - "The games.ts:604 docstring no longer claims the poller sends no progress"
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "Speed + ETA + paused/stalled derivation in pollInstallOnce, extended activePolls entry"
      contains: "downSpeed"
    - path: "src/frontend/hooks/constants.ts"
      provides: "Frontend 'steam-paused' status label branch"
      contains: "steam-paused"
    - path: "public/locales/en/gamepage.json"
      provides: "steamPaused i18n key"
      contains: "steamPaused"
  key_links:
    - from: "src/backend/storeManagers/steam/library.ts (pollInstallOnce)"
      to: "progressUpdate IPC channel"
      via: "sendFrontendMessage('progressUpdate', { progress: { downSpeed, eta } })"
      pattern: "downSpeed"
    - from: "src/backend/storeManagers/steam/library.ts (pollInstallOnce)"
      to: "gameStatusUpdate IPC channel"
      via: "context: 'steam-paused'"
      pattern: "steam-paused"
    - from: "src/frontend/hooks/constants.ts (getStatusLabel)"
      to: "statusContext"
      via: "statusContext === 'steam-paused' branch"
      pattern: "steam-paused"
---

<objective>
Polish the native-installer-OFF Steam install UX (`steam://install` handoff → `startInstallPolling` → `pollInstallOnce`). The poller already streams a live percent (verified live 2026-07-19). Add the three missing pieces of a good install UX: download speed, ETA, and a visible paused/stalled state. Plus fix a now-misleading docstring.

Purpose: Make the simpler OFF path a genuinely good install experience — the fallback alternative to the hard-to-get-right Phase 21 native depot installer.
Output: `downSpeed` + non-empty `eta` in the `progressUpdate` payload, a `context: 'steam-paused'` hint with matching frontend label, and a corrected `games.ts` docstring.

This is polish on working code, not new plumbing. Reuse the existing `progressUpdate` and `gameStatusUpdate` IPC channels — NO new channel.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-07-19-steam-native-install-progress-speed-eta-paused-state.md
@CLAUDE.md

<orientation>
Before touching source, run `graphify query "pollInstallOnce activePolls steam install progress"` to re-scope the subgraph (project rule). Only read raw files after graphify orients you, or to pin exact line numbers.
</orientation>

<interfaces>
<!-- Extracted from the codebase — use directly, no exploration needed. -->

InstallProgress (src/common/types.ts:327) — the progressUpdate payload's `progress` object. downSpeed/eta already exist; NO type change needed:
```typescript
export interface InstallProgress {
  bytes: string
  eta: string
  folder?: string
  percent?: number
  downSpeed?: number   // number — already present; populate it
  diskSpeed?: number
  file?: string
}
```

activePolls entry (src/backend/storeManagers/steam/library.ts:1070) — the natural home for per-appId prev-bytes + timestamp + stalled counter:
```typescript
const activePolls = new Map<string, {
  timer: NodeJS.Timeout
  ticks: number
  seenDownloading: boolean
  notifiedWaiting: boolean
  // ADD: lastBytesDownloaded?: number, lastTickMs?: number, stalledTicks: number
}>()
```
Entry is initialized in startInstallPolling (library.ts:1385-1390) and read in pollInstallOnce as `const poll = activePolls.get(appId)`. NOTE: `poll` can be `undefined` when pollInstallOnce is called directly in unit tests — all new logic MUST degrade gracefully (no speed/eta, no paused) when `poll` is absent.

readAcfState 'downloading' result (library.ts:1145-1152) — the byte fields feeding the derivation:
```typescript
{ state: 'downloading', stateFlags,
  bytesDownloaded, bytesToDownload, bytesStaged, bytesToStage }  // all number, default 0
```

Current progress emit (library.ts:1288-1297) — where downSpeed/eta get added:
```typescript
sendFrontendMessage('progressUpdate', {
  appName: appId, runner: 'steam', status: 'installing',
  progress: { percent, bytes: getFileSize(numerator), eta: '' }  // eta '' is hardcoded — replace
})
```

Existing 'steam-waiting-for-restart' hint (the analog to follow):
- Backend emit: library.ts:1243-1251 (`context: 'steam-waiting-for-restart'` on gameStatusUpdate)
- Frontend label: src/frontend/hooks/constants.ts:32-39 (getStatusLabel switches on `statusContext`)
- i18n keys: public/locales/en/gamepage.json:373-374 (`steamInstalling`, `steamWaitingRestart`)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Derive download speed + ETA in pollInstallOnce, fix games.ts docstring</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    - Speed: given two consecutive ticks where BytesDownloaded goes 5→8 over a 3s interval, progressUpdate.progress.downSpeed is a finite number > 0. First tick (no prior sample) emits with no speed / downSpeed absent-or-0.
    - ETA: once downSpeed > 0, progress.eta is a non-empty string derived from (bytesToDownload - bytesDownloaded) / speed; it decreases as bytesDownloaded rises. When speed is 0/unknown, eta stays '' (today's behavior).
    - Preallocation guard: a non-linear BytesDownloaded jump (e.g. 0→huge in one tick from Steam preallocation) must not produce an absurd/Infinity speed — clamp/smooth so speed and eta stay finite and sane (never NaN/Infinity in the payload).
    - Bottle regression: an ACF with BytesToDownload=0 that falls back to BytesStaged (source-agnostic) STILL emits percent exactly as today (GAP-17-BOTTLE-PROGRESS); speed/eta absence there is acceptable and must not throw.
    - poll undefined: calling pollInstallOnce('730') with no active poll (direct test call) still emits percent and never throws — speed/eta simply absent.
  </behavior>
  <action>
Extend the activePolls entry type (library.ts:1070-1080) with `lastBytesDownloaded?: number`, `lastTickMs?: number`, and `stalledTicks: number` (Task 2 uses stalledTicks; initialize it here to 0). Initialize the new fields in the startInstallPolling entry literal (library.ts:1385-1390): `stalledTicks: 0` and leave the last* fields undefined.

In pollInstallOnce's 'downloading' branch (library.ts:1234-1299), after computing the existing numerator/denominator/percent, derive download speed from the DOWNLOAD bytes specifically (result.bytesDownloaded), NOT the staged numerator — "download speed" tracks bytes off the network. When `poll` exists and `poll.lastBytesDownloaded`/`poll.lastTickMs` are set, compute deltaBytes = bytesDownloaded - lastBytesDownloaded and deltaMs = now - lastTickMs; if deltaMs > 0 and deltaBytes >= 0, speedBytesPerSec = deltaBytes / (deltaMs/1000). Guard: if the result is not finite, skip it. To defuse Steam's preallocation spikes, ignore/clamp a single anomalous tick — do not emit a speed that would imply an ETA below zero or a non-finite value. Store the current bytesDownloaded + Date.now() into poll.lastBytesDownloaded/poll.lastTickMs each tick (only when poll exists) so the NEXT tick has a baseline.

Populate the payload: set `progress.downSpeed` (the InstallProgress field, a number) when speedBytesPerSec is finite and > 0. Replace the hardcoded `eta: ''` (library.ts:1295) with a computed ETA string when speedBytesPerSec > 0 and bytesToDownload > bytesDownloaded: remaining = bytesToDownload - bytesDownloaded, seconds = remaining / speedBytesPerSec; format as a short human string (reuse an existing time-format helper if one is already imported in this module, otherwise a minimal mm:ss / Hh Mm formatter). When speed is 0/unknown, keep eta ''. Do NOT change the percent derivation, the useStaged fallback, the denominator>0 guard, or the finite-percent skip — the bottle path depends on them verbatim.

Fix the docstring at games.ts:604 (inside the `install()` doc block, lines ~599-610): the line "Does NOT call sendProgressUpdate — Steam owns the download with its own UI." is now false — the poller streams a percent (and now speed/ETA). Reword to state that the OFF path's `pollInstallOnce` poller streams percent/speed/ETA over the progressUpdate channel derived from the ACF byte counts, while `install()` itself does not optimistically flip state (D-02).

Add unit tests to the existing `describe('pollInstallOnce()')` block (library.test.ts:2039). The block already uses jest.useFakeTimers and mocks vdf.parse per-test. For a two-tick speed test, call pollInstallOnce twice with rising BytesDownloaded while an active poll exists — drive it via startInstallPolling + jest timer advance, OR seed the activePolls baseline the same way the suite already exercises the poller, matching the existing mock style at lines 2090-2110. Assert: (a) downSpeed > 0 on the second tick, (b) eta is a non-empty string on the second tick, (c) the existing percent assertions still hold, (d) a bottle-style staged-fallback ACF still emits percent (regression). Do NOT place fenced code in this action — follow the existing test patterns in the file.
  </action>
  <verify>
    <automated>yarn test src/backend/storeManagers/steam/__tests__/library.test.ts -t "pollInstallOnce"</automated>
  </verify>
  <done>progressUpdate carries a finite downSpeed > 0 and a non-empty decreasing eta on an active download's second tick; bottle staged-fallback percent still emitted; no NaN/Infinity in any payload; poll-undefined direct calls still emit percent without throwing; games.ts:604 docstring corrected. Steam suite green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Paused/stalled detection + frontend 'steam-paused' hint</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/frontend/hooks/constants.ts, public/locales/en/gamepage.json</files>
  <behavior>
    - Paused detection: when BytesDownloaded does NOT advance across N consecutive downloading ticks (default N=3) AND a real download is in flight (bytesToDownload > 0, download not yet complete), gameStatusUpdate carries `context: 'steam-paused'`.
    - Active download does NOT flag paused: rising BytesDownloaded resets the stalled counter — no 'steam-paused' context emitted.
    - Staging-phase false-positive guard: an ACF in the staged fallback (bytesToDownload === 0, using BytesStaged) must NOT be flagged 'steam-paused' just because download bytes are 0 — only a genuinely in-flight-but-frozen download qualifies.
    - Waiting-for-restart precedence: a StateFlags===1026 handoff manifest keeps its existing 'steam-waiting-for-restart' context (never overridden by 'steam-paused').
    - Frontend: getStatusLabel with status 'installing', runner 'steam', statusContext 'steam-paused' returns the "Paused" label; the existing 'steam-waiting-for-restart' and default 'Installing…' branches are unchanged.
  </behavior>
  <action>
Backend (library.ts pollInstallOnce 'downloading' branch): using the `poll.stalledTicks` counter added in Task 1, compare the current bytesDownloaded against `poll.lastBytesDownloaded`. If a real download is in flight (bytesToDownload > 0 and bytesDownloaded < bytesToDownload) and bytesDownloaded did not advance since last tick, increment poll.stalledTicks; otherwise reset it to 0. When stalledTicks >= a small const threshold (define e.g. `const STALLED_TICKS_THRESHOLD = 3` near the other poll constants at library.ts:1082-1083), treat the install as paused. Emit `context: 'steam-paused'` on the gameStatusUpdate at library.ts:1246-1251 — but ONLY when NOT isWaitingForSteamRestart (restart hint takes precedence; do not clobber it). Guard the whole stalled logic behind `poll` existing so direct test calls with no active poll never flag paused. Do not emit a distinct progressUpdate for paused — the frozen percent already reflects reality; the paused signal rides the existing gameStatusUpdate context, mirroring 'steam-waiting-for-restart' exactly.

Frontend (src/frontend/hooks/constants.ts getStatusLabel, lines 32-39): extend the `installing` branch for runner 'steam'. Currently it is a two-way: `statusContext === 'steam-waiting-for-restart' ? restartLabel : installingLabel`. Add a `steam-paused` case so it becomes: restart hint → "Restart Steam to finish"; paused hint → new `t('gamepage:status.steamPaused', 'Paused')`; else "Installing…". Keep ordering so restart precedence matches the backend.

i18n (public/locales/en/gamepage.json): add a `"steamPaused": "Paused"` key adjacent to `steamInstalling`/`steamWaitingRestart` (lines 373-374), preserving alphabetical/existing ordering and valid JSON.

Tests: (backend) add cases to `describe('pollInstallOnce()')` — (a) three consecutive ticks with frozen BytesDownloaded (bytesToDownload>0) emits gameStatusUpdate with context 'steam-paused'; (b) rising BytesDownloaded across ticks never emits 'steam-paused'; (c) a StateFlags 1026 manifest keeps 'steam-waiting-for-restart' and is never given 'steam-paused'; (d) a staged-fallback ACF (bytesToDownload=0) is not flagged paused. Follow the existing fake-timer / vdf.parse mock style in the block. (frontend) if a getStatusLabel/constants unit test exists (see src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts as the analog), add a case asserting the 'steam-paused' label; otherwise a minimal test alongside it is acceptable.
  </action>
  <verify>
    <automated>yarn test src/backend/storeManagers/steam/__tests__/library.test.ts -t "pollInstallOnce" && yarn test src/frontend/hooks/__tests__/hasStatus.reconcile.test.ts</automated>
  </verify>
  <done>Frozen-download ACF surfaces context 'steam-paused' after the threshold; active download never does; restart-hint precedence preserved; staged fallback not flagged; getStatusLabel returns "Paused" for statusContext 'steam-paused'; steamPaused i18n key present and JSON valid.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam ACF file → GameLib | Untrusted on-disk manifest content (BytesDownloaded/BytesToDownload) parsed by readAcfState; already skipped-on-corrupt (T-2-01) |
| backend → renderer (IPC) | progressUpdate/gameStatusUpdate payloads cross into the frontend |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-AOG-01 | Denial of Service | pollInstallOnce speed/eta math | mitigate | Clamp/guard all divisions: never emit NaN/Infinity; skip non-finite speed; preallocation-jump guard prevents absurd values |
| T-AOG-02 | Tampering | ACF byte fields (attacker-writable file) | accept | Values only drive a display string; already coerced to Number()||0 in readAcfState; no code path or filesystem action keyed off them |
| T-AOG-SC | Tampering | npm/pip/cargo installs | accept | No new dependencies — reuses existing modules and IPC channels; nothing to install |
</threat_model>

<verification>
- Steam backend suite green: `yarn test src/backend/storeManagers/steam`
- Type check clean: `yarn tsc --noEmit` → 0 errors
- Lint clean: `yarn eslint src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/frontend/hooks/constants.ts` → 0 warnings/errors
- Regression: the pre-existing GAP-17-BOTTLE-PROGRESS percent tests (library.test.ts ~2090-2134) still pass unchanged — the bottle install path is NOT regressed by the speed/eta/paused changes.
- After code changes, run `graphify update .` to keep the knowledge graph current (project rule).
</verification>

<success_criteria>
- progressUpdate payload includes a non-empty download rate (downSpeed > 0) during an active native steam:// install.
- ETA is populated (non-empty, decreasing) while speed > 0; '' when speed unknown.
- A paused Steam download surfaces context 'steam-paused' → frontend shows "Paused" instead of a frozen installing bar.
- games.ts:604 docstring corrected.
- Bottle install path (source:'bottle') percent derivation unchanged (regression guard satisfied).
- Gate: steam suite passes, tsc 0 errors, eslint clean.
</success_criteria>

<output>
Create `.planning/quick/260719-aog-steam-native-install-progress-polish-dow/260719-aog-SUMMARY.md` when done.
</output>
