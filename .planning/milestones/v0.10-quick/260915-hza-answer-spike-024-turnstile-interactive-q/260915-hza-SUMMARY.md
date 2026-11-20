---
quick_id: 260915-hza
title: Answer spike 024's Turnstile interactive question for `/store/epic`
date: 2026-09-15
status: complete
outcome: WONTFIX — `/store/epic` stays gated, now on a measurement rather than an open question
todo_closed: .planning/todos/completed/2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md
commits:
  - 21b31b679  # Epic buttons + fresh container spike024d
  - 35309eb4e  # embed viewport fix (the defect that invalidated run 4)
---

# Quick 260915-hza — spike 024's open question, answered

## Result

**A human can click Epic's Turnstile widget, and it does not clear.** The challenge re-issues.
`/store/epic` stays gated; the todo closed WONTFIX with the measurement attached — which is the
outcome the todo itself named as "a perfectly good outcome".

| | Run 4 | Run 5 |
|---|---|---|
| Container | fresh `spike024d` | `spike024d` |
| Viewport at challenge | **969×58 — INVALID** | **986×630, pixel-verified** |
| Steam positive control | not run | **rendered** |
| Turnstile issuances | 4 (`68xxg`, `0ryr2`, `jqh5w`, `12326`) | 3 (`98ums`, `1tuf5`, `whqym`) |
| Verdict | discard | **clicked → re-issued, ~25 s and ~30 s apart** |

Evidence: `shot-epic-INTERACTIVE-challenge-run5.png` (Epic's "One more step" card, an **unchecked**
`Verify you are human` box at full size) and `run-4-5-interactive.log`, both in the spike directory.

⚠️ ~~**That screenshot renders the operator's residential IP** — Cloudflare prints it on the challenge
card. GameLib is a public fork, so the image is deliberately left **unstaged** pending redaction.~~

✅ **REDACTED AND STAGED 2026-09-18.** The residential IP and the Cloudflare `Session ID` are now
covered by an opaque black bar; the **unchecked** `Verify you are human` box this summary cites as
evidence is untouched and still fully legible. The image was never committed while it carried the
IP — `git log --all` over that path returned zero commits — so nothing was ever published. The
"deliberately left unstaged" decision recorded above was correct and held for three days until the
redaction was done.

## What made this nearly go wrong

**Run 4 said "challenge repeats" and it was not a result.** The embed was created at `h:630` and
measured **969×58** by the time the challenge was on screen, and the slot's own tripwire text
("if you can read this while an embed exists, compositing failed") was readable in the capture. A
Turnstile widget rendered into a 58 px viewport cannot support a conclusion either way.

The cause was flexbox, not the bounds sync: `#logwrap` was `flex: 0 0 170px`, but a flex item's
automatic `min-height` is its content height, so the growing event log expanded the panel and
starved `#slot`. Fixed in `35309eb4e` with `min-height: 0` + `max-height: 170px`.

**Spike 024 had already recorded this defect** — "the embed had shrunk to ~`986×117` logical by
capture time", filed under *what is NOT established* and never fixed. It then silently invalidated
the very interactive run it was blocking. Recording a measurement defect as a known limitation is
not a mitigation.

**The log could never have caught it.** `syncBounds(false)` passes `quiet: true` and
`set_embed_bounds` only logs when `!quiet` (`main.rs:341`), so `"category":"bounds"` entries number
**0** across every session of this spike. Pixel capture is the only bounds evidence that exists.

## Harness gap found

`dist/index.html` had buttons for the control origin, Steam and GOG but **no Epic** — Epic was
reachable only from the `SPIKE_AUTORUN` path, i.e. exactly the unattended mode that cannot answer
an interactive question. The todo had been `ready: human` since 2026-09-05 with no way for a human
to perform the measurement it asked for.

## Deliberately not done

- **No executor was dispatched.** The deliverable was a human measurement; an agent asked to
  produce one tends to report an outcome it never observed.
- **No second network.** Runs 1–5 share one residential IP, so they cannot separate "Tauri webview
  is blocked" from "this IP's reputation is spent". That needs a different network, not another
  run here — and it does not change the decision, because the gate cannot be conditional on a
  user's IP reputation.
- **Epic's in-embed "Sign in" button** remains a separate item and was not touched. It leads to the
  known-blocked Talon surface (`/id/api/email/exists`); a cross-webview handoff to the pristine
  `WKWebView` login window is its own piece of work.

## Premise corrections

The todo said "six WebView suites name epic" — it is **seven**. Moot now that the un-gate branch
did not fire, but the number was wrong and would have under-scoped the sweep.

`run.log` **appends**, it does not truncate; it simply did not exist before this session.
