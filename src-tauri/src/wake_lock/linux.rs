    use std::process::{Child, Command, Stdio};

    pub fn acquire(kind: super::WakeLockKind, why: &str) -> Result<Child, String> {
        let what = match kind {
            super::WakeLockKind::Display => "idle",
            super::WakeLockKind::System => "idle:sleep",
        };
        Command::new("systemd-inhibit")
            .arg(format!("--what={what}"))
            .arg("--who=GameLib")
            .arg(format!("--why={why}"))
            .arg("--mode=block")
            .arg("cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("systemd-inhibit could not spawn: {e}"))
    }

    pub fn release(mut child: Child) -> Result<(), String> {
        // Closing stdin is the graceful path: `cat` sees EOF and exits, `systemd-inhibit`
        // follows, logind drops the lock. `kill` is the backstop if it does not.
        drop(child.stdin.take());
        let _ = child.kill();
        child
            .wait()
            .map(|_| ())
            .map_err(|e| format!("systemd-inhibit could not be reaped: {e}"))
    }
