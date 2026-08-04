# DummyStore — a local OAuth login fixture for login/UI work

Iterating on login UX against real stores is miserable: Epic's pre-auth 403 is a parked
anti-bot blocker, and every form tweak needs a live account. Spike 019 built **DummyStore** —
a zero-dependency local OAuth 2.0 authorization-code-grant provider whose login form is a
hot-editable HTML string — so login-window work (modal attachment, autofill affordances, form
changes, capture logic) can be developed and regression-tested offline.

It is the fixture spikes 020, 021 and 022 all ran against. Reuse it; do not rebuild it.

## Requirements

1. **Capture authorization codes by navigation observation** — never a local callback server,
   never remote-page IPC (spike 014b: remote origins are ACL-refused).
2. **Any scripted login test needs a logout preamble**, and store-side counters must be
   baselined *after* it.
3. **Two oracles per claim** — the harness log *and* the store's own `/events` export.
4. **Never log a code or token in full** — 3-char prefix + length, matching `user.ts`.

## How to Build It

### Run it

```bash
node .claude/skills/spike-findings-gamelib/sources/019-dummy-oauth-store/store-server.mjs
# http://127.0.0.1:17940   client_id=gamelib-dummy   demo / dummy-store-pw
```

Endpoints: `/login` (the form; `?autologin=1` self-submits for scripted runs), `/authorize`
(code grant + PKCE S256|plain), `/callback` (redirect landing), `/token`, `/me` (Bearer),
`/logout`, `/events` (forensic export). Misuse is enforced, so the fixture can prove a client
correct: code replay → `invalid_grant`, bad PKCE verifier → `invalid_grant`, `state` is required.

### The capture pattern (this is the part to copy into production)

Watch navigation for the redirect URI and lift `code`/`state` out of the query string. Fire on
`Started`, not `Finished` — the code then reaches the app **before the landing page paints**
(measured: code at 713 ms of a 727 ms flow), which is what lets a modal login window close
itself instantly.

```rust
.on_page_load(move |_w, payload| {
    let url = payload.url().as_str().to_string();
    let started = matches!(payload.event(), PageLoadEvent::Started);
    if started && url.starts_with(CALLBACK_PREFIX) {
        // pull code/state from parsed.query_pairs(), emit to the app
    }
})
```

For the **pristine `WKWebView`**, the equivalent hook is
`decidePolicyForNavigationAction` — it sees navigations WebKit will go on to refuse (that is
the Epic localhost-redirect case; see `tauri-login-webview-cookies.md`).

`on_navigation` is fine to *log* but must drive no logic — it fires for subframes (spike 013).

### Scripted flows

```bash
cd sources/019-dummy-oauth-store/app
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build            # ~28 s warm
CARGO_TARGET_DIR=<repo>/src-tauri/target SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 cargo run
```

Exits 0 only if all of: cold+autologin flow, code-replay rejection, warm-session flow, PKCE
tamper rejection, **and** the store oracle (`formServes == 1`, `codesIssued == 3`). Two
consecutive runs against the same live server both exit 0.

### The sticky-jar trap (this WILL bite scripted login tests)

The login-window cookie jar persists across app restarts (spike 015), so "logged in" is sticky:
a second run silently skips the form and any "the form was served once" assertion fails for the
wrong reason. Every scripted run must start with a logout and baseline afterwards:

```js
await logoutStore();                       // navigate a login window to /logout
const base = counts(await fetch('/events').then(r => r.json()));
// …run flows…
const delta = counts(await fetch('/events').then(r => r.json())) - base;
```

A real logout feature needs genuine cookie teardown — and note wry's cookie **delete** reports
success while deleting nothing (see the memory index / `tauri-login-webview-cookies.md`).

## What to Avoid

- **`oauth2-mock-server` or any packaged mock.** The whole point is that the login form is ours
  to restyle; a library's login/consent UI is not.
- **A callback HTTP server inside the app** to catch the redirect. Navigation observation is
  simpler, faster, and already proven.
- **Detecting login from `document.cookie`** — structurally blind to HttpOnly (014b).
- **Asserting store-side counters from zero.** Baseline after the logout preamble.
- **Leaving the harness running between spikes** — port 17940 collisions produce confusing
  "unreachable" states. The control panels all do a liveness `fetch('/events')` on boot and
  fail loudly; keep that pattern.

## Constraints

- Loopback **HTTP**, not HTTPS. Fine for OAuth-shape and UI work; for anything where transport
  security could change platform behaviour (e.g. autofill eligibility), add a real-HTTPS
  control — spike 020 did exactly that and it is what proved the autofill block was the
  platform, not the origin.
- `crypto.subtle` **is** available on the `tauri://` origin (macOS), so S256 PKCE works in the
  renderer with no Rust help. Windows/Linux unverified — the harness keeps a `plain` fallback.
- In-memory state only: restarting the server drops sessions, codes, and tokens.
- Demo credentials are hardcoded and printed on the form. Never point this harness at anything
  real.

## Origin

Synthesized from spike 019 (run 2026-08-04); used as the fixture by 020, 021, 022.
Source files: `sources/019-dummy-oauth-store/` (`store-server.mjs`, `app/src/main.rs`,
`app/dist/index.html`).
