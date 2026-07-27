---
spike: 015
name: cookie-jar-isolation-persistence
type: standard
validates: "Given a login jar, when the window closes and the app restarts, then cookies persist and stay isolated from the main webview — Electron session.fromPartition('persist:humble') parity"
verdict: VALIDATED (persistence + real partitioning) — with one architectural gap: no session object without a live webview
related: [013, 014a, 014b, 011]
tags: [tauri, cookies, persistence, partition, data-store-identifier, wkwebsitedatastore, macos]
---

# Spike 015: jar isolation and persistence — `persist:humble` parity

## What This Validates

**Given** a login jar populated in a child webview, **when** the window closes and the app
restarts, **then** the cookies persist and stay isolated from the main app webview — the
parity question for `session.fromPartition(HUMBLE_LOGIN_PARTITION)`.

Electron's `persist:humble` partition does three jobs at once in the current code
(`src/backend/humble/user.ts:184, 256`):

1. **Persistence** — the login survives an app restart (`persist:` prefix).
2. **Isolation** — Humble's cookies do not pollute the rest of the app.
3. **Windowless access** — `session.fromPartition()` returns a session object with **no
   window attached**, so the backend can read cookies whether or not any UI exists.

## Research

`wry-0.55.1/src/wkwebview/mod.rs:1209` reads `self.data_store.httpCookieStore()`, where
`data_store` is a per-webview `WKWebsiteDataStore`. Tauri exposes exactly one lever over it:

```rust
WebviewWindowBuilder::data_store_identifier([u8; 16])   // macOS 14+ / iOS 17+ only
WebviewWindowBuilder::incognito(bool)
```

`data_store_identifier` maps to WKWebView's non-default persistent data stores. There is no
Tauri equivalent of a free-standing `Session` object. Host: macOS 26.5.2, so the version gate
is satisfied.

## How to Run

`SPIKE_AUTORUN=1` then `SPIKE_AUTORUN=2` in the 013 harness — the persistence check is round
2 phase A reading the jar that round 1's process left behind. Evidence: `round1.log`,
`round2.log`.

## Investigation Trail

1. **Isolation, default settings: there is none.** Round 1 phases 5–6 read `cookies()` from
   three different webview handles at the same moment:

   | handle | count |
   |---|---|
   | `main` (the app's own `tauri://` control panel) | 33 |
   | `login-control` (loopback origin) | 33 |
   | `login-humble` (humblebundle.com) | 33 |

   Identical. Every webview shares the default `WKWebsiteDataStore`, so **the main app webview
   can read Humble's `_simpleauth_sess`**, and the loopback control page's jar is
   indistinguishable from the live site's. No partitioning by default.

2. **That default is half-useful.** It means a cookie poller does *not* need the login
   window's handle — any live webview reads the same jar. But it also means zero isolation,
   which `persist:humble` currently provides.

3. **`data_store_identifier` genuinely partitions.** Round 2 opened Humble with
   `.data_store_identifier(*b"gamelibspike015\0")` and compared jars in the same instant:

   | | isolated window | main webview |
   |---|---|---|
   | cookie count | 30 | 27 |
   | `csrf_cookie` value prefix | `vtu…` | `rj1…` |
   | `optimizelyEndUserId` | `oeu1785118412053…` | `oeu1785118237664…` |
   | `spike_*` control cookies | **absent** | present |

   Different session identities for the same site, and the loopback control cookies do not
   cross over. This is a real partition, not a relabelling.

4. **Persistence survives process exit.** Round 2 phase A read cookies at **cold start,
   before opening any window**, and got **24 cookies left behind by round 1's process**,
   including `_simpleauth_sess` (`HttpOnly`, `Secure`, 80 chars) and `csrf_cookie`. The
   default store is disk-backed with no `persist:`-style opt-in. Electron parity holds.

5. **The gap: no jar access without a live webview.** Round 1 phase 6a closed the login window
   and read again: `no webview window labelled 'login-humble'`. The *cookies* survived (a
   sibling window still saw them), but the *handle* did not. With
   `data_store_identifier`, that becomes load-bearing: an isolated jar is reachable **only**
   through a webview built with that same identifier. Close the login window and the partition
   is unreadable until another webview re-opens it.

   This is the one place where Tauri has no shape equivalent to
   `session.fromPartition()` — Electron hands you a session object independent of any window;
   Tauri only ever hands you a webview.

## Results

**VERDICT: VALIDATED** — persistence and isolation both have real Tauri equivalents; one
architectural difference must be designed around.

| `persist:humble` job | Tauri equivalent | Status |
|---|---|---|
| Persistence across restart | default store is already disk-backed | ✓ free — 24 cookies survived process exit |
| Isolation from the rest of the app | `data_store_identifier([u8;16])` | ✓ works, macOS 14+/iOS 17+ only |
| Windowless access to the jar | **none** | ✗ requires a live webview handle |

### Surprises

- **The main app webview can read the live site's session cookie** under default settings.
  Convenient for a poller, poor hygiene otherwise — and it means "which webview do I read
  from?" is a non-question by default and a hard constraint the moment you opt into isolation.
- `data_store_identifier` is a fixed 16-byte identifier, not a string namespace like
  Electron's partition names. Platform-gated to macOS 14+/iOS 17+, so Windows/Linux parity for
  isolation is **unverified** and remains an open question for the real build.

### Requirements this produces

7. **Persistence is free; do not build a token cache for it.** The default store already
   survives restart.
8. **Isolation costs a live window.** If `data_store_identifier` is used for `persist:humble`
   parity, the cookie poll must run against a webview built with the same identifier, and that
   webview must outlive the poll. Closing the login window ends the ability to read that jar.
9. **Decide isolation deliberately.** Skipping `data_store_identifier` gives a simpler poller
   (read from any window, including a hidden one) at the cost of letting third-party login
   cookies share the app's own store — and of losing isolation parity on the platforms where
   the API is not even available.
