//! dot-prop 6 paths over `Json` (skeleton for the RED run).

use crate::json::Json;

pub fn segments(_path: &str) -> Option<Vec<String>> {
    None
}

pub fn get<'a>(_root: &'a Json, _path: &str, _dot_paths: bool) -> Option<&'a Json> {
    None
}

pub fn has(_root: &Json, _path: &str, _dot_paths: bool) -> bool {
    false
}

pub fn set(_root: &mut Json, _path: &str, _value: Json, _dot_paths: bool) -> bool {
    false
}

pub fn delete(_root: &mut Json, _path: &str, _dot_paths: bool) -> bool {
    false
}

/// conf refuses `__internal__.<x>` keys when dot paths are on.
pub fn is_reserved_internal(_path: &str, _dot_paths: bool) -> bool {
    false
}
