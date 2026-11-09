//! Job outcome, failure records and the D-09 error-kind list.
//!
//! Reconciled against `depotErrors.ts` `classifyDepotError`, `depot/outcome.ts` and
//! `23.2-MANIFEST-WRITE-TAXONOMY.md`. The TS map (73-11) turns each kind back into the signal
//! `classifyDepotError` reads (it is signature/property based, not instanceof based):
//!
//! | kind                 | TS signal it must map to                                              |
//! | -------------------- | --------------------------------------------------------------------- |
//! | `disk_full`          | message contains `ENOSPC`                                             |
//! | `path_traversal`     | message contains `traversal`                                          |
//! | `sha1_mismatch`      | message contains `sha1 mismatch` (file-level verify)                  |
//! | `size_mismatch`      | file-level size verify failure                                        |
//! | `decode_failed`      | `.code` in DECODE_STAGE_ERROR_CODES (`Failure.code`)                  |
//! | `cdn_http`           | `ChunkHttpError` (`Failure.http_status`)                              |
//! | `network`            | connection-dropped pattern (ECONNRESET, timeout, ...)                 |
//! | `no_content_servers` | "no content servers" plan error                                       |
//! | `stall`              | `isStall` marker + `msSinceProgress`                                  |
//! | `manifest_unavailable` | `.eresult` (`Failure.eresult`) -> isNonRetryableDepotError          |
//! | `manifest_decode`    | manifest parse/decrypt failure                                        |
//! | `not_signed_in`      | "no authenticated Steam CM connection" (signIn action)                |
//! | `path_collision`     | cross-depot case-insensitive path collision                           |
//! | `symlink_failed`     | symlink creation failure                                              |
//! | `delta_unsupported`  | `fromManifest` was `Some` (D-05)                                      |
//! | `io`                 | any other filesystem error (generic bucket)                           |

use serde::{Deserialize, Serialize};

use crate::job::PlannedDepot;

/// `FAILURE_LOG_CAP` (planModel.ts): per-file failures logged in full before suppression.
pub const FAILURE_LOG_CAP: usize = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    CdnHttp,
    DecodeFailed,
    DeltaUnsupported,
    DiskFull,
    Io,
    ManifestDecode,
    ManifestUnavailable,
    Network,
    NoContentServers,
    NotSignedIn,
    PathCollision,
    PathTraversal,
    Sha1Mismatch,
    SizeMismatch,
    Stall,
    SymlinkFailed,
}

/// Every error kind, sorted. The TS map in 73-11 is checked against this list.
pub const ERROR_KINDS: &[&str] = &[
    "cdn_http",
    "decode_failed",
    "delta_unsupported",
    "disk_full",
    "io",
    "manifest_decode",
    "manifest_unavailable",
    "network",
    "no_content_servers",
    "not_signed_in",
    "path_collision",
    "path_traversal",
    "sha1_mismatch",
    "size_mismatch",
    "stall",
    "symlink_failed",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Completed,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureScope {
    Run,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub file: Option<String>,
    pub kind: ErrorKind,
    /// Never a token, key or full URL query.
    pub message: String,
    pub code: Option<String>,
    pub eresult: Option<i32>,
    pub http_status: Option<u16>,
    pub scope: Option<FailureScope>,
    pub ms_since_progress: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcfResult {
    pub state_flags: String,
    pub size_on_disk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedFile {
    pub filename: String,
    pub size: u64,
    pub sha1: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Containers {
    pub vz: u64,
    pub vsza: u64,
    pub pk: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub bytes_fetched: u64,
    pub chunks_fetched: u64,
    pub containers: Containers,
    /// Files given +x by the Mach-O content fallback.
    pub macho_exec_applied: u32,
    /// Cross-depot path collisions detected.
    pub path_collisions: u32,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub job_id: String,
    pub status: Status,
    pub failures: Vec<Failure>,
    pub all_files_verified: bool,
    pub all_modes_applied: bool,
    pub attempted_depots: Vec<PlannedDepot>,
    pub acf: Option<AcfResult>,
    /// `verify_only`: files missing or mismatching.
    pub missing: Option<Vec<String>>,
    /// `select_files`: the files written.
    pub files: Option<Vec<SelectedFile>>,
    pub stats: Stats,
}

/// Port of `selectPrimaryDepotFailure` (depot/outcome.ts): a run-scoped failure beats any
/// file-level one; otherwise the first. `None` for an empty slice (TS throws; the Rust caller
/// is guarded by `failures.is_empty()`).
pub fn select_primary_failure(failures: &[Failure]) -> Option<&Failure> {
    failures
        .iter()
        .find(|f| f.scope == Some(FailureScope::Run))
        .or_else(|| failures.first())
}

#[cfg(test)]
mod tests {
    use super::*;

    impl ErrorKind {
        fn name(self) -> &'static str {
            match self {
                ErrorKind::CdnHttp => "cdn_http",
                ErrorKind::DecodeFailed => "decode_failed",
                ErrorKind::DeltaUnsupported => "delta_unsupported",
                ErrorKind::DiskFull => "disk_full",
                ErrorKind::Io => "io",
                ErrorKind::ManifestDecode => "manifest_decode",
                ErrorKind::ManifestUnavailable => "manifest_unavailable",
                ErrorKind::Network => "network",
                ErrorKind::NoContentServers => "no_content_servers",
                ErrorKind::NotSignedIn => "not_signed_in",
                ErrorKind::PathCollision => "path_collision",
                ErrorKind::PathTraversal => "path_traversal",
                ErrorKind::Sha1Mismatch => "sha1_mismatch",
                ErrorKind::SizeMismatch => "size_mismatch",
                ErrorKind::Stall => "stall",
                ErrorKind::SymlinkFailed => "symlink_failed",
            }
        }
    }

    const ALL: &[ErrorKind] = &[
        ErrorKind::CdnHttp,
        ErrorKind::DecodeFailed,
        ErrorKind::DeltaUnsupported,
        ErrorKind::DiskFull,
        ErrorKind::Io,
        ErrorKind::ManifestDecode,
        ErrorKind::ManifestUnavailable,
        ErrorKind::Network,
        ErrorKind::NoContentServers,
        ErrorKind::NotSignedIn,
        ErrorKind::PathCollision,
        ErrorKind::PathTraversal,
        ErrorKind::Sha1Mismatch,
        ErrorKind::SizeMismatch,
        ErrorKind::Stall,
        ErrorKind::SymlinkFailed,
    ];

    #[test]
    fn error_kinds_const_matches_enum() {
        let serde_names: Vec<String> = ALL
            .iter()
            .map(|k| {
                serde_json::to_value(k)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string()
            })
            .collect();
        let consts: Vec<String> = ERROR_KINDS.iter().map(|s| s.to_string()).collect();
        assert_eq!(serde_names, consts);
        assert!(ALL.iter().zip(ERROR_KINDS).all(|(k, n)| k.name() == *n));
        let mut sorted = consts.clone();
        sorted.sort();
        assert_eq!(sorted, consts, "ERROR_KINDS must stay sorted");
    }

    fn failure(file: Option<&str>, scope: Option<FailureScope>) -> Failure {
        Failure {
            file: file.map(String::from),
            kind: ErrorKind::Io,
            message: "m".into(),
            code: None,
            eresult: None,
            http_status: None,
            scope,
            ms_since_progress: None,
        }
    }

    #[test]
    fn primary_failure_prefers_run_scope() {
        let fs = vec![
            failure(Some("a"), None),
            failure(None, Some(FailureScope::Run)),
        ];
        assert_eq!(
            select_primary_failure(&fs).unwrap().scope,
            Some(FailureScope::Run)
        );
        let fs = vec![failure(Some("a"), None), failure(Some("b"), None)];
        assert_eq!(
            select_primary_failure(&fs).unwrap().file.as_deref(),
            Some("a")
        );
        assert!(select_primary_failure(&[]).is_none());
    }
}
