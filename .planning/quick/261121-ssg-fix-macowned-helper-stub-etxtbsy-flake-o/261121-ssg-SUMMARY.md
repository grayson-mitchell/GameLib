---
quick_id: 261121-ssg
status: complete
---

# Summary: macowned helper stub ETXTBSY flake

**Cause (mechanism-matched, not reproduced locally):** the test `stub()` wrote the helper script with
`std::fs::write` in-process and then exec'd it. Cargo runs tests on parallel threads and several of them
spawn children. If another thread forks while the write fd is open, the child inherits the fd until its
own exec (O_CLOEXEC only closes it at exec). On Linux, exec'ing a file that has an open write fd fails
with ETXTBSY. `run_helper` maps any spawn error to `FallbackReason::HelperFailed`, which is exactly the
`left: Err(HelperFailed)` in CI run 44872994911. macOS doesn't return ETXTBSY, and the test is
`#[cfg(unix)]`, so it couldn't fail on Windows. That fits the test failing only on ubuntu. It isn't
an exit-status race: a missed exit code gives `code() == None`, which falls into `_ => HelperFailed`
too, but `wait_with_output` reaps the child and gets its status reliably.

**Fix:** `stub()` writes the body to a side file (never exec'd), creates the stub with a `cp` child, so
the only write fd on it lives in that child, which has exited before we exec, then chmods by path.
Deterministic, no retries.

**Verified:** fmt, clippy `-D warnings`, `cargo test -p gamelib-steamcm` (309 passed) on macOS.
macOS can't show the race, so the Linux evidence comes only from CI over time.

**Not changed:** `refresh/mod.rs` `mac_source_runs_anonymously_and_carries_playtime_forward` writes a stub
the same way, but it is `#[cfg(target_os = "macos")]`, so it can't hit ETXTBSY.
