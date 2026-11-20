---
quick_id: 260909-su5
title: Add a `tauri:dev:vault` script so live-gate sessions cannot forget GAMELIB_DEV_SECRET_VAULT=1
date: 2026-09-09
status: complete
commit: 07f6ae173
files_changed: 1
---

# Quick Task 260909-su5 — SUMMARY

## What landed

One line, `package.json:33`:

```json
"tauri:dev:vault": "cross-env GAMELIB_DEV_SECRET_VAULT=1 pnpm tauri:dev",
```

Commit `07f6ae173` — **1 file changed, 1 insertion(+)**.

## Why cross-env and not a bare `VAR=1` prefix

A bare env prefix is a POSIX shell-ism that fails under `cmd.exe`, and this project targets
Windows (CLAUDE.md constraint). `.npmrc` carries `node-linker=hoisted` and **nothing else** — in
particular no `shell-emulator`, so pnpm does not paper over the difference. `cross-env@7.0.3` was
already a devDependency (`package.json:158`) and resolved in `node_modules/.bin/`, so this added no
install.

The repo's one existing env-setting script, `lint-translations:gamelib`, uses `export VAR=… && …`.
That precedent was **not** followed: it is a meta script run on the maintainer's machine, whereas
`tauri:dev` is the cross-platform dev entry point.

## What was verified, and what was not

**Verified:**

| Check | Result |
| --- | --- |
| Script value exact-matches the intended string | PASS (`node -e` read-back) |
| `pnpm run` lists `tauri:dev:vault` | PASS |
| `prettier --check package.json` | PASS (file-scoped — repo-wide prettier is red) |
| cross-env delivers exactly `'1'` to the child env | PASS — child printed `"1"`, `v === '1'` true |

That last one is the one that matters: `devSecretVault.ts:73` gates on an **exact** `'1'` string
match, so "the var is set" is not sufficient — it has to arrive as `"1"` and not `"1 "` or `1`. Run
via a probe script rather than `node -e`, because cross-env strips quotes out of `-e` arguments.
Irrelevant to the shipped script (`pnpm tauri:dev` contains no quotes) but worth knowing before
anyone extends this line.

**NOT verified — and the script cannot verify it.** `pnpm tauri:dev:vault` was not run. Setting the
env var proves nothing about which secret-store arm installed; the receipt is
`[bootstrap] secret stores: dev-vault` (vs `keyring`) in `~/Library/Logs/GameLib/gamelib.log`.
**That log check remains the precondition before arming any live fixture** — this script shortens
the command, it does not discharge the check. Note also that the vault starts empty, so the first
run on a freshly-switched arm still costs one Steam re-login.

## Deliberately not done

- **`tauri:dev` still takes the keyring arm.** Flipping the default would silently retire the only
  arm exercising the shipped Keychain path; `260817-d61-LIVE-GATE.md:41` requires
  `GAMELIB_DEV_SECRET_VAULT` to be **unset** or that whole gate is vacuous.
- **Vault guardrails untouched** — the exact-`'1'` match, the packaged-build refusal
  (`isPackagedSidecar()`, fails closed) and the `0600` vault-file requirement are what make this
  safe to reduce to one word. `devSecretVault.ts` is absent from the diff.

## Process note — a near-miss worth recording

The tree was **not** clean. Concurrent quick task `260909-s8x` (lint-ratchet split) had uncommitted
changes in this same `package.json` (`lint` → `lint:src`/`lint:tests`) plus `.gitignore` and an
untracked `meta/lintScoped.cjs`. Its directory holds a PLAN.md and **no SUMMARY.md** — in flight,
not finished.

A plain `git add package.json` would have absorbed another session's unfinished work into this
commit, and `git commit -- package.json` would have been worse: a pathspec commit takes the
**working tree**, not the index. Staged the single hunk via `git apply --cached` instead, then
committed off the index with no pathspec.

Post-commit assertions, made against the **commit**, not the working tree:

- `git show HEAD:package.json` contains `tauri:dev:vault`
- `git show HEAD:package.json` still contains the ORIGINAL `"lint": "eslint --cache --max-warnings 4157 ."`
  — s8x's change was not absorbed
- `git status --porcelain` still shows `M .gitignore` / `M package.json` — s8x's work survives, undisturbed

## Deviation from the quick workflow

The orchestrator wrote the plan and executed inline rather than dispatching `gsd-planner` and
`gsd-executor`. Disclosed rather than silent. Reason: a one-line `package.json` insert against a
tree carrying another live session's uncommitted work in **the same file**. This repo has recorded
both failure modes — commits absorbing the whole tree, and executor `git stash` stranding a
concurrent session — and neither is recoverable by re-running. Precedent: `260909-nzb` disclosed
the same deviation for the same class of reason.
