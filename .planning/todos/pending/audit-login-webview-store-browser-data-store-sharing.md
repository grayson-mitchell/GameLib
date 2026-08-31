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

## PARTIAL ANSWERS from the Phase 35 live-gate re-run, 2026-08-31 (plan 35-29, criterion 21)

Measured while running criterion 21. These do not close this audit, but they remove guesswork from
parts of it.

1. **The store-browser half of the question is currently MOOT.** The Tauri build embeds no browser
   view for store/wiki pages at all (`WebviewUnavailablePanel.tsx:43`); it offers only a
   system-browser handoff. So there is no in-app store webview whose data store could be shared or
   not shared. This question becomes live again only when the embedded browser returns.

2. **The jar that logout clears is bundle-id keyed:**
   `~/Library/HTTPStorages/com.gamelib.shell.binarycookies`. Confirmed live — it was written by the
   running packaged instance, while the process-name-keyed `gamelib-shell.binarycookies` stayed
   stale. Note this holds even when the binary is launched directly from a terminal rather than via
   `open`, because the executable sits inside the `.app` and `CFBundleIdentifier` still resolves.

3. **"Does logout clear it?" — PARTIALLY. Authentication yes, cookies not entirely.** After Epic
   logout, credentials WERE required again (no silent re-auth), but an independent read of that jar
   still showed `_epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID` on `epicgames.com` hosts. Cause
   not established. Filed as `D-35-29-02` in
   `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md`.

4. **The in-product probe that would answer this properly is currently inert.** The Epic cookie
   census cannot read the jar during logout — it requires a login window and logout has none
   (`D-35-29-01`). Fixing that is a prerequisite for auditing this cleanly from inside the product;
   until then, use the on-disk jar read.
