//! The wine manager's store: key `wine-releases` of `<userData>/store/wine-downloader-info.json`
//! (kind cache), through the StoreHost and never with file I/O of this crate's own. The TS owner is
//! `createWineManagerStores` (`src/backend/wine/manager/stores.ts`).
//!
//! The value is a list of `WineVersionInfo`. Each entry is kept as a [`Json`] object, not a struct:
//! the store's bytes are part of the golden, so key order and any key this crate does not know must
//! survive a read and a write.

use std::io;
use std::sync::Arc;

use gamelib_store::host::Store;
use gamelib_store::json::Json;

use crate::ctx::WineCtx;

/// The file name under `<userData>/store/`.
pub const NAME: &str = "wine-downloader-info";
/// The one key the manager reads and writes.
pub const KEY: &str = "wine-releases";

/// Opens the store through the host. A missing file is an empty store; a file that is not a JSON
/// object is `InvalidData` and is never overwritten.
pub fn open(ctx: &WineCtx) -> io::Result<Arc<Store>> {
    ctx.engine
        .host
        .open_cache(&ctx.engine.paths.user_data.join("store"), NAME)
}

/// `store.has('wine-releases')`.
pub fn has(store: &Store) -> bool {
    store.get(KEY).is_some()
}

/// `store.get('wine-releases', [])`: `None` when the key is absent, the entries when it holds a
/// list, and an empty list when it holds anything else.
pub fn read(store: &Store) -> Option<Vec<Json>> {
    match store.get(KEY)? {
        Json::Arr(entries) => Some(entries),
        _ => Some(Vec::new()),
    }
}

/// `store.set('wine-releases', entries)`.
pub fn write(store: &Store, entries: Vec<Json>) -> io::Result<()> {
    store.set(KEY, Json::Arr(entries))
}
