//! The tier-1 `envVariables` of a game (`getKnownFixesEnvVariables`), raw: whatever the winning layer's
//! fix file holds under that key. Only the tier-1 reader 88-08 ported is read, so a remote file's tier-2
//! keys never reach the environment and the allow-list is not widened here.

use gamelib_knownfix::reader::read_known_fixes;
use gamelib_knownfix::types::Runner;
use serde_json::{Map, Value};

use crate::ctx::LaunchCtx;

/// `knownFixes?.envVariables || {}`: the value as the file holds it unless it is falsy (null, false, 0,
/// the empty string) or absent, which is `{}`. A fix whose `envVariables` is a string or a list is
/// returned as that, as the TS does (recorded D-20 quirk, a todo of 88.1-01): the caller decides what to
/// do with a value that is not a map.
pub fn known_fix_env(ctx: &LaunchCtx, app_name: &str, runner: Runner) -> Value {
    let raw = read_known_fixes(&ctx.knownfix, app_name, runner).and_then(|fix| fix.env_variables);
    match raw {
        None | Some(Value::Null) | Some(Value::Bool(false)) => Value::Object(Map::new()),
        Some(Value::String(s)) if s.is_empty() => Value::Object(Map::new()),
        Some(Value::Number(n)) if n.as_f64() == Some(0.0) => Value::Object(Map::new()),
        Some(value) => value,
    }
}
