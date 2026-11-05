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

