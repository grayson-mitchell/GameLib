---
phase: quick-260902-qgd
plan: 01
status: complete
date: 2026-09-02
commit: 348d3e42a
files_modified:
  - src/backend/downloadmanager/__tests__/utils.test.ts
---

# Quick Task 260902-qgd — Summary

Re-pinned the stall-watchdog "honest copy" spec to the namespaced i18n key. One commit,
`348d3e42a`, +6/−2, one file.

## Root cause

**The test was stale; production was already correct.** `utils.ts:266` calls
`i18next.t('gamelib:box.error.install.stalled', ...)`, while the spec still pinned the bare
`'box.error.install.stalled'`.

Quick task `260901-ud5` (commit `c2f567064`, "resolve i18n catalog drift blocking pre-push
leg 4") deliberately re-namespaced **67 fork-authored strings** into the `gamelib` namespace
under its **Bucket R**, satisfying D-05's requirement that `pnpm i18n` write only
`gamelib.json`/`gamelib.mt.json`. It updated the call site and left this assertion behind. The
assertion itself dates to `260817-dib` (`4d2b319e8`, 2026-08-17) and was correct when written.

**Not an absent-key defect.** `public/locales/en/gamelib.json` contains
`box.error.install.stalled` = `"No download progress for {{minutes}} minutes — the install was
stopped"`, along with `box.error.install.failed` and `box.error.install.signInToSteam` — all
three called by `utils.ts` with the same prefix (lines 266, 387, 397). Checked explicitly
because a missing key is invisible to the lint gate, and would have looked identical from the
failure message alone.

## What changed

`src/backend/downloadmanager/__tests__/utils.test.ts` only:

1. The pinned literal → `'gamelib:box.error.install.stalled'`.
2. The spec's title now names the namespaced key, so the title cannot drift from what it
   actually asserts.
3. A short comment recording why the namespace is part of the pin.

The assertion remains an **exact key pin** — deliberately not loosened to a substring or regex.
Loosening it would have kept the suite green while quietly discarding the guarantee the spec
exists for. The second assertion (dialog message does not match `/connection may be stale/`) is
untouched.

## Census

Before fixing a single line, ran a **bidirectional** scan: all **335** test files against all
**147** `gamelib:`-prefixed production keys, checking both directions —

- test pins a **bare** key that production now prefixes, and
- test pins a **`gamelib:`** key that production does *not*.

Exactly **one** hit: this line. `260901-ud5`'s 67-call-site sweep stranded precisely one
assertion. No siblings, and no over-correction in the other direction either.

## Verification

| Gate | Result |
|---|---|
| `downloadmanager/__tests__/utils.test.ts` | **34/34** (was 33/34) |
| `tsc --noEmit` | clean |
| `prettier --check` on the changed file | clean |
| `eslint` on the changed file | **0 errors** (30 pre-existing warnings, all on unrelated lines) |
| `pnpm lint` | 4157 warnings, **exactly** at the `--max-warnings 4157` ratchet, exit 0 |
| `pnpm i18n --fail-on-update` | exit 0, Added/Restored keys **0** |
| files written under `public/locales/` | **none** — checked, because that gate is known to write even when it passes |
| `src/backend/downloadmanager/utils.ts` | untouched |

## Note for whoever next re-namespaces keys in bulk

A namespace move only breaks a test that asserts on the **key** `t()` was called with. Specs
that assert on rendered English pass straight through the change, so a sweep like Bucket R can
strand a key assertion with almost no signal. The bidirectional census above is cheap to re-run
and is the check that makes such a sweep provably complete.
