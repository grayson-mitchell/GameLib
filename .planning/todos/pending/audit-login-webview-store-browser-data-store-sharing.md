---
created: 2026-08-15T08:50:00.000Z
title: "Audit: do the login webview and store browser share one data store, and does logout clear it?"
area: auth/webview
needs: audit-then-maybe-fix
status: OPEN
severity: unknown-pending-audit
upstream:
  - 68eb1adde (Heroic v2.22.1 — Unify webview session partitions so login credentials carry over to stores, #5752) — CONCEPT ONLY, code is not portable
files:
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/screens/WebView/index.tsx
---

## Problem

Upstream `68eb1adde` fixed two defects in Heroic's webview session handling:

1. **Login credentials did not carry from the login webview into the store pages**, because the
   two used different Electron session partitions (`persist:epicstore` vs `persist:epic`).
2. **Logout did not clear the store's session** — no `clearStorageData()`, `clearCache()`, or
   `clearAuthCache()`.

The upstream **code is not portable** — it is Electron `session.fromPartition()`, and GameLib's
surface is WKWebView/wry. But the **bug class is one GameLib plausibly has**, because GameLib
likewise runs a separate login window *and* an embedded in-app store browser, so the same split
between "where you logged in" and "where the session is read" exists.

Two existing open items point the same direction:
- the **"Epic logout unobserved"** carry-forward from Phase 34.5, and
- the known **"wry cookie delete lies about deleting"** gotcha — `.cookies()` deletion silently
  no-ops; the working path is `WKWebsiteDataStore.removeData(for:)`.

## Solution

This is an **audit**, and may or may not produce a fix. Two questions to answer with evidence,
not by reading intent:

1. Do the login webview and the embedded store browser resolve to **one shared
   `WKWebsiteDataStore`**, or separate ones? If separate, a completed login won't be visible to
   the store browser.
2. Does logout actually call `WKWebsiteDataStore.removeData(for:)` for the right data types and
   domains — and is that **observed**, not just reported? Per the standing lesson, never accept a
   mutating call's own success report as proof of effect; verify by re-reading the store.

Read `git show 68eb1adde` first for the shape of the upstream bug (Heroic upstream is git remote
`origin`), then test GameLib's own surface directly.

If the audit finds the surfaces are already unified and logout genuinely clears, close this with
the evidence recorded — a negative result is worth writing down, since this question keeps
resurfacing.
