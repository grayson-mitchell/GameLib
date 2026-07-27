---
spike: 014a
name: cookie-read-rust-webview-api
type: comparison
validates: "Given a webview that has provably received Set-Cookie (including HttpOnly), when Rust Webview::cookies()/cookies_for_url() is called on macOS, then real values return — and an empty result is distinguishable from an unsupported API"
verdict: VALIDATED (API is real) — with a CRITICAL domain-matching defect that silently hides the session cookie
related: [013, 014b, 015, 011]
tags: [tauri, rust, cookies, wkwebview, macos, humble, watchforlogin, false-negative]
---

# Spike 014a: Rust `Webview::cookies()` on macOS — and telling "empty" from "unsupported"

## What This Validates

**Given** a webview that has provably received `Set-Cookie` headers (including `HttpOnly` and
`Secure`), **when** `Webview::cookies()` / `cookies_for_url()` are called on macOS,
**then** real cookie values come back — **and**, critically, an empty result can be
distinguished from a no-op API.

The second half is the whole point. `HumbleUser.watchForLogin()`
(`src/backend/humble/user.ts:305`) does:

```ts
const cookies = await ses.cookies.get({ url: HUMBLE_BASE_URL, name: '_simpleauth_sess' })
if (cookies.length === 0) return   // ← "not logged in yet, keep polling"
```

An unsupported API returning `[]` is *indistinguishable* from "the user hasn't logged in yet".
The poll would tick every 1.5 s forever, log nothing, and finally settle `{ status: 'waiting' }`
at the 5-minute deadline — the same silent-success shape as
`[[navigator-clipboard-noops-under-tauri]]`.

## Research

Read the actual macOS implementation, `wry-0.55.1/src/wkwebview/mod.rs`, before writing a line
of probe code. Three hypotheses were pre-registered from the source:

| # | Hypothesis | Source evidence |
|---|---|---|
| **H1** | `cookies_for_url` misses cookies whose stored domain string differs from the URL host | `:1184` — `cookie.domain() == url.domain()`, plain string equality, no domain-match algorithm |
| **H2** | Off-main-thread reads misbehave | `:1446-1471` — `wait_for_blocking_operation` pumps `NSRunLoop::mainRunLoop()` and errors after a **1 s** limit. Tauri docs warn of a Windows deadlock; macOS is undocumented |
| **H3** | Each webview has its own cookie store | `:1209` — `self.data_store.httpCookieStore()`, and `data_store` is per-webview |

`Webview::cookies()` in `tauri-2.11.5/src/webview/mod.rs:2173` is a bare dispatcher passthrough
— **no main-thread hop**, so H2 is reachable from ordinary command code.

Docs also state the API is *"unsupported on Android; always returns an empty vector"* — proof
that the silent-empty failure mode exists by design on at least one platform, which is why the
positive control below is non-negotiable.

## The Discriminator Design

Three **independent oracles** observe the same jar, so no single API's silence can be
mistaken for truth:

1. **Rust API** — `cookies()` / `cookies_for_url()`.
2. **Loopback control server** (`app/src/control_server.rs`) — sets five cookies with known
   values and flag combinations, then `/probe` **echoes back the raw `Cookie:` header the
   webview actually sent**. No Rust cookie API is involved in that path at all.
3. **`document.cookie`** via the JS channel (spike 014b).

Every read is classified, never reported as a bare `[]`:

| Verdict | Meaning |
|---|---|
| `SUPPORTED_NONEMPTY` | cookies returned; API demonstrably live |
| `SUPPORTED_BUT_EMPTY` | zero cookies, **but** a control cookie was read earlier this session → the empty is real, and a poll may safely keep waiting |
| `UNSUPPORTED_OR_ERROR` | the API returned `Err` — a loud, distinguishable failure |
| `UNDECIDABLE` | zero cookies **and** the API has never proven itself this session → "empty jar" and "no-op API" are indistinguishable. **This is the state that kills a silent poll.** |

## How to Run

See `../013-tauri-child-webview-login-window/README.md`. Round 1 (`SPIKE_AUTORUN=1`) produced
`round1.log`; round 2 (`SPIKE_AUTORUN=2`) produced `round2.log`.

## Investigation Trail

1. **Phase 0 reproduced the trap on purpose.** The very first read, on a cold app before any
   navigation, returned `ok=true, count=0` in 2 ms. Classified `UNDECIDABLE` — correctly. This
   is exactly the reading a naive port would treat as "not logged in yet".

2. **Positive control fired the API into a known state.** After loading `/set`,
   `cookies()` returned **3 of the 5** control cookies:

   ```
   spike_plain=alpha1      domain='localhost'  httpOnly=false secure=false
   spike_httponly=bravo2   domain='localhost'  httpOnly=true  secure=false
   spike_domain=echo5      domain='localhost'  httpOnly=false secure=false
   ```

   **`HttpOnly` cookies come back with real values.** That alone clears the biggest doubt —
   this is not a JS-visibility-only API.

3. **Pivot: two control cookies never arrived.** `spike_secure` and `spike_both` (both
   `Secure`) were absent. My design assumption — "WebKit treats `http://localhost` as a
   trustworthy origin, so `Secure` cookies will store" — was **wrong**. But the independent
   `/probe` oracle agreed exactly (`spike_domain; spike_httponly; spike_plain`), so the Rust
   API was *faithful to the jar*; the jar itself never accepted them. Two oracles agreeing on
   3-of-5 is much stronger evidence than either alone would have been.

4. **`Domain=localhost` is stored WITHOUT a leading dot.** `spike_domain` came back as
   `domain='localhost'`, not `.localhost` — WebKit normalises the dot away. H1 therefore
   needed re-testing on a *different* axis than I expected.

5. **H1 CONFIRMED, twice.** Same jar, same instant, two spellings of the same origin:

   ```
   cookies_for_url("http://localhost:17913")  → 3 cookies   SUPPORTED_NONEMPTY
   cookies_for_url("http://127.0.0.1:17913")  → 0 cookies   SUPPORTED_BUT_EMPTY
   ```

   Then on the live site, which is where it actually bites:

   ```
   cookies()                                        → 33 cookies, INCLUDING _simpleauth_sess
   cookies_for_url("https://www.humblebundle.com")  →  4 cookies, _simpleauth_sess ABSENT
   cookies_for_url("https://humblebundle.com")      → 25 cookies, INCLUDING _simpleauth_sess
   ```

   Humble stores `_simpleauth_sess` with `domain='humblebundle.com'`. `cookies_for_url` compares
   `"humblebundle.com" == "www.humblebundle.com"` → `false`. The four cookies the `www.` read
   *does* return are host-only cookies (`fu`, `__lt__cid`, `__lt__sid`, `optimizelySession`),
   so the call looks perfectly healthy — it returns a plausible non-empty list while silently
   dropping the one cookie that matters.

6. **Confirmed the defect lands on real code, not a hypothetical.**
   `src/backend/humble/constants.ts:13` — `HUMBLE_BASE_URL = 'https://www.humblebundle.com'`.
   Both live call sites pass it verbatim:
   - `watchForLogin()` → `cookies.get({ url: HUMBLE_BASE_URL, name: '_simpleauth_sess' })`
   - `getLiveCsrfToken()` (`user.ts:185`) → same URL, `name: 'csrf_cookie'`

   Electron's `cookies.get({url})` applies proper RFC 6265 domain-matching, so
   `.humblebundle.com` matches `www.humblebundle.com` today. A literal port to
   `cookies_for_url` inverts that.

7. **H2 falsified on macOS.** Calling `cookies()` directly from a worker thread — while wry
   pumps the *main* run loop underneath — returned 3 cookies in **3 ms** with no crash, no
   hang, no `TimedOut`. The documented Windows deadlock does not reproduce here. Main-thread,
   hopped-to-main, and worker reads all agreed. All reads across both rounds completed in
   **2–4 ms**, nowhere near the 1 s internal limit.

8. **Read-after-close is a loud error, not a silent empty.** Once the login window closes,
   the read fails with `no webview window labelled 'login-humble'` → `UNSUPPORTED_OR_ERROR`.
   Good: this failure mode cannot masquerade as "not logged in".

## Results

**VERDICT: VALIDATED — the API is real and complete on macOS — but `cookies_for_url()` is
unsafe for this use case and must not be used.**

The headline worry is cleared: **this is not the clipboard shape.** `Webview::cookies()`
returns `HttpOnly` + `Secure` cookies with full values, in ~3 ms, from any thread.
`_simpleauth_sess` (`HttpOnly=true, Secure=true, 80 chars`) was read successfully many times.

But a **worse-shaped** defect was found underneath it:

> `cookies_for_url()` does exact string equality on the domain. For
> `https://www.humblebundle.com` it returns a **plausible, non-empty, wrong** list with the
> session cookie missing. A poll built on it never errors, never warns, and never succeeds.

That is more dangerous than an empty return, because a non-empty result defeats the very
"is this API even live?" check this spike was built to provide.

### Hypothesis outcomes

| # | Hypothesis | Outcome |
|---|---|---|
| H1 | `cookies_for_url` domain equality drops cookies | **CONFIRMED** — twice (`127.0.0.1` vs `localhost`; `www.` vs apex) |
| H2 | Off-main-thread reads misbehave on macOS | **FALSIFIED** — worker-thread read fine, 3 ms, no deadlock |
| H3 | Cookie store is per-webview | **PARTIALLY CONFIRMED** — shared by default, genuinely partitioned only with `data_store_identifier` (see 015) |

### Requirements this produces

1. **Use `cookies()` + your own domain filter. Never `cookies_for_url()`.** The filter must be
   a proper suffix match (`host == domain || host.endsWith("." + domain)`), which is what
   Electron did for free.
2. **Any cookie-poll port must carry a liveness proof.** A `count === 0` result is only
   actionable if the read channel has demonstrated itself. Cheapest form: on watch start, do
   one unfiltered `cookies()` and require `> 0` (a login page always sets *something* — Humble
   set 33 cookies anonymously); if it returns 0 there, fail loudly instead of polling.
3. **Never log cookie values.** The harness redacts to a 3-char prefix + length; `user.ts`'s
   existing secrecy discipline must survive the port.

### Raw evidence

`round1.log` / `round2.log` (JSONL). Reproduce with `SPIKE_AUTORUN=1` / `=2`.
