use super::*;

mod invite_picker;
pub(crate) use invite_picker::*;
mod humble_cookies;
pub(crate) use humble_cookies::*;
mod humble_reveal;
pub(crate) use humble_reveal::*;
mod humble_open;
pub(crate) use humble_open::*;
mod devtools;
pub(crate) use devtools::*;
mod humble_helpers;
pub(crate) use humble_helpers::*;
mod windows_cdp;
#[cfg(any(target_os = "macos", windows))]
pub(crate) use windows_cdp::*;
#[cfg(target_os = "macos")]
mod pristine_epic;
#[cfg(target_os = "macos")]
pub(crate) use pristine_epic::*;
#[cfg(target_os = "macos")]
mod sheet;
#[cfg(target_os = "macos")]
pub(crate) use sheet::*;
#[cfg(target_os = "macos")]
mod macos_cookies;
#[cfg(target_os = "macos")]
pub(crate) use macos_cookies::*;

// ---- Login-window (child WebviewWindow) support (Phase 34.4.1 Plan 01, D-01/D-02) ----
//
// D-02's resolved shape: a runner-agnostic set of `dispatch_rust_channel` arms -- nothing
// below knows what Humble is -- reached only via `requestRustInvoke()` from the headless
// Node sidecar, the same pattern as the keyring/dialog_open/clipboard arms above and
// below. Pure logic (label generation, URL validation, the domain-suffix filter, event
// shaping) is extracted into `AppHandle`-free functions here, proven by
// `#[cfg(test)] mod tests`; the arms' actual `WebviewWindowBuilder`/`cookies()`/
// `delete_cookie()` calls are proven empirically instead, by this phase's REQ-34.4.1-12
// blocking live gate (`34.4.1-LIVE-GATE.md`), the same split Phase 34.3's clipboard arms
// use.

/// Monotonic counter feeding `next_login_window_label()`. Process-static, mirrors this
/// file's existing `SidecarState::next_id()` counter shape.
static LOGIN_WINDOW_LABEL_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Navigation events observed by the `on_page_load` hook (Pattern 4 below), queued per
/// window label and drained by `humble_login_take_events`. `Mutex<Option<HashMap<..>>>`
/// rather than `Mutex<HashMap<..>>` because `HashMap::new()` is not a `const fn` (its
/// default `RandomState` seed is not const-constructible) -- the map is created lazily on
/// first use instead.
pub(crate) static LOGIN_WINDOW_EVENTS: Mutex<Option<HashMap<String, Vec<Value>>>> = Mutex::new(None);

/// Per-label cap on `LOGIN_WINDOW_EVENTS`, oldest-dropped past this bound (threat
/// T-34.4.1-09): a page that navigates in a loop must not grow the queue without bound
/// between `humble_login_take_events` drains.
const LOGIN_WINDOW_EVENTS_CAP: usize = 50;

/// Canonical label for the app's single Tauri-managed main window (the only entry in
/// `tauri.conf.json`'s `app.windows` array). Used both by the always-compiled tray/devtools
/// call sites below (`main()`'s `.setup()` closure) and by the macOS-only login-window
/// attachment helpers this phase adds (Phase 34.4.2 Plan 02) -- kept as a single plain
/// `const`, not `#[cfg(target_os = "macos")]`-gated, so the label has exactly one definition
/// across the whole file regardless of which call sites end up using it on a given platform.
pub(crate) const MAIN_WINDOW_LABEL: &str = "main";

/// Bound on how long `keyring_get` waits for its worker-thread Keychain read before classifying
/// the call as `keyring:timeout` (34.4.1 gap cycle 2 plan 26, F-9 observability half,
/// T-34.4.1-114/T-34.4.1-115; raised 8s -> 45s by Phase 34.5 gap cycle 4 plan 35, closing Routing
/// item 3). This is OBSERVABILITY, not a fix for F-9's underlying cause, which this plan does NOT
/// establish as a single clean answer (see
/// `keyring_read_timing_hypothesis_absent_vs_present_entry`'s own doc comment and
/// `34.4.1-26-SUMMARY.md` for the full timed verdict).
///
/// Chosen from that harness's own recorded timings on this machine: an absent-entry read
/// completed in 40-102ms across two runs (fast, `NoEntry`, no authorization needed). A
/// present-entry read against the real `steam-refresh-token` account took 48.9s on one run and
/// **291s** on another, both ultimately resolving `PlatformFailure(-60008, "Unable to obtain
/// authorization for this operation")` -- live, hardware-measured evidence for
/// `deferred-items.md`'s ad-hoc-signature/Keychain-ACL theory, reproduced from this same-machine,
/// non-interactive `cargo test` process (a different code identity than the built `gamelib-shell`
/// app, so these exact numbers are illustrative of the MECHANISM, not a promise about the app's
/// own timing).
///
/// **Why 8s was wrong and 45s is the replacement.** A 2026-08-01 live session recorded TWO
/// separate macOS Keychain approval prompts for the same `steam-refresh-token` slot, 19:22:57 and
/// 19:24:38 -- the exact outcome plan 34.5-25's own decision rule defines as FALSIFIED. 8 seconds
/// is shorter than the time a human plausibly takes to notice, read and approve a Keychain
/// authorization dialog, so a human-speed approval could never complete inside the old bound; the
/// read timed out, the worker thread that eventually got the real (human-approved) answer was
/// already abandoned, and the next caller had to prompt again. Two selecting constraints pick 45s:
/// it must exceed ordinary human Keychain-approval time (8s demonstrably does not), and it must
/// stay strictly under the sidecar's own `RUST_INVOKE_TIMEOUT_MS` (60_000ms,
/// `src/backend/sidecar/sidecarRpc.ts`) with enough round-trip headroom that a slow read is still
/// reported as the specific, named `keyring:timeout` rather than degrading into an opaque
/// transport timeout raised by that outer layer instead. 45s satisfies both: comfortably above
/// human approval time, and 15s of raw headroom under the 60s invoke bound -- of which this
/// file's own `#[cfg(test)]` assertion
/// (`keyring_read_timeout_stays_strictly_under_the_sidecar_invoke_bound_with_round_trip_headroom`)
/// enforces at least 10s as a minimum round-trip margin.
///
/// **45s does NOT cover the 291s worst case measured above, and that is deliberate.** That
/// worst-case number is attributed to `deferred-items.md`'s ad-hoc-code-signing /
/// Keychain-ACL-non-persistence theory -- a likely DEV-BUILD severity modifier (an ad-hoc dev
/// signature means the Keychain ACL never persists, so every run re-triggers a slow authorization
/// negotiation), not an established production cause, and this plan does not investigate or fix
/// it. A read that genuinely takes 291s will still time out under the new bound exactly as it did
/// under the old one; only the human-speed-approval case (the live-confirmed defect) is fixed
/// here.
///
/// A timed-out worker thread is ABANDONED, not cancelled: `SecItemCopyMatching` has no interrupt
/// API, so this bound protects the RPC round trip, not the underlying OS call -- the abandoned
/// thread keeps running (and, per this harness's own measurement, may keep running for minutes)
/// on its own.
pub(crate) const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs(45);

/// Host this arm uses to decide whether the window it is about to open is Epic's --
/// the ONLY signal available here, since `LoginWindowSeam.open()` (`loginWindowSeam.ts`)
/// takes no `runner` argument and `humble_login_open` is runner-agnostic by design. Mirrors
/// the literal host of `EPIC_LOGIN_URL` (`frontend/screens/WebView/loginRoutes.ts:45`,
/// READ ONLY, never imported -- this file has no access to frontend source at build time)
/// without changing that constant, per this cycle's hard constraint.
pub(crate) const EPIC_LOGIN_HOST: &str = "www.epicgames.com";

/// GOG's login entry host (`GOG_LOGIN_URL`, `loginRoutes.ts`). GOG added a Cloudflare Turnstile
/// check that fails inside the Tauri-injected login window, so on macOS it takes the same
/// pristine (injection-free) WKWebView route as Epic. Host-keyed like `EPIC_LOGIN_HOST`; never
/// caller-chosen. The function/delegate keep their Epic names (historical).
pub(crate) const GOG_LOGIN_HOST: &str = "auth.gog.com";

/// Classifies a raw `keyring` crate outcome (`Entry::new(...).and_then(|e| e.get_password())`)
/// into the arm's `Value`/`String` contract (34.4.1 gap cycle 2 plan 26, F-9 observability
/// half). Extracted as its own pure function so this classification is directly testable
/// without a live Keychain (mirrors `keyring_account`'s own "pure function, directly testable"
/// precedent) -- Task 2's acceptance criteria requires the `NoEntry`-still-null path proven,
/// and this is the seam that proves it. `NoEntry` is the healthy first-run state (Pitfall 1 /
/// D-06) and resolves `Value::Null`, never an error; every other variant collapses into the
/// file's existing flat `keyring:unavailable:{e}` string convention.
pub(crate) fn keyring_get_result(result: Result<String, keyring::Error>) -> Result<Value, String> {
    match result {
        Ok(secret) => Ok(Value::String(secret)),
        Err(keyring::Error::NoEntry) => Ok(Value::Null),
        Err(e) => Err(format!("keyring:unavailable:{e}")),
    }
}

/// The closed set of successful keyring-operation outcomes a `shell_diag()` line may report
/// (quick 261001-p0s, closing the "keyring RPC arms are success-silent" todo). A closed enum
/// rather than a free `&str` parameter: a free string would make it possible to pass a secret
/// as the token, which this type cannot do by construction -- mirrors `afb0fe744`'s
/// `WriteDirection` reasoning in `devSecretVault.ts`, ported to Rust.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum KeyringOutcome {
    Found,
    Absent,
    Stored,
    Deleted,
}

impl KeyringOutcome {
    pub(crate) fn token(self) -> &'static str {
        match self {
            KeyringOutcome::Found => "found",
            KeyringOutcome::Absent => "absent",
            KeyringOutcome::Stored => "stored",
            KeyringOutcome::Deleted => "deleted",
        }
    }
}

/// Renders one keyring success line. Pure and side-effect-free -- same split as
/// `format_panic_record` above, so a test can assert what the line carries without writing to
/// the operator's real log file. No `[shell] ` prefix: `shell_diag` prepends that itself, and a
/// second copy here would double it.
///
/// `account: &'static str` is load-bearing, not a style choice: any secret value is a
/// runtime-derived `String`, which does not coerce to `&'static str`, so the compiler -- not a
/// reviewer -- forbids passing one here. Only `keyring_account()`'s allowlisted return satisfies
/// this parameter; the raw, caller-supplied `keyring_slot_arg()` text never does.
pub(crate) fn keyring_outcome_message(
    channel: &str,
    account: &'static str,
    outcome: KeyringOutcome,
) -> String {
    format!(
        "keyring {channel} account={account} outcome={}",
        outcome.token()
    )
}

/// Classifies a `keyring_get` result into `Found`/`Absent` by reading the `Value`
/// DISCRIMINANT only -- never the payload. That is the whole reason this takes `&Value` and
/// returns an enum rather than formatting anything itself: even the fact of which secret was
/// read must never carry any part of the secret.
pub(crate) fn keyring_get_outcome(value: &Value) -> KeyringOutcome {
    if value.is_null() {
        KeyringOutcome::Absent
    } else {
        KeyringOutcome::Found
    }
}

/// Runs `read` on a worker thread and bounds the wait for its result at `bound`, returning
/// `Err("keyring:timeout")` if `read` has not completed in time (34.4.1 gap cycle 2 plan 26,
/// T-34.4.1-114/T-34.4.1-115). Follows `humble_reveal_post`'s existing `mpsc_channel` +
/// `rx.recv_timeout()` shape rather than inventing a second one. Generic over the read
/// operation specifically so the timeout path is provable in a unit test with an injected
/// slow/never-returning closure, never by waiting on a real Keychain (this plan's own
/// acceptance criteria) -- see `bounded_keyring_read_times_out_as_keyring_timeout_on_a_never_
/// returning_operation` below.
///
/// A timed-out worker thread is ABANDONED, not cancelled -- there is no API to interrupt a
/// blocked platform call, so this function protects the caller's wait, not the underlying
/// operation. If `read` eventually completes after the bound has already elapsed, its result is
/// sent into a channel whose receiver has already been dropped; `Sender::send` on a
/// disconnected channel simply returns an `Err` this function discards, so the abandoned
/// thread's late result is silently dropped rather than causing a panic.
pub(crate) fn bounded_keyring_read<F>(bound: Duration, read: F) -> Result<Value, String>
where
    F: FnOnce() -> Result<Value, String> + Send + 'static,
{
    let (tx, rx) = mpsc_channel::<Result<Value, String>>();
    thread::spawn(move || {
        let _ = tx.send(read());
    });
    match rx.recv_timeout(bound) {
        Ok(result) => result,
        Err(_) => Err("keyring:timeout".to_string()),
    }
}

