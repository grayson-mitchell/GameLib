# Phase 40: In-app store and wiki browsing under Tauri — Discussion Log

> **Audit trail only.** Do not use as input for planning, research, or execution agents.
> Decisions are captured in `40-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-09-04
**Phase:** 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
**Areas discussed:** Platform scope, Epic anti-bot 403, The `<webview>` unwind, Cookie jar policy,
Overlay collision policy, WebviewControls chrome, Threat model posture, Restore + adtraction port,
store-page deep link, Onboarding tour, i18n

---

## Gate decisions (entered from `/gsd-plan-phase 40`)

| Question | Options | Selected |
|---|---|---|
| Context gate | Run discuss-phase first / Continue without context | Run discuss-phase first ✓ |
| Research gate | Skip research / Research first | Skip research ✓ |
| UI-SPEC gate | Skip UI-SPEC (`--skip-ui`) / Run `/gsd-ui-phase 40` | Skip UI-SPEC ✓ |

**Notes:** Research was skipped because the ROADMAP states in terms that re-deriving these answers
from docs "will get different answers" — spikes 016/017/018 answered them against vendored crate
sources and live hardware. UI-SPEC was skipped; the consequence (spike 017's overlay/z-order
constraint going uncontracted) was raised at the time and is now covered by D-18 – D-21 instead.

---

## Platform scope

| Option | Description | Selected |
|---|---|---|
| macOS only | Ship where the evidence is; panel stays on Windows/Linux | ✓ |
| All three, attempt-and-fallback | Try `add_child` everywhere, degrade at runtime | |
| All three, verify first | Block the phase until Win/Linux are proven | |

| Option | Description | Selected |
|---|---|---|
| Reworded panel naming the reason | Platform-specific copy, preserves D-06's principle | ✓ |
| Keep the panel exactly as-is | No copy change; already translated in 48 locales | |
| Auto open-in-browser on route entry | Skip the panel entirely | |

| Option | Description | Selected |
|---|---|---|
| Target-gate `unstable` to macOS | Only the macOS leg compiles against an unstable API | ✓ |
| Enable unconditionally | One dependency line for all targets | |
| You decide | Discretion at plan time | |

| Option | Description | Selected |
|---|---|---|
| Phase 38 ledger items | The destination that exists for "needs hardware we lack" | ✓ |
| New todos in the queue | Lighter weight; queue already holds 43 items | |
| Both — ledger item plus todo | Redundant by design | |

**Notes:** The concern driving the last question was diffusion — the deferral this phase exists to
resolve sat in three prose locations and zero queues for five phases.

---

## Epic anti-bot 403

**Claude raised a correction to the ROADMAP's framing before asking:** a Tauri-MANAGED child
webview still receives the injected globals, so `add_child` inherits the exact confirmed Talon
fingerprint. The pristine-WKWebView escape hatch was a separate window with no wry webview, which
`add_child` cannot produce.

| Option | Description | Selected |
|---|---|---|
| Panel + open-in-browser | Epic alone keeps the escape hatch | |
| Attempt the embed, degrade on 403 | Build a detector for an anti-bot page | |
| Pristine WKWebView subview for Epic | Raw zero-injection subview; four plumbing gaps inherited | |
| **Other (user free text)** | **"leave epic out for this phase and spike it"** | ✓ |

| Option | Description | Selected |
|---|---|---|
| One bounded live probe | Point an embed at `store.epicgames.com`, record the result | ✓ |
| Take the prediction, don't probe | Assume the store is guarded like the login endpoint | |
| Defer the probe to Phase 38 | File alongside the Windows/Linux unknowns | |

| Option | Description | Selected |
|---|---|---|
| Name the reason plainly | "The Epic Store blocks in-app browsing" | ✓ (amended) |
| Generic "not available here" copy | One translated string instead of two | |
| You decide | Discretion at plan time | |

| Option | Description | Selected |
|---|---|---|
| Keep the Epic tile | Leads to a working escape hatch | ✓ |
| Remove the tile | Don't offer a door that doesn't open | |
| Keep it, mark it visually | Tile carries an "opens externally" indicator | |

**User's choice:** Epic is out of Phase 40 entirely and becomes a spike.

**Notes:** Two follow-ups were asked in plain text after the free-text answer. (1) *Is the spike a
blocker?* — **"alongside"**, so it blocks nothing. (2) *Panel copy* — the "name the reason plainly"
selection was amended because with the question now open rather than decided, asserting that Epic blocks
store browsing would claim something unproven; the 403 is confirmed only on the login endpoint. The
user accepted the provisional wording *"Epic Store browsing isn't available in-app yet"*.

---

## The `<webview>` unwind

**Claude presented a census finding before asking:** `getWebviewPreloadPath` returns a
declared-empty `''` unconditionally under Tauri, so `!webviewPreloadPath` is always true and the
dead surface is materially larger than the ROADMAP's description — it includes the whole
`WebviewControls` component and `HumbleLoginSurface`'s render plus both its effects.

**The first round of questions was rejected.** The user asked: *"what does this mean from an
architectural perspective?"* Claude explained that the codebase contains two incompatible webview
models — Model A (renderer owns a DOM node, synchronous reads, DOM events) and Model B (Rust owns
the object, async invokes, pushed events) — and that `add_child` is not a port of `<webview>` but a
control-plane and layout-plane inversion. It also corrected the ROADMAP's claim that
`HumbleLoginSurface` is a live consumer: it is a half-migrated file.

**User's response:** *"so sounds like the sensible approach is to retire A and move to B"* — which
settled the scope question (full unwind) without it needing to be re-asked.

| Option | Description | Selected |
|---|---|---|
| Unwind first | Delete Model A, then build Model B onto a clean surface | ✓ |
| Same wave, one pass per file | Removal and replacement fused per file | |
| Embed first, unwind after | User-visible win first | |

| Option | Description | Selected |
|---|---|---|
| Re-census the D-17 relay, then decide | Prove zero live callers before removing the channel | ✓ |
| Remove the channel too | Dead caller, dead channel | |
| Keep the channel, delete the caller | Backend surface untouched | |

| Option | Description | Selected |
|---|---|---|
| Delete the `WebviewTag` assertions | The pin's reason to exist goes with the shim | ✓ |
| Keep type and pin | Retain as a declared-dead type | |
| You decide | Discretion at plan time | |

| Option | Description | Selected |
|---|---|---|
| A mutation-proven predicate gate | Fails if `<webview>`/`WebviewTag`/`webviewPreloadPath` returns | ✓ |
| No gate — the deletion is self-evident | `tsc` catches a reintroduced import | |
| A test rather than a gate | Assert absence in the jest suite | |

**Notes:** The gate option carried an explicit warning that it must be mutation-proven in both
directions and that its vocabulary must be measured before it is built.

---

## Cookie jar policy

| Option | Description | Selected |
|---|---|---|
| Shared default jar | Store page carries the real login; Heroic defect #1 absent | ✓ |
| Per-store isolation via `data_store_identifier` | Better hygiene, breaks the login-carrying property | |
| Shared jar, but audited | No behaviour change, documented tradeoff | |

| Option | Description | Selected |
|---|---|---|
| Fix the logout jar leak in Phase 40 | The embed is what makes it user-visible | ✓ |
| Fix, but only prove the symptom | Scope to the store tab specifically | |
| Out of scope — keep it a todo | Ship the embed, leave the leak queued | |

| Option | Description | Selected |
|---|---|---|
| Keep `LoginWarning`, driven by app auth state | Answers "have you connected this store" | ✓ |
| Drive it from the embed's cookies | Parse third-party session cookies per store | |
| Drop `LoginWarning` entirely | The store page shows its own state | |

| Option | Description | Selected |
|---|---|---|
| A real, current Chrome UA | Replaces the synthetic `Chrome/200.0` | ✓ |
| Port the existing `Chrome/200.0` string | Verbatim carry-over | |
| Per-store UA | Five strings, four without evidence | |

**Notes:** The user later asked whether "use of chrome" meant ~100 MB of package size. It does not
— a user agent is a header string; the embed renders on the system WKWebView, and the `unstable`
cargo feature unlocks `#[cfg]`-gated code paths in crates already being compiled. Claude added the
caveat that a pinned Chrome version ages and should carry a comment marking it as maintained.

---

## Overlay collision policy

| Option | Description | Selected |
|---|---|---|
| Hide the embed on any overlay | One rule, correct by construction | ✓ |
| Reserve a rect overlays avoid | No hole, but silent failure when one forgets | |
| Per-overlay decision | Best-looking, judgment call at every site | |

| Option | Description | Selected |
|---|---|---|
| Styled placeholder in the slot | Reads as dimming, not a rendering glitch | ✓ |
| Freeze-frame the last paint | Best illusion, needs a capture path that doesn't exist | |
| Leave it empty | Cheapest, reads as a bug in a screenshot | |

| Option | Description | Selected |
|---|---|---|
| One suppression hook every overlay routes through | Structural, reference-counted | ✓ |
| Manual `hide()` at each overlay site | Simple, forgettable, no error on failure | |
| Suppression hook plus a gate | Strongest; "which components are overlays" is a hard vocabulary | |

| Option | Description | Selected |
|---|---|---|
| `hide()` on leave, `close()` on teardown | Instant returns, scroll and page state intact | ✓ |
| `close()` on leave, recreate on return | Frees memory, cold load every return | |
| `hide()` with an idle timeout to `close()` | Both, plus a guessed threshold and a third state | |

---

## WebviewControls chrome

**Framing:** since `WebviewControls` is already dead, this is a rebuild, not a port. Claude stated
explicitly that it did not know what Tauri 2.11.5's `Webview` exposes for history navigation, and
that the project has a standing rule against planning on an unverified API.

| Option | Description | Selected |
|---|---|---|
| Rust-side history stack + `navigate()` | Zero page-side JS injection | ✓ |
| `eval('history.back()')` into the page | True history semantics; the fingerprinted category | |
| Verify the native API first, then choose | Check before committing | |

| Option | Description | Selected |
|---|---|---|
| Host only | Enough to know the origin, without tracking params | ✓ |
| Full URL, read-only | Browser parity, most noise | |
| No URL display | Cleanest; hides a security-relevant signal | |

| Option | Description | Selected |
|---|---|---|
| Rebuilt component above the embed slot | Same structural position as the dead bar | ✓ |
| Fold into NavShell's tier-2 bar | Route-specific controls into shared chrome | |
| You decide | Discretion at plan time | |

| Option | Description | Selected |
|---|---|---|
| First task verifies against vendored crate source | How spikes 016–018 got their answers | ✓ |
| Plan the history stack unconditionally | Removes the unknown, may reimplement the runtime | |
| Spike it alongside the Epic spike | This one gates a component Phase 40 must ship | |

---

## Threat model posture

| Option | Description | Selected |
|---|---|---|
| No capability grants the embed remote-IPC eligibility | Verifiable from config; ACL is defence-in-depth | ✓ |
| Raw zero-injection WKWebView | Genuinely removes the global; a phase of work by itself | |
| Accept and document | Rests entirely on the ACL never regressing | |

| Option | Description | Selected |
|---|---|---|
| Full store-browser surface | Navigation, downloads, popups, protocol handlers, the shared jar | ✓ |
| Injected-global surface only | Exactly what MANIFEST named and no more | |
| Full surface plus the login seam | Pulls a settled subsystem back into scope | |

| Option | Description | Selected |
|---|---|---|
| Free navigation, external popups/downloads | An allowlist would break checkout | ✓ |
| Origin allowlist per store | Smaller surface; breaks buying and rots | |
| Free navigation, log off-origin | Observability with no actual control | |

| Option | Description | Selected |
|---|---|---|
| Block `gamelib://`, allow `steam://` via the OS | A store page must not drive the app's own scheme | ✓ |
| Block all non-http(s) schemes | Simplest rule; "Install on Steam" buttons would no-op | |
| Allow all, let the OS decide | Hands a page a route into GameLib's scheme | |

---

## Restore + adtraction port

| Option | Description | Selected |
|---|---|---|
| Re-derive the restore for Model B | Keep the behaviour, rebuild against Rust ownership | ✓ |
| Port the existing logic verbatim | Fastest; verbatim ports ship silent defects | |
| Drop it | `hide()`-on-leave already covers within-session | |

| Option | Description | Selected |
|---|---|---|
| Replace `validStoredUrl` with real origin parsing | `includes('gog.com')` matches `evil-gog.com.attacker.net` | ✓ |
| Port the substring check as-is | Low risk, known-weak check | |
| You decide | Discretion at plan time | |

| Option | Description | Selected |
|---|---|---|
| Re-derive adtraction against `on_page_load` / nav failure | Keep the feature; may have no clean analog | ✓ |
| Drop it | An affiliate nudge tied to Heroic's account | |
| Keep the dialog, drop the detection | Dead UI kept alive | |

| Option | Description | Selected |
|---|---|---|
| One live gesture covers both | Proves hook, placeholder, hide/show and geometry together | ✓ |
| Unit-test the hook only | Jest cannot see a native subview | |
| No explicit proof | Screenshot-based judgment was wrong twice on this project | |

**Notes:** The adtraction answer carries an explicit caveat — `on_page_load` reports main-frame
loads, so detecting a blocked third-party subresource may have no Model B equivalent. It must be
verified before it is promised.

---

## store-page deep link, tour, and i18n

| Option | Description | Selected |
|---|---|---|
| Embed known origins, external for the rest | Unvetted third-party URLs never reach a native webview | ✓ |
| Embed any https URL | Best for Discounts; arbitrary data picks the navigation | |
| Always system browser for store-page | Simplest; makes Discounts strictly worse | |

| Option | Description | Selected |
|---|---|---|
| Resolve to the matching store's config | A deep link is just that store's embed, elsewhere | ✓ |
| A distinct "deep link" identity | A sixth configuration to maintain | |
| You decide | Discretion at plan time | |

| Option | Description | Selected |
|---|---|---|
| Tour acquires the suppression hook | One mechanism, no special case | ✓ |
| Tour skips the store tab | Zero risk; skips the phase's headline feature | |
| Hide the embed for the whole tour | Grey placeholder during the tour introducing it | |

| Option | Description | Selected |
|---|---|---|
| `gamelib.json` + the standing l10n pass | No gate catches a violation; this is discipline | ✓ |
| `gamelib.json`, English only for now | Adds to a 10032-string backlog | |
| You decide | Discretion at plan time | |

---

## Claude's Discretion

- Exact wording of all new user-facing strings.
- Whether the `WebviewTag` assertions in `types.usage.test.ts` are entangled with surviving types.
- The `ResizeObserver` debounce interval (spike measured ~40 ms).
- Naming for the rebuilt chrome, the slot, and the suppression hook.
- How store identity is keyed internally.

## Deferred Ideas

- **Epic store browsing inside an embedded webview** — its own spike, running alongside Phase 40,
  blocking nothing. Owns the bounded live probe of `store.epicgames.com`.
- **Windows and Linux child-webview support** — Phase 38 ledger items: whether `add_child` works on
  WebView2/webkit2gtk at all, retina at `scale_factor` 2.0, drag-resize latency, input/scroll feel.
