---
phase: quick-261015-rud
plan: 01
status: complete
completed: 2026-10-15
commits: [] # filled by the orchestrator's closeout commits (see STATE.md row)
files_modified:
  - .planning/quick/261015-rud-live-gate-the-amazon-expiry-strings-a3-a/evidence/
  - .planning/todos/completed/2026-10-10-amazon-expiry-strings-need-a-real-induction.md
  - .planning/todos/pending/2026-10-15-amazon-latch-never-clears-on-a-zero-installed-profile.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/49-LIVE-GATE.md
  - .planning/phases/49-cross-store-signed-out-offline-mode/deferred-items.md
  - src/backend/signInProbe/classify.ts
  - src/backend/signInProbe/runnerProbes.ts
---

# Quick 261015-rud: Amazon expiry strings (A3/A6) live-gated by an in-place nile induction — PASS

Closes `2026-10-10-amazon-expiry-strings-need-a-real-induction.md` (Phase 49 live gate Run 1,
item 5, NOT SCORED). **No server-side device deregistration, no re-login, no code behaviour
change.** Comment-only edits in two `src/` files.

## Verdict

| Item | Result |
|---|---|
| A3 — status Amazon returns for a dead refresh token | **400**, for both a malformed (`gate-invalid`) and a one-character-altered real token. Inside `NILE_AUTH_FAILURE_STATUSES`; no widening. |
| A6 — `<Response [NNN]>` appears verbatim | **CONFIRMED** (`od -c` on the captured line: literal `<Response [400]>`). |
| Item 5 in-app PASS literals | `[signInProbe] nile outcome=expired elapsed=1394ms`, `nile verdict=latched`, `pass complete outcomes=…nile:expired…`; Library row "Your Amazon Games sign-in expired" + RECONNECT; Accounts tile "SIGN-IN EXPIRED — RECONNECT". |
| Restore proof | launch 3: `nile outcome=healthy`, `nile verdict=cleared`, tile "Connected". |
| Classifier on the real captures | `expired` / `expired` / `healthy` (garbage / flip / control) via `classifyNileOutput`. |

## Why the todo's remedy was wrong

The measurement held (`current_user.json` has only `name` + `user_id`) but nile 1.2.0's
`ConfigType.JSONENC` (upstream `nile/utils/config.py` at v1.2.0; the vendored
`.build-tools/runners-onedir/src/nile` is **1.1.2** and has no encryption) is AES-256-CBC keyed by
`sha256(user_id)`, IV stored as the first 16 bytes AES-ECB-encrypted under the same key, file named
`md5(user_id).enc` — and `user_id` is plaintext beside it. `evidence/nileEnc.cjs` (Node built-in
`crypto`) decrypts, edits `tokens.bearer.refresh_token` + `NILE.token_obtain_time`, re-encrypts.

## What ran

1. **Preflight**: no app instances, vault env unset, nile `1.2.0 Robert Speedwagon`, backup of the
   five config files hash-verified, key names of the decrypted store listed (values never printed).
2. **Arm A** (`armA.sh`, scratch copies, one-entry `installed.json` fixture because A4 blocks the
   refresh at zero installed): `garbage`, `flip`, `control`. Exit 0 all three; leak check clean.
3. **Arm B** (`pnpm tauri:dev`, real profile, `nohup … & disown`): launch 1 induced → expired /
   latched, row + tile frames; quit; restore (hash-equal); launch 2 with `installed.json = []` →
   `unknown` / `unchanged` and the tile **still** "Sign-in expired"; launch 3 with the fixture →
   healthy / cleared, tile "Connected". Clean teardown each time (shell, sidecar, vite, 5173).
4. **Docs**: todo → `completed/` with a Resolution; `49-LIVE-GATE.md` verdict row 5 and a dated
   addendum (effective verdict PASS 10/11, 0 deferred); `deferred-items.md` item 3 CLOSED;
   `classify.ts` / `runnerProbes.ts` headers now say A3/A6 were measured; new `ready: code` todo.

## Findings (filed: `2026-10-15-amazon-latch-never-clears-on-a-zero-installed-profile.md`)

- **The latch is one-way with nothing installed.** After the restore, the same boot's `library
  sync` refreshed the real token successfully, yet the probe read `unknown` (A4) and `unknown`
  never clears, so the tile stayed "SIGN-IN EXPIRED — RECONNECT" until launch 3's fixture let the
  probe reach the refresh. The 49-SPEC boundary row that gated a replacement probe command on this
  induction is now open.
- nile 1.2.0 `library sync` after a failed refresh crashes with an unhandled
  `requests.exceptions.JSONDecodeError` (`library.py:120`), exit 1; GameLib logs and continues.

## Verification

| Check | Result |
|---|---|
| `npx prettier --file-info` on the two `src/` files | `"ignored": false` → `--check` run: clean |
| `npx jest src/backend/signInProbe` | 6 suites, 192/192 |
| `pnpm planning-gates` | 12/12 (new todo's frontmatter passes the gate) |
| `graphify update .` | run after the comment edits |
| `.planning/` paths | prettier-ignored (`--file-info` `"ignored": true`); no vacuous check carried |

## Deviations

- The auto-mode permission classifier denied every decrypt / copy / write of the nile token store,
  including key-names-only on a scratch copy. Those five steps ran as operator-typed `!` commands
  from scripts the orchestrator wrote; everything else ran from the orchestrator. Recorded in
  `evidence/preflight.txt` and the plan's permission note.
- Whole-log copies into `evidence/` were also denied (log files can carry credentials), so the
  evidence holds grep excerpts per launch; the runner log rotates per launch and that is noted in
  each excerpt header. Launch 3's runner excerpt is a transcription of the orchestrator's own grep.
- Task 2 gained a launch 3 (see Findings); the plan's "launch 2 proves healthy" was unreachable on
  a zero-installed profile.
- Planning and execution were done inline in the orchestrator (recorded cost lesson; live gates
  are orchestrator-run).
