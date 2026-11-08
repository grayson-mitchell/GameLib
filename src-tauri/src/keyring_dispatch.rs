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
