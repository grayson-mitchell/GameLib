---
quick_id: 260922-99m
slug: repair-the-7-degraded-non-empty-gamepage
status: complete
completed: 2026-09-21
commits:
  - 59a82cd18 fix(quick-260922-99m): repair 6 degraded gamepage wikiLink values
  - 0bfe8ca34 test(quick-260922-99m): add A7, the first positive assertion, and widen A4/A6 to all 47
closes:
  - .planning/todos/completed/2026-09-21-seven-locales-carry-a-degraded-non-empty-wikilink-value.md
---

# 260922-99m — 6 repairs, and the positive assertion the negatives could not replace

## The headline: the todo said 7, the render said 6, and one of its seven was correct

The todo (which I filed one task earlier, in `260922-8xv`) classified 7 locales by reading catalog
text. This task began by **rendering all 47 locale dirs that have a `gamepage.json`** and diffing
each against the English baseline. Five deviate in output:

| locale | rendered deviation                                      |
| ------ | ------------------------------------------------------- |
| `ar`   | `gap="  "` — doubled space                              |
| `gl`   | `gap="  "` — doubled space                              |
| `ga`   | `gap=""` — **no separator at all**                      |
| `sv`   | `gap=""` — **no separator at all**                      |
| `ta`   | visible `&amp; nbsp;` + padded `<1> foo </1>` link text |

Plus `pt_BR`, whose spacing was already right and whose link text was the literal English
`Open page` — a content defect, not a spacing one. **Total 6.**

**`vi` was not a defect.** It writes a plain space where others write `&nbsp;`, and renders
`này: <a ...>` — identical in shape to `en` and `de`, because `shouldUnescape` decodes `&nbsp;` to
an ordinary `U+0020` anyway. Repairing it would have been zero user-visible change bought for
catalog uniformity. It was left alone, and the todo corrected.

## The gate decision, and why a positive assertion was unavoidable

The todo asked whether the assertions should grow a positive one. **Yes — and the reason is
structural, not stylistic: negative assertions cannot see an absence.** `ga` and `sv` rendered
`léigh seo:<a ...>` and were green under A4, A5 *and* A6 at once — nothing doubled, nothing
escaped, link text genuinely Irish and Swedish. Widening a negative set never reaches them.

**A7** asserts the *rendered* gap between sentence and link is exactly one `U+0020`. Gating the
render rather than the catalog's spelling is what lets `vi` stay correct with no exemption list —
a catalog-shape rule would have had to either fail a correct value or carry a skip entry for it.

Two further defects were holes in the **set**, not the assertion, and both had survived three
tasks that each looked directly at this file:

- A4's `/&amp;nbsp/` never matched `ta`'s `&amp; nbsp;` — the space defeats the pattern — so the
  assertion that exists to catch entity mojibake was blind to the worst instance in the repo.
- A6 was scoped to the 15 locales it was written for, so it could not see `pt_BR` shipping the
  exact English string A6 names.

The locale set is now read off disk, not hand-listed, with the count **pinned at 47**. `br`/`sl`
are excluded by construction (no `gamepage.json`) rather than by a comment asking people not to
widen the list.

## Verification

- **Mutation-proven, each pre-fix value caught by its own assertion**: `ta` → A4 + A6,
  `pt_BR` → A6, `ar` → A7, `ga` → A7. Four mutations, five failures, no cross-talk. 161/161 with
  all four reverted.
- **The count pin is load-bearing, and was proven, not assumed.** Collapsing the glob to match
  nothing made the suite report `Tests: 0 total` / success — the exact silent-pass this repo keeps
  stamping out. With the pin it fails loudly: `found 0 locale dirs with a gamepage.json,
  expected 47`.
- Suite 53 → **161 tests** (47-locale coverage on A4/A7, 46 on A6).
- `lint` exit 0 with both counts asserted: src **1119/1124**, tests **638/638** — zero-headroom
  scope held. `tsc` 0, `prettier --check` clean, `i18n-churn-guard` clean, `planning-gates` 12/12.
- `lint-translations`: 0 findings naming `gamepage.wikiLink`, 0 hard failures.

## Lesson worth keeping

Each of the three previous widenings of this gate was exactly as wide as the defect already
known — `de`, then `['de','fr']`, then 17 — and each left the next one invisible. The set is the
part that kept failing, not the assertions. Deriving it from disk with a pinned count ends that
cycle; a hand-maintained list of locales is a list of defects someone has already found.
