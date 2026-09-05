---
quick_id: 260905-h3w
slug: swap-the-git-remotes-origin-becomes-the-fork
status: complete
date: 2026-09-05
mode: quick
ships_code: false
commits:
  - ba2b5fb7a
---

# Quick Task 260905-h3w — Summary

**`origin` is now the GameLib fork; Heroic is `upstream`.** They had been the other way round since
the project began.

## Why this was wrong, beyond the naming

The operator's prompt was "the repo has moved to Tauri, shouldn't Heroic not be origin now?" The
sharper evidence is that **nothing tracked `origin` at all**:

```
fix/steam-native-install-stability -> gamelib/...
main                               -> gamelib/...
```

So the name git treats as the default push/pull target pointed at a repo that returns 403, while
the repo actually in use had to be named explicitly on every push.

**The recorded rationale for the arrangement was already dead.** `git-remote-topology.md`
justified keeping Heroic as `origin` with *"kept for pulling future upstream improvements (the
project must stay mergeable with upstream)"* — and CLAUDE.md states the opposite outright: GameLib
is an independent project and upstream mergeability is explicitly not a constraint. The memory had
gone stale against the project's own constitution.

## Renamed, not removed — and the distinction matters

Mergeability being dead does **not** mean upstream history is disposable. Heroic is still
load-bearing for three unrelated reasons:

1. **`package.json`'s `upstream.baseCommit` (`b5b5cad3f`) is the diff baseline for the whole i18n
   fork-scope system.** `i18nGateScope.json`, `i18nForkTouchedFiles.json` and the A-17 ratchet all
   answer "which files has the fork touched?" as `git diff <baseCommit> HEAD -- src/frontend` —
   the artifacts hand-edited two tasks ago.
2. The locale refresh is a wholesale copy from upstream catalogs.
3. Upstream commits are still reviewed for port decisions — that is exactly how the
   Plausible-telemetry problem surfaced (upstream `a71a8b4b7`).

**But the remote turns out not to be load-bearing for (1).** `b5b5cad3f` is reachable from
`origin/main` as well as from Heroic, so the derivation survives even if the Heroic remote were
deleted outright. Only *re-fetching* upstream needs it. Measured, not assumed — and it is why the
corrected code comment now states the invariant as "the OBJECT must be reachable" rather than
naming any remote.

## Changes

| Change | Kind |
|---|---|
| `git remote rename origin upstream`, then `gamelib origin` | local git config — not a commit |
| `meta/genI18nGateScope.ts` header comment | `ba2b5fb7a` |
| `git-remote-topology.md` + `MEMORY.md` index | operator memory |

The rename is local config, so the **memory file is the durable artifact here** — it was rewritten
rather than patched, because its *why* was wrong independently of this change.

## The comment that had to change

`genI18nGateScope.ts`'s header asserted the script is run locally *"where `origin` already points
at Heroic and the merge-base has been fetched"* — the only place in the tree stating the old
arrangement as fact. Rewritten to state the durable invariant instead, and to record both the new
mapping and that the object is reachable from `origin/main` anyway.

**Two other comments in the same file were deliberately left alone.** Lines ~433 and ~464 say "the
Heroic remote" generically, which stays true whatever it is called locally. Editing them would
have been churn.

## Verification

| Check | Result |
|---|---|
| Tracking config after rename | **auto-rewritten** to `origin/...` for both branches; plain `git push` now resolves to the fork |
| `upstream.baseCommit` still reachable | yes — `git cat-file -t` OK |
| Live derivation (`git diff <base> HEAD -- src/frontend`) | 440 lines, non-empty |
| **A-17 ANTI-ROT** (committed artifact == live git derivation) | **passes** — this is the test that would have caught a broken derivation |
| `genI18nGateScope` suite | 26 passed / 1 skipped — **identical to the pre-rename baseline** |
| `genI18nGateScope` + `hardcodedStringGate` after the comment edit | 166 passed / 1 skipped / **0 failed** |
| `tsc --noEmit`, `prettier --check`, `eslint` | all clean |
| `upstream` remote still fetches | `git ls-remote --heads upstream main` returns Heroic's tip |

The pre-rename baseline was captured **before** touching anything, and it confirmed the
git-dependent A-17 block was *running* rather than `describe.skip`ped — otherwise "still passes"
afterwards would have been worthless.

## Not done

- **Heroic not removed.** Still needed for locale refreshes and port review.
- **`upstream`'s push URL not disabled.** `git remote set-url --push upstream DISABLED` would make
  read-only explicit rather than relying on GitHub's 403. Offered, not done — beyond what was
  asked, and trivially added later.
- **`.github/workflows/create-pr-from-stable.yml` and `update-bug-template-on-release.yml` not
  touched.** Both use `origin`, but in Actions `origin` is whatever `actions/checkout` cloned, so
  local naming cannot affect them. Both look like inherited Heroic release plumbing —
  `create-pr-from-stable.yml` syncs a `stable` branch this fork does not appear to use. Flagged as
  a separate question, not resolved here.
