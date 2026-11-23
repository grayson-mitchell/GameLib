//! Engine state and notices (Phase 87, plan 49): the per-title badge state the game page reads, the
//! notices store and its dismissals, and the `engineStateChanged` pushes. Every cache lives in the
//! context's [`engine_state::EngineStateOwner`] and the notices store opens lazily, so building a
//! context does no I/O (D-17).

pub mod engine_state;
pub mod notices;
pub mod publish;
