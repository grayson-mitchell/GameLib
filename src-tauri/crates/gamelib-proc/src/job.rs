//! Windows kill-on-close Job Objects, one per `SpawnClass::Helper` spawn (the analogue of one unix
//! process group per helper, so reaping a dead sidecar's Job never touches unrelated helpers).
//! An empty module on other platforms.

/// What a `ChildSet` entry holds for its Job: the Job on Windows, nothing elsewhere.
#[cfg(windows)]
pub(crate) type JobSlot = Option<Job>;
#[cfg(not(windows))]
pub(crate) type JobSlot = ();

#[cfg(windows)]
pub use win::Job;

#[cfg(windows)]
mod win {
    use crate::diag::diag;
    use std::os::windows::io::{FromRawHandle, OwnedHandle, RawHandle};
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// A Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`: closing the last handle (our `Drop`,
    /// or the kernel when this process dies) kills every member.
    ///
    /// No breakaway limit is set, so children cannot escape the Job.
    pub struct Job {
        handle: OwnedHandle,
    }

    impl Job {
        /// Creates a Job and assigns `process` to it.
        ///
        /// Known limit: assignment happens after spawn, so a grandchild created before it would
        /// escape; the stand-in (and the Node sidecar) spawn nothing before they are assigned.
        /// Nested jobs are supported on Windows 8+, so an already-jobbed parent is fine.
        ///
        /// Never panics and never uses `?`: any failure is logged (fixed text and the Win32 error
        /// number only) and `None` is returned, leaving the `Child::kill()` fallback.
        pub fn create_for(process: RawHandle) -> Option<Job> {
            // SAFETY: CreateJobObjectW accepts null attributes and name; returns null on failure.
            let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
            if job.is_null() {
                // SAFETY: GetLastError has no preconditions.
                let err = unsafe { GetLastError() };
                diag(&format!(
                    "job object: CreateJobObjectW failed (error {err}); using Child::kill() fallback"
                ));
                return None;
            }

            // SAFETY: the struct is plain-old-data; all-zero is a valid value.
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            // SAFETY: `job` is a valid job handle; the pointer/size describe `info`, which
            // outlives the call.
            let set_ok = unsafe {
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if set_ok == 0 {
                // SAFETY: GetLastError / CloseHandle on the handle we just created.
                let err = unsafe { GetLastError() };
                diag(&format!(
                    "job object: SetInformationJobObject failed (error {err}); using Child::kill() fallback"
                ));
                unsafe { CloseHandle(job) };
                return None;
            }

            // SAFETY: both handles are valid; the caller keeps `process` open for the call.
            let assign_ok = unsafe { AssignProcessToJobObject(job, process as _) };
            if assign_ok == 0 {
                // SAFETY: as above.
                let err = unsafe { GetLastError() };
                diag(&format!(
                    "job object: AssignProcessToJobObject failed (error {err}); using Child::kill() fallback"
                ));
                unsafe { CloseHandle(job) };
                return None;
            }

            // SAFETY: `job` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
            Some(Job {
                handle: unsafe { OwnedHandle::from_raw_handle(job as _) },
            })
        }

        /// Kills every process in the Job now. Returns whether the call succeeded.
        pub fn terminate(&self) -> bool {
            use std::os::windows::io::AsRawHandle;
            // SAFETY: the handle is a valid Job handle owned by `self`.
            let ok = unsafe { TerminateJobObject(self.handle.as_raw_handle() as _, 1) };
            if ok == 0 {
                // SAFETY: GetLastError has no preconditions.
                let err = unsafe { GetLastError() };
                diag(&format!(
                    "job object: TerminateJobObject failed (error {err})"
                ));
            }
            ok != 0
        }
    }
}
