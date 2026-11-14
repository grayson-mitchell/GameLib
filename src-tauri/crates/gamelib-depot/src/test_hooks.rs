//! Test-only seams, compiled only with feature `test-hooks` (enabled by this crate's own
//! dev-dependency, never by release or shell builds).
//!
//! It exists only to land a cancel deterministically in the window between the commit journal
//! write and the abort check in `delta_body` (IN-02).

use std::sync::Mutex;

static ARMED: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Arms a one-shot cancel of `job_id` right after its commit journal is written.
pub fn cancel_after_journal_write(job_id: &str) {
    ARMED.lock().unwrap().push(job_id.to_string());
}

pub(crate) fn after_journal_write(job_id: &str) {
    let hit = {
        let mut a = ARMED.lock().unwrap();
        match a.iter().position(|j| j == job_id) {
            Some(i) => {
                a.remove(i);
                true
            }
            None => false,
        }
    };
    if hit {
        crate::registry::cancel(job_id);
    }
}
