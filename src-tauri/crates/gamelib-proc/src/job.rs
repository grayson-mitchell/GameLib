//! Windows Job Objects: one kill-on-close `Job` per `SpawnClass::Helper` spawn (the analogue of one
//! unix process group per helper, so reaping a dead sidecar's Job never touches unrelated helpers),
//! and one named `GameJob` per tracked `SpawnClass::Game` spawn that does NOT kill on close, so the
//! game tree outlives GameLib and can be found again by name. An empty module on other platforms.

/// What a `ChildSet` entry holds for its Job: the Job on Windows, nothing elsewhere.
#[cfg(windows)]
pub(crate) type JobSlot = Option<Job>;
#[cfg(not(windows))]
pub(crate) type JobSlot = ();

#[cfg(windows)]
pub use win::{GameJob, Job};

#[cfg(windows)]
mod win {
    use crate::diag::diag;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle, RawHandle};
    use windows_sys::Win32::Foundation::{
        CloseHandle, GetLastError, SetLastError, ERROR_ALREADY_EXISTS,
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
        JobObjectExtendedLimitInformation, OpenJobObjectW, QueryInformationJobObject,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::SystemServices::{JOB_OBJECT_QUERY, JOB_OBJECT_TERMINATE};

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

    /// The Job name of the game whose leader is `pid` with start `stamp`, NUL-terminated UTF-16.
    /// `Local\` keeps it in the session namespace; pid and stamp both in the name mean a Job
    /// squatted under a different pid or stamp is never the one opened (T-88.2-08, T-88.2-09).
    fn game_job_name(pid: u32, stamp: u64) -> Vec<u16> {
        format!("Local\\GameLib-Game-{pid}-{stamp}")
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect()
    }

    /// A named Job Object holding one tracked game's tree, created WITHOUT
    /// `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`: closing the last handle, or GameLib dying, leaves the
    /// game and its descendants running, and the Job (which lives while any member does) can be
    /// reopened by name from another process (`GameJob::open`).
    ///
    /// Known limit, the same as the helper `Job`: assignment happens after the game is created, so
    /// a descendant it creates before then is not in the Job.
    #[derive(Debug)]
    pub struct GameJob {
        handle: OwnedHandle,
    }

    impl GameJob {
        /// Creates the Game Job named for `pid` and `stamp` and assigns `process` to it.
        ///
        /// Never panics and never uses `?`: any failure (an existing Job of that name included,
        /// which would not be ours) is logged with fixed text and the Win32 error number only and
        /// answers `None`, leaving the leader-only kill.
        pub fn create_for(process: RawHandle, pid: u32, stamp: u64) -> Option<GameJob> {
            let name = game_job_name(pid, stamp);
            // SAFETY: SetLastError takes a plain value; it clears a stale error so the
            // ERROR_ALREADY_EXISTS check below reads this call's result.
            unsafe { SetLastError(0) };
            // SAFETY: null attributes are allowed and `name` is a NUL-terminated UTF-16 string that
            // outlives the call; CreateJobObjectW returns null on failure.
            let job = unsafe { CreateJobObjectW(std::ptr::null(), name.as_ptr()) };
            // SAFETY: GetLastError has no preconditions; read before any other call can change it.
            let err = unsafe { GetLastError() };
            if job.is_null() {
                diag(&format!(
                    "game job: CreateJobObjectW failed (error {err}); leader-only kill"
                ));
                return None;
            }
            if err == ERROR_ALREADY_EXISTS {
                // SAFETY: `job` is the handle just returned and is closed exactly once.
                unsafe { CloseHandle(job) };
                diag("game job: a job of that name already exists; leader-only kill");
                return None;
            }
            // SAFETY: `job` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
            let handle = unsafe { OwnedHandle::from_raw_handle(job as _) };
            // SAFETY: both handles are valid; the caller keeps `process` open for the call.
            let assigned =
                unsafe { AssignProcessToJobObject(handle.as_raw_handle() as _, process as _) };
            if assigned == 0 {
                // SAFETY: GetLastError has no preconditions.
                let err = unsafe { GetLastError() };
                diag(&format!(
                    "game job: AssignProcessToJobObject failed (error {err}); leader-only kill"
                ));
                return None;
            }
            Some(GameJob { handle })
        }

        /// Opens the Game Job of `pid` and `stamp` by name with terminate and query rights only.
        /// `None` when no such Job exists (the game and its descendants are gone, or it never had
        /// one).
        pub fn open(pid: u32, stamp: u64) -> Option<GameJob> {
            let name = game_job_name(pid, stamp);
            // SAFETY: `name` is a NUL-terminated UTF-16 string that outlives the call; the call
            // returns null on failure.
            let job = unsafe {
                OpenJobObjectW(JOB_OBJECT_TERMINATE | JOB_OBJECT_QUERY, 0, name.as_ptr())
            };
            if job.is_null() {
                return None;
            }
            // SAFETY: `job` is a valid, uniquely-owned handle; OwnedHandle closes it on drop.
            Some(GameJob {
                handle: unsafe { OwnedHandle::from_raw_handle(job as _) },
            })
        }

        /// Kills every process in the Job now. Returns whether the call succeeded.
        pub fn terminate(&self) -> bool {
            // SAFETY: the handle is a valid Job handle owned by `self`.
            let ok = unsafe { TerminateJobObject(self.handle.as_raw_handle() as _, 1) };
            if ok == 0 {
                // SAFETY: GetLastError has no preconditions.
                let err = unsafe { GetLastError() };
                diag(&format!(
                    "game job: TerminateJobObject failed (error {err})"
                ));
            }
            ok != 0
        }

        /// How many processes the Job still holds, `None` when the query fails.
        pub fn active_processes(&self) -> Option<u32> {
            // SAFETY: the struct is plain-old-data; all-zero is a valid value.
            let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { std::mem::zeroed() };
            // SAFETY: the handle is a valid Job handle; the pointer and size describe `info`,
            // which outlives the call; the returned length is not needed.
            let ok = unsafe {
                QueryInformationJobObject(
                    self.handle.as_raw_handle() as _,
                    JobObjectBasicAccountingInformation,
                    &mut info as *mut _ as *mut core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                    std::ptr::null_mut(),
                )
            };
            (ok != 0).then_some(info.ActiveProcesses)
        }
    }
}
