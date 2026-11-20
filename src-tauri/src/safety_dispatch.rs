//! Handlers for the two `safety_*` rustInvoke channels (Phase 82 D-07). Each validates through its
//! generated Args struct then passes straight to the Tauri-free `gamelib-safety` crate. No logging
//! of paths or titles (T-28-04): the crate's replies carry closed-set reasons and caller ids only.

use super::*;

pub(crate) fn rpc_safety_check_removal(args: &[Value]) -> Result<Value, String> {
    SafetyCheckRemovalArgs::from_args(args)?;
    gamelib_safety::dispatch("safety_check_removal", args)
}

pub(crate) fn rpc_safety_remove_tree(args: &[Value]) -> Result<Value, String> {
    SafetyRemoveTreeArgs::from_args(args)?;
    gamelib_safety::dispatch("safety_remove_tree", args)
}
