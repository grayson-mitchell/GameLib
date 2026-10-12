# Phase 50: Epic store in-app on macOS: a Rust-managed raw WKWebView subview for /store/epic - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-12
**Phase:** 50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv
**Areas discussed:** Subview lifetime off the tab, Slow-load timeout UX, Challenge fallback scope, Popups and JS dialogs

---

## Todo cross-reference

| Todo | Match | Outcome |
|------|-------|---------|
| 2026-09-15 Epic in-embed Sign in button has no decided behaviour | real (`blocked_by: Phase 50's live gate`) | Folded — the Sign in arm closes it |
| 2026-10-11 Stores-tab embed not implemented on Windows | real, but macOS-only phase | Reviewed, not folded — operator is finishing its live gate (W1–W8 PASS) |
| 8 others (Windows signing, blank launch, library sort, login-sheet wedge, zoom, button contrast, F9 RPC timeout, Amazon expiry) | keyword noise (`platform`, `app`, `live`) | Left alone |

**Notes:** The user clarified mid-question that the Windows Stores embed was nearly complete on the remote branch and asked for a pull; the merge (`25f65229d`) landed quick `261012-f25`/`gn8` before the gray areas were presented. The ROADMAP's L-2 rationale ("Windows has no Stores-tab embed at all") is therefore stale as *reasoning*; the macOS-only scope stands because the raw `WKWebView` subview is macOS code.

---

## Subview lifetime off the tab

| Option | Description | Selected |
|--------|-------------|----------|
| Keep it, hidden | Phase 40 D-21 parity: hide on leave, close only at app exit; return instant; one idle WebContent process | ✓ |
| Tear it down | ROADMAP's literal wording; every return is a cold load with the #9 stall risk | |
| Keep, tear down after idle | Close after N min hidden; more state to test | |

**User's choice:** Keep it, hidden.

| Option | Description | Selected |
|--------|-------------|----------|
| Same rule as leaving the tab | One lifecycle rule for Epic → Steam → Epic | ✓ |
| Always close on store switch | Only one store page alive at a time | |

**User's choice:** Same rule as leaving the tab.

| Option | Description | Selected |
|--------|-------------|----------|
| Restore last Epic URL | Parity with D-30; validated by the D-31 origin parse | ✓ |
| Always start at the storefront | Avoids restoring a previously challenged URL | |

**User's choice:** Restore last Epic URL.

| Option | Description | Selected |
|--------|-------------|----------|
| Reload on show if auth changed | Keyed on GameLib's own Epic auth state (D-16 rule) | ✓ |
| Never auto-reload | Header lies until the user reloads | |

**User's choice:** Reload on show if auth changed.
**Notes:** None.

---

## Slow-load timeout UX

| Option | Description | Selected |
|--------|-------------|----------|
| 45 s | Matches the Phase 49 D-01 bound idiom; clears nearly every observed healthy load | ✓ |
| 30 s | Snappier; may flag slow-but-healthy cold loads | |
| 60 s | Most conservative; a full minute blank on a real stall | |

**User's choice:** 45 s.

| Option | Description | Selected |
|--------|-------------|----------|
| Transparent subview over the placeholder | `drawsBackground` off; `StoreEmbedPlaceholder` shows through until paint | ✓ |
| Opaque subview, blank until paint | Plain WKWebView; white rectangle in dark themes | |
| Hide subview until didFinish | Placeholder shown longer than the page is blank (SPA finishes late) | |

**User's choice:** Transparent subview over the placeholder.

| Option | Description | Selected |
|--------|-------------|----------|
| Banner in the chrome bar | Row under `StoreEmbedControls`: Reload · Open in browser; subview stays visible | ✓ |
| Panel over a hidden subview | Clearer, but a late paint is thrown away | |

**User's choice:** Banner in the chrome bar.

| Option | Description | Selected |
|--------|-------------|----------|
| No silent retry | One timer, one banner; the stall stays measurable | ✓ |
| One silent reload at 45 s, banner at 90 s | Friendlier on a true stall; doubles the blank wait otherwise | |

**User's choice:** No silent retry.
**Notes:** None.

---

## Challenge fallback scope

| Option | Description | Selected |
|--------|-------------|----------|
| Main-frame `cf-mitigated: challenge` header | Read in `decidePolicyForNavigationResponse`, main frame only; subframe widgets never trip it; host match as fallback if absent | ✓ |
| Any challenges.cloudflare.com request | Fires on subframe/script loads; false-positive on Epic's sign-in widget | |
| Interstitial host + title match only | No headers; brittle against copy/URL changes | |

**User's choice:** Main-frame `cf-mitigated: challenge` header.

| Option | Description | Selected |
|--------|-------------|----------|
| Panel with Try again + Open in browser | Hide the subview; new `'epic-challenged'` reason | ✓ |
| Leave the interstitial visible, add a banner | Runs 4–5 showed the widget is a dead end | |

**User's choice:** Panel with Try again + Open in browser.

| Option | Description | Selected |
|--------|-------------|----------|
| On every visit / Try again | No session memory; challenges were 1 of 32 and transient | ✓ |
| Sticky for the session | Panel until restart | |
| Backoff (1, 5, 15 min) | Most machinery, least benefit at this rate | |

**User's choice:** On every visit / Try again.
**Notes:** None.

---

## Popups and JS dialogs

| Option | Description | Selected |
|--------|-------------|----------|
| System browser, throttled | `createWebView…` returns nil; OS browser via the Tauri embed's 2 s hand-off throttle | ✓ |
| Navigate in place | Pristine-login parity; loses the user's place on the store | |
| Open in the pristine Epic window | A second Rust-owned window; roadmap says no login-seam change | |

**User's choice:** System browser, throttled.

| Option | Description | Selected |
|--------|-------------|----------|
| Native NSAlert via the shipped helpers | `present_native_js_alert` / `_confirm` / `_prompt` reused | ✓ |
| Suppress (return defaults) | Page silently takes the negative branch | |

**User's choice:** Native NSAlert via the shipped helpers.

| Option | Description | Selected |
|--------|-------------|----------|
| Block + one toast | "Install from your Library instead…"; logged once per navigation | ✓ |
| Block silently, log only | Button appears to do nothing | |
| Hand to the OS | Launches Epic Games Launcher if installed; against the one-launcher value | |

**User's choice:** Block + one toast.
**Notes:** None.

---

## Claude's Discretion

- Back/forward/URL reporting (native WK history preferred over D-22's Rust stack).
- IPC shape (`store_embed_*` with a discriminator vs `epic_embed_*`), with one bounds writer.
- Rust module placement; main-thread marshalling pattern.
- Timer behaviour while hidden.
- How `embeddable` becomes platform-aware; the guard and flag move together.
- Additional `objc2-web-kit` features (minimum, `default-features = false`).
- Live-gate evidence capture shape.

## Deferred Ideas

- Epic store on Windows via the WebView2 embed (unmeasured; own spike/phase).
- Map `com.epicgames.launcher://` links onto GameLib's own Epic install flow.
- Linux WebKitGTK raw-view equivalent.
