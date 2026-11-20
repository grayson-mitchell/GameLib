//! `ProcRunner::spawn_streaming` against the real stand-in binary: a line comes through, and
//! cancelling the token kills the child and unregisters it. Plain argv, no env literal.

use gamelib_core::process::ProcessRunner;
use gamelib_proc::probe::is_alive;
use gamelib_proc::{global, ProcRunner};
use std::time::{Duration, Instant};

async fn wait_until(what: &str, limit: Duration, mut pred: impl FnMut() -> bool) {
    let deadline = Instant::now() + limit;
    while !pred() {
        assert!(Instant::now() < deadline, "timed out waiting for: {what}");
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

#[tokio::test]
async fn cancelling_a_stream_kills_the_child_and_unregisters_it() {
    let label = "runner-stream-test";
    let runner = ProcRunner::helper(label);
    let mut child = runner
        .spawn_streaming(
            env!("CARGO_BIN_EXE_gamelib-proc-standin"),
            vec!["lines".to_string()],
        )
        .expect("spawn the stand-in");

    let line = tokio::time::timeout(Duration::from_secs(15), child.lines.recv())
        .await
        .expect("a line within 15 s")
        .expect("the stream is open");
    let pid: u32 = line.trim().parse().expect("the stand-in prints its pid");
    assert!(is_alive(pid), "child alive while streaming");
    assert!(global().labels().contains(&label), "registered while alive");

    child.kill.cancel();
    wait_until("the child to die", Duration::from_secs(5), || {
        !is_alive(pid)
    })
    .await;
    wait_until("the child to unregister", Duration::from_secs(5), || {
        !global().labels().contains(&label)
    })
    .await;
}
