---
created: 2026-08-24T00:00:00.000Z
title: "Epic logout REPORTS clearing 8 cookies and clears ZERO — every Epic cookie survives with its full value, including the 219-byte `EPIC_SESSION_AP` session token"
area: tauri-shell
status: OPEN
severity: major
files:
  - src-tauri/src/main.rs
  - src/backend/storeManagers/legendary/user.ts
---

## Observed

Found by the operator on 2026-08-24 driving **step 8 of `34.6-LIVE-GATE.md`** (Epic logout), on
commit `c13b9e398`, app PID 21682.

The app logged success:

```
(23:05:21) [Legendary]: Legendary logout: cleared 8 epicgames.com cookie(s) (measured post-removal delta)
(23:05:21) [Legendary]: Legendary logout: cleared storage — localStorage=4, sessionStorage=0, …
```

An **independent re-read** of `~/Library/HTTPStorages/gamelib-shell.binarycookies` — taken after the
jar had demonstrably been rewritten (mtime moved `17:59:11` -> `23:05:26`, size `17100` -> `16031`),
so this is NOT a stale-file artifact — says otherwise:

| | before | after |
|---|---|---|
| total cookies | 63 | **63** |
| epicgames.com-matching | 7 | **7** |
| removed by the logout | — | **0** |

**Zero cookies were removed.** And they are not emptied either — every one retains a substantial
value:

```
.epicgames.com            EPIC_SESSION_AP  value_len=219   <- the session token
.epicgames.com            EPIC_LOGIN_ID    value_len= 96
.epicgames.com            _tald            value_len= 36
.epicgames.com            EPIC_DEVICE      value_len= 32
.epicgames.com            _epicSID         value_len= 32
.ecosec.on.epicgames.com  __cf_bm          value_len=199
.www.epicgames.com        __cf_bm          value_len=198
```

Value LENGTHS only were measured; no value was ever read, printed or stored. The length extractor
was proven non-vacuous first: **63/63** cookies report `value_len > 0`, with known-live controls
reading sensibly (`.gog.com gog-al`=150, `gog_lc`=9).

## What DID work

- **legendary's own session is genuinely gone** — `legendaryConfig/legendary/user.json` is absent
  after logout. The CLI can no longer act as the user.
- **Scope correctness holds for everything not deleted.** All 4 near-miss Epic-family cookies
  survive (`.fortnite.com`/`.metahuman.com`/`.twinmotion.com`/`.unrealengine.com`, each named
  `EPIC_DEVICE` — the SAME name as an in-scope cookie, out of scope by domain), as do all 5
  `.gog.com`/`login.gog.com` cookies. So this is not an over-broad clear; it is a **no-op** clear.

## Why it matters

The residue is the browser-side Epic session. `EPIC_SESSION_AP` surviving intact means a subsequent
Epic login webview can re-authenticate silently — "log out" does not sign the user out of Epic in
the webview, only in legendary. On a shared machine the next person to open an Epic surface may
land on a signed-in session.

The reporting is arguably the worse half: **"cleared 8 … (measured post-removal delta)" is
affirmatively wrong**, and a wrong success message forecloses the investigation that a silent
failure would eventually invite. Note also that the app counted **8** while the jar holds **7**
in-scope — its own delta measurement is counting something the persistent store does not reflect,
consistent with wry's in-memory cookie API reporting deletions that never reach the on-disk store.

Shape precedent: [[wry-cookie-delete-lies-about-deleting]] — the same "delete reports success and
does not delete" behaviour, previously recorded and now reproduced on the real logout path with an
independent on-disk measurement.

## Not yet determined

Whether the deletion fails in wry/WKWebView or in the caller's use of it, and whether the
"post-removal delta" is measured against an API view that legitimately no longer lists the cookie
while the persistent store retains it. The count mismatch (8 reported vs 7 on disk) should be
explained by whatever fix lands — do not treat it as a rounding detail.

## Suggested checks for whoever picks this up

1. Re-read the jar from disk after deletion inside the shell itself, rather than trusting the
   removal API's own view, and make the log line report the DISK delta.
2. If wry cannot delete persistently, an honest failure message beats a false success one — say the
   cookies could not be removed rather than claiming a count.
3. Consider whether logout should additionally clear the WKWebView data store for the Epic domains
   (the same mechanism that cleared `localStorage=4` evidently does work).

## Notes

No `resolves_phase:` — this is a shell/webview defect, not a Phase 34.6 port defect, and must not be
auto-closed by it. Live-gate step 8 is recorded **FAIL** on this evidence, scored by identity per
D-13 rather than by count — a count-only check would have accepted the app's own "8" and passed.

Related: [[wry-cookie-delete-lies-about-deleting]] · [[cookie-domain-leading-dot-blindness]] ·
[[tauri-cookies-for-url-drops-cookies]]
