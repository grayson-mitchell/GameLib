---
quick_id: 260910-et3
title: Make dev-vault default `tauri:dev`, add `tauri:dev:keyring` for explicit keyring arm
status: partial
---

# Quick Task 260910-et3 Summary

**One-liner:** Flipped `tauri:dev`'s default secret-store arm from keyring to dev-vault via a new internal `tauri:dev:run` base script, added `tauri:dev:keyring` as the explicit unflagged arm, and documented the capture harness's inherited arm change at its spawn site — Task 3 (memory-doc correction) was deliberately reassigned to the orchestrator, not executed.

## Scope executed

Tasks 1 and 2 only, per orchestrator instruction. Task 3 (editing
`~/.claude/projects/-Users-graysonmitchell-Projects-GameLib/memory/dev-secret-vault-avoids-keychain-prompts.md`)
was **not executed** — that file lives under the orchestrator's memory store, not the repo, and
must never be staged/committed by an executor. The exact correction it calls for is captured below
for the orchestrator to apply.

## Task 1 — restructure `tauri:dev` scripts (package.json)

Replaced the two-line `tauri:dev` / `tauri:dev:vault` pair with four scripts, leaving
`tauri:dev:packaged` byte-identical:

```
"tauri:dev": "cross-env GAMELIB_DEV_SECRET_VAULT=1 pnpm tauri:dev:run",
"tauri:dev:keyring": "pnpm tauri:dev:run",
"tauri:dev:vault": "pnpm tauri:dev",
"tauri:dev:run": "pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri dev",
"tauri:dev:packaged": "pnpm exec vite build && pnpm build:sidecar && pnpm build:decompress-worker-dev && tauri build --debug",
```

`tauri:dev:keyring` delegates directly to `tauri:dev:run` (the internal base), never through the
flagged `tauri:dev`, so it can never inherit `GAMELIB_DEV_SECRET_VAULT=1` — `cross-env VAR=0` on an
outer script cannot unset a value an inner script sets, and the rejected `cross-env
GAMELIB_DEV_SECRET_VAULT=0` alternative would violate the two live-gate contracts requiring the var
be **unset** (see Outstanding below).

**Verification run (all passed):**
- Read-back script: exact byte match on all four keys — `OK read-back`.
- Single-definition check: build-chain string (`build:decompress-worker-dev` + `tauri dev`)
  resolves to exactly `["tauri:dev:run"]` — `OK single-definition`.
- `git diff --stat -- package.json`: 4 insertions, 2 deletions; `tauri:dev:packaged` line present
  unchanged in the diff context (no `-`/`+` on that line).
- `git diff --stat -- src/backend/sidecar/devSecretVault.ts`: empty (no output).
- `pnpm run` lists all four keys with correct values.
- `pnpm exec prettier --check package.json`: "All matched files use Prettier code style!"
- Cross-env delivery probe (see Evidence discipline note below).

**Commit:** `1bfb75003` — `feat(260910-et3): make dev-vault the default tauri:dev arm`

## Task 2 — record capture harness's arm decision at the spawn site

Added a comment immediately above `spawn('pnpm', ['tauri:dev'], ...)` at
`meta/captureShellScrollback.ts:677` (now ~9 lines earlier due to the insertion) explaining the
decision to leave the harness on `tauri:dev` (which now inherits the dev-vault arm) rather than
repointing it to `tauri:dev:keyring`, citing three reasons: (1) nothing the harness measures
touches the secret-store arm, (2) the gamelib.log snapshot it copies already carries the real
`[bootstrap] secret stores:` receipt, (3) `command: 'pnpm tauri:dev'` in meta.json stays literal
and true.

**Verification run (all passed):**
- `git diff -- meta/captureShellScrollback.ts`: 9 insertions, 0 deletions — comment lines only, zero
  changed executable code.
- `pnpm codecheck`: clean (no output beyond the tsc invocation).
- `pnpm lint`: exit 0, `638 problems (0 errors, 638 warnings)`, `production: PASS | tests: PASS`.
  `git diff --stat -- meta/lintScoped.cjs`: empty — both ceilings (SRC 1123 / TESTS 638)
  unchanged.
- `pnpm exec prettier --check meta/captureShellScrollback.ts`: "All matched files use Prettier
  code style!"
- `pnpm exec jest --selectProjects Meta`: `Test Suites: 39 passed, 39 total`, `Tests: 1 skipped,
  1075 passed, 1076 total`. `meta/__tests__/captureShellScrollback.test.ts` passed.

**Commit:** `7167bd98b` — `docs(260910-et3): record capture harness's inherited dev-vault arm`

## `captureShellScrollback.ts` decision as implemented

Kept the spawn call on `pnpm tauri:dev` (not repointed to `tauri:dev:keyring`). This means the
capture harness now inherits the dev-vault arm by default, matching the plan's explicit
instruction. Documented in-line per the three reasons above.

## Task 3 — reassigned, not skipped

**File:** `/Users/graysonmitchell/.claude/projects/-Users-graysonmitchell-Projects-GameLib/memory/dev-secret-vault-avoids-keychain-prompts.md`

This is an orchestrator memory-store file, outside the repo — never staged or committed by this
executor. `git status --porcelain` confirms no repo-tracked file was touched by this task.

**Exact correction Task 3 called for, carried forward verbatim for the orchestrator to apply:**

1. **Frontmatter `description`** currently reads:
   `"GAMELIB_DEV_SECRET_VAULT=1 skips Keychain entirely in dev builds — opt-in, so dev runs pester for the login password by default"`
   This is now inverted by 260910-et3. It should say the vault is the **default** for
   `pnpm tauri:dev` as of 2026-09-10 (`260910-et3`), that `pnpm tauri:dev:keyring` is the
   explicit four-script keyring arm, and that this does not apply to packaged builds (which
   remain `0600`-guarded keyring-only, unaffected by the default flip).

2. **Body section headed "Why: opt-in, not default"** — this heading and its content assert the
   opposite of the new default and needs to be corrected/relabeled to reflect that dev-vault is
   now the default arm, with `tauri:dev:keyring` as the opt-in override for exercising keyring
   specifically.

3. **"How to apply" block** currently instructs the reader to type
   `GAMELIB_DEV_SECRET_VAULT=1 pnpm tauri:dev`. This should now read plain `pnpm tauri:dev` (the
   flag is now baked into the script), with `pnpm tauri:dev:keyring` given as the way to force
   the keyring arm.

4. **The 2026-09-09 "Operator instruction" section** ("live gates SHOULD run in dev-vault mode")
   has a "How to apply" line reading:
   `start the dev session for any live gate as GAMELIB_DEV_SECRET_VAULT=1 pnpm tauri:dev` —
   this should now read plain `pnpm tauri:dev`, noting the instruction is satisfied by the new
   default.

5. Per the plan, do **not** touch the two live-gate contract files
   (`260817-d61-LIVE-GATE.md:41` and `260907-ov3-LIVE-GATE.md:234`) — those still correctly
   require `GAMELIB_DEV_SECRET_VAULT` be **unset** in the launching shell (not merely non-`'1'`);
   this task only adds a dated update section to the memory doc, appended in its established
   style, not a rewrite of the doc's history. Any addition should note that "the shell var is
   unset" no longer by itself proves anything about which arm ran, now that `tauri:dev` sets it
   internally via `cross-env` inside the script rather than requiring the operator to export it.

Suggested verification once applied (from the plan):
- `grep -n "opt-in, dev runs pester" <file>` → nothing (inverted description gone).
- `grep -c "tauri:dev:keyring" <file>` → at least 1.
- `grep -n "260910-et3" <file>` → update section attributed.
- `git status --porcelain` (repo) → no new file from this task.

## Evidence discipline — what was and was not proven

Per the plan's Outstanding section, **nothing in Tasks 1-2 proves the dev-vault arm actually
installs at runtime.** Only the `[bootstrap] secret stores: dev-vault` line in
`~/Library/Logs/GameLib/gamelib.log`, from a fresh `pnpm tauri:dev` launch, is that proof — and
this executor did not launch `tauri:dev` (a live session was already running and must not be
disrupted; a second `pnpm tauri:dev` invocation also exits 0 without replacing the running
instance, per `tauri-dev-noops-against-a-running-instance`, so it would measure nothing anyway).

The cross-env delivery probe run during Task 1 verification:

```
pnpm exec cross-env GAMELIB_DEV_SECRET_VAULT=1 pnpm exec node -e 'console.log("child sees:",JSON.stringify(process.env.GAMELIB_DEV_SECRET_VAULT))'
→ child sees: "1"

pnpm exec node -e 'console.log("child sees:",JSON.stringify(process.env.GAMELIB_DEV_SECRET_VAULT))'
→ child sees: undefined
```

**This probe mirrors the shape of the `tauri:dev` -> `tauri:dev:run` chain (cross-env setting a var
through a `pnpm` hop) — it is not the chain itself, and it does not confirm that
`installDevSecretVault()` actually installs the dev-vault arm at runtime.** That confirmation is
the orchestrator's to obtain by driving the live `[bootstrap] secret stores: dev-vault` receipt,
per the plan's Outstanding section.

## Deviations from Plan

None — Tasks 1 and 2 executed exactly as written. Task 3 was reassigned per explicit orchestrator
instruction in this invocation's scope_change (not a deviation discovered during execution).

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `1bfb75003` | `feat(260910-et3): make dev-vault the default tauri:dev arm` |
| 2 | `7167bd98b` | `docs(260910-et3): record capture harness's inherited dev-vault arm` |

## Files changed

- `package.json` (Task 1)
- `meta/captureShellScrollback.ts` (Task 2)

## Not committed / not executed

- Task 3 memory-doc correction — reassigned to orchestrator (see above).
- `.planning/quick/260910-et3-make-dev-vault-the-default-for-tauri-dev/260910-et3-SUMMARY.md` (this
  file) — not committed per instruction; orchestrator handles the docs commit.
- `STATE.md`, `ROADMAP.md` — not updated per instruction.
- `260817-d61-LIVE-GATE.md`, `260907-ov3-LIVE-GATE.md` — not edited, as required.
- `meta/lintScoped.cjs` — not modified; `git diff --stat` confirmed empty.

## Self-Check

- `package.json` contains the four expected script entries: FOUND (read-back verified above).
- `meta/captureShellScrollback.ts` contains the new comment: FOUND (diff shown above).
- Commit `1bfb75003` exists: FOUND (`git log --oneline -1` confirmed at commit time).
- Commit `7167bd98b` exists: FOUND (`git log --oneline -2` confirmed at commit time).

## Self-Check: PASSED
