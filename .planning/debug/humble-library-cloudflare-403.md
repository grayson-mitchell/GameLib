---
status: awaiting_human_verify
trigger: "Humble library sync is Cloudflare-blocked: the filterUserLibrary server-action POST to https://www.humblebundle.com/home/library returns 403 \"Attention Required! | Cloudflare\" (HTML challenge page), so the live app logs \"Humble sync: library fetch access_denied, cache untouched\" and then enters a denial cooldown. All preceding GETs from the same client succeed with the same session cookie (session status JSON, /home/library HTML, 34 JS chunks, action-id discovery). Reproduced twice on macOS on 2026-11-25: (1) the live app after Humble sign-in under `pnpm tauri:dev` (dev vault) — ~/Library/Logs/GameLib/gamelib.log.old 18:42:46: \"discovered filterUserLibrary action after 34 chunk fetches (of 38)\" then \"library fetch access_denied\"; (2) the Phase 94-10 forward-mode real capture (src/backend/humble/__tests__/oracle/realCapture.oracle.test.ts, GAMELIB_ORACLE_HUMBLE=forward), redacted output untracked at src-tauri/crates/gamelib-humble/tests/fixtures/recorded/real/sync/ — exchanges.json entry 37 is the 403 POST, body-37.html is the Cloudflare page. The 403 POST sent, in wire order: host, connection: keep-alive, Cookie (ory_session_* only — no __cf_bm/cf_clearance), Mozilla UA, Accept: text/x-component, Next-Action, Next-Router-State-Tree, Origin, Referer, content-type multipart/form-data, accept-language: *, sec-fetch-mode: cors, accept-encoding: gzip, deflate, content-length. The 403 response sets a __cf_bm cookie. Suspects: Node/undici-style client fingerprint or default headers (accept-language: *, sec-fetch-mode: cors) on a POST, missing Cloudflare cookies the login webview holds, or a Humble-side change. Context: the Humble adapter is still TypeScript (Phase 94 ports it to Rust in plans 94-23..25 behind 94-10, which is paused at its operator checkpoint waiting on this fix). Constraints: never read, print or store the operator's session cookie — the operator exports it themselves; any live re-test against Humble needs the operator. Goal: find why the POST is challenged, fix it so a real sync returns library pages, then 94-10's capture can be re-run."
created: 2026-11-25T06:10:00Z
updated: 2026-11-25T06:50:00Z
---

## Current Focus
<!-- OVERWRITE on each update - always reflects NOW -->

hypothesis: ROOT CAUSE CONFIRMED and, after a correction (see Evidence 06:42), now properly evidenced on the www origin. Cloudflare in front of www.humblebundle.com blocks any POST carrying a `Next-Action` header when the client is not a real browser network stack: Node undici, system curl and reqwest/rustls all get the WAF block page (403, 4550 bytes), while a real WKWebView page ON www.humblebundle.com running the identical request gets 200 text/x-component from Humble's own server-action handler. FIX LANDED (Rust shell op, see Resolution). The only open items are the authenticated in-webview POST, WebKitGTK and WebView2, which need the Phase 94 Rust adapter as a caller.
test: DONE. Differential in one session: same host, path, action id and body shape, Node undici 403 block page vs real WKWebView (anonymous, non-persistent store, www-origin page, the REAL script text extracted from humble_action.rs, navigation to gamelib.invalid cancelled in the delegate like on_navigation) 200 text/x-component with a not_authenticated flight reply; text/plain reveal shape 409 "Server Action unavailable." vs Node 403. 61 module tests, 988 shell tests, 12 of 14 hand-seeded mutants killed (2 equivalent).
expecting: n/a for the desk. The authenticated end-to-end check is the 94-29/94-32 live gate (operator, macOS first).
next_action: HAND BACK to the orchestrator: DEBUG COMPLETE with the unverified list; the orchestrator replans 94-10, 94-23, 94-25, 94-26 to send the two POSTs through this op instead of reqwest. After the live gate confirms an authenticated library POST returns real pages, archive this session and append the knowledge-base entry.
bug_class: Bohrbug (deterministic, reproduces on every anonymous POST; no timing component)
reasoning_checkpoint:
  hypothesis: "Cloudflare (a WAF rule or Bot Management threshold on humblebundle.com, added or tightened between 2026-11-14 08:43 and 2026-11-25 18:42) blocks Next-Action POSTs whose client is not a browser TLS/HTTP stack; our sidecar sends them from Node undici, so every library page and every reveal POST is blocked at the edge before Humble's session check."
  confirming_evidence:
    - "Probe A: anonymous Node fetch POST in the adapter's exact shape (no cookie) returns the identical 4550-byte Cloudflare block page as the authenticated capture, so the block precedes and ignores the session."
    - "Probes C and G: adding a Safari-faithful then a Chrome-157-faithful header set (UA, sec-ch-ua*, sec-fetch-*, accept-language, priority) plus the __cf_bm cookie echoed from a prior GET still returns the block page, so headers and the cookie jar are not the discriminator."
    - "Probe B (system curl, SecureTransport/LibreSSL, HTTP/2) and the reqwest 0.13 + rustls(ring) probe return the same block page, so it is not Node-specific."
    - "Probe E: the same POST without the Next-Action header returns 200 (the page), so the rule is scoped to server-action POSTs, not to POST or to the path."
    - "CORRECTED 2026-11-25: the first Chrome and WKWebView probes ran AFTER an anonymous /home/library redirected to auth.humblebundle.com/login, so their JSON 404 'Invalid path' came from the auth host, not www; they proved nothing about www. Re-run from a page that stays on www (the real script, WKWebView, anonymous): 200 text/x-component, a not_authenticated flight reply from Humble's server-action handler; same-session Node control: 403 block page."
  falsification_test: "An authenticated in-page POST from the app's own webview would still get the block page if the rule also keys on something a browser lacks inside a Tauri webview (for example a missing cf_clearance, or the hidden window not being a top-level navigation). The operator-side check: a hidden-webview library POST returns 200 text/x-component, not the block page."
  fix_rationale: "Moving the two server-action POSTs onto a genuine browser network stack (the app's own webview) removes the fingerprint difference the rule keys on, and uses the webview's cookie jar (including __cf_bm) natively. Any Node/curl/reqwest change cannot, because every non-browser stack tried is blocked. This is the same conclusion as humble-reveal-key-fails round 7 (Electron net.request), re-applied to the Tauri shell."
  blind_spots: "(1) No authenticated POST was run from a webview (operator-only; needs a caller, 94-29/94-32). (2) WebKitGTK on Linux and WebView2 on Windows were not tested. (3) The date the rule appeared is unknown (between 2026-11-14 08:43 and 2026-11-25 18:42). (4) Which single attribute the rule keys on (TLS ClientHello, ALPN/HTTP2 settings, a bot score) is not isolated, and need not be. (5) The op has only run as a bare WKWebView; the Tauri/wry hidden window (window.eval, on_navigation, on_page_load) is unproven live. (6) A Cloudflare interactive challenge on the page GET cannot be solved in a hidden window; it would surface as humble_action_open:page-timeout."
  candidate_causes:
    - "config (external): Cloudflare WAF custom rule or Bot Management score threshold on Next-Action POSTs at humblebundle.com — CONFIRMED as the proximate cause"
    - "code: the adapter's request construction regressed since 11-13 — ELIMINATED (postLibraryAction unchanged since the live-verified commit; curl and reqwest, written fresh, reproduce)"
    - "environment: the operator's egress IP or ASN is newly scored — ELIMINATED (Chrome and WKWebView from the same machine and IP pass; GETs pass)"
    - "data: the body or session content trips a WAF content rule — ELIMINATED (anonymous POST with no session blocks; a bogus text/plain body with Next-Action blocks; header-less POST with the same path passes)"
  and_gate: "yes — two conditions must hold together: (1) the request carries Next-Action (server-action POST), AND (2) the client is not a browser network stack. Either alone passes (Probe E passes condition 1 absent; Chrome and WKWebView pass condition 2 absent). root_cause is therefore the pair: Humble's edge rule (external config) AND GameLib sending server-action POSTs from a non-browser stack (our transport choice, the part we control)."
tdd_checkpoint: null

## Session Loop
<!-- Read and written only by the checkpoint loop that drives gsd-debugger; gsd-debugger never edits it. OVERWRITE on each dispatch and each wait -->

goal: find_and_fix
tdd_mode: false
tdd_phase: none
resume_count: 0
awaiting: decision
question: Transport for the two Humble server-action POSTs (library filterUserLibrary and reveal/redeem): A hidden Humble webview (recommended), B TLS/HTTP2-impersonating Rust client, C drive Humble's own page client. Also: land first in the TS adapter or only with the Rust port (94-23..25)?
last_next_action: RETURN a decision checkpoint to the orchestrator; do not edit adapter.ts or Rust until the operator picks

## Symptoms
<!-- Written during gathering, then immutable -->

expected: A Humble library sync from a signed-in session fetches the filterUserLibrary server-action pages and fills the keys cache; the 94-10 real capture records those pages.
actual: Every GET succeeds (session-status JSON 200, /home/library HTML 200, 34 JS chunks 200, action id discovered), then the server-action POST to /home/library returns 403 with Cloudflare's "Attention Required!" HTML; the app logs "Humble sync: library fetch access_denied, cache untouched" and later syncs are skipped by the denial cooldown.
errors: "Humble sync: library fetch access_denied, cache untouched" (gamelib.log.old 18:42:46); "Humble sync: skipped — denial cooldown active until 2026-11-25T05:57:46.692Z"; capture console "captured 37 exchanges (session authenticated, library access_denied)"; HTTP 403, title "Attention Required! | Cloudflare", response sets __cf_bm.
reproduction: (1) `pnpm build:sidecar && pnpm tauri:dev`, connect Humble Bundle, let the sync run; (2) operator-only: export GAMELIB_HUMBLE_CAPTURE_COOKIE from the dev vault (`jq -r .sessionCookie "${TMPDIR}gamelib-dev-secret-vault.json"`) and run `GAMELIB_ORACLE_HUMBLE=forward pnpm exec jest --runTestsByPath src/backend/humble/__tests__/oracle/realCapture.oracle.test.ts`.
started: Unknown — the operator is not sure a Humble library sync has ever succeeded since the 2026-11-13 server-action rewrite or on the Tauri app; no successful Humble sync was found in this Mac's GameLib logs (Oct 23 – Nov 25). Prior art: resolved/humble-reveal-key-fails.md (2026-07-08) found Cloudflare Bot Management passes Node GETs but challenges Node POSTs on TLS fingerprint, fixed then via Electron net.request on persist:humble.

## Eliminated
<!-- APPEND only - prevents re-investigating after /clear -->

- hypothesis: "The Node (undici) stack is blocked uniquely, so a different non-browser client (curl, reqwest/rustls) would pass."
  evidence: system curl 8.7.1 over HTTP/2 (SecureTransport/LibreSSL) and a reqwest 0.13 + rustls(ring) client built with gamelib-humble's exact feature set both receive the same 4550-byte block page. The Rust port in 94-23..25 would be blocked identically.
  timestamp: 2026-11-25T07:00:00Z
- hypothesis: "undici's default headers (accept-language: *, sec-fetch-mode: cors, accept-encoding: gzip, deflate) or a missing sec-fetch-site/dest cause the block."
  evidence: Probe C (Safari-faithful set) and Probe G (full Chrome 157 set incl. sec-ch-ua*, sec-fetch-*, accept-language, priority) are still blocked.
  timestamp: 2026-11-25T06:58:00Z
- hypothesis: "The POST is blocked because it does not echo the __cf_bm cookie that every earlier GET set (the adapter keeps no jar)."
  evidence: Probes C and G fetched __cf_bm from a prior anonymous GET and sent it back; still blocked. (Browsers pass with only the __cf_bm their own page load set.)
  timestamp: 2026-11-25T06:58:00Z
- hypothesis: "The block depends on the session, the body or prevState (a content rule on key data or account fields)."
  evidence: Probe A has no cookie and the page-1 initial-state body, and gets the same block page; Probe D (text/plain, bogus action id, bogus path) is also blocked; real Chrome and WKWebView POSTing the same bodies pass.
  timestamp: 2026-11-25T06:55:00Z
- hypothesis: "Cloudflare blocks all non-browser POSTs to humblebundle.com."
  evidence: Probe E, a POST to /home/library without the Next-Action header, returns 200 text/html (the library page) through Node fetch. The rule is scoped to server-action POSTs.
  timestamp: 2026-11-25T07:01:00Z
- hypothesis: "A regression in GameLib's request construction since the 2026-11-13 live verification."
  evidence: `git diff a58e3e3e8 HEAD -- src/backend/humble/adapter.ts` changes only action-id-cache plumbing and an import path; postLibraryAction/postRedeemAction are byte-for-byte the live-verified requests. Independently written curl and Rust probes reproduce the block.
  timestamp: 2026-11-25T06:40:00Z
- hypothesis: "The operator's IP or ASN is newly flagged."
  evidence: A real Chrome and a WKWebView on the same machine and IP pass the edge for the same POST, and every GET passes.
  timestamp: 2026-11-25T07:05:00Z

- hypothesis: "The first Chrome and WKWebView anonymous probes (07:03, 07:05) proved a browser stack passes the edge on www.humblebundle.com."
  evidence: INVALIDATED. An anonymous /home/library finishes on www and then redirects to auth.humblebundle.com/login (WKWebView didFinish at 0.7 s www, 1.5 s auth, three runs). Those probes posted after the redirect, so their JSON 404 "Invalid path" was the auth host's. The two eliminations above that cite "Chrome and WKWebView pass" (session/body content; operator IP/ASN) are re-supported by the corrected probe at 06:42: a WKWebView page on www, same machine, same IP, same action id, gets 200 for the library shape and the origin's own 409 for the reveal shape while Node gets 403 for both.
  timestamp: 2026-11-25T06:42:00Z

## Evidence
<!-- APPEND only - facts discovered during investigation -->

- timestamp: 2026-11-25T06:05:00Z
  checked: redacted capture src-tauri/crates/gamelib-humble/tests/fixtures/recorded/real/sync/exchanges.json (37 exchanges)
  found: exchanges 1-36 are GET 200; exchange 37 is POST /home/library 403, body-37.html titled "Attention Required! | Cloudflare"; request Cookie carried only ory_session_*; response set __cf_bm.
  implication: the block is Cloudflare's edge, not Humble's session check (the same cookie authenticated the GETs).
- timestamp: 2026-11-25T06:05:00Z
  checked: ~/Library/Logs/GameLib/gamelib.log and gamelib.log.old
  found: 18:42:46 "Humble library: discovered filterUserLibrary action after 34 chunk fetches (of 38)" then "Humble sync: library fetch access_denied, cache untouched"; 18:46:05 sync skipped by denial cooldown; no successful Humble sync in any retained log.
  implication: the live app hits the identical block, so this is a product bug, not a capture-harness artefact.
- timestamp: 2026-11-25T06:40:00Z
  checked: src/backend/humble/adapter.ts (postLibraryAction, postRedeemAction, discoverActionId) + git history
  found: BOTH server-action POSTs use global Node `fetch` (undici) with a hand-built Cookie header (ory_session only). The seam transport (revealPost, hidden reveal window) and the Electron net.request transport from humble-reveal-key-fails rounds 6-7 were removed by commits 31a4f11df (2026-11-13) and a58e3e3e8 (2026-11-14, "legacy seam POST code removed"). `git diff a58e3e3e8 HEAD -- adapter.ts` shows only action-id-cache plumbing; postLibraryAction's request construction is byte-for-byte unchanged since the live-verified version.
  implication: the code path that fails today is the same one that worked on 11-13/11-14; the cause is a change in what Cloudflare does with it, not a regression in our request building.
- timestamp: 2026-11-25T06:40:00Z
  checked: resolved/humble-keys-sync-api-gone.md and resolved/humble-reveal-redeem-broken.md
  found: "LIVE VERIFY PASSED (macOS, operator) 2026-11-13 22:11:45: totalDocs=44 totalPages=9 pagesFetched=9 items=44, committed=44/44" for the same multipart filterUserLibrary POSTs; "Verified live 2026-11-14 08:43: GOG key revealed via redeemEntitlementAction (keyPresent=true, 9s)" for the Node-fetch text/plain POST. Local gamelib.log files only go back to Oct 25 plus today's (rotated), which is why the operator's "no successful sync in the logs" is true but not evidence of never working.
  implication: Node-fetch POSTs passed Cloudflare from this Mac 11 to 12 days ago. "Node transport fingerprint is always challenged" is falsified as stated; the July Electron-era failure was either a different rule set or the rule set has since been re-tightened.
- timestamp: 2026-11-25T06:45:00Z
  checked: recorded/real/sync/body-37.html (4550 bytes) and exchanges.json set-cookie names
  found: the page is Cloudflare's WAF rule block page ("Sorry, you have been blocked ... The action you just performed triggered the security solution ... a certain word or phrase, a SQL command or malformed data"), not a Managed Challenge ("Just a moment"). Every response in the capture (session-status, page HTML, all 34 chunks, and the 403) sets `__cf_bm`; the adapter keeps no cookie jar and never sends __cf_bm back, so the POST carries only ory_session_*. Also: the redacted fixture still contains the operator's public IP and the Cloudflare Ray ID in body-37.html (privacy leak in the untracked 94-10 files, flagged to the orchestrator).
  implication: a block-action WAF rule (custom rule or Bot Management score threshold) fired on the POST.
- timestamp: 2026-11-25T06:52:00Z
  checked: anonymous probe A (Node 22 fetch, adapter-shape multipart POST to /home/library, real public action id from the capture chunks, NO cookie)
  found: 403 text/html 4550 bytes, title "Attention Required! | Cloudflare", sets __cf_bm.
  implication: the block is independent of the session; it fires at the edge on the request shape alone, which makes the whole investigation testable without the operator's cookie.
- timestamp: 2026-11-25T06:54:00Z
  checked: anonymous probe B (system curl 8.7.1, HTTP/2, SecureTransport/LibreSSL, same headers and `-F` fields in the same order)
  found: 403 text/html 4550 bytes, same block page, http=2.
  implication: a different TLS library and HTTP/2 do not help; not Node-specific.
- timestamp: 2026-11-25T06:56:00Z
  checked: anonymous probe C (one GET to obtain __cf_bm, then Node fetch POST echoing it with Safari-faithful headers incl. sec-fetch-site/mode/dest, accept-language en-US, priority)
  found: GET 200; POST 403 block page.
  implication: headers plus the cookie echo are not enough.
- timestamp: 2026-11-25T06:58:00Z
  checked: anonymous probe D (reveal-shaped POST: text/plain JSON body, made-up 42-hex action id, path /home/library/0000000000000000)
  found: 403 block page.
  implication: the reveal POST (redeemEntitlementAction) is blocked too, so a keys-only fix to the library path would leave reveal broken.
- timestamp: 2026-11-25T07:01:00Z
  checked: anonymous probe E (Node fetch POST to /home/library WITHOUT a Next-Action header, text/plain `[]`)
  found: 200 text/html 162427 bytes (the library page).
  implication: the rule is scoped to server-action POSTs (the Next-Action header), not to POST or to the path.
- timestamp: 2026-11-25T07:03:00Z
  checked: real Chrome 157 (/Applications/Google Chrome.app, --headless=new, fresh temp --user-data-dir, HeadlessChrome token removed from the UA) navigated anonymously to /home/library, then an in-page fetch POST with the same Next-Action id, router-state-tree and multipart body, driven over the DevTools protocol
  found: 404 application/json, 155 bytes, `{"error":{"code":404,"details":{"ruleId":"6176b3cb"},"message":"Invalid path"...}`; cfBlockPage=false.
  implication: a genuine browser stack gets past the Cloudflare edge with the same request (the JSON 404 is an origin-side answer for an anonymous session).
- timestamp: 2026-11-25T07:05:00Z
  checked: WKWebView (compiled Swift probe, non-persistent data store, offscreen window, anonymous) loading /home/library then `callAsyncJavaScript` POST, same request
  found: identical to Chrome — 404 application/json 155 bytes, ruleId 6176b3cb, cfBlockPage=false.
  implication: the app's own macOS engine passes the edge, so a webview transport is viable on macOS.
- timestamp: 2026-11-25T07:08:00Z
  checked: anonymous probe G (Node fetch with the full Chrome 157 header set incl. sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, sec-fetch-*, accept-language, priority, accept-encoding with br/zstd, plus __cf_bm echo) and a reqwest 0.13 + rustls(ring) probe (gamelib-humble's exact features: HTTP/1.1, hand-built multipart body)
  found: both 403 block page (reqwest reported http=HTTP/1.1).
  implication: Chrome-faithful headers do not move the verdict; the rule keys on the transport below the header layer. The planned reqwest/rustls port of the adapter (94-23..25) would be blocked on day one.
- timestamp: 2026-11-25T07:09:00Z
  checked: src-tauri/src/login_window/humble_reveal.rs, src/backend/login/loginWindowSeam.ts, src/backend/sidecar/loginSeamRegistration.ts
  found: the hidden-window transport still exists end to end: Rust arm `rpc_humble_reveal_post` (hidden WebviewWindow on the Humble origin, in-page `fetch()` with `credentials: 'include'`, result exfiltrated through a `location.href` to non-resolvable `gamelib.invalid` and intercepted in `on_navigation`; 20 s timeout; window closed on every path), the TS `LoginWindowSeam.revealPost`, and the sidecar registration. Only the adapter's call to it was deleted on 2026-11-14. Its limits for this use: it sends a form-urlencoded body with only Content-Type/Accept/csrf-prevention-token headers, evals immediately after build without waiting for the page load, and loads the bare origin URL rather than /home/library.
  implication: option A (webview transport) is an extension of existing, tested code (arbitrary headers, an in-page multipart `FormData` with the root part appended last, text/plain support, wait for page load, load the page path), not a new subsystem.

- timestamp: 2026-11-25T06:38:00Z
  checked: the REAL script text (ACTION_SCRIPT_HEAD parsed out of humble_action.rs, plus one JSON value) run in a live WKWebView (swift probe, non-persistent store, no operator profile), page /home/library, navigation to gamelib.invalid cancelled in decidePolicyFor (what on_navigation does)
  found: node --check passes. The reply came back through the intercepted navigation (86 chars) and decoded to `{"status":0,"error":"origin-mismatch",...}`: the page had already redirected to https://auth.humblebundle.com/login, so the script's origin guard refused to post. The guard works; the finding is that an anonymous /home/library does not stay on www.
  implication: (1) the script, the return channel and the guard function in a real engine; (2) the earlier "browser passes on www" probes were run on the auth origin and are invalid (Eliminated 06:42); (3) open() must wait for the page to settle and must reject a cross-origin landing.
- timestamp: 2026-11-25T06:41:00Z
  checked: WKWebView didFinish timing for an anonymous /home/library, three runs
  found: first finish on www at 793, 679, 737 ms; second finish on auth.humblebundle.com/login at 1533, 1438, 1453 ms (gap 740, 759, 716 ms).
  implication: a 1.5 s quiet window (about twice the gap), capped at 4 s, catches the redirect; open_action_session now settles and then fails with humble_action_open:redirected:<host> when the page is off its origin.
- timestamp: 2026-11-25T06:42:00Z
  checked: the same real script from a page that STAYS on www (https://www.humblebundle.com/ and /store), multipart library shape, public action id, anonymous, versus a Node undici control (probeA) in the same minute
  found: WKWebView in-page POST to https://www.humblebundle.com/home/library: 200, content-type text/x-component, 224 chars, not a block page; body is Humble's flight reply with `"error":"not_authenticated"` (the action handler ran). Node undici, same URL, action id and body shape: 403, text/html, 4550 bytes, "Attention Required! | Cloudflare", server: cloudflare, __cf_bm set.
  implication: the browser-stack-passes half of the AND-gate is now evidenced on www itself; the fix's mechanism is real. The reply is 575 chars of base64url and decodes under the Rust decoder (golden test a_reply_emitted_by_a_real_wkwebview_decodes_into_the_documented_result).
- timestamp: 2026-11-25T06:43:00Z
  checked: the text body kind (reveal shape): POST /home/library/0000000000000000, content-type text/plain;charset=UTF-8, made-up action id, from a www page in WKWebView, versus Node (probeD)
  found: WKWebView: 409 text/plain "Server Action unavailable." (Next's own answer to an unknown action id, 26 chars). Node: 403 block page, 4550 bytes.
  implication: the reveal POST (redeemEntitlementAction) is fixed by the same transport; the text path of the script works in a real engine.
- timestamp: 2026-11-25T06:46:00Z
  checked: verification of the landed code (cargo test -p gamelib-shell, clippy, jest gates, check:ipc-contract, prettier, hand-seeded mutants)
  found: 61 humble_action tests and 988 shell tests pass (2 ignored, pre-existing); clippy reports 0 findings in the new module (two were fixed: manual_hash_one, assertions_on_constants); check:ipc-contract in sync; jest tauriShellSource (298), rustInvokeSchemas, longRunningChannels, rustInvokeChannel, rustChannelAllowlist, humbleShortcutsShimSchedule pass; prettier clean on the five TS files. 14 hand-seeded mutants (no Rust mutation tool exists here): 12 killed, 2 survive and are equivalent (the origin join in validate_same_origin_path is defence in depth behind the shape checks, test accepted_paths_stay_on_the_origin pins that; the stale-reply drain in post_action is redundant with the per-request id check). Pre-existing failures NOT caused by this change: humbleFixtureRedaction (2 tests, same offenders at HEAD, from the untracked recorded/real/ capture) and engineWine/launchPort suites (a concurrent edit of fakeLauncherDeps.ts by another agent).
  implication: everything that can be verified without a signed-in session and a Rust caller has been.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: Cloudflare in front of www.humblebundle.com blocks Next.js server-action POSTs (any POST carrying a `Next-Action` header) from clients that are not a real browser network stack, returning its WAF block page (403, "Sorry, you have been blocked", 4550 bytes) before Humble's session check. The sidecar sends both server-action POSTs (filterUserLibrary and redeemEntitlementAction) from Node undici, so every library page and every reveal is blocked; the Rust port's planned reqwest/rustls transport would be blocked identically (curl and reqwest/rustls were tested). It is an AND of two conditions: Humble's edge rule (external; appeared or tightened between 2026-11-14 08:43 and 2026-11-25 18:42, because the same Node-fetch code passed live on 2026-11-13 and 2026-11-14) and GameLib's non-browser transport (ours). Header sets, a cookie echo, HTTP/2, a different TLS library and reqwest/rustls all fail to clear it. Evidence note: a real WKWebView page on www.humblebundle.com running the identical request gets through (200 text/x-component for the library shape; the origin's own 409 for the reveal shape) in the same minute Node gets 403; the earlier Chrome/WKWebView probes were on the auth origin and are superseded.
fix: LANDED as a shared Rust shell op, Rust port only (no edit to src/backend/humble/adapter.ts or any TS Humble adapter/sync/user code, per the operator). New `src-tauri/src/login_window/humble_action.rs` and three rustInvoke channels (`humble_action_open`, `humble_action_post`, `humble_action_close`; TS contract in sidecarTransport.ts and ipc/rustInvoke.ts, ipc_contract.rs regenerated). One hidden Humble webview is opened on a Humble page (https, a humblebundle.com host, optional UA), the open waits for page-load-finished and then for 1.5 s of quiet (capped 4 s), and a page that ends off its origin fails with `humble_action_open:redirected:<host>` (an unauthenticated /home/library redirects to auth.humblebundle.com about 0.7 s after it finishes). Any number of POSTs then run as in-page `fetch()`: caller headers from an allowlist (accept, content-type, next-action, next-router-state-tree, next-url), a multipart body built in an in-page FormData in the caller's order (root part `0` last stays last, no Content-Type set so the engine writes the boundary) or a text body, optional same-origin referrer, redirect follow or manual. Result `{status, body, contentType, url, redirected, type}`; a 403 is a normal result. The script is a fixed head plus one JSON value (no placeholder splicing), guards `location.origin` before fetching, and reports through the existing navigation-intercept channel to gamelib.invalid as base64url (about 1.33x, not up to 6x), over-size replies reported as response-too-large. Shutdown contract: a `gamelib_core::shutdown::global()` registrant named `humble_action` held for exactly the in-flight open or post, every wait bounded (20 s page, 30 s post) and cancelled within 100 ms by the shutdown token; no process spawned; an idle watcher closes a session after 120 s without a post; at most 2 sessions; close is explicit and idempotent. The existing `humble_reveal_post` and `humble_login_clear_storage` arms are untouched. Also: the block-page guard in src/backend/__tests__/humbleFixtureRedaction.test.ts (rule "Cloudflare block page", keyed on cf-error-details / Cloudflare Ray ID / cf-footer-ip / Your IP, never on a dotted quad), and the dispatch-arm and channel-count pins (202 to 205) in tauriShellSource.test.ts and rustInvokeSchemas.test.ts.
verification:
  target_test: { result: pass, note: "No unit test can reproduce a Cloudflare edge decision. The driving evidence is a same-session differential (Node undici 403 vs the real script in a real WKWebView 200), plus 61 humble_action tests including a golden reply captured from that real WKWebView run." }
  mutation_check: { result: skipped, reason_if_skipped: "no Rust mutation tool configured (cargo-mutants absent; Stryker is TS-only). Substituted 14 hand-seeded mutants at the fix's decision points: 12 killed, 2 survive and are equivalent (redundant defence in depth, see Evidence 06:46)", mutant_killed: "12 of 14" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: false, note: "Additive change: one new module, three new channels, one new test rule; the only edits to existing lines are the two count pins." }
  adjacent_tests: { result: pass, suites_run: ["cargo test -p gamelib-shell (988 passed, 2 ignored)", "jest tauriShellSource, rustInvokeSchemas, longRunningChannels, rustInvokeChannel, rustChannelAllowlist, humbleShortcutsShimSchedule, the six *ChannelParity suites", "jest src/backend/__tests__ + sidecar + host + common sweep: only pre-existing failures"], note: "Pre-existing, not caused by this change: humbleFixtureRedaction x2 (same offenders at HEAD, from the untracked recorded/real/ capture owned by 94-10) and engineWine/launchPort x3 (concurrent edit of fakeLauncherDeps.ts by another agent)." }
  revert_and_reconfirm: { result: partial, bug_returned_on_revert: "mechanism level yes: swapping the transport back to Node undici returns the 403 block page in the same minute", fixed_on_reapply: "mechanism level yes: the real script in a real WKWebView returns 200", note: "Application level not run: the op has no caller until the Phase 94 Rust adapter exists, so a live app sync cannot be re-run; the operator accepted that the live app stays broken until 94-29." }
  guardrail_verdict: accepted_debt
  rejected_signal: "none rejected; unmet: authenticated end-to-end revert-and-reconfirm (no caller until 94-29). Debt accepted by the operator's landing decision (Rust port only), owed to the 94-29/94-32 live gate."
oracle_type: derived (a golden reply captured from a real WKWebView run, decoded through the Rust decoder) plus a differential (undici 403 vs WebKit 200). Not implicit.
files_changed:
  - src-tauri/src/login_window/humble_action.rs (new)
  - src-tauri/src/login_window.rs
  - src-tauri/src/main.rs (SHELL_SOURCE_FILES and SHELL_SOURCE_PARTS)
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/ipc_contract.rs (generated)
  - src/common/types/sidecarTransport.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
  - src/backend/__tests__/humbleFixtureRedaction.test.ts
replan_required: |
  Plans 94-10, 94-23, 94-25 and 94-26 must be replanned to send the two server-action POSTs through this op, not reqwest.
  - 94-10 (capture): record the two POSTs by operator HAR export, or capture through this op (open on /home/library, post, close). A reqwest forward capture will always record the 403 block page.
  - 94-23 and 94-25 (library sync) and 94-26 (reveal): call `open_action_session` / `post_action` / `close_action_session` (shell Rust) or the three `humble_action_*` channels; GETs (session status, page HTML, JS chunks, action-id discovery) stay on reqwest. gamelib-humble has no tauri dependency, so the adapter needs a small transport trait implemented in the shell over these three functions.
  - Callers must read `humble_action_open:redirected:<host>` as "signed out" and must close the session in every path (the idle watcher is a backstop, not the plan).
  - The webview carries the cookie from the shared jar; a vault-only cookie is not sent. If the jar lacks the session the open rejects as redirected.
unverified:
  - an AUTHENTICATED in-webview POST (library page and reveal) through the Tauri hidden window: needs the operator's session and a Rust caller (94-29/94-32)
  - the Tauri/wry plumbing as a whole in a live app (window.eval, on_navigation, on_page_load, WebviewWindowBuilder from a worker thread); only the script and the return channel were run, in a bare WKWebView
  - WebKitGTK on Linux and WebView2 on Windows (and whether Cloudflare treats them as browsers); also Chromium's 2 MB URL cap behaviour at the 1.2 MB response limit
  - a Cloudflare interactive challenge on the page GET (would surface as humble_action_open:page-timeout)
  - `init.referrer` honoured by each engine
live_gate_recipe: |
  Once a caller exists (94-29): sign in to Humble in the app, run a sync, and check ~/Library/Logs/GameLib/gamelib.log for `humble_action_open: page loaded, session open` then one `humble_action_post: status=200 bytes=N` per library page (N in the thousands, not 4550), and no `access_denied`. A status=403 with bytes=4550 means the edge still blocks the webview too (the AND-gate's second half is then false for authenticated Tauri windows).
