    use objc2_core_foundation::CFString;

    const K_IOPM_ASSERTION_LEVEL_ON: u32 = 255;
    const K_IORETURN_SUCCESS: i32 = 0;

    const ASSERTION_TYPE_DISPLAY: &str = "PreventUserIdleDisplaySleep";
    const ASSERTION_TYPE_SYSTEM: &str = "PreventUserIdleSystemSleep";

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            assertion_type: *const CFString,
            assertion_level: u32,
            assertion_name: *const CFString,
            assertion_id: *mut u32,
        ) -> i32;
        fn IOPMAssertionRelease(assertion_id: u32) -> i32;
    }

    /// Take one assertion, returning its `IOPMAssertionID`. Never panics: an unavailable or
    /// failing power API returns `Err` and the caller logs and carries on.
    pub fn acquire(kind: super::WakeLockKind, name: &str) -> Result<u32, String> {
        let assertion_type = CFString::from_str(match kind {
            super::WakeLockKind::Display => ASSERTION_TYPE_DISPLAY,
            super::WakeLockKind::System => ASSERTION_TYPE_SYSTEM,
        });
        let assertion_name = CFString::from_str(name);
        let mut assertion_id: u32 = 0;
        // SAFETY: both CFStrings outlive the call, and `assertion_id` is a valid out-pointer to
        // a live local. IOKit copies the strings; it does not retain these borrows.
        let result = unsafe {
            IOPMAssertionCreateWithName(
                &*assertion_type,
                K_IOPM_ASSERTION_LEVEL_ON,
                &*assertion_name,
                &mut assertion_id,
            )
        };
        if result == K_IORETURN_SUCCESS {
            Ok(assertion_id)
        } else {
            Err(format!("IOPMAssertionCreateWithName failed: {result:#x}"))
        }
    }

    /// Release exactly the assertion `assertion_id` names.
    pub fn release(assertion_id: u32) -> Result<(), String> {
        // SAFETY: `assertion_id` came from a successful `IOPMAssertionCreateWithName` above and
        // is released at most once -- the registry removes it under the same lock.
        let result = unsafe { IOPMAssertionRelease(assertion_id) };
        if result == K_IORETURN_SUCCESS {
            Ok(())
        } else {
            Err(format!("IOPMAssertionRelease failed: {result:#x}"))
        }
    }
