---
created: 2026-09-07
title: "lintTranslations.ts's header comment and baseline `reason` string both describe a 794-pair gap that was filled the same day — now actively wrong, not merely dated"
area: meta-i18n-gates
status: "RESOLVED 2026-09-08 by quick task 260908-gx3. All three sites rewritten (the todo enumerated two; a third at the CANONICAL_LOCALES_PATH comment carried the same stale figure). Artifact regenerated so the shipped reason string no longer carries the lifted constraint."
severity: minor
source: "41-REVIEW.md IN-02, carried forward by 41-REVIEW-FIX.md (outstanding); materialized by quick task 260906-u8i"
files:
  - meta/lintTranslations.ts (header comment ~:52-53; the baseline `reason` string ~:490-494)
  - meta/i18nCatalogPresenceBaseline.json (totalPairs is now 0)
resolves_phase: null
---

# Two comment sites still describe a gap that no longer exists

## What changed after the review filed this

`41-REVIEW.md` raised IN-02 as a **prediction**: a dated point-in-time measurement in a
long-lived header comment "will read as stale" eventually, with "no action needed beyond what's
already done (dating the claim)".

That prediction came true the same day. Quick task `260906-u8i` filled all 794 pairs and
re-recorded the baseline to `totalPairs: 0`. So this is no longer a comment that *will* age —
it is a comment that **currently describes a state the repo is not in**.

Two sites, not one:

1. **`meta/lintTranslations.ts:52-53`** — "measured at HEAD (2026-09-06) this was hiding 794
   missing (locale, key) pairs across 17 keys, invisible to `pnpm lint-translations:gamelib` the
   whole time."
2. **`meta/lintTranslations.ts:490-494`** — the baseline artifact's own embedded `reason` string:
   "Filling these requires `pnpm machine-fill-gamelib`, which needs an API key and is out of
   Phase 41's unattended scope." Filling is done. The sentence describes a constraint that was
   lifted.

Site 2 is the worse of the two because it is not a comment — it is **written into the generated
JSON artifact**, so the stale claim ships in `meta/i18nCatalogPresenceBaseline.json` and will be
re-emitted verbatim by every future `LINT_TRANSLATIONS_WRITE_BASELINE=1` run.

## What a fix looks like

Rewrite both to describe the *mechanism* rather than a snapshot: the header should say what the
inverted presence check does and why the un-inverted one was blind, without asserting a live
count. If a count is genuinely useful as motivation, mark it explicitly historical
("when this check landed, it surfaced 794 pairs; that gap was filled in `260906-u8i`").

The `reason` string should state the file's contract — a record of a known gap, not a permission
to grow it — and drop the claim about what is or isn't in scope for a phase that has closed.

## Related

[[a-comment-can-invert-its-own-cited-source]] — a comment asserting something its own source does
not support. Same family: prose that outlived the fact it was derived from.

---

## Resolution — 2026-09-08, quick task 260908-gx3

Fixed alongside its sibling (`2026-09-07-presence-baseline-totalpairs-is-unenforced-prose`), as
that todo instructed — the `reason` string was being rewritten for the sibling's fix anyway, and
leaving the stale sentence in it would have been absurd.

**Three sites, not the two enumerated here:**

1. `meta/lintTranslations.ts:~52` — rewritten to describe the mechanism. 794 survives only inside
   an explicitly-historical parenthetical that names `260906-u8i` as the task that filled it, and
   states that the committed baseline, never a comment, is where the current figure lives.
2. `meta/lintTranslations.ts:~420` (**not enumerated by this todo**) — the `CANONICAL_LOCALES_PATH`
   comment said fixture trees "would 'drift' from the 794-pair baseline on every single run". The
   reasoning still held against a 0-pair baseline, but the figure was stale prose in a third site
   two lines from the others. Now baseline-figure-agnostic.
3. The `reason` string in `writePresenceBaseline()` — the worst of the three for the reason this
   todo gave. Dropped the "out of Phase 41's unattended scope" claim (a constraint lifted, on a
   phase since closed) and replaced it with the file's actual contract plus what `totalPairs` now
   is.

The artifact was **regenerated** via `LINT_TRANSLATIONS_WRITE_BASELINE=1` rather than hand-edited,
so the writer and the shipped file cannot diverge. The diff was confined to `reason` and
`generatedAt`; `totalPairs: 0` and `missing: {}` were unchanged.

`grep -rn 794 meta/` now returns exactly one line: the historical parenthetical in site 1.
