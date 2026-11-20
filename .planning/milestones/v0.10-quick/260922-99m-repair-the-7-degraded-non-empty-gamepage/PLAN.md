---
quick_id: 260922-99m
slug: repair-the-7-degraded-non-empty-gamepage
created: 2026-09-21
description: "Repair the degraded non-empty gamepage `wikiLink` values, and replace the gate's negative-only assertions with a positive one"
resolves_todo: .planning/todos/pending/2026-09-21-seven-locales-carry-a-degraded-non-empty-wikilink-value.md
---

# Quick Task 260922-99m — repair the degraded `wikiLink` values, and gate what the user sees

## The todo's population is 7. The measured population is 6, and one of its seven is not a defect.

The todo (filed by `260922-8xv`, i.e. by me) classified 7 locales by reading their **catalog text**.
This task began by rendering instead — all 47 locales that have a `gamepage.json`, through the real
i18next engine, comparing each against the English baseline (`gap=" "`, no `&amp;`):

```
ROW|ar|gap="  "|inner="افتح الصفحة"|amp=false          <- doubled space
ROW|ga|gap=""  |inner="Oscail an leathanach"|amp=false <- NO space at all
ROW|gl|gap="  "|inner="Abrir páxina"|amp=false         <- doubled space
ROW|sv|gap=""  |inner="Öppna sida"|amp=false           <- NO space at all
ROW|ta|gap=" " |inner=" திறந்த பக்கம் "|amp=TRUE       <- visible "&amp; nbsp;" + padded link text
(all 42 others identical to the en baseline)
```

Two corrections to the todo, both in the direction of doing less:

1. **`vi` is not a defect.** Its catalog carries a plain space where others carry `&nbsp;`, and it
   renders `này: <a ...>` — **byte-identical in shape to `en` and `de`**. `shouldUnescape` decodes
   `&nbsp;` to an ordinary `U+0020` anyway (stated as an accepted trade in `260921-k2d`'s closing
   note), so the entity and a plain space are the same thing to a reader. `vi` is left alone.
   Touching it would be a change with zero user-visible effect made only for catalog uniformity.
2. **`pt_BR` is real but is a different defect** from the other five: its spacing is correct and it
   renders `Open page` — untranslated link text, already the thing A6 was built to catch.

So the repair set is **6**: `ar`, `ga`, `gl`, `sv`, `ta` (spacing/mojibake) and `pt_BR` (English
link text).

## The gate decision the todo asked for: positive, and measured on the RENDER

The todo asked whether A4/A5/A6 should "grow a positive assertion (exactly one decoded space
between the colon and the link) rather than only the three negative ones, since it is the negative
shape that lets four of these seven through."

**Yes — and the right subject is the rendered markup, not the catalog shape.** A catalog-shape gate
(require a literal `&nbsp;` immediately before `<1>`) would have to either fail `vi` or carry an
exemption for it, and `vi` is correct. A rendered gate has no such problem: it asks the only
question that matters — *what does the reader see between the sentence and the link* — and is
indifferent to which spelling produced it.

New **A7**: the rendered gap between the sentence and the `<a>` is exactly one `U+0020`. That is
the assertion `ga`/`sv` (no gap) and `ar`/`gl` (two) fail, and no negative assertion can express.

## Tasks

1. Repair the 6 values.
2. Add A7 (positive, rendered). Widen A4 and A6 from their named sets to **all 47 locale dirs that
   have a `gamepage.json`**, derived from the filesystem with the count **pinned at 47** so a glob
   that collapses to nothing cannot pass (the `minFiles` floor idea `meta/lintScoped.cjs` already
   uses). `br`/`sl` are excluded by construction — they have no `gamepage.json` — rather than by a
   hand-maintained skip list.
3. Strengthen A4: its regex is `/&amp;nbsp/`, which **does not match `ta`'s `&amp; nbsp;`** — the
   space defeats it. Assert no `&amp;` at all; measured, no locale's value legitimately contains an
   ampersand once `ta` is repaired.
4. Prove each new/widened assertion fails for its own reason by mutation before trusting it.

## Out of scope

- `pt`'s `Abrir pagina` (missing the accent on `página`). It is a Portuguese spelling slip, not a
  markup or fallback defect, and is nothing this task measured or that any assertion here covers.
  Not fixed, not filed — noted here only so the next census does not read it as new.
