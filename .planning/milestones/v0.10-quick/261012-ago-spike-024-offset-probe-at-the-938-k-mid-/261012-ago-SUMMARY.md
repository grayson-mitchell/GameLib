---
quick_id: 261012-ago
title: Spike 024 — runs 24–27, the ~938 k stall offset is mid-string-literal inside an inline script; the document stream stopped there
date: 2026-10-12
status: complete
outcome: MEASURED — 0 of 8 mid-parse stalls (0 of 16 since run 19); on documents of exactly the stalled runs' lengths the stalled offset lands 149–150 characters into the inline analytics-worker script, inside the string literal 'epic-analytics-worker', mid character token, so the main-document response had stopped arriving at a fixed transfer position. A stalled upstream stream, not a WebKit yield or a webview defect; the embed's answer is a load timeout + reload, not webview code
todo_closed: .planning/todos/completed/2026-10-12-the-mid-parse-epic-store-stall-at-938-k-did-not-recur-and-is-not-occlusion.md
executed_inline: true
---

# Quick 261012-ago — runs 24–27

## Result

| Run | Steam | `www…` | `store…` | docLen | Embed |
|---|---|---|---|---|---|
| 24 | served | RENDERED by 20 s | RENDERED by 20 s | 1 121 737 / 736 | challenged ×2 |
| 25 | served | RENDERED | RENDERED | 1 121 734 / 1 121 168 | challenged ×2 |
| 26 | served | RENDERED | RENDERED | **1 121 252** (= run 18) | challenged ×2 |
| 27 | served | RENDERED | RENDERED | **1 121 253** (= run 19) | challenged ×2 |

No mid-parse stall in 8 arms; 0 of 16 across runs 20–27. Raw Epic arms across runs 12–27: 32,
challenged 1 (run 21).

## What it means

- **The offset is placed.** `docLen` 938 545 / 938 544 (run 18) minus the serialiser's 23-char
  `</script></head></html>` is 149–150 characters into the inline analytics `SharedWorker`
  script, inside `'epic-analytics-worker'`. No element, `</head>` or parser-blocking resource
  is anywhere near; only the end of input parks a tokenizer mid character token. The document
  stream had stopped at a fixed transfer position (±1 across hosts, ~160 shift with a ~15 k
  document change between days). Run 19's completion by 120 s is a resumed stream.
- **Decided by position, not by `nav.responseEnd`:** `responseEnd` read `0` on two rendered
  `store…` arms (24, 27) and `nav.decoded` is `0` on every `www…` arm — neither is a reliable
  tell on its own in this WebKit. Deviation from the todo's prescription, recorded.
- **Deviation from the todo's knob:** no occluder (`SPIKE_PRISTINE_OCCLUDE=pre` was
  prescribed). The stall was seen 0 of 2 under the occluder and 5 of 14 without, so the runs
  reproduced the un-occluded condition with the host made key by a new
  `SPIKE_PRISTINE_FOCUS=1`; every read carries `occluded` so a disguise was detectable anyway.
- **Not a shipping blocker.** Upstream of the webview; the product answer is a load timeout
  with a reload affordance on the embed.

## Landed

- Harness: probe fields `at938` (raw), `headEnd`, `bodyAt`, `tagsAround`, `scriptAt`;
  `SPIKE_PRISTINE_FOCUS=1`. `cargo build` clean; rendered probe JS passes `node --check`.
- README: frontmatter (`runs: 27`, verdict tail), `### Runs 24–27`, established #9,
  NOT-established update, reproduce-knob paragraph, consequence paragraph. `run-24.log` …
  `run-27.log` with challenge-card session ids and IPs redacted (plain + URL-encoded);
  `events-export.json` and `run.log` restored after each run. No new shots kept (all rendered).
- Todo closed with a RESOLUTION.

## Gates

- `cargo build` clean; rendered probe JS `node --check` clean. Prettier: `--file-info` reports
  `ignored: true` for the todo and the quick-task markdown, and `.rs`/README are under
  `.planning/spikes` — no formatter check applies, so none is claimed. `pnpm planning-gates`
  12/12 with the todo move staged.

## Not done

- Brotli block vs HTTP chunk boundary at the stall position — not readable from inside the
  page, and `curl` is challenged.
- Whether Safari reproduces the stream stall on a cold load.
- A load-timeout + reload affordance on the embed is a product decision for the raw-subview
  design, not filed here (the design itself is still undecided).
