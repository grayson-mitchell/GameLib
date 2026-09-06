---
created: 2026-09-07
title: "lintTranslations.ts's header comment and baseline `reason` string both describe a 794-pair gap that was filled the same day — now actively wrong, not merely dated"
area: meta-i18n-gates
status: OPEN
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
