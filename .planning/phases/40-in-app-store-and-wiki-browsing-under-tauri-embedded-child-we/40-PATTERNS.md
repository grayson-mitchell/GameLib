# Phase 40: In-app store and wiki browsing under Tauri — Pattern Map

**Mapped:** 2026-09-04
**Files analyzed:** 17 (create/modify), plus 3 shared cross-cutting patterns
**Analogs found:** 13 / 17 (4 have no strong in-repo analog — see "No Analog Found"; the spike
reference doc stands in for those)

**No RESEARCH.md this phase** — spikes 016/017/018 (`tauri-embedded-store-browser.md`) and
013–015 (`tauri-login-webview-cookies.md`) are the technical source, verified against vendored
crate sources and live hardware. Every Rust excerpt below is either (a) copied from code already
shipped in `src-tauri/src/main.rs`, or (b) the proven shape from the spike reference doc, marked
as such — there is no shipped `add_child` call in the repo yet to copy from.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src-tauri/Cargo.toml` | config | N/A | same file, lines 20-30 / 95-101 (existing `[target.'cfg(target_os = "macos")'.dependencies]` block) | exact — the target-gate mechanism this file already uses for other deps |
| `src-tauri/src/main.rs` — embed lifecycle commands (`store_embed_open`/`hide`/`show`/`close`, `set_embed_bounds`) | route (Rust command-dispatch arm) | request-response | `humble_reveal_post` / `humble_login_clear_storage` arms (`main.rs:985-1050`) | role-match (command shape, arg parsing, error strings) |
| `src-tauri/src/main.rs` — `add_child` construction itself | route (embed creation) | event-driven (page-load callbacks) | **no shipped analog** — proven shape is `tauri-embedded-store-browser.md`'s "Create the embed" section; nearest shipped sibling is `open_pristine_epic_login_window` (`main.rs:2924`, `WindowBuilder::build()` + main-thread confinement pattern) | partial — thread-confinement pattern only |
| `src-tauri/src/main.rs` — cookie clear at `WKWebsiteDataStore` level (D-15) | service (cookie management) | CRUD (delete) | `cookie_domain_matches` (`main.rs:1823`) + its call site around `main.rs:960-975` (`delete_cookie` loop) | exact — same comparator, same delete-then-verify shape |
| `src-tauri/src/main.rs` — navigation history stack / host display (D-22/D-23) | service (in-memory state) | event-driven | `WakeLockRegistry` (`main.rs:4225-4270`, id-keyed `HashMap` behind one `Mutex`, `allocate`/`forget`) | role-match (registry-behind-a-mutex shape, not id semantics) |
| `src/backend/humble/loginWindowSeam.ts`-equivalent: new `src/backend/store/storeEmbedSeam.ts` (interface + `setStoreEmbedSeam`/`getStoreEmbedSeam`) | service | request-response | `src/backend/humble/loginWindowSeam.ts` (full file) | exact |
| `src/backend/sidecar/storeEmbedFlowRegistration.ts` (new) | service (IPC registration) | request-response | `src/backend/sidecar/humbleLoginFlowRegistration.ts` (full file) | exact |
| `src/common/types/sidecarTransport.ts` — new `RUST_STORE_EMBED_*` constants | config (channel name constants) | N/A | `RUST_HUMBLE_LOGIN_*` block, `sidecarTransport.ts:296-425` | exact |
| `src/frontend/screens/WebView/index.tsx` (full rewrite) | screen/controller | request-response + event-driven | itself (pre-image) — retire Model A branches, keep route-URL map, `validStoredUrl`, adtraction Dialog shape | self (rewrite in place) |
| New chrome component (rebuilt `WebviewControls`, D-24) — e.g. `src/frontend/components/UI/StoreEmbedControls/index.tsx` | component | request-response (Rust-reported state, not synchronous query) | `src/frontend/components/UI/WebviewControls/index.tsx` (full file, for layout/JSX/i18n keys) — **control inverts**, do not copy the `canGoBack()`/event-listener wiring | role-match, structural only |
| New suppression hook/context (D-20) — e.g. `src/frontend/components/UI/NavShell/StoreEmbedSuppressionContext.tsx` | provider/hook | event-driven | `src/frontend/components/UI/NavShell/Tier2PortalContext.tsx` (full file) for the Context/Provider shape; **no ref-counting analog exists in the frontend** — see "No Analog Found" | partial (shape only, not the counting logic) |
| New placeholder component (D-19) | component | N/A (pure render) | `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` (styling/class-naming convention) | role-match |
| `src/frontend/screens/WebView/components/HumbleLoginSurface.tsx` (edit: delete dead effects/render) | component | request-response | itself (pre-image) — keep the `TauriLoginPanel` return path and the login-watch effect; delete `webviewRef`, the two Model-A `useLayoutEffect`s, the `<webview>` render | self |
| `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` (edit: D-02/D-08 reword) | component | N/A | itself (pre-image) | self |
| `src/backend/platform/types.ts` (edit: delete `WebviewTag`/`DidFailLoadEvent` shim) | model/type | N/A | itself, `types.ts:167-230` | self |
| `src/backend/platform/index.ts` (edit: drop re-export at `:1128`) | model (barrel) | N/A | itself | self |
| `src/backend/platform/__tests__/types.usage.test.ts` (edit: delete pinned assertions) | test | N/A | itself, `assert_webviewTag()` section (`:216-280`, `:670`) | self |
| New mechanical predicate gate (D-13) — phase-dir `model-a-retirement-gate.py` | test (planning gate) | batch | `.planning/phases/34.4.1-.../seam-parity-sweep-gate.py` (full file, 1621 lines — same no-args-is-CI-mode / `--write` / `--self-test` contract) | exact |
| `src/frontend/App.tsx` (edit: `store-page` route origin check, D-34) | route | request-response | itself, `App.tsx:190-230` route table | self |

## Pattern Assignments

### `src-tauri/Cargo.toml` (config)

**Finding, not just an analog:** the `unstable` feature is **already enabled unconditionally**
at line 25 (`tauri = { version = "2", features = ["tray-icon", "image-png", "unstable"] }`), for
the pristine-Epic-webview spike work. D-03 requires it to be **target-gated to macOS**. The file
already has the target-gate mechanism to copy — just applied to a different dependency:

**Existing target-gate pattern** (`Cargo.toml:101` area):
```toml
[target.'cfg(target_os = "macos")'.dependencies]
# (existing macOS-only deps live here)
```

**The edit:** move `tauri`'s `unstable` feature OUT of the top-level `[dependencies]` `tauri = {...}`
line and into a macOS-gated duplicate, keeping the base `tauri` dependency (sans `unstable`) for
Windows/Linux:
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
...
[target.'cfg(target_os = "macos")'.dependencies]
tauri = { version = "2", features = ["unstable"] }
```
Verify against Cargo's own feature-unification semantics before committing to this exact shape —
Cargo unifies features across duplicate dependency declarations for the same crate, so confirm
this actually excludes `unstable` from non-macOS builds rather than unifying it back in (this is
exactly the kind of claim 34.3 D-05 says must be checked against real `cargo build --target
x86_64-pc-windows-msvc` output or vendored docs, not assumed).

---

### `src-tauri/src/main.rs` — embed lifecycle commands

**Analog:** `humble_reveal_post` / `humble_login_clear_storage` (`main.rs:985-1050`)

**Command dispatch shape to copy** (arg parsing, window-build error handling, response shape):
```rust
"humble_reveal_post" => {
    let parsed = reveal_post_args(args)?;
    let label = next_login_window_label();
    let (tx, rx) = mpsc_channel::<String>();
    let window = match tauri::WebviewWindowBuilder::new(
        app,
        &label,
        tauri::WebviewUrl::External(parsed.origin_url.clone()),
    )
    .user_agent(&parsed.user_agent)
    .visible(false)
    .on_navigation(move |url| { /* ... */ true })
    .build()
    {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[shell] humble_reveal_post: window build failed: {e}");
            return Err(format!("humble_reveal_post:window:{e}"));
        }
    };
    // ... script/exchange work, then a single close-site covering every exit path
}
```
Copy the "every exit path closes/releases before returning" discipline verbatim for the embed's
`store_embed_close` arm, and the `match ... { Ok(w) => w, Err(e) => { eprintln!(...); return
Err(...) } }` shape for `store_embed_open`.

**The dispatch table itself:** `fn dispatch_rust_channel(channel: &str, args: &[Value], app:
&AppHandle) -> Result<Value, String>` at `main.rs:4607`, `match channel { ... }` — new arms are
literal-string match arms added to this same function, following the naming convention
`snake_case`, prefixed by feature area (`humble_*`, so the embed's arms should share one prefix,
e.g. `store_embed_*`).

---

### `src-tauri/src/main.rs` — embed creation (`add_child`)

**No shipped analog exists.** The proven shape is entirely from
`.claude/skills/spike-findings-gamelib/references/tauri-embedded-store-browser.md` (already
verified against vendored crate sources and live hardware, per D-25):

```rust
use tauri::webview::WebviewBuilder;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};

let window = app.get_window("main").ok_or("no main window")?;
let builder = WebviewBuilder::new("store-embed", WebviewUrl::External(url))
    .user_agent(CHROME_UA)
    .on_page_load(|_w, payload| { /* Started|Finished, main frame -- feed D-22's history stack */ })
    .on_navigation(|_u| true); // log only, never drive logic (subframes included)
let webview = window.add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))?;
```

`MAIN_WINDOW_LABEL` constant already exists at `main.rs:1321` (`"main"`) — use it rather than a
new literal.

**Nearest thread-confinement analog** (`open_pristine_epic_login_window`, `main.rs:2915-2933`):
```rust
#[cfg(target_os = "macos")]
fn open_pristine_epic_login_window(
    app: &AppHandle,
    label: &str,
    url: tauri::Url,
    visible: bool,
    user_agent: &str,
) -> Result<Value, String> {
    let origin = url.origin().ascii_serialization();
    let mut window_builder = tauri::WindowBuilder::new(app, label).visible(visible);
    // ...
    let window = window_builder.build()
        .map_err(|e| format!("humble_login_open:pristine:build-failed:{e}"))?;
```
`add_child` itself "hops to the main thread internally — callable from any thread" per the spike
doc, so the embed's arms do NOT need the explicit `run_on_main_thread` hop `humble_login_clear_cookies`
needs elsewhere in this file — confirm that against the vendored source per D-25 before assuming it.

---

### `src-tauri/src/main.rs` — cookie clear at `WKWebsiteDataStore` level (D-15)

**Analog:** `cookie_domain_matches` (`main.rs:1823-1842`) and its call site (`main.rs:960-975`)

```rust
fn cookie_domain_matches(host: &str, domain: Option<&str>) -> bool {
    match domain {
        // MANDATORY: strip RFC 6265's leading-dot wildcard marker before comparing.
        Some(d) => {
            let d = d.strip_prefix('.').unwrap_or(d);
            host == d || host.ends_with(&format!(".{d}"))
        }
        None => false,
    }
}
```
```rust
let matching: Vec<_> = window.cookies()
    .map_err(|e| e.to_string())?
    .into_iter()
    .filter(|c| match c.domain() {
        Some(d) => cookie_domain_matches(d, Some(domain)),
        None => false,
    })
    .collect();
for cookie in matching {
    window.delete_cookie(cookie).map_err(|e| e.to_string())?;
}
let after_matching = count_matching(&window)?;
Ok(Value::Number(verified_delete_count(before_matching, after_matching).into()))
```

**Do not write a second comparator.** `cookie_domain_matches` is, per its own doc comment, "the
only domain comparator this project has, deliberately." Reuse it for the GOG/Amazon logout clear
(D-15) rather than adding a second ad hoc one — the reference doc's own warning about a
"..humblebundle.com" regression applies to any new copy of this logic.

**wry's cookie-delete-lies caveat** (project memory `wry-cookie-delete-lies-about-deleting`):
the shipped code already verifies the delete via `verified_delete_count(before_matching,
after_matching)` rather than trusting the return value — copy that verify-don't-trust shape for
D-15's fix, not a bare `delete_cookie()?` call.

---

### `src/backend/store/storeEmbedSeam.ts` (new)

**Analog:** `src/backend/humble/loginWindowSeam.ts` (full file — read via graphify orientation;
its shape is: an interface (`LoginWindowSeam`) + typed result shapes (`LoginWindowCookieRead`,
`LoginWindowNavEvent`, etc.) + module-level `setLoginWindowSeam`/`getLoginWindowSeam` singleton
accessors, with EXACTLY ONE call site for the setter, enforced by comment discipline).

The new `storeEmbedSeam.ts` should mirror: one interface (`StoreEmbedSeam`) covering `open`,
`setBounds`, `hide`, `show`, `close`, `takeNavEvents` (or equivalent for D-22's history push);
one setter/getter pair; and the same "every method throws a descriptive Error on a malformed
response rather than silently coercing" discipline `createRustLoginWindowSeam` uses throughout
`humbleLoginFlowRegistration.ts` (see below) — load-bearing per that file's own doc comment,
because a silently-coerced default would misreport a dead Rust channel as a healthy empty one.

---

### `src/backend/sidecar/storeEmbedFlowRegistration.ts` (new)

**Analog:** `src/backend/sidecar/humbleLoginFlowRegistration.ts` (full file, 483 lines)

**Curated-import discipline to copy verbatim** (module doc comment convention, D-01/D-02 lineage):
```typescript
import { ipcMain } from '../platform'
import { requestRustInvoke } from './sidecarRpc'
import {
  RUST_HUMBLE_LOGIN_OPEN,
  // ... one named const per Rust channel, imported from sidecarTransport.ts
} from '../../common/types/sidecarTransport'
```
Never import a store-runner's own `ipc_handler.ts` (if one exists) — same double-registration
hazard the doc comment above warns about for `humble/ipc_handler.ts`.

**Response-coercion pattern to copy** (`createRustLoginWindowSeam`, lines 172-329): every method
does `const record = result as {...} | null; if (!record || typeof record.x !== ...) { throw new
Error(...) }`. Apply this to `store_embed_open`'s label response, `store_embed_take_nav_events`'s
array response, etc.

**Registration function shape to copy** (`registerHumbleLoginFlows`, lines 336-482):
```typescript
export function registerStoreEmbedFlows(): void {
  setStoreEmbedSeam(createRustStoreEmbedSeam())
  ipcMain.handle('storeEmbedOpen', async (...) => { try { ... } catch (error) { ...; return <safe-default> } })
  ipcMain.on('storeEmbedSetBounds', () => { void (async () => { try { ... } catch (error) { logSendFailure(...) } })() })
}
```
D-07's fail-safe convention applies identically: every `handle` arm resolves a safe default on
catch, never rejects (`sidecar-dialog-reject-crashes` project memory); every `send`/`on` arm
wraps its body in `void (async () => {...})()` so a rejection can never become unhandled.

---

### `src/common/types/sidecarTransport.ts` — new channel-name constants

**Analog:** `RUST_HUMBLE_LOGIN_*` block, `sidecarTransport.ts:296-425`

```typescript
export const RUST_HUMBLE_LOGIN_OPEN = 'humble_login_open' as const
export const RUST_HUMBLE_LOGIN_COOKIES = 'humble_login_cookies' as const
export const RUST_HUMBLE_LOGIN_CLOSE = 'humble_login_close' as const
```
Same `snake_case` string literal matching the Rust match-arm literal exactly, same `as const`,
grouped under a doc comment naming the plan/decision that added them, and re-exported from the
barrel at the bottom of the file (mirrors line ~418-425's `RUST_HUMBLE_LOGIN_OPEN,` list).

---

### `src/frontend/screens/WebView/index.tsx` (rewrite)

**Analog:** itself (pre-image, 597 lines) — this is an edit-in-place, not a fresh file. Keep:

- The route→URL map shape (`urls: { [pathname: string]: string }`, lines 190-204) and the
  `startUrl` resolution flow (lines 205-221) — store/wiki/login routing logic is unchanged by
  the embed swap, only what renders at the bottom changes.
- The adtraction `Dialog`/`DialogHeader`/`DialogContent` JSX block (lines 556-594) — D-32 re-derives
  the DETECTION mechanism (`on_page_load` vs the dead `did-fail-load` listener), not this render.
- The `runner === 'humble'` early return to `<HumbleLoginSurface>` (lines 492-499) and the
  `!webviewPreloadPath` guard's `TauriLoginPanel` arm (line 519) — both are Model B already and
  untouched by this phase.

**Delete:** `webviewRef` (`useRef<WebviewTag>(null)`, line 69), `validStoredUrl`'s substring
checks (lines 37-52 — D-31 replaces with real origin parsing via `new URL(url).origin ===`
comparisons, not `.includes()`), the two Model-A `useLayoutEffect`s (lines 275-373, 375-416), the
mouse back/forward effect (lines 455-483, replaced by D-22's Rust-driven history), and the whole
`<webview>` render branch (lines 531-549, including `WebviewControls` and its
`webviewRef.current &&` guard).

**D-31's re-derivation target** (what `validStoredUrl` becomes — real origin parsing, not substring):
```typescript
// BEFORE (F-vulnerable to evil-gog.com.attacker.net):
case 'gog': return url.includes('gog.com')
// AFTER (origin-exact or suffix-of-real-host, never substring-of-full-URL):
case 'gog': return new URL(url).hostname === 'gog.com' || new URL(url).hostname.endsWith('.gog.com')
```

---

### New chrome component (D-24, rebuilt `WebviewControls`)

**Analog:** `src/frontend/components/UI/WebviewControls/index.tsx` (full file, 137 lines) — for
JSX layout (`SvgButton` icons, `WebviewControls__url` host display span, i18n key names like
`webview.controls.back`/`.forward`/`.reload`/`.openInBrowser`) and the CSS class naming
convention (`WebviewControls__icon`, `WebviewControls__urlInput--warning`).

**Do NOT copy the control logic** — this is the "control inverts" case from CONTEXT.md's
Specific Ideas section. The old component synchronously queries `webview.canGoBack()`:
```typescript
// DEAD PATTERN — no equivalent under add_child:
const [webviewGoBack, setWebviewGoBack] = useState(false)
webview.addEventListener('did-navigate', () => setWebviewGoBack(webview.canGoBack()))
```
The new component instead RECEIVES back/forward-availability as props/state pushed from Rust via
D-22's history-stack channel (see `storeEmbedSeam.ts`'s `takeNavEvents`-shaped method) —
structurally closer to how `TauriLoginPanel` receives `state: TauriOAuthLoginState` as a prop
rather than deriving it from a live DOM handle (`TauriLoginPanel.tsx:87`, `({ runner, state }: Props)`).
The `openInBrowser` button's `window.api.openWebviewPage(url)` call (line 130) stays a valid
pattern — same escape-hatch shape `WebviewUnavailablePanel` uses via `window.api.openExternalUrl`.

**D-23's host-only display**: the old component showed the full URL (`WebviewControls__url`
input, line 111-123); the new one shows only `new URL(currentUrl).host`.

---

### New suppression hook/context (D-20)

**Analog:** `src/frontend/components/UI/NavShell/Tier2PortalContext.tsx` (full file, 62 lines) —
for the Context/Provider/`useMemo` shape only:

```typescript
export interface Tier2PortalValue {
  target: HTMLElement | null
  setTarget: (el: HTMLElement | null) => void
  filled: boolean
  setFilled: (filled: boolean) => void
}
const defaultValue: Tier2PortalValue = { target: null, setTarget: () => null, filled: false, setFilled: () => null }
export const Tier2PortalContext = React.createContext<Tier2PortalValue>(defaultValue)
export const Tier2PortalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [filled, setFilled] = useState(false)
  const value = useMemo(() => ({ target, setTarget, filled, setFilled }), [target, filled])
  return <Tier2PortalContext.Provider value={value}>{children}</Tier2PortalContext.Provider>
}
```

**No ref-counting analog exists in the frontend** — see "No Analog Found" below. The closest
REF-COUNTED shape in the whole codebase is Rust-side, not React: `WakeLockRegistry`
(`main.rs:4225-4270`) — an id-keyed `HashMap<u32, WakeLockKind>` behind one `Mutex`, with
`allocate`/`forget`/`holds` methods. It is NOT a literal analog (it counts OS power assertions,
not overlay-open calls), but its shape — "PURE bookkeeping struct; every mutation goes through
one lock; `holds(kind)` answers 'is at least one still live' by scanning the map" — is the right
shape to translate into a React `useReducer`/counter context: increment on
overlay-mount, decrement on unmount, `isSuppressed = count > 0` drives `hide()`/`show()`.

---

### New placeholder component (D-19)

**Analog:** `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` (full file, 77
lines) — for the "no hooks besides `useTranslation`, invocable as a plain function, hookless/DOM-less
test convention" pattern this project uses for every WebView-adjacent static panel
(`TauriLoginPanel`, `CrossoverBadge`, `MacArchBadge` per that file's own doc comment):
```typescript
const WebviewUnavailablePanel = ({ url }: Props) => {
  const { t: tGamelib } = useTranslation('gamelib')
  const heading = tGamelib('webview.unavailable.heading', '...')
  return (
    <div className="WebView__unavailablePanel">
      <h2 className="WebView__unavailablePanel-heading">{heading}</h2>
      ...
    </div>
  )
}
```
The D-19 placeholder needs no `url` prop and no button — it is pure decoration matching the app
surface while the embed is hidden — but should keep the `WebView__unavailablePanel`-style
BEM class-naming convention for consistency with its sibling panels in the same directory.

---

### `src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx` (edit, D-02/D-08)

Self-analog. Reword `heading`/`body` (currently "In-app store and wiki browsing is not available
on this build" / "GameLib's Tauri build does not yet embed a browser view...") to name the
platform reason (D-02: "not available on Windows/Linux yet" framing) for non-macOS, and craft
Epic's provisional copy (D-08: "Epic Store browsing isn't available in-app yet", NOT an assertion
that Epic blocks it) — both keep this file's existing `tGamelib(key, defaultText)` call shape and
its `openInBrowser` button pattern (lines 63-71) unchanged structurally.

---

### `src/backend/platform/types.ts` / `index.ts` / `__tests__/types.usage.test.ts` (delete, D-12)

Self-analog — this is a subtraction, not a new pattern. Delete `WebviewTag`/`DidFailLoadEvent`
(`types.ts:167-230`, the block with the "Consumed by" doc comment naming the 3 dead call sites),
its re-export at `index.ts:1128`, and `assert_webviewTag()` plus the earlier `WebviewTag` mentions
in `types.usage.test.ts` (lines 47, 216, 223, 259, 263-277, 572, 670, per D-12's own line list).
Cross-check against `sidecar-guard-first-import-breaks-electron-hook`-class regressions: confirm
no other type in the same file's interface block structurally depends on `WebviewTag` before
deleting the whole section.

---

### Mechanical predicate gate (D-13)

**Analog:** `.planning/phases/34.4.1-tauri-embedded-browser-login-seam-replace-the-electron-webvi/seam-parity-sweep-gate.py`
(1621 lines) plus its two siblings in the same directory (`ported-channels-gate.py`,
`wkwebview-silent-noop-sweep.py`).

**Contract to copy exactly:**
- No-args invocation is the CI path (`meta/runPlanningGates.py` discovers `*-gate.py` and invokes
  with zero arguments) — the gate WALKS the real `src/` tree at run time and CHECKS a committed
  artifact still matches, writing nothing by default.
- `--write` regenerates the committed artifact deliberately (never the default — "the repo already
  lost a set of pins this way").
- `--self-test` proves every check function actually rejects known-bad input BEFORE trusting a
  clean run against real files (anti-vacuity discipline, referenced against
  `grep-assertion-must-fail-against-known-bad-input`).

**D-13's own predicate is narrower than the 34.4.1 gate's** (a grep-shaped census, not a
multi-tier AST differ): fail if `<webview>`, `WebviewTag`, or `webviewPreloadPath` reappears
anywhere under `src/frontend/`. Per the project's own gate-authoring lessons
(`decision-coverage-gate-needs-a-specific-bullet-shape`, `ui-spec-gate-false-fires-on-build`,
`a-gate-can-convict-correct-code`), measure this gate's vocabulary against the ACTUAL post-deletion
tree before committing to a bare substring grep — a naive `grep -r webview` will false-fire on
unrelated words (e.g. `WebviewBuilder` in the new Rust code, `store-embed`'s own frontend prop
names if one is ever named `webview*`). Scope the grep to `src/frontend/**/*.{ts,tsx}` and the
three literal tokens named in D-13, and mutation-test it in BOTH directions per that decision's
own requirement (must fail if a `<webview>` tag is reintroduced; must NOT fail against the
post-Phase-40 tree with the new Rust embed shipped).

## Shared Patterns

### Response coercion / "throw, never silently default" (backend seam methods)
**Source:** `src/backend/sidecar/humbleLoginFlowRegistration.ts:172-329` (`createRustLoginWindowSeam`)
**Apply to:** `storeEmbedSeam.ts`'s every method, `storeEmbedFlowRegistration.ts`'s every
response coercion.
```typescript
const record = result as { total?: unknown; matched?: unknown } | null
if (!record || typeof record.total !== 'number' || !Array.isArray(record.matched)) {
  throw new Error(`<channel>: malformed response (...): ${JSON.stringify(result)}`)
}
```
Load-bearing per that file's own doc comment: a silently-coerced default recreates the exact
class of defect F-6/F-34.4.2-19 shipped from (a dead Rust channel misreporting as a healthy
empty one).

### Fail-safe IPC handlers (never reject, never let an `on` throw unhandled)
**Source:** `humbleLoginFlowRegistration.ts:344-411` (`registerHumbleLoginFlows`)
**Apply to:** every new `ipcMain.handle`/`ipcMain.on` arm in `storeEmbedFlowRegistration.ts`.
```typescript
ipcMain.handle('humbleStartLogin', async () => {
  try { return await HumbleUser.startLogin() }
  catch (error) { console.warn(...); return { status: 'error' } }
})
ipcMain.on('humbleStopLogin', () => {
  void (async () => { try { HumbleUser.stopLogin() } catch (error) { logSendFailure(...) } })()
})
```

### Domain comparator reuse (never a second ad hoc comparator)
**Source:** `src-tauri/src/main.rs:1823-1842` (`cookie_domain_matches`)
**Apply to:** any new Rust code touching cookie domains (D-15's clear, any embed-side domain
check). The file's own doc comment states this is deliberately the ONLY domain comparator in the
project — a second copy risks reintroducing F-34.4.2-19's leading-dot regression.

### "Logged, never silent" for declared-deferred/declared-blocked surfaces
**Source:** `WebView/index.tsx:525-527` (`window.api.logInfo(...)` before returning
`WebviewUnavailablePanel`); `TauriLoginPanel.tsx`'s every terminal branch (`window.api.logInfo`
before each return).
**Apply to:** Epic's D-08 panel, D-04's Windows/Linux ledger-item panel (D-02) — every
declared-deferred surface logs its own gap explicitly rather than failing silently.

## No Analog Found

| File/Pattern | Role | Data Flow | Reason |
|---|---|---|---|
| `add_child` embed construction | route | event-driven | No shipped code calls `Window::add_child` yet — `unstable` was enabled only for the pristine-webview (webview-LESS `WindowBuilder`) spike, a structurally different API. Use `tauri-embedded-store-browser.md`'s proven shape directly; verify against the vendored `tauri-2.11.5`/`wry-0.55.1` source per D-25 before writing the plan. |
| Reference-counted overlay-suppression hook (D-20) | provider/hook | event-driven | No React context in the frontend does reference counting today; `Tier2PortalContext` is a single-target/single-flag context, not a counter. `WakeLockRegistry` (Rust) is the closest counting SHAPE in the repo but is a different language and domain. |
| Rust-side navigation history stack feeding D-22's back/forward | service | event-driven | No existing Rust struct records a per-webview URL history; nearest sibling (`WakeLockRegistry`) is id-keyed state, not an ordered stack. Build fresh against `on_page_load`'s proven event shape (`tauri-embedded-store-browser.md`). |
| Bounds-sync `ResizeObserver` → `invoke('set_embed_bounds', ...)` (D-17/D-18's renderer-as-sole-writer) | hook | event-driven | No existing frontend code drives a native-subview bounds sync; the closest conceptual sibling (window-chrome drag regions, `src/preload/api/tauriWindowChrome.ts`) manipulates the OS window itself, not a child webview's geometry. Copy the proven JS shape from `tauri-embedded-store-browser.md`'s "Bounds sync" section verbatim — it is already the answer, not a hint. |

## Metadata

**Analog search scope:** `src/frontend/screens/WebView/**`, `src/frontend/components/UI/**`,
`src/backend/humble/**`, `src/backend/sidecar/**`, `src/backend/platform/**`, `src-tauri/src/main.rs`,
`.claude/skills/spike-findings-gamelib/references/**`, prior phase directories under
`.planning/phases/34.4.1-*` for gate-script precedent.
**Files scanned:** ~25 read directly; graphify queries used to orient before each raw read/grep
pass, per this session's tool-use constraint.
**Pattern extraction date:** 2026-09-04
