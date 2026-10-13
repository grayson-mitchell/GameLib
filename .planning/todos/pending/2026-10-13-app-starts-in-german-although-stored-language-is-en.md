---
created: 2026-10-13T00:00:00.000Z
title: "App UI starts in German although both config stores say language: en and the system locale is en-NZ"
area: i18n
severity: major
platform: any
ready: code
found_by: "operator, 2026-10-13, incidental observation while opening the Phase 50 live gate: 'for some reason started in german'"
files:
  - src/frontend/index.tsx
  - src/common/languages.ts
  - src/preload/tauriTransport.ts
---

## What was seen

The operator launched GameLib (dev binary, pid 26716, `target/debug/gamelib-shell`, started
2026-10-13 16:54) and the UI came up **in German**. The Epic store embed under test rendered fine,
so this is unrelated to Phase 50's subject matter — it was noticed in passing.

## Why the obvious explanations are already ruled out

Measured 2026-10-13, read-only, at the moment of the report:

| thing checked | value |
| --- | --- |
| `~/Library/Application Support/GameLib/config.json` → `language` | `en` |
| `~/Library/Application Support/gamelib/config.json` → `language` | `en` |
| `defaults read -g AppleLanguages` | `en-NZ` |
| `LANG` | `C.UTF-8` |
| `grep -i 'language\|locale\|i18n\|lng' gamelib.log` | **no matches at all** |

So this is not the user's stored preference, not the macOS system language, and not an env
override. The log is silent, which is itself part of the defect: nothing records which language
was resolved or where the value came from, so the resolution is unobservable after the fact.

## Where to start

`src/frontend/index.tsx:203-205`:

```ts
const languageCode: string =
  configStore.get_nodefault('language') ?? storage.getItem('language') ?? 'en'
configStore.set('language', languageCode)
```

Two things make this the prime suspect, both unverified:

1. **The middle term is a `localStorage` read.** If `configStore.get_nodefault('language')`
   returns `undefined` — e.g. because the store snapshot is not hydrated for that key at the
   moment this top-level statement runs — resolution falls through to
   `storage.getItem('language')`, which is webview-local state that no config file reflects. The
   file header at `:150-170` already documents a *different* defect of exactly this shape in this
   same file: a pre-paint `applyFramelessDecorations()` read the snapshot before hydration and
   always resolved the default, which shipped a visibly broken window for `framelessWindow: true`
   users. That makes "the snapshot is not ready when a top-level statement reads it" an
   established failure mode here, not a speculative one.
2. **Line 205 writes the resolved value straight back.** If a stale value wins at `:203`, it is
   persisted rather than corrected. Note this cuts against the hypothesis as much as for it: the
   on-disk config still reads `en`, so either the write did not land in the file that was read, or
   the German value never came through this path at all. Resolve that contradiction first — it is
   the cheapest discriminator available and it decides whether `:203` is even the right line.

`localStorage` is keyed per WebKit data store, so the dev binary (`gamelib-shell`) and the
packaged bundle (`com.gamelib.shell`) have **separate** copies — relevant because a reproduction
attempt on the wrong flavour may simply not carry the same stale value. See
[[tauri-dev-vault-vs-keyring-decides-live-gate-auth]] for the general shape of that trap.

## Suggested fix direction, not a decision

Whatever the mechanism, add a single log line recording the resolved language **and which of the
three terms supplied it**. Right now `grep` over `gamelib.log` returns nothing for any
language-related token, so the next person to hit this starts from zero again. A defect that
leaves no trace in the log is the recurring theme in
[[no-gate-detects-english-side-string-drift]].

## Not yet established

- Whether it reproduces on a cold launch, or was a one-off on that session.
- Which of the 49 shipped locale directories was actually loaded (`de` vs `de-DE`).
- Whether the operator ever set German deliberately in some earlier session, which would make
  this a stale-state bug rather than a mis-resolution.
