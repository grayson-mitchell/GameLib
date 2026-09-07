---
quick_id: 260906-mdc
slug: move-archify-diagrams-to-doc-archify
date: 2026-09-06
status: rolled-back
---

# Summary

Published the four archify architecture diagrams under `doc/archify/`.

## What landed

| Path | Bytes | SHA-256 (first 16) |
| --- | --- | --- |
| `doc/archify/gamelib-overview.html` | 717,469 | `9897a359cfc1317a` |
| `doc/archify/gamelib-topology.html` | 725,309 | `d548bd9125db3942` |
| `doc/archify/gamelib-runners.html` | 722,651 | `de81f3c9f2dcd74b` |
| `doc/archify/gamelib-capability.html` | 718,519 | `d754dadb090b98b1` |

Plus `doc/archify/spec/*.architecture.json` (four specs) and
`doc/archify/README.md`. Copies were verified byte-identical to the delivered
artifacts before commit.

## Deviation from plan

The plan scoped changes to `doc/archify/` and this planning directory.
`.prettierignore` was also modified — this was necessary, not incidental:

`doc/` is not covered by `.prettierignore`, so a dry run of
`npx prettier --check "doc/archify/**"` reported all 8 files as style
violations. The pre-push hook runs prettier repo-wide, so committing as-is
would have pushed the gate red. Running `prettier --write` was rejected as the
fix: the HTML is a generated artifact delivered with a SHA-256 receipt, and
reformatting it would invalidate that receipt and could break the inlined
viewer runtime. Adding `doc/archify` to `.prettierignore` matches the existing
precedent in that file for byte-identical fixtures
(`meta/__tests__/fixtures/upstream-workflows`, `public/bin`).

Re-checked after the change: `All matched files use Prettier code style!`

## Known trade-off, not resolved

~2.9 MB of generated HTML now lives in git history. Each artifact inlines the
whole archify viewer runtime, so the four blobs are near-duplicates of each
other, and every future re-delivery writes a fresh ~720 KB blob rather than a
delta. If repo weight becomes a concern, the alternative is to commit
`spec/` only and treat the HTML as a build product.

## Not done

No source changes, no CI wiring, no regeneration-on-commit hook.


---

## ROLLED BACK — 2026-09-07

The user reviewed the published diagrams and decided they should not be
versioned. `doc/archify/` was removed in full, along with the `.prettierignore`
entry that existed only to protect it.

Reverted forward, not rewritten: by the time the decision was made this commit
sat roughly 75 commits deep under concurrent work on the same branch, so a
`reset`/`rebase` would have destroyed another session's history. The removal is
an ordinary deletion commit.

`.planning/STATE.md` was dirty with a concurrent session's uncommitted line when
the removal landed. Only this task's own table row was staged — built by
applying the edit to the `HEAD` blob, staging that, then restoring the working
tree to the other session's version with the same edit re-applied. Their line
was never staged.

The "known trade-off" recorded above is the reason for the rollback: ~2.9 MB of
near-duplicate generated HTML in git history, growing by ~720 KB per
re-delivery. That was flagged before the original commit and accepted at the
time; on review it was not worth the repo weight.

The artifacts and their pinned specs were verified byte-identical outside the
repo before deletion, so nothing was lost. They are regenerable from the specs
at any time via `archify deliver` — see the removed `doc/archify/README.md`,
preserved in this commit's parent (`git show 1c1454e66:doc/archify/README.md`).
