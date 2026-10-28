---
created: 2026-10-28
title: "Steam store page 'remote install' asks for a Steam sign-in even though the store is already signed in"
source: user report 2026-10-28, while buying Undertale (391540) in the embedded store
area: steam-store-embed
files:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src-tauri/src/main.rs
severity: minor
platform: any
ready: human
---

On a Steam store page in GameLib's embedded store browser there is a "remote install" option.
Clicking it asks the user to sign in to Steam, even though the store website in the same embed is
already signed in.

Not diagnosed. Hypotheses to check, not conclusions:

- Steam's remote install is driven by a separate signed-in session, not just the store cookie. The
  store cookie in the embed may not be enough for it.
- The prompt could come from a page the embed opens in a way that loses the store session (a popup
  or new window with a different cookie store, or a cross-origin step).
- Even if it works, it would ask a Steam client to install the game, and that is not the client
  GameLib manages. Bridge installs go through GameLib's own depot path. So the question may be
  whether to hide or intercept the option, not make it work.

**Decision needed:** the user said this "might need to spike". Decide whether it is worth a spike
(`/gsd-spike`): find out what remote install needs and whether GameLib should support, hide or
reroute it to its own Install. Read `Skill("spike-findings-gamelib")` first: the login-webview and
cookie surface is already documented there.
