//! The bottle state primitives (Phase 87, SVC-02, D-07): where a bottle lives and its engine marker
//! with the in-process version gate. The conf, the pinned-artifact marker, the ledger, the registry
//! and the prefix resolver join in the next task of the slice.
//!
//! These are the one-way on-disk state of the phase: the marker is written byte for byte as the
//! released TS builds wrote it, and a marker a newer build wrote is never overwritten.

pub mod marker;
pub mod paths;

pub use marker::{BOTTLE_FILE_VERSION, ENGINE_MARKER_CHAIN, MARKER_FILE};
