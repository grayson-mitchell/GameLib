---
quick_id: 260919-8yq
date: 2026-09-19
status: complete
commit: 074bea408
files_changed: 1
source_todo: .planning/todos/pending/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md
todo_status_after: OPEN (step 1 of 5 done)
---

# Quick Task 260919-8yq — Summary

Deleted the **25 dead fork-added `humbleKeys.*` keys** from
`public/locales/en/translation.json`. This is **Direction step 1** of the 2026-09-15
unlocalised-`humbleKeys` todo, and only that step. The todo stays **OPEN**.

## What shipped

`074bea408` — one file, 1 insertion / 28 deletions (27 deleted lines plus one
trailing-comma repair). 24 dead scalar entries plus the whole `group` object
(`other` was its only child, so an empty `{}` was not left behind).

`humbleKeys` leaves: **84 → 59**.

## Why 25 keys were safe to delete

Phase 43's 43-07 collapse renamed them and stranded the originals. Six have a
surviving live twin carrying **byte-identical English**:

| deleted | surviving twin |
| --- | --- |
| `ownedBlockBody` / `ownedBlockTitle` / `ownedBlockGoto` | `c2Body` / `c2Title` / `c2Action` |
| `revealTitle` / `revealBody` | `revealConfirmTitle` / `revealConfirmBody` |
| `yourKey` | `keyShownTitle` |
| `ambiguousOutcome` | `revealAmbiguousBody` |
| `cooldownRetry` | `revealCooldownBody` |
| `ownedPassiveNote` | `finishOwnedNote` |

The remainder (`tabAll`, `tabSpares*`, `tabWaiting*`, `spares*`, `waiting*`,
`emptyTitle`, `expiringSoon`, `group.other`) are the three-tab screen 43-07 deleted
outright. `emptyTitle`'s English now lives at `gamelib:humbleKeys.emptyHeading`
(`Keys/index.tsx:650`) — the rename that made the original dead.

## How it was verified — key-set diff, never an exit code

`lintTranslations` reads only the `gamelib` namespace
(`FORK_OWNED_NAMESPACES = ['gamelib']`), so it is **green and blind** to everything
in this task. Its pass is recorded as no-regression, **not** as evidence. The actual
evidence:

- File re-parses; `humbleKeys` leaf count exactly 59.
- Surviving set **set-equal** to the independently measured live set.
- Every surviving value **byte-identical** to its pre-edit value.
- Every other top-level namespace **deep-equal** before and after (no collateral).
- `git diff --name-only` = exactly one file.
- Zero references to any deleted key across `src/` and `meta/`, re-run post-edit.
- `npx jest --testPathPattern 'lintTranslations|i18nCatalogChurnGuard|gamelibCatalogParity'`
  → 3 suites, **239 passed**.
- `npx jest --testPathPattern 'screens/Humble'` → 4 suites, **181 passed**.

## Traps that armed, and what happened

1. **Two `"humbleKeys":` matches in the file.** Checked before touching anything: the
   second (line 1214) is `sidebar.humbleKeys`, a display label — not a duplicate block.
   A duplicate-key census across every nesting level returned **none**. Had it been a
   real duplicate, `json.load` would have been silently reporting only the last one and
   the whole live/dead split would have been wrong.
2. **`yourKey` sorts last in the block**, so deleting it stranded a comma on the
   preceding line. Repaired structurally (next non-empty line closes the object), and
   the repair count was asserted at exactly 1.
3. **D-05 churn guard is unstaged-only.** Re-confirmed today:
   `meta/i18nCatalogChurnGuard.ts` runs `git diff --name-only -- public/locales` with
   **no `--cached`**, so the edit was red while unstaged and green once staged. The
   test's own comment claims it bites "staged or unstaged" — the comment contradicts its
   own command. Suites were run **after** staging.
4. **No JSON round-trip.** `public/locales/` is in `.prettierignore` (line 5), so the
   catalogues are not prettier-normalised. Edited line-in-place; re-parse was the check,
   not the mechanism. (A probe did show this file happens to round-trip exactly at
   `indent=4, ensure_ascii=False, trailing newline` — recorded, not relied on.)
5. **Two deletion traps did NOT arm**, and saying they did would have been a false claim:
   no locale carries any of these keys, so the `da`/`id`/`nl` trailing-comma trap and the
   47-vs-49 population trap are both irrelevant here. One file changed, not 47.
6. **Presence baseline deliberately NOT regenerated.** It is scoped to
   `namespace: gamelib` and never tracked a `translation`-namespace key, so this deletion
   owes no regeneration and can produce no drift.

## What remains open — the larger half

`en/translation.json` still holds **59 live `humbleKeys.*` keys** absent from **all 46**
non-English `translation.json` files (`br` and `sl` have no such file at all). The Humble
Keys screen still renders English to every non-English user, and **no gate can see it**.

That fill awaits an operator decision between two options, which is why the todo is
`ready: human`:

- **Fill in place** — 59 × 46 plus creating `br`/`sl` ≈ 2,832 strings; stays permanently
  ungated.
- **Migrate the 59 to the `gamelib` namespace, then fill** — same string volume, but lands
  them in the fork namespace D-06 says they belong in, and the presence baseline at
  `totalPairs: 0` then makes any future gap CI-visible instead of silent. Costs ~7 `src/`
  call sites re-prefixed, and CI goes red from the moment the English keys land until the
  fill completes, so it must ship atomically.

Also still open and deliberately **not** bundled: whether `FORK_OWNED_NAMESPACES` should
widen to cover fork-added prefixes inside upstream namespaces.

## One thing went wrong: I broke STATE.md's frontmatter, and the gate caught it

The first STATE.md write turned `pnpm planning-gates` red at **10/11**:
`frontmatter does NOT parse: bad indentation of a mapping entry (5:579)`.

Cause: `stopped_at` and `last_activity` are **single-quoted YAML scalars**, and inside one a
literal `'` must be written `''`. My prepended narrative contained
`FORK_OWNED_NAMESPACES = ['gamelib']` and several apostrophes (`Phase 43's`, `the file's`), each
of which closed the scalar early. The existing 42k-char suffix was already correctly escaped —
only the new text was malformed.

Repaired by restoring STATE.md from `HEAD` via `git show HEAD:<path>` (**not**
`git checkout -- <path>`, which fires the post-checkout hook) and re-applying with a `''`
escape, plus dropping the bracketed-quote construction in favour of prose. Gates then 11/11,
and both parsers — `pnpm planning-gates` and `gsd-sdk query frontmatter.get` — read the field.

Worth noting for next time: the existing hazard on these fields was *truncation* from wrapping
the scalar. This is a **second, different** hazard on the same two fields — an unescaped quote
in the added text — and it fails loudly at the gate rather than silently. The suffix-preservation
assertion I wrote did not catch it, because the suffix *was* preserved; the file simply stopped
being YAML.

## Deviation from the standard quick-task flow

The workflow spawns `gsd-planner` then `gsd-executor`. Both steps were run **inline** by
the orchestrator instead. Reason: the load-bearing details here — the exact 25-key list,
the no-round-trip rule, the unstaged-only churn guard — were already measured in this
session, and the single highest-probability failure mode was a fresh agent reaching for a
`json.load`/`json.dump` round-trip and reformatting all of `translation.json`. The plan,
the atomic commit, SUMMARY.md and the STATE.md row all follow the normal shape.
