---
spike: 013
name: tauri-child-webview-login-window
type: standard
validates: "Given Tauri 2.11.5 on macOS, when a child WebviewWindow opens a live login site with a spoofed UA, then the page loads and the parent process observes every navigation with its URL"
verdict: VALIDATED
related: [011, 012, 014a, 014b, 015]
tags: [tauri, rust, webview, navigation, login, humble, user-agent, macos]
---

# Spike 013: Tauri child WebviewWindow on a live login site

## What This Validates

**Given** Tauri 2.11.5 / wry 0.55.1 on macOS 26.5.2, **when** a child `WebviewWindow` is
opened on `https://www.humblebundle.com/login` with a spoofed Chrome user agent, **then** the
page loads, the UA override reaches real network requests, and the parent process receives an
observable navigation stream equivalent to the Electron `<webview>` `did-navigate` relay.

This is the harness spike. It exists because **013–015 all need the same app**, and because
you cannot ask the cookie question (014a/014b) without first having a webview that has been
somewhere real. The app in `app/` serves all four spikes.

## Why This Matters

`src/frontend/screens/WebView/index.tsx` renders an Electron `<webview>` tag and wires six
listeners on it (`did-navigate`, `did-navigate-in-page`, `dom-ready`, `did-fail-load`,
`page-title-updated`). Two of those drive real backend behaviour:

- `onHumbleLoginNavigate` → `HumbleUser.notifyLoginNavigated()` → `forceRevalidate()`
  (`src/backend/humble/user.ts:244`), which bypasses the poll throttle **and re-arms the
  5-minute watch deadline**.
- `webview.setUserAgent(...)` applies `standardBrowserUserAgent()` so Humble's Cloudflare bot
  management does not challenge the login page.

Neither the `<webview>` tag nor `session.setUserAgent` exists under Tauri.
`WebviewUnavailablePanel.tsx` currently disables the whole store-browser screen in the Tauri
build, so this is unported surface, not a regression.

## Research

Checked against the vendored crate sources rather than docs alone
(`~/.cargo/registry/src/index.crates.io-*/`), because the platform-specific behaviour is what
matters and the docs are platform-generic.

| Electron surface (today) | Tauri 2.11.5 equivalent | Status |
|---|---|---|
| `<webview>` tag in the renderer | `WebviewWindowBuilder` + `WebviewUrl::External` — a real OS window, not an embedded tag | different shape, works |
| `webview.setUserAgent()` | `.user_agent(&str)` on the builder | works (proven below) |
| `did-navigate` (top-level only) | `.on_page_load(Started/Finished)` | works, main-frame only |
| `did-navigate-in-page` | `.on_navigation(&Url) -> bool` | fires, **but also for subframes** |
| `did-fail-load` | no direct equivalent found | open |
| `page-title-updated` | none — `WebviewWindow::title()` is the **native window title** and is never fed from `document.title` | **missing** |

**Chosen approach:** child `WebviewWindow` with `WebviewUrl::External`, `.user_agent()`,
`.on_navigation()` and `.on_page_load()`. No Tauri CLI required — the harness is a plain
`cargo run` with a static `dist/index.html` as `frontendDist`, matching the convention
established by spikes 011/012.

## How to Run

```bash
cd .planning/spikes/013-tauri-child-webview-login-window/app

# Interactive — click through the probes yourself
CARGO_TARGET_DIR=../../../../src-tauri/target cargo run

# Scripted round 1 (013 navigation + 014a cookie reads + 015 isolation)
SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 CARGO_TARGET_DIR=../../../../src-tauri/target cargo run

# Scripted round 2 (UA verification + 014b JS channel + data_store_identifier)
SPIKE_AUTORUN=2 SPIKE_AUTORUN_EXIT=1 CARGO_TARGET_DIR=../../../../src-tauri/target cargo run
```

`CARGO_TARGET_DIR` is pointed at the project's own Tauri target dir on purpose: the crate
features in `app/Cargo.toml` deliberately match `src-tauri/Cargo.toml`, so the ~600 cached
rlibs are reused and a clean build of this harness takes **5 seconds instead of ~10 minutes**.

## What to Expect

- Two OS windows: the dark control panel, and a child window that navigates to Humble.
- A live event stream in the control panel (navigation, cookie-read, control-server, js-channel).
- `run.log` (JSONL, flushed per event) and `events-export.json` in the spike directory.

## Observability

Forensic log layer: ISO-8601 timestamp + ms-since-start + category + message + structured
data, written to `run.log`, mirrored to stderr, and emitted to the control panel over a Tauri
event. Categories: `app`, `window`, `navigation`, `cookie-read`, `control-server`,
`js-channel`, `remote-ipc`, `autorun`.

**Secret discipline:** cookie values are redacted to a 3-char prefix + length unless the name
starts with `spike_` (cookies this harness set itself). A live `_simpleauth_sess` value is
never written to disk — the same rule `user.ts` enforces.

## Investigation Trail

1. **Built the harness, opened Humble.** The page loaded first try. No CSP, no
   remote-URL allowlist, no plugin needed for an external URL — `WebviewUrl::External` just
   works.

2. **Counted the navigation events** and found the first real divergence from Electron:
   round 1 logged **8 `on_navigation` but only 6 `on_page_load`** events. For the Humble
   window alone:

   ```
   on_navigation            https://www.humblebundle.com/login
   on_page_load   started   https://www.humblebundle.com/login
   on_navigation            https://a5532459098439680.cdn.optimizely.com/client_storage/...html
   on_navigation            about:blank
   on_navigation            about:blank
   on_navigation            https://d.mailer.humblebundle.com/connect.html?...
   on_navigation            about:blank
   on_page_load   finished  https://www.humblebundle.com/login
   ```

   Five of the eight `on_navigation` events are **iframes** (Optimizely's client storage
   frame, Humble's mailer connect frame, three `about:blank`). Electron's `did-navigate` is
   top-level only. `on_page_load` is the faithful analog; `on_navigation` is not.

3. **Verified the UA override against a real request**, not just `navigator.userAgent`.
   Round 1 opened the control window *without* the override and the loopback server logged:

   ```
   Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)
   ```

   — note the **absent browser product token**. That is not a UA any real browser sends, and
   it is exactly the kind of fingerprint Cloudflare bot management scores against. Round 2
   opened it *with* `.user_agent(CHROME_UA)` and the same server logged the full
   `... Chrome/131.0.0.0 Safari/537.36`, with `navigator.userAgent` agreeing. The override is
   real and reaches the network layer, not just the JS global.

4. **Probed window lifetime.** After `w.close()`, `app.get_webview_window("login-humble")`
   returns `None` — every later cookie read against that label fails with
   `no webview window labelled 'login-humble'`. See 015: the jar survives, the *handle* does not.

## Results

**VERDICT: VALIDATED** — a child `WebviewWindow` on a live site works, with three
behavioural differences that must be designed around rather than ported literally.

| Finding | Evidence | Consequence for the port |
|---|---|---|
| External URLs load with no allowlist/CSP setup | Humble login rendered first try | no blocker |
| `.user_agent()` reaches real HTTP requests | loopback server saw `Chrome/131.0.0.0` | Humble's UA requirement (D-05/D-07) is portable |
| **Default macOS UA has no product token** | `AppleWebKit/605.1.15 (KHTML, like Gecko)` | UA spoof is *mandatory*, not reinforcement — the default is more bot-like than Electron's |
| **`on_navigation` fires for subframes** | 5 of 8 events were iframes/`about:blank` | wiring `notifyLoginNavigated()` to `on_navigation` lets a third-party ad iframe **re-arm the login watch deadline indefinitely**, defeating WR-03's timeout. Use `on_page_load` |
| `on_page_load` is main-frame Started/Finished | 2 events for the Humble load | correct `did-navigate` analog |
| **No `page-title-updated` analog** | `title()` returned the native window title, never `document.title` | killed the first 014b channel design outright (see 014b) |
| Closing the window destroys the handle | `no webview window labelled …` | a cookie poller must not hold the login window's handle |

### Surprises

- The **subframe navigation firehose** was not anticipated. It is benign for logging but
  actively harmful if wired to deadline re-arming.
- **Tauri injects `window.__TAURI__` into `https://www.humblebundle.com`.** The exfil channel
  reported `tauriGlobalPresent=true` on the live origin. Every command invocation was denied
  (see 014b), but the global's *presence* on a third-party page is a security surface worth a
  threat-model line.
