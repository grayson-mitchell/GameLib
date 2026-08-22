---
status: resolved
trigger: "Log upload sends unredacted content to a public paste — no audit performed"
created: 2026-08-22T00:00:00Z
updated: 2026-08-22T00:00:00Z
resolved: 2026-08-22T00:00:00Z
---

## Current Focus

hypothesis: RESOLVED — the two credentials the todo named (Steam refresh token, revealed
  Humble key) are NOT reachable from an uploadable log. A THIRD, unnamed one was: the GOG
  access_token/refresh_token/session_id, via `gog/user.ts`'s raw-stdout logError.
test: Multi-line census of all 77 secret-adjacent log calls under src/backend; RED-proven
  regression test against the reintroduced defect.
expecting: n/a — closed.
next_action: NONE. Fixed, tested (RED-proven), audit re-run to confirm closure. One
  defense-in-depth design call deferred to the user as its own todo.

## Symptoms

expected: Log content sent to a third-party public paste contains no live credentials.
actual: UNKNOWN — never audited. `uploadLogFile` (src/backend/logger/uploader.ts) POSTs up to
  10 MiB of log content to `https://dpaste.com/api/v2/` as a public paste with a 2-day expiry,
  and there is no redaction anywhere in `src/backend/logger/`.
errors: none — this is not a failure report. There is no error, no crash, and no observed leak.
reproduction: |
  Not a bug repro. The audit is static in the first instance:
  1. `uploadLogFile` in src/backend/logger/uploader.ts is invoked behind a confirm dialog
     (src/frontend/components/UI/LogFileUploadDialog/index.tsx) — NOT a silent background upload.
  2. It reads log file content via getLogFilePath / readPartOfFile and POSTs it to dpaste.com.
  3. The open question is what can be IN that content.
started: Predates the Tauri port. The threat surface is identical in the Electron and Tauri
  builds. GameLib adds Steam refresh tokens and revealed Humble key values that upstream Heroic
  never had, so the potential blast radius is larger here than upstream.

## Constraints (from the todo — do not violate)

- **This todo carries NO confirmed finding.** A bounded audit of whether a live credential can
  actually reach a log line was explicitly DECLINED by the user during Phase 34.3
  context-gathering (D-09). Do not write this up as a demonstrated leak. It has not been checked
  either way.
- **Audit before fix.** Do not jump to adding a scrub pass. Establish reachability first.
- **Census, do not sample.** Prior art in this repo: auditing a redaction by tracing ONE caller
  found 1 leak; censusing the whole LIST found 3. Enumerate every log call site that can touch a
  secret and give each an explicit verdict.
- **Three legitimate outcomes**, all acceptable:
  1. A reachable path is found -> add redaction before upload, then RE-RUN the audit to prove
     the path is closed.
  2. No reachable path -> downgrade this todo to a documented non-issue. Do NOT close it
     silently and do NOT delete the record.
  3. Inconclusive -> record exactly what was checked and what remains unchecked.

## Verified at HEAD (2026-08-22, before this session opened)

- `grep -rn "redact\|scrub\|sanitiz" src/backend/logger/` -> **zero matches**. No redaction
  exists anywhere in the logger package.
- `src/backend/logger/uploader.ts` still POSTs to `https://dpaste.com/api/v2/` with a 10 MiB cap
  (`KiB`/`MiB` consts) and `EXPIRY_DAYS = 2`.
- Logger package contents: constants.ts, electronStores.ts, formatter.ts, index.ts,
  ipc_handler.ts, log_writer.ts, paths.ts, types.ts, uploader.ts, __tests__/

## Evidence

- timestamp: 2026-08-22 — **SINK MAPPED.** `uploadLogFile` (uploader.ts:55) =
  `readPartOfFile(getLogFilePath(args), 10 * MiB)` -> `encodeURIComponent(...)` -> POST to
  `https://dpaste.com/api/v2/`. `getLogFilePath` (paths.ts) resolves exactly three families:
  (a) `gamelib.log`, (b) `runners/<runner>.log`, (c) `games/<appName>_<runner>/<type>.log`.
  The UI can upload ANY of the three: `LogSettings/index.tsx:241` passes `showLogOf` straight
  through as `logFileArgs`, and `showLogOf` ranges over all three shapes.

- timestamp: 2026-08-22 — **ROUTING: the default logger IS an uploadable sink.** The
  module-level `logInfo`/`logError`/`logWarning`/`logDebug` (logger/index.ts:14-24) all delegate
  to `heroicLogWriter`, whose file is `gamelib.log`. So reachability does NOT need a special
  path: any backend log call carrying a secret lands in an uploadable file. This collapses the
  audit to "does any log call emit a live credential".

- timestamp: 2026-08-22 — **FORMATTER: unknown values are dumped WHOLE.**
  `convertUnknownToString` (formatter.ts) returns `message.stack` for an `Error`, but falls
  through to `JSON.stringify(message, null, 2)` for anything else. So passing a plain object to
  a log call pretty-prints every field. Mitigating: an `Error` is reduced to its stack, so the
  common `logError([msg, err])` shape does NOT dump an axios `config`/`response`.

- timestamp: 2026-08-22 — **METHOD CORRECTION (census, not sample).** A line-oriented
  `grep -E "log(Error|...)[^;]*stdout"` MISSED the one real finding below, because `logError(`
  and its template literal sit on different lines. Re-ran the census with a multi-line
  brace-matching scan (python `re.S`) over all of `src/backend` excluding `__tests__`:
  **77 multi-line log calls** mention a secret-shaped identifier. All 77 reviewed.

- timestamp: 2026-08-22 — **Runner-command vector: CLOSED, no drift.**
  `getRunnerCallWithoutCredentials` (launcher.ts:1876) redacts `--code`, `--token`,
  `--code-verifier`, `--password`, `--serial`, `--client-id`, and `callRunner:1703` logs only
  the resulting `safeCommand`. Re-ran Phase 34.5's own census grep at HEAD, widened with
  `secret|refresh-token|api-key|auth|session|cookie|key`: the only secret-carrying flags in
  `src/backend` are `--code` (gog/user.ts:83, nile/user.ts:134, legendary auth.ts:6),
  `--token` (legendary auth.ts:7), `--password` (gog library.ts:692, games.ts:373/838/1139),
  `--code-verifier`/`--serial`/`--client-id` (nile/user.ts:136-140). **Every one is already in
  the redaction list.** No drift since 34.5.

- timestamp: 2026-08-22 — **Humble revealed key: NOT reachable.** `adapter.ts revealKey:722`
  logs `keyPresent=${Boolean(...)}` and `errorMsgLength=${...?.length ?? 0}` only, with an
  explicit C4 note that `error_msg` may echo a key. `describeSchemaFailure:551` logs
  contentType + `bodyIsString` + `bodyLength` + zod issue PATHS only — never the body.
  The `{ status: 'schema_error', raw: response.data }` return value carries the full body, so
  `raw` was traced to every consumer: `library.ts:384` and `:871` log a fixed string plus the
  gamekey (an order id, not a secret) and never touch `.raw`. The revealed value is persisted as
  `revealedKeyValue` via `patchCachedState` (library.ts:1205) — `grep revealedKeyValue` across
  `src/backend` returns **zero** log call sites.

- timestamp: 2026-08-22 — **Steam refresh token: NOT reachable.** `grep refreshToken` over
  `src/backend` (non-test) yields 15 sites, all store/transport, none inside a log call.
  `tokenStore.ts` logs `'Failed to decrypt Steam refresh token:', err` (:160) and a plaintext
  WARNING (:139) — neither carries the value. `keyringTokenStore.ts` is presence/length only
  (`present=${value.length > 0} len=${value.length}`, :381; `len=${token.length}`, :408).
  `devSecretVault.ts:146/154` logs `key=${slot}` — the slot NAME, with a guardrail comment.

- timestamp: 2026-08-22 — **Cookies: NOT reachable.**
  `grep -E "log(Info|Error|Warning|Debug)[^)]*[Cc]ookie"` over `src/backend` (non-test) returns
  **zero** hits carrying a value. Every Humble/Legendary cookie log is a count or an error
  (`cleared ${deleted} ... cookie(s)`, `cookie read failed:`, err).

- timestamp: 2026-08-22 — **Bare-identifier dumps (JSON.stringify vector): all benign.**
  `logInfo(output)` at main.ts:1282 and runnerMiscFlowRegistration.ts:255 is `syncSaves` output;
  `gogLogWriter.logInfo(logContent)` (gog/library.ts:582) and the zoom twin (:106) are a
  formatted "Games List" of titles; `tools/index.ts:679/685` is winetricks output;
  `legendary/library.ts:818` is `toggle-sync` stdout (EGS sync, not auth).

- timestamp: 2026-08-22 — **FINDING F-01 (the one reachable path). `src/backend/storeManagers/gog/user.ts:97`
  logs the raw stdout of `gogdl auth --code <code>` into `gamelib.log`.**

  ```ts
  const { stdout } = await libraryManagerMap['gog'].runRunnerCommand(
    ['auth', '--code', code],
    { abortId: 'gogdl-auth', logSanitizer: authLogSanitizer }   // :83-87
  )
  try { data = JSON.parse(stdout.trim()); ... }
  catch (err) {
    logError(
      `GOG login failed to parse std output from gogdl. stdout: ${stdout.trim()}, error ${err}`,
      LogPrefix.Gog                                              // :97
    )
  }
  ```

  The project ALREADY classifies this exact stdout as secret-bearing: `authLogSanitizer`
  (gog/user.ts:12) rewrites `access_token`, `session_id`, `refresh_token` and `user_id` to
  `<redacted>`. That sanitizer is passed to `runRunnerCommand` on the SAME call — it governs the
  **runner log**. The `logError` on :97 bypasses it entirely and writes to the **general** log.
  Both files are uploadable.

  Worse, the sanitizer cannot help even if it were applied here: its body is
  `try { JSON.parse(line) ... } catch { return line }` — it returns the line VERBATIM when the
  line is not JSON, which is exactly the condition under which :97 fires.

  **Precondition, stated honestly:** the branch fires only when `JSON.parse(stdout.trim())`
  throws, so the leak requires stdout that is *both* unparseable *and* token-bearing — e.g. a
  warning/deprecation line emitted alongside the JSON token payload, or a truncated write. Pure
  non-JSON error text carries no token. So this is a **reachable-but-conditional** path, NOT a
  demonstrated live leak. It has not been observed in the wild in this session.

- timestamp: 2026-08-22 — **Sibling-site check (why the census mattered).** The identical
  `JSON.parse(stdout)` failure is handled in three other places, and the other three are SAFE:
  `gog/user.ts:242` (`getCredentials`) logs `['Error getting GOG credentials:', error]` — the
  error only, never stdout; `nile/user.ts:93` logs `redactNileLoginData(output)` explicitly, and
  its `JSON.parse` has no catch at all; `legendary/library.ts:818` is not an auth command.
  A sampling audit that opened `getCredentials` first would have concluded "GOG is fine".

## Eliminated

- hypothesis: "A revealed Humble key value can reach an uploadable log."
  verdict: ELIMINATED — `revealKey` logs presence/length only; `revealedKeyValue` has zero log
  call sites; `raw` is never logged by any consumer.
- hypothesis: "The Steam refresh token can reach an uploadable log."
  verdict: ELIMINATED — no `refreshToken` site is inside a log call; the keyring store logs
  length/presence only.
- hypothesis: "Runner auth tokens leak via the logged runner command line."
  verdict: ELIMINATED — `getRunnerCallWithoutCredentials` covers every secret-carrying flag at
  HEAD; re-ran 34.5's census widened, found no drift.
- hypothesis: "An axios error logged as `logError([msg, err])` dumps request headers/body."
  verdict: ELIMINATED — the formatter reduces any `Error` to `.stack`; `config`/`response` are
  not part of a stack. (Would NOT hold for a rejection with a plain object; none found.)

## Resolution

root_cause: |
  The audit's bounded question had a THREE-part answer, and the honest headline is that the two
  credentials the todo named were both clean while a third, unnamed one was not.

  - Steam refresh token: NOT reachable. Eliminated.
  - Revealed Humble key value: NOT reachable. Eliminated.
  - **GOG `access_token` / `refresh_token` / `session_id`: REACHABLE (conditionally).**

  `src/backend/storeManagers/gog/user.ts` interpolated the raw stdout of `gogdl auth --code`
  into a `logError` template. That stdout is the GOG token-exchange response. `logError`
  resolves to `heroicLogWriter`, i.e. `gamelib.log` — a file `uploadLogFile` will POST verbatim
  to a public dpaste paste with a 2-day expiry.

  The project already classified that stdout as secret-bearing: `authLogSanitizer`
  (gog/user.ts:12) redacts exactly `access_token`/`session_id`/`refresh_token`/`user_id`, and is
  passed as `logSanitizer` to the very `runRunnerCommand` call that produces the stdout. But that
  sanitizer governs the RUNNER log only; the `logError` wrote to the GENERAL log and bypassed it.
  The sanitizer also could not have fixed the call site if applied there — its body returns the
  line verbatim on `JSON.parse` failure, which is this branch's precondition.

  Scope honesty: the branch fires only when `JSON.parse(stdout.trim())` throws, so a leak needs
  stdout that is both unparseable AND token-bearing (e.g. a warning line emitted alongside the
  JSON payload). Pure non-JSON error text carries no token. Classified reachable-but-conditional.
  No live leak was observed in the wild during this session — consistent with the todo's
  instruction not to overstate.

fix: |
  `src/backend/storeManagers/gog/user.ts` — the catch branch now logs
  `stdoutLength: ${stdout.trim().length}` instead of `stdout: ${stdout.trim()}`, matching the
  presence/length discipline `humble/adapter.ts`'s `describeSchemaFailure` already uses
  (`bodyLength=`, never a body). The branch stays diagnostically useful: a truncated write is
  still distinguishable from a wrong-format response by length alone.

  NOT done, deliberately: a blanket regex scrub at the upload boundary. See "Deferred decision".

verification: |
  - `pnpm exec jest src/backend/storeManagers/gog/` -> **18/18 pass, 2 suites**.
  - **RED proven against the defect, not just green with the fix.** Reverted the one-line change
    via `sed` on a scratchpad copy (no `git stash`/`git reset` — shared-tree hazard discipline)
    and re-ran: both new tests FAIL, and jest's own diff prints the leak verbatim —
    `"...stdout: WARNING: gogdl is deprecated... {\"access_token\":\"live-access-token-abc123\",
    \"refresh_token\":\"live-refresh-token-def456\",\"session_id\":\"live-session-id\"...}"`.
    That output IS the demonstration the todo asked for. Fix restored, re-run green.
  - The fixture is realistic, not contrived: a non-JSON preamble line followed by the real token
    JSON, which is the actual shape that makes `JSON.parse` throw while a token is present.
  - `pnpm exec tsc --noEmit` -> exit 0.
  - `pnpm exec eslint <both changed files> -f json`, filtered on `severity === 2` -> **0 errors**
    (counted from JSON, not from console text — warnings print adjacent to errors).
  - **Audit re-run to prove closure** (the todo required this): the multi-line census for log
    calls interpolating raw `stdout` now returns exactly **1** hit,
    `legendary/library.ts:818 logInfo(\`${stdout}\`)` — inspected and BENIGN: its command is
    `toggle-sync` (EGS sync toggle), not an auth exchange. Recorded rather than silently dropped.

files_changed:
  - src/backend/storeManagers/gog/user.ts
  - src/backend/storeManagers/gog/__tests__/user.test.ts

## Deferred decision (NOT closed by this session)

The todo's outcome (1) suggested "add a scrub pass over known token/key patterns" before upload.
I fixed the source instead and did **not** add a scrub at the upload boundary. Rationale:

- A regex scrub over 10 MiB of arbitrary log text is a false-negative machine — it can only
  catch patterns someone thought of, and this session's finding was NOT pattern-shaped (a token
  inside an otherwise-normal stdout dump). It would have caught this one only by luck.
- Worse, it manufactures confidence: once "logs are scrubbed before upload" is true on paper,
  the source-level discipline that actually works here — the `keyPresent=`/`bodyLength=`/
  `len=` convention already used consistently across humble/, keyringTokenStore, devSecretVault
  — loses its rationale.
- This census found the backend's source-level discipline is otherwise sound: 77 secret-adjacent
  multi-line log calls reviewed, exactly one defect.

That said, defense-in-depth at the boundary is a legitimate design call and it is the USER's to
make, not mine to silently decline. Filed as its own todo rather than buried here:
`.planning/todos/pending/log-upload-boundary-scrub-decision.md`.
