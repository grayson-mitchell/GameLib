use super::*;

// ---- Rust-side keyring dispatch (Phase 28: sidecar->Rust rustInvoke channel) ----

/// Dispatches a `rustInvoke` frame's `channel`/`args` to the matching keyring operation.
/// The Keychain `service` is the compile-time `KEYRING_SERVICE` constant; the `account` is
/// resolved from a compile-time ALLOWLIST (`keyring_account`) keyed by a caller-supplied slot
/// NAME (`keyring_slot_arg`) — never an account string sourced directly from `args` (threat
/// T-28-03: the sidecar must not be able to address an arbitrary Keychain entry). **T-28-03
/// still holds**: the slot can only ever select one of a fixed, compile-time set of accounts —
/// the sidecar's reachable set is exactly the allowlist, not an open namespace. Error mapping
/// follows this file's existing flat `String` convention (`.map_err(|e| e.to_string())`, see
/// `open_external` above); a bare `keyring::Error` variant is never returned as-is.
///
/// macOS-only follow-up for `shell_show_item_in_folder` (debug session
/// `finder-reveal-no-selection`, 2026-08-23, source: Phase 34.3 UAT G1 / REQ-34.3-11 item 2).
///
/// ROOT CAUSE (machine-verified, caller-independent): `reveal_item_in_dir` opens the correct
/// folder 100% of the time, but the SELECTION half of the operation is silently dropped by
/// Finder/AppKit whenever the app that was frontmost *before* the reveal fired has its key
/// window on a different display/Space than the one Finder's reveal window opens on (this
/// machine's primary display, regardless of which display the caller occupies — "Displays have
/// separate Spaces" is macOS's default). This is NOT specific to GameLib's code path or to the
/// `NSWorkspace.activateFileViewerSelecting` API: a standalone Swift binary calling that same
/// API reproduced 0/16 selections under the identical display condition (20/20 and 6/6 with
/// Terminal/Safari frontmost on the primary display), and even a manual two-step
/// `tell application "Finder" to reveal … / activate` AppleScript reproduces the identical drop.
/// GameLib's own window commonly lives on a secondary display during development, which is
/// exactly the failing condition.
///
/// FIX (machine-verified 8/8, including with zero added delay): fire a SEPARATE, follow-up
/// `select POSIX file` Apple Event at Finder after the initial reveal. Apple Events queue, so
/// this reliably lands once Finder is ready — it does not need to race the space/display
/// transition the way the bundled reveal+select call does. The path is passed as a real
/// `osascript` argument (`on run argv`), never interpolated into script text, so no
/// quote/backslash escaping is needed. Runs on a detached thread so the RPC caller is not held
/// up waiting on this fire-and-forget correction; the small sleep is a safety margin, not a
/// measured requirement.
#[cfg(target_os = "macos")]
pub(crate) fn macos_finder_reselect_workaround(path: &str) {
    let path = path.to_string();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(150));
        // `POSIX file <text>` yields an unresolved file *specifier*; Finder's `select` needs a
        // real filesystem reference, so the `as alias` coercion is load-bearing. Without it
        // every invocation fails with AppleScript -1728 ("Can't get POSIX file ...") and, since
        // the failure is only visible in osascript's stderr, the whole workaround degrades to a
        // silent no-op. Verified: the uncoerced form errored 5/5, the coerced form 5/5 OK.
        let out = Command::new("osascript")
            .arg("-e")
            .arg(
                "on run argv\n  tell application \"Finder\" to select (POSIX file (item 1 of argv) as alias)\nend run",
            )
            .arg(&path)
            .output();
        // Report failures rather than discarding them. This path is a best-effort correction, so
        // a failure must never propagate to the caller -- but it must not be invisible either:
        // the defect above survived precisely because nothing reported it. Matches the existing
        // `[shell]` eprintln diagnostic convention used by `open_external`.
        match out {
            Ok(o) if !o.status.success() || !o.stderr.is_empty() => {
                shell_eprintln!(
                    "[shell] finder reselect workaround failed for {:?}: {}",
                    path,
                    String::from_utf8_lossy(&o.stderr).trim()
                );
            }
            Err(e) => {
                shell_eprintln!("[shell] finder reselect workaround could not spawn osascript: {e}")
            }
            _ => {}
        }
    });
}

// OBSERVABILITY, not a root-cause fix (34.4.1 gap cycle 2 plan 26, F-9). F-9's cause is
// NOT established by this plan -- the missing-entry hypothesis's harness verdict is
// recorded in `keyring_read_timing_hypothesis_absent_vs_present_entry`'s doc comment and
// in `34.4.1-26-SUMMARY.md`. What this wrapper DOES do: bound the wait on
// `entry.get_password()` at `KEYRING_READ_TIMEOUT`, well under the sidecar's own 60s
// `RUST_INVOKE_TIMEOUT_MS` (`sidecarRpc.ts`), so a blocked read (e.g. an unanswered
// Keychain prompt -- `phase-28-keyring-complete`'s Deny -> `PlatformFailure(-128)` is a
// real, reachable state) fails fast as a NAMED `keyring:timeout` instead of silently
// consuming the sidecar's whole RPC budget and surfacing as an unattributable generic
// RPC timeout. It does NOT make a blocking Keychain call return faster -- the worker
// thread is abandoned on timeout, not cancelled (`bounded_keyring_read`'s own doc
// comment).
//
// Sibling arms deliberately NOT wrapped: `keyring_set` and `keyring_delete` below keep
// their original unbounded synchronous shape. Reads (`keyring_get`) fire transparently
// and repeatedly behind the scenes on every credential/csrf lookup (the read-count
// defect this gap cycle's `deferred-items.md` traces as F-9's likely amplifier); writes
// and deletes fire only on an explicit user action (sign-in, disconnect) the user is
// already actively engaged with, at far lower frequency, so a modal prompt there is a
// single expected step in a flow the user just started, not a silent stall behind an
// unrelated background call. `keyring_available` (below `keyring_delete`) is likewise
// left unwrapped: it exists as a read-adjacent probe and would be a natural Task-scope
// candidate for a later plan, but this plan's own harness and fix are scoped to the
// exact `keyring_get` signature F-9 was observed on.
pub(crate) fn rpc_keyring_get(channel: &str, args: &[Value]) -> Result<Value, String> {
    let a = KeyringGetArgs::from_args(args)?;
    let account = keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
    let result = bounded_keyring_read(KEYRING_READ_TIMEOUT, move || {
        let outcome =
            Entry::new(KEYRING_SERVICE, account).and_then(|entry| entry.get_password());
        keyring_get_result(outcome)
    });
    // Four explicit branches, each emitting exactly one line: the Ok arm is split on
    // `keyring_get_outcome()`'s own discriminant (Found vs. Absent) rather than folded
    // into one dynamically-dispatched call, so the Found/Absent distinction is visible
    // at this call site and not just inside the pure classifier it delegates to.
    match &result {
        Ok(v) if keyring_get_outcome(v) == KeyringOutcome::Found => {
            shell_diag(&keyring_outcome_message(
                channel,
                account,
                KeyringOutcome::Found,
            ));
        }
        Ok(_) => {
            shell_diag(&keyring_outcome_message(
                channel,
                account,
                KeyringOutcome::Absent,
            ));
        }
        Err(e) if e == "keyring:timeout" => {
            shell_diag(&format!(
                "keyring {channel} timed out after {KEYRING_READ_TIMEOUT:?} (worker thread abandoned, not cancelled -- see KEYRING_READ_TIMEOUT's doc comment)"
            ));
        }
        Err(e) => {
            shell_diag(&format!("keyring {channel} failed: {e}"));
        }
    }
    result
}

pub(crate) fn rpc_keyring_set(channel: &str, args: &[Value]) -> Result<Value, String> {
    let a = KeyringSetArgs::from_args(args)?;
    let account = keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
    match Entry::new(KEYRING_SERVICE, account) {
        Ok(entry) => match entry.set_password(&a.secret) {
            Ok(()) => {
                shell_diag(&keyring_outcome_message(
                    channel,
                    account,
                    KeyringOutcome::Stored,
                ));
                Ok(Value::Bool(true))
            }
            Err(e) => {
                // The emitter has no parameter capable of carrying the secret
                // (threat T-28-04): `keyring_outcome_message`'s types forbid it,
                // and `secret` is never passed to it -- channel + error only,
                // enforced by construction rather than by this comment alone.
                shell_diag(&format!("keyring {channel} failed: {e:?}"));
                Err(format!("keyring:unavailable:{e}"))
            }
        },
        Err(e) => {
            shell_diag(&format!("keyring {channel} failed: {e:?}"));
            Err(format!("keyring:unavailable:{e}"))
        }
    }
}

pub(crate) fn rpc_keyring_delete(channel: &str, args: &[Value]) -> Result<Value, String> {
    let a = KeyringDeleteArgs::from_args(args)?;
    let account = keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
    match Entry::new(KEYRING_SERVICE, account) {
        Ok(entry) => match entry.delete_credential() {
            // Deleting an already-absent entry is success, not an error -- and the
            // two arms below now differ in their logged token while remaining
            // identical in their returned result.
            Ok(()) => {
                shell_diag(&keyring_outcome_message(
                    channel,
                    account,
                    KeyringOutcome::Deleted,
                ));
                Ok(Value::Bool(true))
            }
            Err(keyring::Error::NoEntry) => {
                shell_diag(&keyring_outcome_message(
                    channel,
                    account,
                    KeyringOutcome::Absent,
                ));
                Ok(Value::Bool(true))
            }
            Err(e) => {
                shell_diag(&format!("keyring {channel} failed: {e:?}"));
                Err(format!("keyring:unavailable:{e}"))
            }
        },
        Err(e) => {
            shell_diag(&format!("keyring {channel} failed: {e:?}"));
            Err(format!("keyring:unavailable:{e}"))
        }
    }
}

// NON-PROMPTING since quick-260905-l8g. This arm used to call `entry.get_password()` on
// the caller's REAL slot, which is a full secret read: it raised a macOS authorization
// dialog exactly like `keyring_get`, while being documented as a cheap capability probe.
// Logging that prompt (quick-260905-jx3) and teaching the startup gate to see it
// (quick-260905-kd0) were mitigations; this removes the channel.
//
// The slot argument is still parsed and still validated, so `keyring:unknown-slot` remains
// the contract for an unrecognised slot -- but it deliberately no longer selects the item
// looked up. The question this arm answers is slot-INDEPENDENT, which is what its own
// documentation always claimed ("Backend works, whether or not a token is currently
// stored") and what `SidecarHumbleSecretStore.isAvailable()` already relies on ("a
// Keychain that is reachable for one slot is reachable for the other").
//
// Accepted semantic narrowing, stated rather than buried: a user who DENIES the dialog for
// a real item used to drive this to `false`. It now stays `true`, because denying access
// to one item does not make the backend unavailable. The one affected caller is
// `humble/user.ts`'s `encryptionDegraded` flag; a failed write is reported by
// `setSecret()`'s own error handling, not by this probe.
pub(crate) fn rpc_keyring_available(channel: &str, args: &[Value]) -> Result<Value, String> {
    // Conversion-only (quick 261001-p0s), deliberately: a capability probe against a
    // never-written account has no slot-scoped outcome worth a `KeyringOutcome`
    // token, unlike the three arms above. Its `Ok(_)` branch already emits a loud
    // WARNING, which is the one event here worth reading; this does not re-create
    // the blind spot being closed elsewhere in this `match`, it just carries no
    // success emission of its own.
    //
    // Validated for its rejection contract, intentionally unused for the lookup.
    let a = KeyringAvailableArgs::from_args(args)?;
    let _validated_slot =
        keyring_account(a.slot.as_deref().unwrap_or(KEYRING_DEFAULT_SLOT))?;
    match Entry::new(KEYRING_SERVICE, KEYRING_REACHABILITY_PROBE_ACCOUNT) {
        Ok(entry) => match entry.get_password() {
            // THE expected healthy answer. The backend answered, and answered that this
            // deliberately-never-written account holds nothing -- which is exactly the
            // fast, ACL-free path this probe is built on.
            Err(keyring::Error::NoEntry) => Ok(Value::Bool(true)),
            // Reachable, but something wrote to a reserved account. The backend is
            // demonstrably up so the honest answer is still `true`, but this must be loud:
            // an item here means the probe has re-acquired an ACL and may prompt again.
            Ok(_) => {
                shell_diag(&format!(
                    "keyring {channel}: WARNING -- a value exists at the reserved probe account; the reachability probe may raise an authorization prompt again (see KEYRING_REACHABILITY_PROBE_ACCOUNT)"
                ));
                Ok(Value::Bool(true))
            }
            // A *successful* report of unavailability (D-06's honest-unavailable signal),
            // not an error — the caller asked "is it available", and the honest answer
            // here is "no".
            Err(e) => {
                shell_diag(&format!("keyring {channel} failed: {e:?}"));
                Ok(Value::Bool(false))
            }
        },
        Err(e) => {
            shell_diag(&format!("keyring {channel} failed: {e:?}"));
            Ok(Value::Bool(false))
        }
    }
}

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
