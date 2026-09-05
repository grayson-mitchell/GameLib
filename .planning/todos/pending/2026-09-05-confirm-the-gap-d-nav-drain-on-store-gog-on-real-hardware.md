---
created: 2026-09-05T13:45:00.000Z
title: 'Confirm the GAP-D nav drain live on `/store/gog` — Back enables and the host label follows'
area: frontend/store-embed
needs: one-manual-gesture-on-macos
status: OPEN
severity: minor
blocks: nothing
origin: quick 260905-e61 (GAP-D fix) — its own second DoD line, left unrun; queued by 260905-c40
files:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/components/UI/StoreEmbedControls/index.tsx
  - src-tauri/src/main.rs
---

## What is outstanding

Quick `260905-e61` fixed GAP-D — in-embed navigation now reaches the renderer via a drained
queue, implemented across all three layers, with automated coverage green. **Its second
definition-of-done line was not run:** manual confirmation on real hardware that, on
`/store/gog`, clicking an in-page link actually enables the Back button and moves the host
label off the affiliate host.

This is a **confirmation of a shipped fix**, not an open defect. The automated half passed.

## Why it needs its own queue entry

It was recorded in exactly two places — the `resolution:` line of a todo that now sits in
`.planning/todos/completed/`, and `260905-e61-SUMMARY.md:91-93`. Neither is a queue.

It cannot surface through `audit-uat` either: that tool only parses VERIFICATION files whose
status is `human_needed` or `gaps_found` (`~/.claude/get-shit-done/bin/lib/uat.cjs:58`), and
`40-VERIFICATION.md` is `gaps_closed_partially`. Phase 40 does not appear in the audit at all.

## The gesture

On the **packaged** build (`vite build && build:sidecar-sea && build:decompress-worker-dev &&
tauri build` → `src-tauri/target/release/bundle/macos/GameLib.app`; never `tauri:dev` or
`--debug`, per the recorded build lesson):

1. Open `/store/gog`. The start URL is the affiliate host `af.gog.com`; the landing page is
   `www.gog.com`. Note what the host label reads.
2. Click any in-page link.
3. **Expect:** Back becomes enabled, and the host label tracks the page actually shown.
   Before the fix both stayed frozen until Reload.

## Definition of done

- The gesture above run once on real macOS hardware, outcome recorded verbatim (pass or fail)
- If it fails, reopen `2026-09-05-in-embed-navigation-never-reaches-the-renderer-back-forward-de.md`
  out of `completed/` rather than filing a new item
