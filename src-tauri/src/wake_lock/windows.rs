    use std::sync::mpsc::{channel as mpsc_channel, Sender};
    use std::sync::OnceLock;
    use std::thread;

    pub const ES_CONTINUOUS: u32 = 0x8000_0000;
    pub const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
    pub const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(es_flags: u32) -> u32;
    }

    static FLAG_THREAD: OnceLock<Sender<u32>> = OnceLock::new();

    /// Post a recomputed flag word to the long-lived holder thread, starting it if needed.
    pub fn apply(flags: u32) -> Result<(), String> {
        let sender = FLAG_THREAD.get_or_init(|| {
            let (tx, rx) = mpsc_channel::<u32>();
            thread::spawn(move || {
                // This thread must OUTLIVE every assertion it takes; it parks here for the
                // life of the process and never returns while the sender is alive.
                while let Ok(next) = rx.recv() {
                    // SAFETY: a plain kernel32 call with no pointer arguments. A 0 return
                    // means failure, which is reported by the next `apply` round-trip rather
                    // than panicking on this thread.
                    let previous = unsafe { SetThreadExecutionState(next) };
                    if previous == 0 {
                        shell_eprintln!(
                            "[shell] WARN: wake lock SetThreadExecutionState({next:#x}) failed -- continuing"
                        );
                    }
                }
            });
            tx
        });
        sender
            .send(flags)
            .map_err(|_| "wake_lock:flag-thread-gone".to_string())
    }
