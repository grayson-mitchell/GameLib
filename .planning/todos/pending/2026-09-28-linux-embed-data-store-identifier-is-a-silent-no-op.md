---
created: 2026-09-28
title: 'On Linux, data_store_identifier per-store cookie isolation is a silent no-op, and every webview shares one WebKitWebContext. Decide the Linux isolation story before an embed ships there. Windows parity is unverified.'
found_during: spikes 025/026 (2026-09-28; commits c54e047ca, 369f482a4), filed by quick 260928-raq
severity: minor
platform: windows
ready: live-gate
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

## Decision (2026-09-29): accept one shared cookie jar on Linux

- **Who decided.** The operator decided this directly on 2026-09-29, and quick `260929-9qr`
  recorded it. It is final. Do not re-litigate it.
- **What was decided.** Accept one shared cookie jar on Linux, and ship the already-decided
  GTK-box-native Linux embed (the positioning todo's option (a)) on it. The Linux isolation
  question is CLOSED as a documented, accepted limitation, not a blocker.
- **The hygiene cost.**
  - On Linux every webview in the process shares one `WebKitWebContext` and one cookie jar, so
    any embed on Linux can read any other embed's cookies, and the login windows' cookies,
    in-process.
  - `data_store_identifier` stays a silent no-op on the GTK backend (see Mechanism above). Spike
    026 step 5 measured an embed with it set seeing all 10 shared-jar cookies.
  - Whoever builds the Linux embed must not pass it expecting isolation, and must not describe
    the Linux embed as per-store isolated.
- **What this does not cost against today.**
  - The shipped macOS embed never sets `data_store_identifier`: no file under `src-tauri/src`
    contains it (measured 2026-09-29), so `store_embed_open` already runs on the one default jar.
  - That sharing is deliberate, per ROADMAP.md's Phase 40 "one default cookie jar per PROCESS"
    (spike 018) note.
  - What Linux gives up is the OPTION of per-store isolation, not an isolation any shipped build
    has.
- **Why not the wry / `tauri-runtime-wry` change.** It is still UNVERIFIED, and no such patch
  exists. A forked or upstreamed change would have to be carried through every Tauri upgrade,
  with no guarantee upstream accepts it.
- **Why not keeping Linux off the embed.** The positioning todo's option (a) decision
  (2026-09-28, quick `260928-upj`) already rejected shipping no Linux embed, as against the
  one-launcher core value. This resolves the tension that decision flagged. The positioning todo
  gains a dated addendum saying so.
- **Windows is NOT decided here.** `## Windows: UNVERIFIED` above is untouched and still open.
  `38-E01`'s `spike_evidence_2026_09_28` in `38-VERIFICATION.md` routes spike 027's live
  isolation result to this file by its `pending/` path.
- **Why `platform: windows` and `ready: live-gate`.**
  - The Linux half needs nothing more: no decision, no code, no run. No code was written by quick
    260929-9qr.
  - The only remaining work is recording the live Windows sitting's result. `ready:` follows the
    next action (commit `00bc6fa1f`), and `platform:` follows the machine that action needs.
- **Why it stays in `pending/`.**
  - The operator's option text said to close this todo, and the Linux question is closed in this
    section.
  - The file cannot move yet. The Windows question lives here, and `38-E01` routes its result
    here by path. `38-E03`/`38-E04` `blocked_by` also cite this `pending/` path.
  - Once the Windows result is recorded here, the file can close.
- **What would re-open the Linux half.** A future wry whose GTK backend reads
  `data_store_identifier`, for example through a per-identifier `WebKitWebContext`. If that
  happens, re-run spike 026's step-5 cookie probe before assuming isolation exists on Linux.
- **Same-change note.** The same commit re-scoped the isolation clause in the Linux segments of
  `38-E03`/`38-E04` `blocked_by` in `38-VERIFICATION.md`, in fields named
  `linux_isolation_decided_2026_09_29`, with a dated `deferral_note` amendment. It also appended
  `## Addendum (2026-09-29)` to
  `2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md`.
