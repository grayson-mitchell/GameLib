//! The tested-CrossOver-builds record (phase 59, D-15), `testedCrossoverVersions.ts`. It warns, never
//! blocks: every function answers a boolean, a line or `None`. Separate from the ntdll patch rows,
//! which additionally need an ntdll hash.

use serde_json::Value;

use crate::crossover::run_tool::{run_tool, RunToolArgs};
use crate::ctx::EngineCtx;
use crate::jsutil::js_trim;

/// The CFBundleVersion of every build GameLib was tested with (equal to the bottle conf `Version`).
const TESTED_CROSSOVER_BUILDS: [&str; 1] = ["26.3.0.39832"];

const CX_BIN_SUFFIX: &str = "/Contents/SharedSupport/CrossOver/bin";
/// The most dismissed builds the notices store keeps: a longer list is cut to its last entries on the
/// next write.
pub const MAX_DISMISSED: usize = 50;
/// The store key of the builds whose untested notice the user dismissed.
pub const UNTESTED_DISMISSED_KEY: &str = "dismissedUntestedCrossoverBuilds";
/// `plutil` reads one key of one plist: a second is plenty.
const PLUTIL_TIMEOUT_MS: u64 = 15_000;

/// `^\d+\.\d+\.\d+\.\d+$` with ASCII digits only (JS `\d`) and no line-terminator allowance.
fn is_build(text: &str) -> bool {
    let mut parts = 0;
    for part in text.split('.') {
        parts += 1;
        if part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()) {
            return false;
        }
    }
    parts == 4
}

pub fn is_tested_crossover(build: Option<&str>) -> bool {
    build.is_some_and(|b| TESTED_CROSSOVER_BUILDS.contains(&b))
}

pub fn untested_log_line(build: Option<&str>) -> Option<String> {
    let Some(b) = build else {
        return Some(
            "Engine: CrossOver build could not be read; treating it as untested".to_string(),
        );
    };
    if is_tested_crossover(build) {
        return None;
    }
    Some(format!(
        "Engine: CrossOver build {b} is untested with GameLib; please report issues"
    ))
}

/// Where the dismissed builds live (the TS `EngineNoticeStore`): the engine's notice store, owned
/// outside this module. `get` answers the stored value or `None`; `set` replaces it.
pub trait NoticeStore {
    fn get(&self, key: &str) -> Option<Value>;
    fn set(&self, key: &str, value: Value);
}

fn read_dismissed(store: &dyn NoticeStore) -> Vec<String> {
    match store.get(UNTESTED_DISMISSED_KEY) {
        Some(Value::Array(items)) => items
            .into_iter()
            .filter_map(|v| match v {
                Value::String(s) => Some(s),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// An untested (and readable) build whose notice the user has not dismissed.
pub fn should_show_untested_notice(build: Option<&str>, store: &dyn NoticeStore) -> bool {
    let Some(b) = build else {
        return false;
    };
    if is_tested_crossover(build) {
        return false;
    }
    !read_dismissed(store).iter().any(|d| d == b)
}

/// Records a dismissed build, keeping the last 50. A string that is not a dotted four-number build is
/// refused and writes nothing.
pub fn dismiss_untested_notice(build: &str, store: &dyn NoticeStore) -> bool {
    if !is_build(build) {
        return false;
    }
    let mut list = read_dismissed(store);
    if !list.iter().any(|d| d == build) {
        list.push(build.to_string());
    }
    let keep = list.len().saturating_sub(MAX_DISMISSED);
    store.set(
        UNTESTED_DISMISSED_KEY,
        Value::Array(list.into_iter().skip(keep).map(Value::String).collect()),
    );
    true
}

/// The CrossOver app's `CFBundleVersion`, read with `plutil` through `run_tool`'s spawn path (the
/// isolated arm, label `engine-plutil`). `None` when `bin_dir` is not a CrossOver bundle's bin, the
/// tool fails or times out, or the answer is not a dotted four-number build.
pub async fn read_crossover_build(ctx: &EngineCtx, bin_dir: &str) -> Option<String> {
    let app_path = bin_dir.strip_suffix(CX_BIN_SUFFIX)?;
    if !app_path.ends_with(".app") {
        return None;
    }
    let result = run_tool(
        ctx,
        RunToolArgs {
            tool: "/usr/bin/plutil".to_string(),
            args: [
                "-extract",
                "CFBundleVersion",
                "raw",
                "-o",
                "-",
                &format!("{app_path}/Contents/Info.plist"),
            ]
            .map(String::from)
            .to_vec(),
            timeout_ms: PLUTIL_TIMEOUT_MS,
            cancel_id: None,
        },
    )
    .await;
    if result.code != Some(0) || result.timed_out {
        return None;
    }
    let out = js_trim(&result.stdout);
    is_build(out).then(|| out.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_build_is_four_ascii_numbers_and_nothing_else() {
        for ok in ["26.3.0.39832", "0.0.0.0"] {
            assert!(is_build(ok), "{ok}");
        }
        for bad in [
            "",
            "26.3.0",
            "26.3.0.39832.1",
            "26.3.0.x",
            "v26.3.0.1",
            "26.3.0.1\n",
            "\u{ff10}.1.2.3",
        ] {
            assert!(!is_build(bad), "{bad:?}");
        }
    }

    #[test]
    fn only_the_tested_build_is_tested_and_an_unreadable_one_is_not() {
        assert!(is_tested_crossover(Some("26.3.0.39832")));
        assert!(!is_tested_crossover(Some("26.3.0.39832 ")));
        assert!(!is_tested_crossover(Some("__proto__")));
        assert!(!is_tested_crossover(None));
        assert_eq!(untested_log_line(Some("26.3.0.39832")), None);
    }
}
