//! Typed CM failures, the credential-refusal table and the crate diagnostic sink.
//!
//! The sink (`diag`) must never be passed tokens, passwords, keys or request codes (T-28-04).

use std::sync::OnceLock;

/// The EResults with which the CM refuses the credential itself, mirroring
/// `CREDENTIAL_REFUSAL_ERESULTS` in `userTypes.ts`: InvalidPassword, AccessDenied, Revoked,
/// Expired, AccountLogonDenied. Only these may latch `credentialsMissing`.
pub const CREDENTIAL_REFUSAL_ERESULTS: [i32; 5] = [5, 15, 26, 27, 63];

/// EResult 34, LogonSessionReplaced: another client took the session. Not a credential problem.
pub const ERESULT_LOGON_SESSION_REPLACED: i32 = 34;
/// EResult 27, Expired.
pub const ERESULT_EXPIRED: i32 = 27;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CmError {
    Timeout,
    Closed,
    /// IO failure; carries the error kind only.
    Io(String),
    Discovery,
    EResult(i32),
    /// Logon session replaced (EResult 34).
    Replaced,
    /// Protocol or local failure; carries a variant or reason name only, never message bodies.
    Protocol(String),
    Unsupported,
}

pub fn eresult_of(e: &CmError) -> Option<i32> {
    match e {
        CmError::EResult(n) => Some(*n),
        CmError::Replaced => Some(ERESULT_LOGON_SESSION_REPLACED),
        _ => None,
    }
}

pub fn is_credential_refusal(e: &CmError) -> bool {
    eresult_of(e).is_some_and(|n| CREDENTIAL_REFUSAL_ERESULTS.contains(&n))
}

/// Network-level failures that say nothing about the credential and are worth a retry.
pub fn is_transient(e: &CmError) -> bool {
    matches!(
        e,
        CmError::Timeout | CmError::Closed | CmError::Io(_) | CmError::Discovery
    )
}

static SINK: OnceLock<fn(&str)> = OnceLock::new();

fn default_sink(msg: &str) {
    eprintln!("[steamcm] {msg}");
}

/// Route crate diagnostics. First call wins. Never emit secrets through it.
pub fn set_diag_sink(f: fn(&str)) {
    let _ = SINK.set(f);
}

pub(crate) fn diag(msg: &str) {
    #[cfg(test)]
    test_capture::push(msg);
    (SINK.get().copied().unwrap_or(default_sink))(msg);
}

/// Test-only per-thread copy of every `diag` line, so a test can assert that a line reached the
/// crate's sink (the process-global sink is first-call-wins and cannot be swapped per test).
/// `#[tokio::test]` runs on one thread, so a thread-local sees the test's own lines only.
#[cfg(test)]
pub(crate) mod test_capture {
    use std::cell::RefCell;

    thread_local! {
        static LINES: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
    }

    pub(crate) fn push(msg: &str) {
        LINES.with(|l| l.borrow_mut().push(msg.to_string()));
    }

    /// Drain and return the lines `diag` has seen on this thread.
    pub(crate) fn take() -> Vec<String> {
        LINES.with(|l| std::mem::take(&mut *l.borrow_mut()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refusal_table_is_exact() {
        for n in -5..200 {
            assert_eq!(
                is_credential_refusal(&CmError::EResult(n)),
                [5, 15, 26, 27, 63].contains(&n),
                "{n}"
            );
        }
    }

    #[test]
    fn replaced_is_34_and_not_a_refusal() {
        assert_eq!(eresult_of(&CmError::Replaced), Some(34));
        assert!(!is_credential_refusal(&CmError::Replaced));
        assert!(!is_credential_refusal(&CmError::EResult(34)));
    }

    #[test]
    fn transient_kinds_never_refuse() {
        for e in [
            CmError::Timeout,
            CmError::Closed,
            CmError::Io("x".into()),
            CmError::Discovery,
        ] {
            assert!(is_transient(&e));
            assert!(!is_credential_refusal(&e));
            assert_eq!(eresult_of(&e), None);
        }
        assert!(!is_transient(&CmError::EResult(5)));
        assert!(!is_transient(&CmError::Replaced));
    }

    #[test]
    fn secret_debug_is_redacted() {
        let s = crate::backend::RefreshTokenSecret::new("abc".into());
        let d = format!("{s:?}");
        assert!(d.contains("<redacted>") && !d.contains("abc"));
        assert_eq!(s.expose(), "abc");
    }
}
