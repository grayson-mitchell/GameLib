---
phase: quick-261110-vdk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts
  - src/backend/__tests__/quitTeardownWiring.test.ts
  - .planning/todos/pending/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md
  - .planning/todos/completed/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md
autonomous: true
requirements:
  - TODO-2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir

must_haves:
  truths:
    - "When a GOG game launches with a signed-in user and cometSupport not false, comet is spawned with --access-token/--refresh-token/--user-id/--username/--quit and never with --from-heroic"
    - "When GOGUser.getCredentials returns undefined (offline / signed out), comet is not spawned, a warning is logged, and the game still launches"
    - "When experimentalFeatures.cometSupport === false or userData.username is missing, comet is not spawned and getCredentials is not called"
    - "No GOG token value reaches gamelib.log or the comet runner log (argv is not logged by the runner; comet's own stdout/stderr is redacted before it reaches the comet log writer)"
    - "The todo is closed: moved to .planning/todos/completed/ with a Resolution section"
  artifacts:
    - path: "src/backend/storeManagers/gog/games.ts"
      provides: "token-mode comet spawn in GOGGame.launch"
      contains: "'--access-token'"
    - path: "src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts"
      provides: "argv pin + skip cases + redaction case for comet"
      contains: "--refresh-token"
    - path: ".planning/todos/completed/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md"
      provides: "closed todo with Resolution"
      contains: "## Resolution"
  key_links:
    - from: "src/backend/storeManagers/gog/games.ts (launch)"
      to: "GOGUser.getCredentials(this.deps)"
      via: "await before spawnLongLived"
      pattern: "GOGUser\\.getCredentials\\(this\\.deps\\)"
    - from: "src/backend/__tests__/quitTeardownWiring.test.ts C7"
      to: "games.ts comet spawn site"
      via: "source-text anchor near spawnLongLived( and id: 'gog-comet'"
      pattern: "--access-token"
---

<objective>
Fix the GOG comet panic at launch. comet v0.2.0's `--from-heroic` hard-codes
`<home>/Library/Application Support/heroic/gog_store/auth.json` (no path option, no env
override — settled by the orchestrator via `comet --help` and `strings`), while GameLib keeps
GOG auth under `gamelib/gog_store`. Switch comet to token mode, sourcing tokens from
`GOGUser.getCredentials(this.deps)`, skip comet cleanly when credentials are unavailable, keep
tokens out of every log, pin the argv in tests, and close the todo.

Purpose: Galaxy features (achievements, presence via comet) work for GOG games instead of comet
dying at start.
Output: patched `games.ts`, updated launch tests + C7 structural test, closed todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md
@src/backend/storeManagers/gog/games.ts (lines ~826-875 only: the comet block in launch())
@src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts (lines 1-220 mocks/harness, 305-395 the `GOGGame.launch: comet on the process runner` describe)
@src/backend/__tests__/quitTeardownWiring.test.ts (lines 172-184, test C7)

Load `Skill("gamelib-conventions")` before writing — the `<verify>` prettier rule and the
todo-close conventions apply. No new child-process spawn site is added (comet already goes
through `this.deps.runner.spawnLongLived`), so the fake-HOME rule is not triggered.

<interfaces>
Current comet block in GOGGame.launch (games.ts ~833-858):
- `const userData: UserData | undefined = this.deps.stores.gog.configStore.get_nodefault('userData')`
- `let comet: LongLivedHandle | undefined`
- `const cometLogWriter = getRunnerLogWriter('comet')`
- guard: `userData && userData.username && GlobalConfig.get().getSettings().experimentalFeatures?.cometSupport !== false`
- `const path = getCometBin()`; `comet = this.deps.runner.spawnLongLived(join(path.dir, path.bin), ['--from-heroic', '--username', userData.username, '--quit'], { id: 'gog-comet', onStdout: (data: string) => cometLogWriter.writeString(data), onStderr: (data: string) => cometLogWriter.writeString(data) })`
- `logInfo(\`Launching Comet!\`, LogPrefix.Gog)`
- after runRunnerCommand: `comet.unregister(); comet.kill()`

GOGUser (src/backend/storeManagers/gog/user.ts, already imported in games.ts as `import { GOGUser } from './user'`):
- `static getCredentials(deps: GOGUserDeps): Promise<GOGCredentials | undefined>` — returns undefined when offline (logs its own warning, spawns nothing); TTL-cached, otherwise spawns `gogdl auth` with `authLogSanitizer`. Already called as `GOGUser.getCredentials(this.deps)` at 5 other sites in games.ts.

GOGCredentials (src/common/types/gog.ts:480): `access_token: string`, `refresh_token: string`, `user_id: string` (Galaxy user id — what comet's `--user-id` means), plus `expires_in`, `token_type`, `scope`, `session_id`, `loginType`.

comet v0.2.0 CLI: `--access-token <T> --refresh-token <T> --user-id <ID> --username <U>` (username required) `--quit`.

Runner logging (src/backend/process/runner.ts `spawnLongLived`, ~301-363): argv is passed to `spawn` and NEVER logged; the only runner log line is `deps.log.warn(\`${opts.id}: ${err.message}\`)` on spawn error (Node spawn error messages carry the command path, not argv). Child stdout/stderr go to `opts.onStdout`/`opts.onStderr` and `opts.logSink` (with optional `opts.sanitize`); the comet call site uses onStdout/onStderr only.

Test harness (gogImportGame.test.ts): `jest.mock('../user', ...)` exposes `GOGUser.getCredentials: jest.fn()`; `resetMocks: true` so implementations must be set inside the harness/beforeEach. `launchHarness()` builds a `createScriptedRunner([{ cmd: '/fake/comet/comet', argv: [...] }])` — an argv mismatch makes the scripted runner throw. `GlobalConfig.get` is mocked to `{ config: {}, getSettings: () => ({}) }`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Spawn comet in token mode from GOGUser.getCredentials, redact tokens from comet output, pin argv in tests</name>
  <files>src/backend/storeManagers/gog/games.ts, src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts, src/backend/__tests__/quitTeardownWiring.test.ts</files>
  <behavior>
    In the `GOGGame.launch: comet on the process runner` describe of gogImportGame.test.ts (write these first, watch the argv pin go RED against the current `--from-heroic` code):
    - Test A (argv pin): with `GOGUser.getCredentials` resolving `{ access_token: 'AT-secret', refresh_token: 'RT-secret', user_id: 'galaxy-42', ... }` and userData `{ username: 'player1' }`, exactly one spawnLongLived call with cmd `/fake/comet/comet`, argv exactly `['--access-token', 'AT-secret', '--refresh-token', 'RT-secret', '--user-id', 'galaxy-42', '--username', 'player1', '--quit']`, opts id `gog-comet`; argv does not contain `--from-heroic`; `GOGUser.getCredentials` called once with the game's deps. Keep the existing teardownAll-does-not-throw assertion.
    - Test B (credentials undefined): getCredentials resolves undefined → zero spawnLongLived calls, `logWarning` called once with a message mentioning comet, `mockRunRunnerCommand` still called (game launched), launch resolves true.
    - Test C (cometSupport false): `GlobalConfig.get` getSettings returns `{ experimentalFeatures: { cometSupport: false } }` → zero spawnLongLived calls AND getCredentials not called.
    - Test D (no username): userData `{}` (no username) → zero spawnLongLived calls AND getCredentials not called.
    - Test E (redaction): existing "routes comet stdout and stderr" test keeps `'out-chunk'`/`'err-chunk'` pass-through; add that `opts.onStdout('token=AT-secret refresh=RT-secret')` results in `mockCometLog.writeString` receiving a string that contains neither `AT-secret` nor `RT-secret` (contains `<redacted>` instead).
    - Test F (no token in logs): across Tests A and E, no call argument of the mocked `logInfo`, `logWarning`, `logError` or `logDebug` (from `backend/logger`) contains `AT-secret` or `RT-secret`.
  </behavior>
  <action>
    Tests: make `launchHarness()` accept options (credentials, settings, userData) and set `(GOGUser.getCredentials as jest.Mock).mockResolvedValue(...)` inside it (resetMocks is on); import `GOGUser` from `'../user'` (the module is already mocked). The scripted runner step argv becomes the token-mode argv from the behavior block. Add Tests A-F.

    games.ts, inside launch() — replace only the comet block, keep it at the same place and keep the spawn call inline in games.ts (C7 inspects this file's text):
    1. Keep the existing guard (userData?.username and `cometSupport !== false`) as the OUTER condition so a disabled comet or missing username never triggers a `gogdl auth` spawn.
    2. Inside the guard: `const cometCredentials = await GOGUser.getCredentials(this.deps)`. If it is undefined or any of `access_token`, `refresh_token`, `user_id` is empty, call `logWarning('Comet not started: GOG credentials unavailable (offline or signed out); Galaxy features disabled for this session', LogPrefix.Gog)` and do not spawn — the game launch continues (no panic-spawn, per orchestrator decision). Confirm `logWarning` is imported in games.ts; add it to the existing `../../logger` import if not.
    3. Otherwise spawn with argv `['--access-token', cometCredentials.access_token, '--refresh-token', cometCredentials.refresh_token, '--user-id', cometCredentials.user_id, '--username', userData.username, '--quit']`. Use credentials' `user_id` (authoritative fresh source), not `userData.galaxyUserId`. Keep `id: 'gog-comet'` and the existing comment about runner-tracked teardown.
    4. Redaction (Claude's discretion: comet's own output is untrusted — it may echo tokens in debug/error lines, and runner logs can be uploaded): add a small module-level, non-exported helper in games.ts, e.g. `redactSecrets(text: string, secrets: readonly string[]): string`, that replaces every occurrence of each non-empty secret with `<redacted>` using split/join (no regex — tokens may contain regex metacharacters). onStdout/onStderr pass `redactSecrets(data, [access_token, refresh_token])` to `cometLogWriter.writeString`.
    5. Do NOT log the argv, the credentials object, or any token anywhere. `logInfo('Launching Comet!', LogPrefix.Gog)` stays as-is. Do not add a `// log-secret-gate-exempt` comment — nothing here should need one.
    6. The `await` adds at most one `gogdl auth` spawn before the game starts, only when the TTL cache has expired; acceptable, note it in the SUMMARY.

    Token-logging audit (record the result in the SUMMARY): confirm by reading runner.ts `spawnLongLived` that argv is never written to `deps.log` or any sink (already established — re-confirm in one Read of lines ~301-363, no wider exploration), and that games.ts's comet block passes no `logSink`.

    quitTeardownWiring.test.ts C7: change the anchor from `"'--from-heroic'"` to `"'--access-token'"` (keep the ±400 window asserting `spawnLongLived(` and `id: 'gog-comet'`), add `expect(code).not.toContain("'--from-heroic'")`, and add a one-line comment citing quick 261110-vdk (comet moved to token mode because `--from-heroic` hard-codes Heroic's config dir).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts src/backend/__tests__/quitTeardownWiring.test.ts meta/__tests__/logSecretGate.test.ts && npx tsc --noEmit && npx eslint src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts src/backend/__tests__/quitTeardownWiring.test.ts && npx prettier --check src/backend/storeManagers/gog/games.ts src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts src/backend/__tests__/quitTeardownWiring.test.ts && test "$(grep -v '^\s*//' src/backend/storeManagers/gog/games.ts | grep -c "'--from-heroic'")" = "0"</automated>
  </verify>
  <done>Tests A-F pass (A was RED before the games.ts change); C7 anchors on `--access-token` and asserts `--from-heroic` is gone; logSecretGate, tsc, eslint and prettier (all three paths report `ignored: false`) are green; games.ts contains no live `'--from-heroic'`.</done>
</task>

<task type="auto">
  <name>Task 2: Close the todo with a Resolution section</name>
  <files>.planning/todos/pending/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md, .planning/todos/completed/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md</files>
  <action>
    `git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/` (same filename). Keep its frontmatter unchanged (completed/ is exempt from the triage gate, but do not strip keys). Append a `## Resolution` section, matching the prose shape of `.planning/todos/completed/2026-11-01-invite-picker-raises-whole-main-window.md`, stating: quick 261110-vdk; comet v0.2.0 has no config-path option or env override (`--from-heroic` hard-codes `heroic/gog_store/auth.json`), so GameLib now spawns comet in token mode from `GOGUser.getCredentials` (access/refresh token, Galaxy `user_id`, username); comet is skipped with a warning when credentials are unavailable (offline / signed out) and the game still launches; comet's stdout/stderr is token-redacted before the comet runner log; tests pinning argv and the skip paths live in `gogImportGame.test.ts` and C7 in `quitTeardownWiring.test.ts`; accepted trade-off: tokens are visible in comet's argv to `ps` for the life of the game session; operator live check (`pgrep -fl comet` while a GOG game plays, and no panic in the comet runner log) is pending and not blocking.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md && grep -c '^## Resolution' .planning/todos/completed/2026-11-10-comet-from-heroic-reads-wrong-gog-auth-dir.md && pnpm planning-gates</automated>
    Prettier: `npx prettier --file-info` reports `{ "ignored": true, "inferredParser": null }` for `.planning/todos/completed/*.md` (checked against the 2026-11-01 sibling during planning), so a `--check` would be vacuous and is deliberately omitted per the conventions skill. Re-confirm with `--file-info` on the moved file; if it reports `ignored: false`, run `npx prettier --check` on it.
  </verify>
  <done>Todo exists only under completed/ with a Resolution section naming the fix, the ps-argv trade-off, and the pending operator check; `pnpm planning-gates` green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend -> comet child process | GOG OAuth tokens cross into a third-party binary via argv |
| comet stdout/stderr -> comet runner log | untrusted child output written to a log file that can be uploaded |
| backend -> gamelib.log | any log call near the spawn site |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vdk-01 | Information disclosure | games.ts comet spawn logging | mitigate | No log call interpolates argv/credentials; runner.ts spawnLongLived never logs argv (re-confirmed in Task 1); Test F asserts no token reaches logInfo/logWarning/logError/logDebug; logSecretGate meta test runs in verify |
| T-vdk-02 | Information disclosure | comet stdout/stderr -> cometLogWriter | mitigate | `redactSecrets` replaces access/refresh token values with `<redacted>` before writeString; Test E pins it |
| T-vdk-03 | Information disclosure | comet argv visible via `ps` to same-host users | accept | comet v0.2.0 offers no stdin/file/env token channel and `--from-heroic` is hard-wired to Heroic's path; single-user desktop, same exposure Heroic accepts; recorded in SUMMARY and todo Resolution |
| T-vdk-04 | Denial of service | launch path awaiting getCredentials | accept | getCredentials is TTL-cached and returns undefined immediately offline; worst case one `gogdl auth` spawn before game start; failure path skips comet, never blocks launch |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/gog/__tests__/gogImportGame.test.ts src/backend/__tests__/quitTeardownWiring.test.ts meta/__tests__/logSecretGate.test.ts` green
- `npx tsc --noEmit` green
- `pnpm planning-gates` green

Human check (operator, NOT blocking this task; record as pending in SUMMARY): `pnpm tauri:dev` (after `pnpm build:sidecar` if the sidecar is stale), launch a GOG game while online, then in a terminal run `pgrep -fl comet` — expect a comet process with `--access-token` in its argv and no `--from-heroic`; the comet runner log shows no `heroic.rs` panic and contains no raw token. Quit the game — comet is gone (`pgrep -fl comet` empty).
</verification>

<success_criteria>
- comet is spawned in token mode with credentials from `GOGUser.getCredentials`; `--from-heroic` is gone from games.ts
- Credentials-unavailable, cometSupport=false and no-username paths skip comet without spawning, and the game still launches
- No token value appears in any log call or in the comet runner log output path
- Todo moved to completed/ with a Resolution section; SUMMARY records the token audit, the accepted ps-argv trade-off, and the pending operator live check
</success_criteria>

<output>
Create `.planning/quick/261110-vdk-fix-comet-from-heroic-reading-heroic-gog/261110-vdk-SUMMARY.md` when done
</output>
