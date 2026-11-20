---
quick_id: 261012-ago
title: Spike 024 — runs 24+: what sits at the ~938 k mid-parse stall offset
created: 2026-10-12
status: complete
executed_inline: true
todo: .planning/todos/pending/2026-10-12-the-mid-parse-epic-store-stall-at-938-k-did-not-recur-and-is-not-occlusion.md
---

# Quick 261012-ago — name the element at the stall offset, bound the recurrence rate

## Task 1 — probe instrumentation (`.planning/spikes/024-…/app/src/main.rs`)

- `probe_script`: `at938` (`outerHTML.slice(937800, 939200)`, whitespace-collapsed), `headEnd`
  (`indexOf('</head>')`), `bodyAt` (`indexOf('<body')`), and `tagsAround` — the six tag opens
  before offset 938 450 and the four after, each as `offset:<tag prefix>` — so a rendered arm
  names the element at the stall offset even if the document has drifted a few hundred chars
  since runs 18/19, and a stalled arm's `tail` lands inside the same window.
- `SPIKE_PRISTINE_FOCUS=1`: focus the host window right after each pristine arm is created when
  no occluder is in play, so the un-occluded condition that produced the stall (runs 17–19) is
  reproduced with the host explicitly key, and a blank arm cannot be a natural occlusion in
  disguise. The occluder is NOT used: the stall was seen 0 of 2 under it and 5 of 14 without.
- verify: `cargo build` in the spike app; prettier N/A (`.rs` under `.planning/spikes`).

## Task 2 — the measurement

`SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 SPIKE_PRISTINE=1 SPIKE_PRISTINE_INMAIN=1
SPIKE_PRISTINE_LONG=1 SPIKE_PRISTINE_FOCUS=1 SPIKE_RUN=<n>`, runs 24–27 back to back, ~6.5 min
each. Stop early if a mid-parse stall (`readyState=loading`, `isLoading=true`, empty body,
`docLen` ≈ 938 k) is caught with the new fields. Decision on a stalled arm: `nav.responseEnd
=== 0` with `nav.decoded` short of ~1.1 M ⇒ the server has not flushed the rest (streaming-SSR
stall, not ours); `responseEnd > 0` with the parser parked ⇒ WebKit holding at a yield.

## Task 3 — record

README `### Runs 24+` (table; the offset reading from rendered arms; the stalled-arm decision
or the bounded rate), established / NOT-established update, reproduce-knob note, frontmatter
`runs` + verdict tail; `run-24.log` … redacted; `events-export.json` restored; todo closed with
a RESOLUTION or updated with the bounded rate and the offset reading. verify:
`pnpm planning-gates`.
