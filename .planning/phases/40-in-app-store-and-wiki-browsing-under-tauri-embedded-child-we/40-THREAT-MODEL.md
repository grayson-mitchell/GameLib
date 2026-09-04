# Phase 40 Plan 04: Store/Wiki Embed Threat Model

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote store origin → Tauri IPC | The Tauri global is injected into remote pages (spike 014b). Remote origins get eligibility only via a capability remote-url grant, which no capability declares. |
| remote store origin → OS | `window.open`, downloads and custom URL schemes are the three ways a store page reaches outside the webview. |
| store embed → shared cookie jar | One jar per process holds every store's session and is readable from any webview handle, including the embed's. |
| renderer → Rust logout path | The logout path deletes credentials and cookies; a partial failure that skips the credential is a security regression, not a cosmetic one. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-40-04-01 | Elevation of Privilege | ACL window-leg inheritance by the store embed | mitigate | Task 1 proves the conjunction: no capability declares a remote-url grant (the control that denies a remote origin any match), plus a defence-in-depth attempt to scope `default.json` by webview rather than window, verified against every renderer window-chrome call or reverted with the falsification recorded. |
| T-40-04-02 | Elevation of Privilege | `gamelib://` reached from a store page | mitigate | Task 2 returns false from `on_navigation` for the app's own scheme and logs the block. This is the sharpest edge in the phase — it would let a store page drive the app. |
| T-40-04-03 | Elevation of Privilege | unknown URL schemes | mitigate | Task 2's policy is default-deny on any scheme outside the enumerated set, implemented in a named unit-tested function rather than an inline closure. |
| T-40-04-04 | Tampering | store-page-initiated downloads | mitigate | Task 2 returns false from `on_download` and routes the URL to the system browser. A store page cannot write to disk through the app. |
| T-40-04-05 | Spoofing | `window.open` popups rendered inside the app frame | mitigate | Task 2 returns the deny variant from `on_new_window` and routes to the system browser, where the URL bar and the user's password manager both work. |
| T-40-04-06 | Information Disclosure | shared default cookie jar | accept | D-14: one jar per process is retained deliberately. Isolation would break the store tab carrying the user's login, which is the only reason the tab is worth having, and is macOS 14+ only. Recorded as an accepted cost with its rationale in `40-THREAT-MODEL.md`. |
| T-40-04-07 | Information Disclosure | stale session cookies surviving logout | mitigate | Task 3 clears GOG and Amazon hosts at default-data-store level through the existing verified helper. The embed is what makes this user-visible for the first time. |
| T-40-04-08 | Repudiation | a cookie clear that reports success while deleting nothing | mitigate | wry's delete is known to lie. The helper measures with an independent before/after all-cookies re-read; Task 3 consumes that count and warns on zero-against-non-empty, proven by a unit test. |
| T-40-04-09 | Denial of Service | store checkout broken by over-restriction | mitigate | D-28 forbids an origin allowlist. Task 2 leaves ordinary https navigation free and an acceptance criterion requires the SUMMARY to state that no allowlist exists. |
| T-40-04-SC | Tampering | npm/pip/cargo installs | mitigate | This plan adds no package. Every mechanism used already exists in the tree or in an already-resolved crate. If `Cargo.lock` or `pnpm-lock.yaml` gains an entry, stop for a blocking package-legitimacy checkpoint. |

## Controls verified

### D-26 corrected: the capability grant is a two-leg conjunction, not a single check

The original D-26 assertion ("no capability lists the embed label, therefore the embed has no
IPC access") was imprecise about *why*. `Window::add_child` (`src-tauri/src/main.rs:4743`)
creates `store-embed` as a genuine child webview of the `main` window. Tauri's own access
resolution ORs two legs together, it does not AND them:

- **Window leg** — `tauri-2.11.5/src/ipc/authority.rs:457-459`, inside
  `RuntimeAuthority::resolve_access`: `cmd.windows.iter().any(|w| w.matches(window))`. Because
  `default.json` is scoped `"windows": ["main"]` with no `webviews` key, and
  `tauri-utils-2.9.3/src/acl/capability.rs:150-161`'s own doc comment states a window match
  "will be enabled on all the webviews of that window, regardless of the value of `webviews`",
  **`store-embed` DOES match this capability on the window leg** — exactly like every other
  webview of `main`. The original D-26 wording ("no capability lists the embed label") is true
  as a literal string search but is not the reason IPC is denied.
- **Origin leg** — `tauri-2.11.5/src/ipc/authority.rs:57-67`, `Origin::matches`. A `Remote`
  origin (which is what `store-embed` has, since it loads `tauri::WebviewUrl::External(url)`)
  only matches a capability's resolved command if that capability's execution context carries a
  `Remote` grant — which only exists if the capability declares a `remote.urls` entry. **This is
  the leg that actually denies `store-embed` IPC eligibility**, because no capability in this
  repository declares `remote`.

Both legs must be true for a command to resolve; `store-embed` satisfies the window leg but
fails the origin leg, so command resolution fails overall. The corrected framing: the embed's
IPC denial rests entirely on the absence of a `remote` grant, not on window/webview scoping.

#### Half (i) — PRIMARY control, verified by direct grep + source citation

Command run from the repo root:

```
$ grep -rn "remote" src-tauri/capabilities/
```

Output (post this plan's edits, description prose only — no `"remote"` config key anywhere):

```
src-tauri/capabilities/default.json:4:  "description": "... (prose mentions of the word
  "remote" inside this plan's new paragraph, and inside the pre-existing paragraphs about
  remote content in the main window) ..."
```

No line contains a `"remote":` JSON key. `default.json` is the only capability file in
`src-tauri/capabilities/`. Because `Origin::matches` (`authority.rs:57-67`) requires exactly
that key to grant a `Remote` origin any eligibility, and it is absent, `store-embed` (and any
other remote-origin webview in the process) cannot resolve any command — this is the load-bearing
control referenced by T-40-04-01.

#### Half (ii) — DEFENCE-IN-DEPTH attempt: scope `default.json` to `"webviews": ["main"]`

Per the plan's mandate, a second, independent control was attempted: switch the capability's
matching mechanism from the window leg to the webview leg, which would exclude `store-embed`
from matching via window inheritance and leave the origin leg as the only leg in play (belt and
suspenders — even if the origin leg were ever misconfigured, the webview leg would still deny
the embed).

Steps taken:

1. Edited `src-tauri/capabilities/default.json`, changing `"windows": ["main"]` to
   `"webviews": ["main"]`.
2. Ran `cd src-tauri && cargo check` — passed cleanly (`Finished` in ~4.8s; the build directory
   was briefly lock-contended by a concurrent process, see below).
3. Before proceeding to interactive verification of all thirteen renderer window-chrome calls
   (`minimize`, `maximize`, `toggleMaximize`, `unmaximize`, `close`, `startDragging`,
   `setFullscreen`, `isFullscreen`, `isMaximized`, `isMinimized`, `setDecorations`,
   `setTitleBarStyle`, `setZoom`) plus `create-webview-window`, ran `ps aux | grep -i
   "tauri\|gamelib-shell\|vite"` and found a live, already-running `pnpm tauri:dev` session on
   this machine: an active `tauri dev` process, `pnpm exec vite`, a running
   `target/debug/gamelib-shell` binary, and a running sidecar process — all with real PIDs, not
   leftover artifacts.
4. This executor runs non-interactively with no way to drive that already-live app window (no
   click automation is safe here; see project memory
   `driving-the-tauri-web-inspector-console` — a wedged Web Inspector console runs nothing — and
   `tauri-dev-noops-against-a-running-instance` — a second `tauri:dev` invocation would not
   replace the running instance, it would silently no-op). Attempting to drive that session
   risks corrupting a concurrent human session's state; spawning a second isolated instance to
   test in is not equivalent to verifying the actual shipped capability file end-to-end, and
   cannot be done leak-free without terminating a session this executor does not own.
5. Because full end-to-end verification of every window-chrome call could not be completed
   safely and reliably in this autonomous run, the change was **reverted**:
   `"webviews": ["main"]"` → `"windows": ["main"]` (original value, unchanged from before this
   plan). `git diff` on `default.json` before the description edit showed only that single
   line changed and reverted, net no-op on the `windows`/`webviews` key.

**Disposition: the defence-in-depth webview-scoping change was evaluated and reverted. This is
recorded as a deliberate, plan-sanctioned outcome, not a failure** — the plan explicitly frames
this as acceptable ("If ANY of those breaks, REVERT the scoping, record the falsification... and
keep half (i) as the sole control"; "a revert recorded in writing is a success, not a failure").
Half (i) (the absent `remote` grant / origin-leg denial) remains the sole shipped control for
T-40-04-01, and is sufficient on its own per the conjunction analysis above — the window leg
was never the actual denying mechanism, so reverting to `"windows": ["main"]` does not reopen
this threat.

A paragraph was appended to `default.json`'s `description` field documenting this entire
finding in place, naming `STORE_EMBED_LABEL`, the ACL leg it matches, the revert, and an
explicit prohibition: `store-embed` must never be added to a capability that declares a
`remote.urls` grant naming any origin the embed navigates to (GOG, Amazon, Zoom, Steam,
PCGamingWiki, or any `store-page?store-url=` deep-link target) — doing so is the one
configuration change that would actually grant those origins IPC eligibility.

### T-40-04-06 acceptance rationale (recorded per D-14)

The shared default cookie jar is a single `WKWebsiteDataStore::defaultDataStore()` per process.
Every store webview (main window's store-search surface, the Humble login flow, and now
`store-embed`) reads and writes the same jar. This is retained deliberately: a per-webview
isolated data store is macOS 14+ only and would break the entire reason the embed exists —
carrying the user's existing GOG/Amazon/Zoom login into the embedded tab. The cost this accepts
is that any webview handle in the process can technically read another store's session cookie;
the mitigations for the *consequence* of that (stale sessions surviving logout) are handled
separately as T-40-04-07/T-40-04-08, which are mitigated in Task 3, not accepted.
