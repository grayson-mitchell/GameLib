# Tauri Login Webview + Cookie Reads (store browser, Humble/Epic/GOG login)

Spike 011 rated Electron's `session` API as one of only 3 of 16 needing "a small shim." Spikes
013–015 went and measured it on real hardware (macOS 26.5.2, tauri 2.11.5, wry 0.55.1). The shim is
small; **the semantics underneath it are not the same, and one difference silently breaks Humble
login.**

Affected code: `HumbleUser.watchForLogin()` / `getLiveCsrfToken()` / `notifyLoginNavigated()`
(`src/backend/humble/user.ts`), `src/backend/humble/constants.ts`, and
`src/frontend/screens/WebView/index.tsx` (whose `<webview>` tag is currently disabled under Tauri by
`WebviewUnavailablePanel.tsx`).

## Requirements

1. **NEVER use `Webview::cookies_for_url()`. Use `cookies()` plus your own domain filter — and that
   filter MUST strip a leading dot from the cookie's `domain` before comparing.** Skipping the strip
   is not a rounding error: it makes the filter categorically blind to every leading-dot cookie
   domain, which is exactly how F-34.4.2-19 broke Humble login silently for weeks. See
   "The killer" below.
2. **Any cookie poll must carry a liveness proof** — `count === 0` is otherwise indistinguishable
   from a dead API.
3. **The Rust cookie API is the ONLY viable login-detection channel** — `document.cookie` cannot see
   the deciding cookie.
4. **Wire navigation relays to `on_page_load`, never `on_navigation`.**
5. **The UA override is mandatory, not reinforcement.**
6. **Persistence is free; isolation costs a live window.**
7. **There is no `session.fromPartition()` shape** — jar access requires a live `Webview` handle.
8. **Remote pages cannot invoke app commands, but they do get `window.__TAURI__`** — threat-model it.
9. **Never log cookie values.**

## How to Build It

### The killer: `cookies_for_url()` does string equality on the domain

wry's macOS implementation filters with plain `==`, not RFC 6265 domain-matching:

```rust
// wry-0.55.1/src/wkwebview/mod.rs:1184
cookie.domain() == url.domain()
```

Measured against the live site, same jar, same instant:

```
cookies()                                        → 33 cookies, INCLUDING _simpleauth_sess
cookies_for_url("https://www.humblebundle.com")  →  4 cookies, _simpleauth_sess ABSENT
cookies_for_url("https://humblebundle.com")      → 25 cookies, INCLUDING _simpleauth_sess
```

> 🔍 **OPEN DISCREPANCY — worth re-measuring, deliberately NOT reconciled here.** The third row
> above is hard to square with the corrected domain finding below. If `_simpleauth_sess`'s domain is
> really `.humblebundle.com` (leading dot) and wry filters with plain `==`, then
> `cookie.domain() == url.domain()` should be `".humblebundle.com" == "humblebundle.com"` → `false`,
> and the dot-less URL should have excluded the cookie too. It did not.
>
> Something in that chain is not what we think: wry's `url.domain()`, WebKit's per-call domain
> rendering, or the July reading itself. **No explanation is offered — none has been measured.** The
> numbers above are left exactly as recorded in July (`sources/014a-.../round1.log`); they are raw
> observations and stay unedited. Anyone depending on `cookies_for_url` semantics should re-measure
> both URLs *and* dump the raw `cookie.domain()` string in the same breath before trusting either.
>
> This does not weaken the guidance: `cookies()` + your own filter is correct regardless of how the
> discrepancy resolves.

Humble stores `_simpleauth_sess` under the **`humblebundle.com` apex, not `www.`**, so
`"humblebundle.com" == "www.humblebundle.com"` → `false`.
`HUMBLE_BASE_URL = 'https://www.humblebundle.com'` (`src/backend/humble/constants.ts:13`) is passed
verbatim to both `watchForLogin()` and `getLiveCsrfToken()`.

> ⚠ **CORRECTION (2026-08-08, F-34.4.2-19).** This section previously read
> "`domain='humblebundle.com'` (WebKit normalises away the leading dot)". **That parenthetical is
> FALSIFIED.** `_simpleauth_sess`'s real domain, re-measured live via a read-only OS-level
> WKWebView cookie-jar parse, is **`.humblebundle.com` — leading dot present.** WebKit does *not*
> normalise it away. Acting on the dot-less reading is what produced the defective comparator
> below, and the mistake cost weeks of silent Humble-login failure.
> Record: `.planning/debug/resolved/humble-isloggedin-never-set.md`; fix commit `0dfd08044`.

**This is worse than an empty return.** The four cookies the `www.` read *does* return are host-only
cookies (`fu`, `__lt__cid`, `__lt__sid`, `optimizelySession`), so the call looks perfectly healthy —
it returns a plausible non-empty list while silently dropping the one cookie that matters, defeating
naive "is this API even live?" checks. `checkCookie()` treats `cookies.length === 0` as "not logged
in yet", so the poll ticks every 1.5 s for the full 5-minute deadline and then settles
`{status:'waiting'}` with no error, no toast, no log.

Also reproduced on loopback: `cookies_for_url("http://127.0.0.1:PORT")` → 0 while
`http://localhost:PORT` → 3, same origin.

**Do this instead:**

```rust
let host = url.host_str().unwrap_or_default();
let cookies: Vec<_> = webview.cookies()?          // NOT cookies_for_url
    .into_iter()
    .filter(|c| match c.domain() {
        Some(d) => {
            // MANDATORY: strip RFC 6265's leading-dot wildcard marker BEFORE comparing.
            // Removing this line reintroduces F-34.4.2-19. See the warning below.
            let d = d.strip_prefix('.').unwrap_or(d);
            host == d || host.ends_with(&format!(".{d}"))
        }
        None => false,
    })
    .collect();
```

This mirrors the shipped `cookie_domain_matches` at `src-tauri/src/main.rs:975-994`. Keep the two
in step — that function is the only domain comparator this project has, deliberately, so a second
ad hoc one does not drift.

> ⛔ **DO NOT "simplify" the strip away.** Earlier revisions of this document recommended exactly
> that shape without it:
>
> ```rust
> Some(d) => host == d || host.ends_with(&format!(".{d}")),   // ← SHIPPED. BROKE PRODUCTION.
> ```
>
> `format!(".{d}")` on an already-dotted `d` (`.humblebundle.com`) demands a `"..humblebundle.com"`
> suffix **no real hostname can ever contain**, so the comparator silently matches *nothing* with a
> leading-dot domain — for any host, not just Humble's. That is F-34.4.2-19: the login poll ticked
> correctly forever, `_simpleauth_sess` never entered the `matched` array, the unfiltered `total`
> stayed healthy every tick (Humble sets 20+ cookies), `classifyCookieRead` therefore always
> returned `SUPPORTED_NONEMPTY` instead of an error or timeout verdict, and **not one log line was
> ever emitted.** No config write, no Logout control, no login form, no error — on a session that
> was genuinely authenticated (`getGamekeys()` → `status:'ok'`, 31 gamekeys).
>
> RFC 6265 defines a `.example.com` cookie as applying to `example.com` itself, not only to its
> subdomains — so stripping the dot is the **spec-correct** reading, not a Humble special case.
>
> A passing Rust test asserted the blind behaviour as *correct, intended* behavior until this was
> caught. A green test is not evidence the comparator is right; see the memory
> `grep-assertion-must-fail-against-known-bad-input`.

### Liveness proof before any poll

```
on watch start:
  let all = webview.cookies()?;
  if all.is_empty() { fail LOUDLY — do not enter the poll }
```

A login page always sets something: Humble handed **33 cookies to an anonymous visitor**. Classify
every read rather than returning a bare `[]`:

| Verdict | Meaning |
|---|---|
| `SUPPORTED_NONEMPTY` | cookies returned; API demonstrably live |
| `SUPPORTED_BUT_EMPTY` | zero, **but** the channel proved itself earlier → a real "not logged in yet" |
| `UNSUPPORTED_OR_ERROR` | `Err` — a loud, distinguishable failure |
| `UNDECIDABLE` | zero **and** never proven → empty and no-op are indistinguishable. **Never poll on this.** |

### The good news: the API itself is sound on macOS

`Webview::cookies()` returns `HttpOnly` **and** `Secure` cookies with full values.
`_simpleauth_sess` (`HttpOnly=true, Secure=true, 80 chars`) read successfully many times. All reads
completed in **2–4 ms** from the main thread, a worker thread, and a `run_on_main_thread` hop. The
documented Windows deadlock does **not** reproduce on macOS, and wry's internal 1 s timeout
(`wkwebview/mod.rs:1446`, which pumps `NSRunLoop::mainRunLoop()`) is never approached.

**This is NOT the `navigator.clipboard` silent-no-op shape.**

### Opening the login window (013)

```rust
WebviewWindowBuilder::new(&app, "login-humble", WebviewUrl::External(url))
    .user_agent(CHROME_UA)                 // MANDATORY — see below
    .on_page_load(|w, payload| { /* did-navigate analog: Started | Finished, main frame */ })
    .on_navigation(|u| { /* ALSO fires for subframes — do not drive logic from this */ true })
    .build()?
```

External URLs load with no allowlist, CSP, or plugin setup. `.user_agent()` reaches **real HTTP
requests**, verified server-side, so D-05/D-07's Chrome-UA requirement is portable.

**Why the UA is mandatory:** Tauri's default macOS UA is
`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)` — with
**no browser product token at all**. That is a worse Cloudflare-bot-management fingerprint than
Electron's default.

**Why `on_navigation` is wrong for the relay:** on Humble's login page, **5 of 8** `on_navigation`
events were iframes (Optimizely client storage, Humble's mailer connect frame, three `about:blank`);
`on_page_load` fired exactly twice (Started/Finished, main frame). Electron's `did-navigate` is
top-level only. Since `notifyLoginNavigated()` → `forceRevalidate()` **re-arms the watch deadline**,
relaying subframe navigations lets a third-party ad frame keep a login watch alive indefinitely,
defeating WR-03's timeout.

### Persistence and isolation (015)

| `persist:humble` job | Tauri equivalent | Status |
|---|---|---|
| Persistence across restart | default `WKWebsiteDataStore` is already disk-backed | ✓ free — 24 cookies incl. `_simpleauth_sess` survived process exit |
| Isolation from the rest of the app | `.data_store_identifier([u8;16])` | ✓ real — different `csrf_cookie` values, control cookies absent |
| Windowless jar access | **none** | ✗ needs a live webview handle |

**By default there is no isolation at all.** The app's own `tauri://` webview, the login window, and
any other window all returned the *same* 33 cookies — the main app webview can read the live site's
session cookie. Convenient for a poller (read from any window), poor hygiene otherwise.

Once you opt into `data_store_identifier`, the jar is readable **only** through a webview built with
that same identifier, and closing the login window destroys the handle
(`no webview window labelled 'login-humble'`) even though the cookies survive. Electron hands the
backend a session object with no window attached; **Tauri only ever hands you a `Webview`.** Anchor
the poller to a webview that outlives the poll.

## What to Avoid

- **`cookies_for_url()`** — see above. The single most dangerous API in this area.
- **Detecting login from `document.cookie`.** `_simpleauth_sess` is `HttpOnly` and structurally
  invisible to JS, while **27 other cookie names** on the live login page make the read look
  perfectly healthy. It cannot see the deciding cookie and cannot report that it cannot. (`csrf_cookie`
  *is* JS-visible, but there's no reason to use the weak channel when the Rust API returns it too.)
- **`WebviewWindow::title()` as a JS→Rust side channel.** It returns the **native NSWindow title**,
  which Tauri sets explicitly and WKWebView never feeds from `document.title`. This is the same gap
  as "no `page-title-updated` analog". It cannot work by construction — the first 014b channel design
  died here. (`eval()` returns `Result<()>`, fire-and-forget, so there is no built-in return path;
  the working fallback was navigating the page to a loopback server with the value in the query
  string, which destroys the page.)
- **Expecting a `remote.urls` capability to grant IPC to app commands.** With
  `windows: ["login-*"]` and `remote.urls: ["https://*.humblebundle.com"]` declared, the injected
  script still got `rejected: report_from_page not allowed. Plugin not found`. `remote.urls` grants
  the *webview* remote-IPC eligibility; app-level `#[tauri::command]`s are not in the ACL. Do not
  design a login flow that depends on the login page talking back to the backend.
- **Assuming isolation is free.** Skipping `data_store_identifier` means third-party login cookies
  share the app's own store.
- **Logging cookie values.** Redact to a short prefix + length (`user.ts` already enforces this).

## Constraints

- **Verified only on macOS 26.5.2 / tauri 2.11.5 / wry 0.55.1.** Windows (WebView2) and Linux
  (webkit2gtk) have **separate** cookie implementations in wry and may domain-match correctly — the
  `cookies_for_url` defect is macOS-observed and **unverified elsewhere**. Re-test before relying on
  either behaviour cross-platform.
- **Tauri docs state `cookies()` is unsupported on Android and always returns an empty vector** —
  proof that the silent-empty failure mode exists by design on at least one platform.
- **Tauri docs warn `cookies()` deadlocks in synchronous commands/event handlers on Windows.** Use
  async commands and separate threads there. Not reproducible on macOS.
- **`data_store_identifier` is macOS 14+ / iOS 17+ only**, and is a fixed 16-byte identifier, not a
  string namespace like Electron partition names.
- **`window.__TAURI__` is injected into third-party origins** (confirmed present on
  `https://www.humblebundle.com`). Every invoke is ACL-refused, but the surface is real.

## Reproducing

A working harness is preserved at `sources/013-tauri-child-webview-login-window/app/` — a standalone
Tauri app with an interactive control panel, a loopback control server that sets known cookies, a
`/probe` route echoing the raw `Cookie:` header, and two scripted probe sequences:

```bash
cd <app>
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build      # ~5 s thanks to the shared target dir
SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 ... cargo run        # navigation + cookie reads + isolation
SPIKE_AUTORUN=2 SPIKE_AUTORUN_EXIT=1 ... cargo run        # UA verification + JS channel + partitioning
```

Raw JSONL evidence: `sources/014a-cookie-read-rust-webview-api/round1.log`, `round2.log`.

## Origin

Synthesized from spikes: 013, 014a, 014b, 015 (run 2026-07-27).
Source files: `sources/013-tauri-child-webview-login-window/`,
`sources/014a-cookie-read-rust-webview-api/`, `sources/014b-cookie-read-injected-js/`,
`sources/015-cookie-jar-isolation-persistence/`.
