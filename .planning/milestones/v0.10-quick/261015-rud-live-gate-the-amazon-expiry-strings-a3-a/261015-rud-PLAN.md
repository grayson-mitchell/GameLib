---
phase: quick-261015-rud
plan: 01
type: execute
wave: 1
depends_on: []
subsystem: backend/signInProbe
tags: [amazon, nile, sign-in-probe, live-gate, macos, a3, a6, evidence, todos]
requirements: [TODO-rud-1]
autonomous: false # blocked: the auto-mode classifier denies the decrypt step (see Blocker)
files_modified:
  # Certain -- the evidence bundle (new directory)
  - .planning/quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/evidence/
  # Certain -- the record this task closes (moved pending -> completed, Resolution appended)
  - .planning/todos/completed/2026-10-10-amazon-expiry-strings-need-a-real-induction.md
  # Certain -- item 5 disposition (Run 1 § Disposition) and deferred item 3
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/deferred-items.md
  # Conditional -- comment-only, ONLY where a header states A3/A6 are untested/assumed
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/runnerProbes.ts
  # Conditional -- ONE new `ready: code` todo, ONLY if NNN is outside {400,401,403} (FINDING A3)
  # - .planning/todos/pending/2026-10-15-amazon-refresh-returns-NNN-outside-the-nile-auth-failure-set.md

estimate:
  tokens: 45000
  raw_tokens: 45000
  tasks: 3
  confidence: medium
---

# Quick 261015-rud: live-gate the Amazon expiry strings (A3/A6) by an in-place nile induction

Closes `.planning/todos/pending/2026-10-10-amazon-expiry-strings-need-a-real-induction.md`
(Phase 49 live gate Run 1, item 5, NOT SCORED).

## Locked decisions (verified at HEAD d0594be48, 2026-10-15)

1. **The todo's measurement is sound; its remedy is wrong.** `current_user.json` really carries only
   `name` and `user_id`. But nile v1.2.0 (`nile/utils/config.py`, `ConfigType.JSONENC`, fetched
   from the upstream v1.2.0 tag — the vendored `.build-tools/runners-onedir/src/nile` is 1.1.2 and
   predates the scheme) encrypts the token store with AES-256-CBC, key = `sha256(user_id)`, and
   stores the IV as its first 16 bytes AES-256-ECB-encrypted under the same key. The file name is
   `md5(user_id).enc` — confirmed: `md5("amzn1.account.AEHW…")` = `ce4aec427c5a85b89d2e6576f707aa50`,
   the one `.enc` in the profile. `user_id` is plaintext in `current_user.json`. The store is
   therefore editable in place; **no server-side device deregistration and no re-login.**
2. **A4 still gates the refresh.** `cli.py list_updates` (v1.2.0 L179-192) returns before any auth
   call when `installed.json` is empty, and it reads only that local file. This profile has
   `installed.json = []` and `library.json = []`. A one-entry `installed.json` fixture lifts the
   gate; `game_ids` then resolves empty against the empty library and the refresh line has already
   been emitted.
3. **Build for the in-app arm: `pnpm tauri:dev`** (the contract's launch-2 build, launch map row 2).
   The Amazon tokens live in nile's files, not the keyring, and an unattended `tauri:dev:keyring`
   boot prompt would bound the probe to `unknown` at 45 s.
4. **Scoring** is the contract's own (49-LIVE-GATE § Item 5): PASS if NNN ∈ {400, 401, 403}
   (`NILE_AUTH_FAILURE_STATUSES`, `classify.ts:53`); any other NNN is FINDING A3 → file a
   `ready: code` todo to widen the set; no `<Response [` text is FINDING A6. No `src/` behaviour
   change in this task.
5. **Key names only, never values**, in every evidence file (T-49-15).

## Codec

`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/c1636bac-e941-4922-bf8a-6b6793218bcd/scratchpad/nileEnc.cjs`
(Node built-in `crypto`, no deps). `keys <dir>` prints dotted key names; `induce <dir> garbage|flip`
rewrites the `.enc` with `tokens.bearer.refresh_token` invalid (`gate-invalid`, or the real token
with one middle character altered) and `NILE.token_obtain_time = 1`, then round-trips to verify.
The helper is session-scratch; a copy goes into `evidence/` so the run is reproducible.

## Permission note (2026-10-15)

Backups were taken and hash-verified first (`scratchpad/backup/`, `.enc` sha256
`e2ae3a13…c7d3` matched the profile). The auto-mode classifier then denied every command that
decrypted, copied or wrote the nile token store — even `keys` on the scratch copy, key names only
— so those five steps ran as operator-typed `!` commands from scripts the orchestrator wrote
(`armA.sh`, `armB-induce.sh`, `armB-restore.sh`, `armB-launch3-fixture.sh`, `armB-final.sh`;
copies of the codec are in `evidence/`). Launches, log excerpts, screenshots and quits ran from the
orchestrator. Task 2 gained a launch 3: launch 2 (restored tokens, `installed.json = []`) can only
read `unknown` (A4), so the `healthy`/`cleared` proof needed the fixture with the real tokens.

<task type="auto">
<name>Task 1: Arm A — CLI induction against scratch copies (two shapes)</name>
<files>
.planning/quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/evidence/
</files>
<action>
Preflight (record to `evidence/preflight.txt`): `pgrep -f 'target/debug/gamelib-shell'`,
`pgrep -f 'build/main/sidecar.js'`, `lsof -nP -iTCP:5173 -sTCP:LISTEN` all empty;
`env | grep GAMELIB_DEV_SECRET_VAULT` empty; `public/bin/arm64/darwin/nile/nile --version`
= `1.2.0 Robert Speedwagon`; key names of the backup store via `nileEnc.cjs keys backup`
(must include `tokens.bearer.refresh_token`, `tokens.bearer.expires_in`, `NILE.token_obtain_time`).

For SHAPE in garbage, flip:
1. `cp -p backup/{*.enc,current_user.json,library.json,syncpoint.raw} armA-$SHAPE/nile/`;
   write `armA-$SHAPE/nile/installed.json` = `[{"id":"gate-fake-installed","path":"/nonexistent","version":"0"}]`.
2. `node nileEnc.cjs induce armA-$SHAPE/nile $SHAPE` → record its one-line output (key names only).
3. `NILE_CONFIG_PATH=$SCR/armA-$SHAPE public/bin/arm64/darwin/nile/nile list-updates --json
   > evidence/armA-$SHAPE.stdout 2> evidence/armA-$SHAPE.stderr; echo "exit=$?" > evidence/armA-$SHAPE.exit`.
4. Extract the exact `Failed to refresh the token <Response [NNN]>` line into
   `evidence/armA-$SHAPE.line` (`grep -F 'Failed to refresh the token'`). Score per the contract.
   If the line carries no `<Response [`, that is FINDING A6; if there is no such line at all,
   the premise (a refresh was attempted) failed — inspect stderr, adjust, do not score.

Also run the **negative control**: an un-induced copy (`armA-control`, same fake `installed.json`,
untouched `.enc`) must NOT emit the refresh-failure line (token not expired → no refresh).
</action>
<verify>
`evidence/armA-garbage.line` and `evidence/armA-flip.line` each hold exactly one line matching
`Failed to refresh the token <Response \[[0-9]{3}\]>`; `evidence/armA-control.stderr` has no
`Failed to refresh` text. `grep -c -E 'refresh_token"?\s*[:=]\s*"[^g]' evidence/*` is 0 (no token
value leaked). Every path written is under `.planning/` — `npx prettier --file-info` reports
`"ignored": true` for `.planning/quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/evidence/preflight.txt`,
so no `--check` is carried (it would be vacuous).
</verify>
<done>Two measured NNN values (or a FINDING A6), a passing control, nothing sensitive on disk.</done>
</task>

<task type="auto">
<name>Task 2: Arm B — in-app launch on the real profile, then restore and prove healthy</name>
<files>
.planning/quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/evidence/
</files>
<action>
Only after Task 1 produced a `<Response [NNN]>` line. Real profile dir
`$HOME/Library/Application Support/gamelib/nile_config/nile` (`GameLib/` is the same dir on APFS).
1. Re-assert the Task 1 preflight (no instances). `cp -p` the live `.enc` and `installed.json`
   to `backup/` again ONLY IF their sha256 differs from the existing backup (the app may have
   refreshed since; the newest is the restore source — record which).
2. Induce `garbage` on the real dir with `nileEnc.cjs induce <dir> garbage`; write the one-entry
   `installed.json` fixture. Record key names changed.
3. `nohup pnpm tauri:dev > evidence/terminal-launch-1.log 2>&1 & disown` (memory: never a harness
   background task). Wait for `Sign-in probe:` + `list-updates` in `$HOME/Library/Logs/GameLib/gamelib.log`
   and the `pass complete outcomes=` line (≤ 90 s). Copy `gamelib.log` → `evidence/gamelib-launch-1.log`
   and `runners/nile.log` → `evidence/runner-nile-launch-1.log` (grep-verify no token value in the
   runner log before copying; redact if any).
4. Required literals: `[signInProbe] nile outcome=expired`, `nile verdict=latched`,
   `pass complete outcomes=` naming nile. Screenshot the main window (`screencapture -l <id>` via
   `CGWindowListCopyWindowInfo`, frontmost pid asserted) showing the Amazon row
   "Your Amazon Games sign-in expired" → `evidence/item5-row.png`; navigate to the Amazon tile
   (Library) and capture "Sign-in expired — Reconnect" → `evidence/item5-tile.png`.
5. Quit the app (Cmd+Q via `osascript`), assert pid gone, kill any orphan vite on 5173.
6. Restore: `cp -p backup/<enc> <dir>/` and `cp -p backup/installed.json <dir>/`; sha256 equal.
7. Launch 2 (same command, `terminal-launch-2.log`): required `[signInProbe] nile outcome=healthy`
   → `evidence/gamelib-launch-2.log`. Quit, census empty (shell, sidecar, vite, 5173).
</action>
<verify>
`grep -F 'nile outcome=expired' evidence/gamelib-launch-1.log` and
`grep -F 'nile verdict=latched' evidence/gamelib-launch-1.log` each ≥ 1;
`grep -F 'nile outcome=healthy' evidence/gamelib-launch-2.log` ≥ 1; both PNGs non-empty;
`shasum -a 256` of the live `.enc` equals the backup; live `installed.json` is `[]`;
`pgrep -f 'target/debug/gamelib-shell'` empty. Prettier: evidence paths are `.planning/`
(ignored), no `--check` carried.
</verify>
<done>Item 5's PASS literals (or FINDING) measured in the running app; profile restored and proven healthy.</done>
</task>

<task type="auto">
<name>Task 3: Score, close the todo, update the gate record and the source comments</name>
<files>
.planning/todos/completed/2026-10-10-amazon-expiry-strings-need-a-real-induction.md
.planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
.planning/phases/49-cross-store-signed-out-offline-mode/deferred-items.md
src/backend/signInProbe/classify.ts
src/backend/signInProbe/runnerProbes.ts
</files>
<action>
1. `git mv` the todo to `completed/`; append `## Resolution (2026-10-15, quick 261015-rud)`:
   the premise correction (decryptable store; vendored 1.1.2 vs bundled 1.2.0), the two Arm A
   NNN values, the Arm B literals, the verdict, evidence paths. Key names only.
2. 49-LIVE-GATE.md: in Run 1's disposition list and the verdict table, change item 5 from
   DEFERRED/NOT SCORED to the measured result with a dated addendum (do not rewrite history —
   add, cite `261015-rud`). Update the "Effective verdict" line's counts.
3. deferred-items.md item 3: mark resolved with the same citation.
4. `classify.ts` / `runnerProbes.ts`: ONLY where a comment says A3/A6 are source-derived,
   assumed or untested (e.g. `classify.ts:13`, `:185`; `runnerProbes.ts:11-18`), reword to
   "measured 2026-10-15 (quick 261015-rud): NNN"; no code change. If NNN ∉ {400,401,403}, do NOT
   widen `NILE_AUTH_FAILURE_STATUSES` here — file the `ready: code` todo with
   `severity: major`, `platform: any`, `ready: code` (bare, in that order).
5. `graphify update .` after any `src/` edit.
</action>
<verify>
`npx prettier --file-info src/backend/signInProbe/classify.ts` and `… runnerProbes.ts` report
`"ignored": false` → run `npx prettier --check src/backend/signInProbe/classify.ts src/backend/signInProbe/runnerProbes.ts`
(only if either was edited; otherwise state it and omit). `npx jest src/backend/signInProbe`
still 191/191. `pnpm planning-gates` 12/12 (todo frontmatter gate covers any new pending todo).
The `.planning/` paths are prettier-ignored; no `--check` over them.
</verify>
<done>Todo closed with a dated Resolution, gate record and deferred list updated, comments truthful, gates green.</done>
</task>
