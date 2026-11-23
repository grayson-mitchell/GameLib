//! The one resolver for the CrossOver `bin` directory (`crossoverLocation.ts`, quick 261024-cjq).
//!
//! CrossOver may live in `/Applications`, in `~/Applications`, or anywhere Spotlight finds its bundle
//! id. Every cxbottle, wineserver and wine spawn resolves through here, never through a hard-coded
//! path. The Spotlight search is `gamelib-wine`'s (D-04): this crate asks the shell's
//! [`CrossoverDiscovery`] at call time and keeps the answer in the locator's memo.

use std::path::Path;
use std::sync::Mutex;

use gamelib_core::process::BoxFuture;

use crate::ctx::EngineCtx;
use crate::jsutil::path_join;

/// A CrossOver bundle's `bin` directory below the `.app`.
const CROSSOVER_BIN_SUBPATH: &str = "Contents/SharedSupport/CrossOver/bin";
/// The tail of a CrossOver wine binary.
const WINE_BIN_SUFFIX: &str = "/SharedSupport/CrossOver/bin/wine";

/// The CrossOver search (D-22), implemented by the shell over `gamelib_wine::discovery::discover_crossover`.
/// Answers the wine binaries it found (each ends in `/SharedSupport/CrossOver/bin/wine`), empty when
/// there are none or the platform has no CrossOver. Called only when the two default install locations
/// hold no `cxbottle`, and never at construction.
pub trait CrossoverDiscovery: Send + Sync + 'static {
    fn discover(&self) -> BoxFuture<Vec<String>>;
}

/// The discovery a context has until the shell's is set: finds nothing.
#[derive(Debug, Default, Clone, Copy)]
pub struct NoCrossoverDiscovery;

impl CrossoverDiscovery for NoCrossoverDiscovery {
    fn discover(&self) -> BoxFuture<Vec<String>> {
        Box::pin(async { Vec::new() })
    }
}

/// `crossoverBinDirFromWineBin`: the directory of a wine binary whose path ends in the CrossOver bin
/// suffix, else `None`.
pub fn crossover_bin_dir_from_wine_bin(wine_bin: &str) -> Option<String> {
    wine_bin
        .ends_with(WINE_BIN_SUFFIX)
        .then(|| wine_bin[..wine_bin.len() - "/wine".len()].to_string())
}

/// A `bin` directory that holds `cxbottle` (the TS `hasCxbottle`).
fn has_cxbottle(dir: &str) -> bool {
    !dir.is_empty() && Path::new(&path_join(&[dir, "cxbottle"])).exists()
}

/// One locator per context: the memoised bin directory is probed on first use, never at construction.
#[derive(Debug)]
pub struct CrossoverLocator {
    /// Where the system-wide default install lives (`/Applications`); a test points it elsewhere so a
    /// CrossOver on the machine running it cannot answer.
    system_applications: String,
    memo: Mutex<Option<String>>,
}

impl Default for CrossoverLocator {
    fn default() -> CrossoverLocator {
        CrossoverLocator::with_system_applications("/Applications")
    }
}

impl CrossoverLocator {
    pub fn new() -> CrossoverLocator {
        CrossoverLocator::default()
    }

    pub fn with_system_applications(dir: impl Into<String>) -> CrossoverLocator {
        CrossoverLocator {
            system_applications: dir.into(),
            memo: Mutex::new(None),
        }
    }

    fn memoised(&self) -> Option<String> {
        self.memo.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// The sync half (`resolveCrossoverBinDir`): the hinted wine binaries, then the memo, then the two
    /// default install locations (probe candidates, not hard-codes). The first holding `cxbottle` wins.
    pub fn resolve_bin_dir_sync(
        &self,
        user_home: &str,
        hint_wine_bins: &[String],
    ) -> Option<String> {
        let mut candidates: Vec<String> = hint_wine_bins
            .iter()
            .filter_map(|bin| crossover_bin_dir_from_wine_bin(bin))
            .collect();
        candidates.extend(self.memoised());
        candidates.push(path_join(&[
            &self.system_applications,
            "CrossOver.app",
            CROSSOVER_BIN_SUBPATH,
        ]));
        candidates.push(path_join(&[
            user_home,
            "Applications/CrossOver.app",
            CROSSOVER_BIN_SUBPATH,
        ]));
        candidates.into_iter().find(|dir| has_cxbottle(dir))
    }

    /// `resolveCrossoverBinDirAsync`: the sync answer, else the first discovered wine binary whose bin
    /// directory holds `cxbottle`, memoised for the next call.
    pub async fn resolve_bin_dir(
        &self,
        ctx: &EngineCtx,
        hint_wine_bins: &[String],
    ) -> Option<String> {
        let user_home = ctx.paths.user_home.to_string_lossy().into_owned();
        if let Some(found) = self.resolve_bin_dir_sync(&user_home, hint_wine_bins) {
            return Some(found);
        }
        for bin in ctx.crossover_discovery.discover().await {
            if let Some(dir) = crossover_bin_dir_from_wine_bin(&bin).filter(|d| has_cxbottle(d)) {
                *self.memo.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir.clone());
                return Some(dir);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctx::{EnginePaths, Platform};
    use crate::testing::FixedClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    struct Found(Vec<String>);

    impl CrossoverDiscovery for Found {
        fn discover(&self) -> BoxFuture<Vec<String>> {
            let bins = self.0.clone();
            Box::pin(async move { bins })
        }
    }

    fn ctx(home: &FakeHome, discovery: Arc<dyn CrossoverDiscovery>) -> EngineCtx {
        let root = home.root().to_path_buf();
        EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(FixedClock::new(1)),
            Platform::Mac,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_crossover_discovery(discovery)
    }

    /// A locator whose system-wide location is an empty directory of the fake home.
    fn no_system_install(home: &FakeHome) -> CrossoverLocator {
        CrossoverLocator::with_system_applications(
            home.root()
                .join("SystemApplications")
                .to_string_lossy()
                .into_owned(),
        )
    }

    fn bundle_bin(root: &Path, name: &str) -> String {
        let bin = root.join(name).join(CROSSOVER_BIN_SUBPATH);
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("cxbottle"), b"").unwrap();
        bin.to_string_lossy().into_owned()
    }

    #[test]
    fn bin_dir_from_wine_bin_keeps_only_the_crossover_suffix() {
        assert_eq!(
            crossover_bin_dir_from_wine_bin(
                "/A/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine"
            ),
            Some("/A/CrossOver.app/Contents/SharedSupport/CrossOver/bin".to_string())
        );
        assert_eq!(crossover_bin_dir_from_wine_bin("/usr/local/bin/wine"), None);
        assert_eq!(crossover_bin_dir_from_wine_bin(""), None);
    }

    #[tokio::test]
    async fn a_hint_wins_and_discovery_is_asked_only_when_nothing_else_holds_cxbottle() {
        let home = FakeHome::new("engine-locate-");
        let hinted = bundle_bin(home.root(), "Hinted.app");
        let locator = no_system_install(&home);
        let ctx = ctx(&home, Arc::new(NoCrossoverDiscovery));
        let hint = vec![format!("{hinted}/wine")];
        assert_eq!(locator.resolve_bin_dir(&ctx, &hint).await, Some(hinted));
        // Neither a hint, the memo nor the default locations: not installed.
        assert_eq!(locator.resolve_bin_dir(&ctx, &[]).await, None);
    }

    #[tokio::test]
    async fn the_first_discovered_bin_with_cxbottle_is_memoised() {
        let home = FakeHome::new("engine-locate-");
        let spotlight = bundle_bin(home.root(), "Spotlight.app");
        let bare = home.root().join("Bare.app").join(CROSSOVER_BIN_SUBPATH);
        let found = Found(vec![
            format!("{}/wine", bare.to_string_lossy()),
            "/not/a/crossover/wine".to_string(),
            format!("{spotlight}/wine"),
        ]);
        let locator = no_system_install(&home);
        let ctx = ctx(&home, Arc::new(found));
        assert_eq!(
            locator.resolve_bin_dir(&ctx, &[]).await,
            Some(spotlight.clone())
        );
        // The memo answers the sync half from now on.
        let user_home = ctx.paths.user_home.to_string_lossy().into_owned();
        assert_eq!(
            locator.resolve_bin_dir_sync(&user_home, &[]),
            Some(spotlight)
        );
    }
}
