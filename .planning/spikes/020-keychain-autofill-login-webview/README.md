---
spike: 020
name: keychain-autofill-login-webview
type: standard
validates: "Given the dummy store's login form in (a) a wry WebviewWindow and (b) a pristine raw WKWebView, when the user focuses the credential fields, then macOS Keychain/password-manager autofill offers to fill — or the gating is proven and fallbacks enumerated"
verdict: PARTIAL
related: [019, 013]
tags: [keychain, autofill, wkwebview, entitlement, passwords, pristine]
---

# Spike 020: Keychain / password-manager autofill in the login webviews

## What This Validates

Given the spike-019 DummyStore login form (proper `autocomplete="username"` /
`autocomplete="current-password"` markup) rendered in **both** production login surfaces —
(a) a wry-created Tauri `WebviewWindow` and (b) a pristine raw `WKWebView` (the Epic
surface) — when a human focuses the credential fields, submits credentials, and tries the
paste fallback, then we learn which (if any) autofill channels exist on macOS for a
non-browser app, and what the fallback UX must be.

## Research

External evidence gathered before building (all pointing the same way — but never measured
on macOS 26 with this stack):

- Apple Developer Forums threads report **Password AutoFill is intentionally disabled for
  WKWebView on macOS** — `SFSafariViewController` (iOS-only anyway) or a real browser is the
  supported path ([719636](https://developer.apple.com/forums/thread/719636),
  [654338](https://developer.apple.com/forums/thread/654338),
  [741089](https://developer.apple.com/forums/thread/741089)).
- iOS's associated-domains WKWebView autofill (fill works, save doesn't) has **no macOS
  analog** — and associated domains are structurally unavailable to us anyway: GameLib cannot
  publish `apple-app-site-association` on epicgames.com/gog.com/steampowered.com.
- Third-party managers (1Password) fill **only real browsers with extension frameworks** —
  "no mechanism for filling into apps on macOS other than Safari, Firefox, Chrome, Opera…"
  (1Password community).
- The restricted `com.apple.developer.web-browser.public-key-credential` entitlement is for
  **passkeys in actual browsers** (Apple approval required); no public entitlement enables
  plain password autofill in WKWebView.

| Approach | Pros | Cons | Status |
|----------|------|------|--------|
| Direct: measure autofill affordances live in both surfaces | Grounds the widely-believed "no" (or falsifies it) on macOS 26 | Needs human eyes + a seeded Keychain entry | **CHOSEN (this spike)** |
| Take the forums' word for it | Free | Violates conventions (verdicts must be observed); save-vs-fill-vs-context-menu are distinct channels nobody enumerated | rejected |
| Build fallbacks first (own Keychain store, paste UX) | Ships something | Premature until the direct channel's status is proven | follow-up, informed by this spike |

Fidelity caveat carried from 019: DummyStore is loopback HTTP. Probes P5/P6 use a real
HTTPS login page to control for that variable.

## How to Run

```bash
cd .planning/spikes/019-dummy-oauth-store && node store-server.mjs &   # if not running
cd ../020-keychain-autofill-login-webview/app
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo build                   # ~8 s warm
CARGO_TARGET_DIR=<repo>/src-tauri/target cargo run                     # control panel
# SPIKE_AUTORUN=1 additionally auto-opens both login surfaces and logs CGWindowIDs
```

Pre-reqs for the fill probes:
1. In the macOS **Passwords** app, add a manual entry: site `127.0.0.1`, user `demo`,
   password `dummy-store-pw` — gives the local form a fillable candidate.
2. Have a real HTTPS site with a saved Keychain password (default probe: github.com/login).

## What to Expect

The control panel lists probes P1–P9 (autofill-on-focus, save-on-submit, context-menu
AutoFill item, Passwords-app copy → Cmd+V paste — each × both surfaces). Every yes/no toggle
and note is written to the forensic log; "Export observations" writes
`events-export.json` with the full results table.

Expected per the research: P1–P6 **no** (no autofill UI anywhere), P7 likely **no**,
P8/P9 **yes** (paste works — P9 specifically re-proves the pristine window's Cmd+V
key-equivalent monitor). Any "yes" on P1–P6 falsifies the research and is a major finding.

## Observability

- `run.log` (JSONL) + `events-export.json` — window lifecycle, page loads, every human
  observation with timestamp and note.
- CGWindowIDs logged per window; screenshots captured via `screencapture -l<id>`.

## Investigation Trail

1. Research pass (above): consistent external "no" for macOS WKWebView password autofill,
   but save/fill/context-menu are distinct channels and macOS 26 is unmeasured — so measure.
2. Harness built: wry surface reused from 019; pristine surface adapted from src-tauri's
   `open_pristine_epic_login_window` (raw `WKWebView` into a `tauri::WindowBuilder` shell —
   requires the `unstable` cargo feature, same as src-tauri; `makeFirstResponder` +
   single-app-lifetime Cmd+V/C/X/A/Z local monitor keyed to the pristine NSWindow).
3. Smoke run: both surfaces render the DummyStore form (screenshots `smoke-wry.png`,
   `smoke-pristine.png`, captured by CGWindowID per the 016 convention). Typing works in the
   pristine window (text visible in the password field as dots — first responder promotion
   confirmed).
4. Human probe run (2026-08-04, reported conversationally — the observer drove both windows
   live): P1/P3/P5/P6 **no** inline affordance anywhere; P2/P4 **no** save offer; then the
   surprise —
5. **P7 falsified the blanket "no autofill in WKWebView" claim.** Right-click in a
   credential field → **AutoFill → Passwords** opens the system panel and **fills**, in all
   four combinations (wry × pristine, DummyStore-HTTP × real-HTTPS). Observed UX caveats,
   identical in both surfaces: the panel does not auto-match the current site (manual search
   required); the panel's search box **rejects typed input with a beep** (manual scroll
   only); after selecting an entry you click the specific field to fill. Same behavior in
   both surfaces ⇒ system-panel behavior in non-Safari hosts, not a harness key-delivery bug.
6. P8/P9: Cmd+V paste from the Passwords app lands in **both** surfaces — re-proving the
   pristine window's key-equivalent monitor fix under a fresh minimal reimplementation.

## Results

**⚠ PARTIAL** — inline autofill is platform-blocked, but two working system channels exist.

| Channel | wry WebviewWindow | pristine WKWebView |
|---|---|---|
| Inline autofill on focus (key icon / dropdown / Touch ID) | ✗ none (HTTP & HTTPS) | ✗ none (HTTP & HTTPS) |
| "Save password?" offer on submit | ✗ never | ✗ never |
| Right-click → AutoFill → Passwords panel | ✓ fills | ✓ fills |
| Cmd+V paste from Passwords app | ✓ | ✓ (needs the key-equivalent monitor) |

Findings that carry forward:

- **Inline Password AutoFill and save-prompts do not exist for WKWebView in a non-browser
  macOS app — confirmed live on macOS 26**, on both login surfaces, on HTTP *and* real
  HTTPS (controls out the loopback variable). Matches Apple's browser-only policy; no
  public entitlement changes this.
- **The system context-menu AutoFill → Passwords panel is a real, working Keychain channel
  in both surfaces** — even for a loopback-HTTP site. GameLib never touches the credential.
  Its UX is rough (no site auto-match; search box beeps at typed input in both surfaces —
  system-panel behavior in non-Safari hosts; manual scroll; click-per-field fill).
- **Paste is the universal fallback** and works in both surfaces; the pristine window's
  Cmd+V local-monitor fix is load-bearing for it and was re-proven here.
- **UX implication for the real build:** don't build a custom credential store for store
  logins. Surface the two system channels instead — e.g. a hint in the login window chrome:
  "Right-click a field → AutoFill → Passwords, or paste from the Passwords app."
- Screenshots: `smoke-wry.png`, `smoke-pristine.png` (form rendering in both surfaces).

