---
task: 260822-rz1
title: "Title external child windows with the URL's hostname instead of Tauri's 'Tauri App' default"
status: complete
date: 2026-08-22
branch: wt/smallstuff
resolves_todo: .planning/todos/completed/2026-08-22-external-child-windows-are-titled-tauri-app.md
files_modified:
  - src/preload/api/tauriChildWindows.ts
  - src/preload/__tests__/childWindows.test.ts
---

## What changed

`tauriCreateNewWindow` now derives a window title from the url's host via a new total helper,
`externalWindowTitle`, and spreads it in conditionally. Every external link window is titled
`protondb.com` / `codeweavers.com` / `applegamingwiki.com` instead of **"Tauri App"**.

The WR-07 comment was rewritten rather than deleted. It keeps WR-07's real requirement (remote
content must never wear the app's own name), corrects the false document-title-fallback claim **in
place** with the evidence, and states that Electron parity is knowingly not restored.

## The comment was worse than no comment

The old text instructed future readers not to "fix" the behaviour, while misdescribing it:

> "Omitting `title` restores that Electron behaviour: Tauri falls back to the loaded document's own
> title. Do not 'fix' this by adding a title back."

Re-verified at HEAD before any code was written:

- `default_title()` returns `"Tauri App"` — tauri-utils `src/config.rs:2375`. **The lockfile pins
  2.9.3, not the 2.9.2 the todo cited**; the crate was bumped and the fact survived it, which is
  the check that matters.
- Tauri v2 does not sync `document.title` at all. `on_document_title_changed`
  (`tauri-2.11.5/src/webview/webview_window.rs:297-332`) is an **opt-in** hook whose own doc
  example body is `window.set_title(&title).unwrap()` — if the framework did the sync, neither the
  hook nor that line would exist. It is a **Rust builder** API and is unreachable from the JS
  `WebviewWindow` constructor this module uses, so it is not even an available fix here.

## Why the host, not the page title

Option 3 from the todo. A host is not merely an acceptable substitute for the page's own title —
it is the **stronger** anti-phishing signal, because an attacker controls `<title>` freely but not
the host they are served from. Option 2 (inject an init script to sync `document.title`) was
rejected: it would put first-party script into renderer-supplied remote content, against the
isolation posture that keeps these windows matching no capability.

Label discipline is untouched. The title is cosmetic and is never an input to
`nextExternalWindowLabel()` (T-34.1-27), and a test now pins that the two cannot be confused.

## Edge cases the implementation actually handles

| Input | Title | Why |
| --- | --- | --- |
| `https://codeweavers.com/...` | `codeweavers.com` | normal case |
| `https://www.protondb.com/app/1` | `protondb.com` | leading `www.` stripped |
| `https://www.com/x` | `www.com` | **not** `com` — `www.com` is a real registrable domain, so the strip is conditional on a dot remaining |
| `not-a-url` | *(key omitted)* | `new URL` throws; helper is total, window still opens |
| `file:///etc/passwd` | *(key omitted)* | parses fine but has no host — `title: ''` would be worse than none |

Omitted, never `title: undefined`, so Tauri sees no key at all.

## Verification

- `pnpm exec jest src/preload` — **136/136 pass, 8 suites**. The target suite is 23/23.
- **RED-proven.** Reverted the module to its HEAD version (`git show HEAD:<path> >` the file — no
  `git stash`, no `git reset`, the stash stack is shared with concurrent sessions) with the fixed
  copy held in the scratchpad, re-ran, restored. Exactly **5 failed / 18 passed**, and the split is
  the right one: the four title-value tests plus the title/label-separation test fail, while the
  two *"omits `title`"* fallback tests **pass in both states** — they guard behaviour this change
  deliberately preserves, so they should be insensitive to it.
- `pnpm exec tsc --noEmit` — exit 0.
- `eslint -f json` on both files, filtered to `severity === 2` — 0 errors.

## Honest limit of the new gate

The replaced assertion was `expect(options.title).toBeUndefined()` — true about the code, silent
about the result, and green for the entire life of the defect. The new assertions name the exact
displayed string, and under Tauri the `title` option is applied verbatim, so callsite value and
displayed value are now the same string. But they are still read from the constructor mock: a unit
test in a `node` environment cannot observe a real OS window. **What closes that gap is the live
UAT observation, not this suite** — re-observing one external link window is the proof that the
title renders. This is recorded so nobody reads 23 green tests as having verified the pixels.
