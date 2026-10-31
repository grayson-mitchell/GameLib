---
created: 2026-10-31
title: 'In-app "Report a problem" form for non-technical users — no account, auto-attached redacted diagnostics'
area: feedback
files: []
severity: medium
platform: any
ready: human
---

## Problem

GameLib has no channel for bug reports or feedback. The target user is a gamer, **not a
developer** — the operator was explicit that GitHub users are absolutely not the target, so
GitHub Issues (even with issue forms and a pre-filled "Report a bug" link) is the wrong front
door: requiring a GitHub account loses most reports. Plain email loses tracking, de-duplication
and the environment details non-technical users won't think to include (OS, version, store,
game, launch route).

## Solution

Decided direction (2026-10-31 discussion):

- **In-app "Report a problem"** menu entry. A short form with a free-text "what happened" field,
  an optional reply email, and an "Include diagnostics" checkbox (on by default). No account and
  no external site.
- **Auto-attached diagnostics** — app version, OS, store, game/AppId, launch route (native /
  bridge / bottled), and recent logs. **Redaction is the careful part:** strip home paths, Steam
  IDs, account names/usernames and tokens before anything leaves the machine (the logs carry
  GOG `userId`/`username` and similar — see the fake-HOME incident history in
  `gamelib-conventions`).
- **Delivery, now:** a hosted form service (Formspree, Web3Forms or similar) that emails the
  operator. Zero hosting.
- **Delivery, later:** a small endpoint that files reports into a private tracker (or a private
  GitHub repo) so they get tracking without users ever seeing GitHub. Consider reusing the Phase
  57 relay (`.planning/phases/57-opt-in-known-fix-sharing-via-relay/`) as the transport if it
  becomes a real hosted service — not verified yet.
- **Discord:** optional, later, for community and "how do I…" questions — not the bug-report
  channel (reports get buried in chat).

`ready: human` because the form service still needs picking and signing up for, and the
redaction scope needs sign-off before a build starts.
