---
quick_id: 261001-svm
created: 2026-10-01
title: "Live-gate measurement record — store embed visibility across store-route switches on macOS"
---

# Measurement record (orchestrator, measured live 2026-10-01 ~20:35–20:50 NZDT)

Everything below was measured on this Mac by the orchestrating session before this quick task was
opened. It is evidence, not inference. Do not re-run the app to "confirm" it, and do not soften any
of it into a hedge — but equally, do not widen it beyond what is written here.

## Harness

- **Build under test:** the macOS **dev/debug** build — `src-tauri/target/debug/gamelib-shell`,
  pid 85669, built 18:30 on 2026-10-01, running under `pnpm tauri dev` (vite on `:5173`) as an
  **orphan of a session that had already ended** (its scratchpad belongs to session
  `10bce52e-…`, which is not in `ListAgents`). Nothing else was driving it. The packaged/release
  build was NOT measured.
- **Why the dev build and not a packaged one:** a second instance cannot be launched while this one
  holds the single-instance socket (the absorption trap), and the Web Inspector — the drive
  mechanism below — exists only in the debug build.
- **Drive mechanism:** the docked Web Inspector console. A CGEvent click into the console prompt
  (`swift` helper, screen point `400,847`), then `System Events keystroke` + `key code 36`.
  The app is a hash router, so `location.hash = "#/store/gog"` etc. drives navigation with no
  hand-clicking of app UI.
- **Instrument:** `screencapture -l43517 -o -x` (window id from `CGWindowListCopyWindowInfo`;
  window at `117,65`, `1280×800` logical, 2× retina). PNG byte size was used as a cheap
  frame-difference signal, and every verdict below was additionally read as an image.
- **Captures live in the session scratchpad only** (`/private/tmp/claude-501/…/67bb0c54-…/
  scratchpad/`) and are deliberately NOT committed: the GOG page is signed in, so the frames carry
  account UI.

## Finding 1 — the Epic-panel hypothesis is REFUTED

Todo under test: `.planning/todos/pending/2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`.

1. From `/library`, `location.hash = "#/store/gog"` → the native embed opened and painted
   `www.gog.com` (Witcher banner, GOG chrome). This is the positive control: the capture pipeline
   CAN see native embed content inside the window surface.
2. A 24-frame burst (~100 ms apart) was armed, then `location.hash = "#/store/epic"` was sent.
   Frames before the switch are ~1.10 MB (GOG content); from the first post-switch frame they drop
   to ~579 KB and stay there.
3. The **first post-switch frame** (~100 ms after the hash change, read as an image) shows the
   `WebviewUnavailablePanel` clean — "Epic Store browsing isn't available in-app yet", "Open in
   browser" — with **no GOG content, no Epic content, and no native webview surface anywhere**,
   at the panel's bounds or elsewhere.
4. All 13 post-switch frames (~1.1 s) carry one of two hashes differing by ~100 bytes (the console
   caret blink). A settled capture seconds later is likewise clean.
5. Reproduced a second time later in the session from a freshly-shown GOG embed (`14-epic-again.png`,
   376 KB, panel only).

**Verdict: refuted on hardware, post-CR-01-fix.** No native content is visible over or around the
Epic unavailable panel at any point during or after a GOG -> Epic switch.

## Finding 2 — a different defect, found while running the gate

**On macOS the store embed stays HIDDEN after any return to a store route.** The slot renders
black indefinitely.

| path measured | result |
| --- | --- |
| `/library` -> `/store/gog` (a *second* visit, after the route had been left) | black slot, still black at +12 s |
| `/store/gog` -> `/store/epic` -> `/store/gog` | black slot, still black at +5 s |
| then `window.api.storeEmbedShow()` alone, nothing else | GOG repaints immediately (872 KB frame) |

Supporting detail:

- `window.api.storeEmbedShow()` returned `{"status":"ok"}`, so the native webview still exists —
  the label resolved, it is not a `store_embed_show:no-webview:` error.
- Because `show()` **alone** (no bounds flush) restores it, the embed is **hidden, not
  mis-positioned**. Bounds are fine on macOS. The Linux sibling symptom — the embed drawn at
  `(0,0)` over the app chrome — did **NOT** reproduce here: the chrome and sidebar render normally
  in every capture.
- The first entry to a store route after app launch is fine (the create path shows the webview).
  It is every *later* entry that is blank.

**Mechanism, read from source (not guessed):** `store_embed_open`'s existing-webview branch at
`src-tauri/src/main.rs:5801` only calls `existing.navigate(url)` on macOS. The `show()` +
re-apply-the-carried-rect step directly above it is `#[cfg(target_os = "linux")]`, added by quick
task `260930-blh` on 2026-09-30 for exactly this symptom on Linux, with its in-situ comment calling
the macOS behaviour "unchanged". Meanwhile the renderer hides the embed on route leave
(`useStoreEmbedHost.ts`'s route-lifecycle cleanup, D-21) and, on remount, has `openedRef === false`
so its first `flush()` goes through `storeEmbedOpen` — which on macOS navigates and never shows.
Nothing else ever calls `storeEmbedShow()` on that path.

This is quick `260930-blh`'s own SUMMARY, "Open observations", item 5 — *"The macOS path has the
same shape as the two defects fixed here … That is unmeasured on macOS, and could be a real macOS
defect."* It is no longer unmeasured.

**Honest caveats, to be carried into the new todo verbatim in substance:**

- Measured on the **dev/debug** build only. The branch in question is plain Rust source shared with
  the release build, but a packaged build was not re-measured.
- The session included one renderer reload (`location.reload()`) before these reproductions. Both
  reproductions above were from clean navigation states after it, and the mechanism above does not
  depend on a reload.
- No fix is attempted in this quick task.

## Scope of this quick task

1. Close the Epic-panel todo: record Finding 1 in the file and move it to `.planning/todos/completed/`.
2. File Finding 2 as a NEW pending todo (`severity: major`, `platform: macos`, `ready: code`).
3. STATE.md Quick Tasks row + docs commit.

No source code changes. No `src/`, no `src-tauri/`.
