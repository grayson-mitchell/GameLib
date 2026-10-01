---
created: 2026-09-28
title: 'On Linux, data_store_identifier per-store cookie isolation is a silent no-op, and every webview shares one WebKitWebContext. Decide the Linux isolation story before an embed ships there. Windows parity is unverified.'
found_during: spikes 025/026 (2026-09-28; commits c54e047ca, 369f482a4), filed by quick 260928-raq
severity: minor
platform: any
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

## Windows addendum (sitting 13, 2026-09-30)

- **Result: a silent no-op on Windows too.** Phase 38 sitting 13 (quick `260930-o75`) ran the spike
  027 harness's autorun, Phase 8 included, natively on the operator's Windows 11 machine (MSVC
  build, `Cargo.lock` wry 0.57.0). On WebView2 the "isolated" child's jar reported all 15 cookies,
  including the Steam and GOG cookies from the shared jar. The same `data_store_identifier` that
  spike 026 measured as a no-op on Linux does nothing on Windows either.
- **Source agrees.** wry 0.57.0 defines `with_data_store_identifier`, and the field that carries
  it, only under `#[cfg(any(target_os = "macos", target_os = "ios"))]` (`src/lib.rs:1579`,
  `:1612`). So per-store isolation through this field exists on macOS/iOS only.
- **Not scored against `38-E01`**, per that item's own routing. `38-E01` was discharged PASS on
  attach/placement/geometry, and its `result:` notes this finding as unscored.
- **Scope of the claim.** One host, and the spike harness, not the shipped app. The shipped app
  compiles no embed on Windows and never sets `data_store_identifier` on any platform (see the
  Decision section above).
- **Status is unchanged by this addendum.** This section records the result, as the Windows
  section above asked. It does not decide a Windows isolation story, and this file's frontmatter
  and `pending/` location were deliberately left as they were. Evidence:
  `.planning/quick/260930-o75-phase-38-sitting-13-windows-38-e01-38-w0/evidence/e01-verdict.md`
  (phase 8 paragraph) and `e01-run.log` / `e01-events-export.json` (cookie values redacted).

## Re-triage (quick 260930-o75, 2026-09-30)

- The Windows result is recorded (see the addendum above): isolation is a silent no-op on WebView2
  too. So the live gate this file was waiting on is done.
- It does **not** close. The Windows result turns "Windows parity is unverified" into an open
  **decision**: accept one shared cookie jar on Windows (the Linux choice of 2026-09-29), or build
  per-embed isolation another way before an embed ships there. For example, a separate WebView2
  user-data folder or profile per store. This is untested here, a direction and not a finding.
- Hence `platform: any` and `ready: human`: the next action is the operator's decision, not a
  machine sitting.

## Decision (2026-10-01): accept one shared cookie jar on Windows

- **Decided.** Windows gets the same answer as Linux: one shared cookie jar. This closes the
  decision the re-triage above left open. (Operator's `action todo:` instruction, 2026-10-01.)
- **Evidence.**
  - Sitting 13 (quick `260930-o75`) measured `data_store_identifier` as a silent no-op on WebView2
    (the "isolated" child saw all 15 cookies).
  - wry 0.57.0 defines `with_data_store_identifier` only under macOS/iOS (`src/lib.rs:1579`,
    `:1612`).
  - The shipped macOS embed never sets it and runs on one default jar per process, deliberately
    (ROADMAP Phase 40, spike 018). Windows and Linux now match macOS as shipped.
- **Rejected.**
  - A separate WebView2 user-data folder or profile per store: an untested direction that would
    fork the embed design per OS, with no shipped Windows embed to justify it.
  - Keeping Windows off the embed: contradicts the one-launcher core value, and was already
    rejected for Linux.
- **Hygiene cost.** Any embed on Windows can read any other embed's cookies, and the login
  windows' cookies, in-process. Whoever builds the Windows embed must not pass
  `data_store_identifier` expecting isolation, and must not describe the Windows embed as
  per-store isolated.
- **Re-open trigger.** A wry whose Windows backend honours an isolation field. Re-run spike 027
  Phase 8's cookie probe before assuming isolation exists.
- **Status.** Linux and Windows are both decided; nothing is left to record. The file moves to
  `todos/completed/` in this change. No code changed.
