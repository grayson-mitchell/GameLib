---
status: resolved
trigger: "Steam store page 'remote install' asks for a Steam sign-in even though the store is already signed in"
created: 2026-10-30
updated: 2026-10-30
source_todo: .planning/todos/pending/2026-10-28-steam-store-remote-install-asks-to-sign-in-again.md
---

## Current Focus

hypothesis: (none yet) candidates from the todo — (a) Steam's remote install needs a session the embed's store cookie does not supply; (b) the prompt comes from a popup/new window or cross-origin step that loses the store session; (c) even when signed in it targets a real Steam client, not GameLib, so the right answer may be hide/intercept rather than make it work.
test:
expecting:
next_action: LIVE CHECKPOINT (see return); previously: gather initial evidence — what the "remote install" control on store.steampowered.com actually does (URL/XHR, which host, which cookie it needs — steamLoginSecure is per-host: store.steampowered.com vs steamcommunity.com vs login.steampowered.com), and how the embed handles new-window / target=_blank / cross-host navigation (useStoreEmbedHost.ts, src-tauri/src/main.rs new-window handling)
reasoning_checkpoint:
tdd_checkpoint:

## Symptoms

expected: In GameLib's embedded Steam store, clicking "remote install" on a store page for an owned game either works without a second sign-in (the store embed is already signed in), or is replaced/hidden by GameLib's own Install path.

actual: Clicking "remote install" asks the user to sign in to Steam, although the store website in the same embed is already signed in.

errors: None reported; the symptom is the sign-in prompt itself.

timeline: Reported by the user 2026-10-28 while buying Undertale (391540) in the embedded store. Not known whether it ever worked.

reproduction: On macOS, open the in-app Steam store (/store/steam), sign in, open an owned game's store page (e.g. Undertale 391540), click "remote install".

constraints:
- Decision is the user's: support, hide, or reroute remote install to GameLib's own Install. Checkpoint with root cause + options before implementing any of them.
- GameLib does not run a Steam client remote install could target the way Valve expects; bridge/native installs go through GameLib's own depot path.
- Embed rules (Skill spike-findings-gamelib, references/tauri-embedded-store-browser.md and tauri-login-webview-cookies.md): one cookie jar per process; never cookies_for_url(); relay navigation from on_page_load; renderer owns embed geometry.
- Live checks need the user at the machine (checkpoint them). Restart tauri dev after backend changes (it does not rebuild the sidecar; check sidecar.js mtime).
- Load Skill gamelib-conventions before writing spawn/test code or todo/UAT edits; <verify> prettier checks scoped to exact paths.

## Eliminated

- hypothesis: (b-popup) remote install opens a new window with a separate cookie store
  evidence: on_new_window in store_embed_open denies every popup and hands http(s) to the SYSTEM browser (D-28); a popup never loads in a second embed webview. The system browser has NO Steam session, so a popup-borne sign-in would look exactly like "asks me to sign in again" (still open, not eliminated as a cause, only as an in-embed cookie split).
  timestamp: 2026-10-30

## Evidence

- timestamp: 2026-10-30
  checked: src-tauri/src/main.rs store_embed_open (L6567-6720), store_embed_navigation_policy (L6393)
  found: the embed is a child webview of the main window (same WKWebsiteDataStore, one cookie jar), UA override only, no data-store isolation. Navigation: http(s) Allow; steam: Handoff to open_external (Steam.app) only when top-level host is a Valve host, throttled 2s; window.open -> system browser; downloads -> system browser. Nothing in the code special-cases remote install.
  implication: GameLib cannot make Steam's remote-install UI "work or not"; any steam:// it emits is bounced to the OS Steam client, and any popup lands in a cookie-less system browser.
- timestamp: 2026-10-30
  checked: ~/Library/Application Support/Steam/logs (console_log, connection_log, loginusers.vdf)
  found: logs only retain 10-30 (nothing from the 10-28 repro; no 391540 or steam://install lines). A Steam client IS installed and logs on/off repeatedly (GameLib's go-offline/goonline wrap), signed in via JWT, RememberPassword=1.
  implication: no direct evidence of what the click did; needs a live repro with logging.
- timestamp: 2026-10-30
  checked: live, user at the Mac — Undertale (391540) store page in the embed
  found: page shows the "in your library" banner AND "Add to Cart". The banner is rendered from Steam's per-user dynamic data, so the embed's store session is signed in and recognised. Add to Cart alongside it is normal Steam behaviour for an owned game (the purchase box stays so it can be bought as a gift), not a session inconsistency.
  implication: the store cookie works in-page; the sign-in prompt on remote install is not a general embed sign-in failure. Still need where the prompt appears on click (in-page / system browser / Steam.app).
- timestamp: 2026-10-30
  checked: live, same page, owned game
  found: no "remote install" control on the owned-game store page.
  implication: not reproducible from the product page. The original 10-28 report came while BUYING Undertale, so the control was most likely on the post-purchase / checkout-receipt page (Steam offers install-to-device there). Repro needs a purchase or free-license claim flow.

## Resolution

root_cause: Not a GameLib defect. The control is Steam's own post-purchase "Remotely Install - <device> | <OS>" offer (live 2026-10-30: "Remotely Install - BigRazer | PC", the user's Windows gaming PC). It targets another signed-in Steam client via Valve's remote-downloads feature and behaves the same in any browser. The in-app store's session is signed in and recognised (owned-game page shows the in-library banner). The 10-28 sign-in prompt was not reproduced.
fix: none — closed as not-a-bug by the user.
verification: live, user at the Mac, 2026-10-30 — post-purchase page in the embed offered remote install to BigRazer.
files_changed: []
- timestamp: 2026-10-30
  checked: live, user bought another game in the embed
  found: post-purchase page offers "Remotely Install - BigRazer | PC" (the user's Windows gaming PC). User: "this would work the same on any interface".
  implication: Steam's remote-downloads feature targeting another Steam client; not GameLib's concern. Closed.
