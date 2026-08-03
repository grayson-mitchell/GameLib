---
spike: 019
name: dummy-oauth-store
type: standard
validates: "Given a local OAuth 2.0 auth-code-grant provider (fake store: login form → authorize → redirect with code → token exchange), when a Tauri login window drives the flow end-to-end, then every step is observable in a forensic log and the harness is reusable for UI/form iteration"
verdict: VALIDATED
related: [013, 014a, 014b, 015, 018]
tags: [oauth, pkce, login, webview, tauri, dummy-store, harness]
---

# Spike 019: DummyStore — local OAuth auth-code-grant login harness

## What This Validates

Given a local OAuth 2.0 authorization-code-grant provider ("DummyStore": login form →
authorize → redirect with code → token exchange → Bearer-protected profile), when a Tauri
login `WebviewWindow` drives the flow end-to-end, then every step is observable in a forensic
log on **both** sides (harness `run.log` + store `/events`), and the harness is reusable for
login-UX iteration — specifically as the substrate for spike 020 (Keychain/password-manager
autofill) and spike 021 (modal login window).

## Research

No library research needed — the OAuth 2.0 code grant + PKCE (RFC 6749 / 7636) is spec-known,
and prior spikes already established the webview surface. Approach comparison for the provider:

| Approach | Tool | Pros | Cons | Status |
|----------|------|------|------|--------|
| Hand-rolled Node ESM server | `node:http` + `node:crypto` only | Zero deps; login form is a hot-editable HTML string (the whole point is form iteration); conventions-aligned (`.mjs`, hardcode everything) | We own spec-correctness (mitigated: replay + PKCE-tamper probes built in) | **CHOSEN** |
| `oauth2-mock-server` (npm) | JS lib | Spec-correct out of the box | New dep; token-endpoint-centric — its login/consent UI is not ours to restyle, which defeats the purpose | rejected |
| Extend 013's Rust control server | in-harness | One process | Every form tweak = recompile; wrong iteration loop for UI work | rejected |

Key inherited constraints applied by design:
- Code capture is **navigation observation** (`on_page_load`, main-frame, `Started`), not
  remote-page IPC — 014b proved remote origins cannot invoke app commands.
- `on_navigation` is logged but drives **no logic** (fires for subframes — 013).
- Chrome UA spoof on the login window (013: mandatory, not reinforcement).
- Codes/tokens logged as 3-char prefix + length only (conventions).

## How to Run

```bash
cd .planning/spikes/019-dummy-oauth-store
node store-server.mjs &                       # DummyStore on http://127.0.0.1:17940

cd app
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build   # ~28 s warm

# Interactive (the UI/form-iteration surface):
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo run
#   → "Start login flow (interactive)" and type demo / dummy-store-pw

# Scripted, reproducible, exits with a verdict:
CARGO_TARGET_DIR=<repo>/src-tauri/target SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 cargo run
```

## What to Expect

Scripted run (exit 0 = all probes passed):
- **Flow A** (cold + autologin): form auto-submits, code captured, token exchanged, `/me`
  fetched — ~730 ms end-to-end.
- **Replay probe**: re-redeeming flow A's code → `400 invalid_grant` "code REPLAY detected".
- **Flow B** (warm session): completes with **no form at all** (~75 ms) — the session cookie
  short-circuits `/authorize`.
- **Flow C** (PKCE tamper): corrupted verifier → `400 invalid_grant` "PKCE verification
  FAILED"; correct verifier then succeeds (code not burned by the failed attempt).
- **Store oracle**: `/events` confirms exactly 1 form serve + 3 codes issued per run.

Interactive run: the DummyStore login form (username/password with proper
`autocomplete="username"` / `autocomplete="current-password"` attributes) renders in a
560×720 login window; the control panel shows each of the 7 flow steps flipping ○→◆→✓.

## Observability

- **Harness side**: `run.log` (JSONL) + `events-export.json` — window lifecycle, every
  `on_navigation`/`on_page_load`, code capture, flow steps with elapsed ms.
- **Store side**: `GET /events` — every request, form serve, credential check, code
  issue/redeem, PKCE verdict, token issue, `/me` hit. Two independent oracles per claim.
- Scripted runs have a 90 s Rust-side watchdog (exit 2) so a hang fails loudly.

## Investigation Trail

1. **Provider design**: hand-rolled Node server chosen over `oauth2-mock-server` so the login
   form is a directly editable HTML string — form iteration is the spike's purpose.
2. **First scripted run passed end-to-end on the first try** (rare enough to note): flow A
   814 ms, replay rejected, warm flow B 124 ms, `formServes=1 / codesIssued=2` cross-checked
   against the store's own log.
3. **Surprise: `crypto.subtle` exists on the `tauri://` origin** — PKCE ran as real S256, not
   the `plain` fallback I'd wired defensively. WKWebView treats the custom scheme as a secure
   context. (The fallback stays in the code; Windows/Linux unverified.)
4. **Found a latent flakiness before it bit**: the login-window jar persists across app
   restarts (spike 015), so a second scripted run against the same live server would inherit
   the warm session, skip the form, and falsely fail the `formServes=1` oracle. Fixed with a
   logout preamble + baselining the store-oracle counts after the preamble instead of at zero.
5. **Added the PKCE tamper probe** (flow C): corrupted verifier rejected; also documents that
   a failed PKCE attempt does **not** burn the code in this implementation (RFC-permitted).
6. **Two back-to-back scripted runs, same live server: both exit 0** — harness is idempotent.

## Results

**VALIDATED.** The full auth-code-grant flow runs end-to-end inside a Tauri login window with
every step observable, and misuse probes (replay, PKCE tamper, state mismatch check) behave
correctly. Evidence: `run.log`, `events-export.json`, store `/events`; two consecutive
scripted runs exit 0.

Findings that carry forward:

- **Navigation observation is a sufficient auth-code capture channel.** `on_page_load`
  (Started, main frame) saw the redirect and delivered `code`+`state` to the app **before the
  landing page painted** (code at 713 ms of a 727 ms flow). No callback server, no remote-page
  IPC needed. This is the shape a real store OAuth flow should use.
- **`crypto.subtle` is available on `tauri://` (macOS)** — S256 PKCE works in-renderer with no
  Rust help. Cross-platform status unverified.
- **The shared cookie jar makes "logged-in" sticky across app restarts** — great for UX,
  hazardous for test determinism. Any scripted login test needs an explicit logout preamble
  (and a real logout feature needs actual cookie/session teardown — ties into the known wry
  cookie-delete defect from the memory index).
- **Warm-session authorize is ~75 ms and fully silent** — a "reconnect" (token refresh via
  hidden login window) would be imperceptible; relevant to 021's modal UX decisions.
- **Fidelity caveat for spike 020**: DummyStore runs on plain `http://127.0.0.1`. Password
  managers may gate autofill on HTTPS/domain association; 020 must establish whether loopback
  HTTP is even eligible for Keychain autofill before interpreting a negative result.
