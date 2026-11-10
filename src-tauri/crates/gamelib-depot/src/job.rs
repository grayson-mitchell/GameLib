//! Wire types for the depot job: request (`DepotJob`, `SummarizeRequest`), events (`JobEvent`) and
//! the hand-redacted `Debug` impls. 64-bit ids are `String` end to end (never a JS number).
//! Mirrors RESEARCH Pattern 5; the TS side (73-11) builds these.

use serde::{Deserialize, Serialize};
use std::fmt;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobMode {
    Install,
    VerifyOnly,
    SelectFiles,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DepotRef {
    pub depot_id: String,
    pub manifest_id: String,
    pub request_code: Option<String>,
    /// 64 hex chars (AES-256 depot key). Never logged.
    pub key: String,
    pub owner_app_id: String,
    /// D-05: delta-ready shape. Must be `None` in phase 73; `Some` yields `delta_unsupported`.
    #[serde(default)]
    pub from_manifest: Option<String>,
}

impl fmt::Debug for DepotRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DepotRef")
            .field("depot_id", &self.depot_id)
            .field("manifest_id", &self.manifest_id)
            .field(
                "request_code",
                &self.request_code.as_ref().map(|_| "<redacted>"),
            )
            .field("key", &"<redacted>")
            .field("owner_app_id", &self.owner_app_id)
            .field("from_manifest", &self.from_manifest)
            .finish()
    }
}

/// Mirrors TS `ContentServerHostMeta` plus the host string (decompress.ts).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostRef {
    pub host: String,
    pub vhost: Option<String>,
    /// "CDN" | "SteamCache" | ...
    pub kind: Option<String>,
    pub https_support: Option<String>,
    pub use_token_auth: bool,
    pub weighted_load: Option<f64>,
}

/// D-11: policy inputs for the post-download appmanifest write, decided by TS.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FinalizeSpec {
    pub steamapps_dir: String,
    pub installdir: String,
    pub name: String,
    pub buildid: Option<String>,
    pub last_owner: Option<String>,
    pub allow_full_ownership: bool,
    /// quick 261110-up7: the Steam beta branch the depots were selected from. None or "public"
    /// writes no BetaKey.
    #[serde(default)]
    pub beta_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JobLimits {
    pub file_concurrency: u32,
    pub inflight_chunks: u32,
    pub decode_threads: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DepotJob {
    pub job_id: String,
    pub mode: JobMode,
    pub app_id: String,
    pub install_root: String,
    pub depots: Vec<DepotRef>,
    pub hosts: Vec<HostRef>,
    /// Required iff `mode == select_files`.
    pub select_paths: Option<Vec<String>>,
    /// `None` for shared redists (D-12) and `select_files`.
    pub finalize: Option<FinalizeSpec>,
    pub limits: Option<JobLimits>,
}

/// D-02: manifest summary request (file count / bytes / pattern matches per depot).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SummarizeRequest {
    pub app_id: String,
    pub depots: Vec<DepotRef>,
    pub hosts: Vec<HostRef>,
    pub patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepotSummary {
    pub depot_id: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub matches: Vec<String>,
    /// Filenames (manifest form, not normalised) of the files flagged InstallScript (256), so a
    /// shared redist can find its installscript without the file list (73-19, D-02).
    pub installscripts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeResult {
    pub depots: Vec<DepotSummary>,
    /// Depots Steam refused with EResult 40 (Blocked); left out of `depots`.
    #[serde(default)]
    pub skipped_depots: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedDepot {
    pub depot_id: String,
    pub gid: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStat {
    pub host: String,
    pub bytes: u64,
    pub chunks: u64,
    pub failures: u32,
}

/// Body of a `JobEvent`; the `kind` tag is flattened next to `jobId` / `seq`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum JobEventBody {
    #[serde(rename_all = "camelCase")]
    Planned {
        total_bytes: u64,
        total_files: u64,
        depots: Vec<PlannedDepot>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        done_bytes: u64,
        net_bytes: u64,
        total_bytes: u64,
        files_done: u64,
        files_total: u64,
        host: Option<String>,
        elapsed_ms: u64,
    },
    /// `message` is never a token, key or full URL query.
    #[serde(rename_all = "camelCase")]
    Warning { message: String, count: u32 },
    #[serde(rename_all = "camelCase")]
    HostSummary { hosts: Vec<HostStat> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEvent {
    pub job_id: String,
    pub seq: u64,
    #[serde(flatten)]
    pub body: JobEventBody,
}

fn is_numeric_id(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

impl DepotJob {
    /// Port of `NUMERIC_ID` (planModel.ts) plus key / path shape checks.
    pub fn validate(&self) -> Result<(), String> {
        let bad = || "depot_job_run:bad-args".to_string();
        if self.job_id.is_empty() || !is_numeric_id(&self.app_id) {
            return Err(bad());
        }
        for d in &self.depots {
            if !is_numeric_id(&d.depot_id)
                || !is_numeric_id(&d.manifest_id)
                || !is_numeric_id(&d.owner_app_id)
                || d.key.len() != 64
                || !d.key.bytes().all(|b| b.is_ascii_hexdigit())
            {
                return Err(bad());
            }
        }
        if self.mode == JobMode::SelectFiles && self.select_paths.is_none() {
            return Err(bad());
        }
        if !Path::new(&self.install_root).is_absolute() {
            return Err(bad());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn job_json(from_manifest: serde_json::Value) -> serde_json::Value {
        json!({
            "jobId": "j1", "mode": "install", "appId": "480",
            "installRoot": if cfg!(windows) { "C:\\games\\x" } else { "/games/x" },
            "depots": [{
                "depotId": "481", "manifestId": "123", "requestCode": null,
                "key": KEY, "ownerAppId": "480", "fromManifest": from_manifest
            }],
            "hosts": [], "selectPaths": null, "finalize": null, "limits": null
        })
    }

    #[test]
    fn job_schema_accepts_null_from_manifest() {
        let job: DepotJob = serde_json::from_value(job_json(json!(null))).expect("parses");
        assert!(job.depots[0].from_manifest.is_none());
        job.validate().expect("valid");
    }

    #[test]
    fn job_schema_rejects_unknown_field() {
        let mut v = job_json(json!(null));
        v["surprise"] = json!(1);
        assert!(serde_json::from_value::<DepotJob>(v).is_err());
        let mut v = job_json(json!(null));
        v["depots"][0]["extra"] = json!(1);
        assert!(serde_json::from_value::<DepotJob>(v).is_err());
    }

    #[test]
    fn job_debug_redacts_key() {
        let mut v = job_json(json!(null));
        v["depots"][0]["requestCode"] = json!("98765432123456789");
        let job: DepotJob = serde_json::from_value(v).expect("parses");
        let dbg = format!("{job:?}");
        assert!(!dbg.contains(KEY));
        assert!(!dbg.contains("98765432123456789"));
        assert!(dbg.contains("<redacted>"));
    }

    #[test]
    fn validate_rejects_bad_shapes() {
        let mut job: DepotJob = serde_json::from_value(job_json(json!(null))).unwrap();
        job.depots[0].key = "zz".into();
        assert!(job.validate().is_err());
        let mut job: DepotJob = serde_json::from_value(job_json(json!(null))).unwrap();
        job.app_id = "48a".into();
        assert!(job.validate().is_err());
        let mut job: DepotJob = serde_json::from_value(job_json(json!(null))).unwrap();
        job.mode = JobMode::SelectFiles;
        assert!(job.validate().is_err());
        let mut job: DepotJob = serde_json::from_value(job_json(json!(null))).unwrap();
        job.install_root = "relative/dir".into();
        assert!(job.validate().is_err());
    }

    #[test]
    fn event_serializes_with_flat_kind() {
        let ev = JobEvent {
            job_id: "j".into(),
            seq: 3,
            body: JobEventBody::Warning {
                message: "m".into(),
                count: 2,
            },
        };
        let v = serde_json::to_value(&ev).unwrap();
        assert_eq!(v["kind"], "warning");
        assert_eq!(v["jobId"], "j");
        assert_eq!(v["count"], 2);
    }
}
