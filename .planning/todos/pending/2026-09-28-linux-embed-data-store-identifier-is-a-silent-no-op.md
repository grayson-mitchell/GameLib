---
created: 2026-09-28
title: 'On Linux, data_store_identifier per-store cookie isolation is a silent no-op, and every webview shares one WebKitWebContext. Decide the Linux isolation story before an embed ships there. Windows parity is unverified.'
found_during: spikes 025/026 (2026-09-28; commits c54e047ca, 369f482a4), filed by quick 260928-raq
severity: minor
platform: linux
ready: human
area: store-embed
files:
  - .planning/spikes/026-linux-add-child-runtime/README.md
  - .planning/spikes/MANIFEST.md
  - .planning/spikes/027-windows-add-child-crosscheck/app/src/main.rs
---

## Mechanism

- `wry-0.57.0/src/lib.rs:2479-2481` (`fetch_data_store_identifiers`): hard-coded to the macOS
  `wkwebview::InnerWebView::fetch_data_store_identifiers` backend.
- The builder field itself is declared as a cross-platform option (`lib.rs:1581/1620/1639`).
- Spike 026 grepped `webkitgtk/mod.rs` directly and confirmed it never reads the field at all —
  the GTK backend accepts the builder call and does nothing with it.

## Measured (spike 026, step 5)

The `isolatedStore` embed (`data_store_identifier` set, expecting an empty/near-empty jar) saw
all 10 shared-jar cookies, including every `store.steampowered.com` and `gog.com` cookie set
earlier in the same run. Cite cookie NAMES and paths only, never a pasted log line.

## What it contradicts

- `.planning/spikes/MANIFEST.md`'s Idea C requirement "Per-store isolation works on children via
  `data_store_identifier` (macOS 14+)" is true on macOS and has no Linux equivalent.
- This settles spikes 015/018's own "Windows/Linux parity unverified" caveat for Linux, in the
  negative.

## Why minor

Same shipped-app gate as the sibling positioning todo
(`.planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`):
`src-tauri/Cargo.toml:114-128` gates the `unstable` feature, and therefore this whole code path,
to macOS only. Nothing live is affected today.

## The decision

- Accept one shared cookie jar on Linux and document the hygiene cost (any embed on Linux can
  read any other embed's cookies within the same process).
- A wry / `tauri-runtime-wry` change so the GTK backend honours the identifier (for example, a
  per-identifier `WebKitWebContext`). Label this as an UNVERIFIED option — no such patch exists
  today.
- Keep Linux off the embed entirely (same status-quo option as the sibling positioning todo).

## Windows: UNVERIFIED

Spike 027 only type-checked the `add_child`/`data_store_identifier` call surface against
`x86_64-pc-windows-gnu` — it never ran on real Windows hardware. The `38-E01` ledger item's
sitting runs the spike 027 harness, whose autorun Phase 8
(`.planning/spikes/027-windows-add-child-crosscheck/app/src/main.rs:698`) exercises exactly this
isolation question live. Record that result HERE, by this filename, when the sitting runs — not
against `38-E01`, whose own `test:` is scoped to attach/placement/geometry, not cookie isolation.
