//! The one crate-global tokio runtime. It hosts the session actor, the anonymous actor and the
//! sign-in flows. Synchronous callers (the shell's plain worker threads, the CLI) `block_on` it.
//!
//! Calling from inside any tokio runtime would panic in `block_on`; `block_on_guarded` returns
//! `Err("steamcm:nested-runtime")` instead (Pitfall 2, T-79-47).

use std::future::Future;
use std::sync::OnceLock;

use tokio::runtime::{Builder, Runtime};

pub(crate) const NESTED_RUNTIME: &str = "steamcm:nested-runtime";

static RUNTIME: OnceLock<Runtime> = OnceLock::new();

/// Multi-thread, two workers. Built on first use; worker threads are named `steamcm`.
pub(crate) fn runtime() -> &'static Runtime {
    RUNTIME.get_or_init(|| {
        Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("steamcm")
            .enable_all()
            .build()
            .expect("steamcm runtime")
    })
}

/// Run `f` to completion on the crate runtime from a thread that is not inside any runtime.
pub(crate) fn block_on_guarded<F: Future>(f: F) -> Result<F::Output, String> {
    if tokio::runtime::Handle::try_current().is_ok() {
        return Err(NESTED_RUNTIME.to_string());
    }
    Ok(runtime().block_on(f))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_runtime_every_call() {
        assert!(std::ptr::eq(runtime(), runtime()));
    }

    #[test]
    fn block_on_from_a_plain_thread_works() {
        assert_eq!(block_on_guarded(async { 7 }), Ok(7));
    }

    #[tokio::test]
    async fn nested_call_is_an_err_not_a_panic() {
        assert_eq!(
            block_on_guarded(async { 7 }),
            Err("steamcm:nested-runtime".to_string())
        );
    }
}
