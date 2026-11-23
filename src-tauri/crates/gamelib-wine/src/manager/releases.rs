//! The release lists: the seven GitHub feeds (`downloader/constants.ts`, `fetchReleases`,
//! `getAvailableVersions`), their merge against the stored list (`updateWineVersionInfos`) and the
//! `releasesInfoReady` check that decides which feeds are worth fetching (`updateWineListsIfOutdated`).
//!
//! Every release is a [`Json`] object built with `insert_js` in the order the TS assigned its
//! properties, because the store's bytes are part of the golden. A feed that fails (a transport error,
//! a non-2xx status, a body that is not the expected list) is logged and skipped as the TS did; the
//! other feeds and the stored list carry on. No log line names a URL or a response body.

use std::io;

use gamelib_engine::ctx::Platform;
use gamelib_engine::fetch::FetchError;
use gamelib_store::json::{Json, Obj};
use serde::Deserialize;
use serde_json::Value;

use super::{date_ms, emit_updated, log_error, log_info, log_warn, number, store, text_of, truthy};
use crate::ctx::{Arch, WineCtx};
use crate::runtimes::request;

/// Url to the Proton GE github release page.
pub const PROTONGE_URL: &str =
    "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases";
/// Url to the Proton github release page.
pub const PROTON_URL: &str = "https://api.github.com/repos/ValveSoftware/Proton/releases";
/// Url to the Wine Lutris github release page.
pub const WINELUTRIS_URL: &str = "https://api.github.com/repos/lutris/wine/releases";
/// Url to the Wine Crossover github release page.
pub const WINECROSSOVER_URL: &str =
    "https://api.github.com/repos/Heroic-Games-Launcher/wine-crossover/releases";
/// Url to the Wine Staging for macOS github release page.
pub const WINESTAGINGMACOS_URL: &str =
    "https://api.github.com/repos/Gcenx/macOS_Wine_builds/releases";
/// Url to the Game Porting Toolkit from Gcenx github release page.
pub const GPTK_URL: &str = "https://api.github.com/repos/Gcenx/game-porting-toolkit/releases";
/// Url to Proton-CachyOS from the CachyOS team github release page.
pub const PROTON_CACHYOS_URL: &str = "https://api.github.com/repos/CachyOS/proton-cachyos/releases";

/// How many releases a refresh asks each feed for (`updateWineVersionInfos`'s `count = 50`).
pub const DEFAULT_COUNT: u32 = 50;

/// The seven feeds, in the order of the TS `Repositorys` enum (its numeric values are the indices the
/// goldens carry).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Repository {
    ProtonGe,
    Proton,
    WineLutris,
    WineCrossover,
    WineStagingMacos,
    Gptk,
    ProtonCachyos,
}

impl Repository {
    pub const ALL: [Repository; 7] = [
        Repository::ProtonGe,
        Repository::Proton,
        Repository::WineLutris,
        Repository::WineCrossover,
        Repository::WineStagingMacos,
        Repository::Gptk,
        Repository::ProtonCachyos,
    ];

    /// The repository with this `Repositorys` enum value.
    pub fn from_index(index: usize) -> Option<Repository> {
        Repository::ALL.get(index).copied()
    }

    pub fn url(self) -> &'static str {
        match self {
            Repository::ProtonGe => PROTONGE_URL,
            Repository::Proton => PROTON_URL,
            Repository::WineLutris => WINELUTRIS_URL,
            Repository::WineCrossover => WINECROSSOVER_URL,
            Repository::WineStagingMacos => WINESTAGINGMACOS_URL,
            Repository::Gptk => GPTK_URL,
            Repository::ProtonCachyos => PROTON_CACHYOS_URL,
        }
    }

    /// The `type` its releases carry.
    pub fn kind(self) -> &'static str {
        match self {
            Repository::ProtonGe => "GE-Proton",
            Repository::Proton => "Proton",
            Repository::WineLutris => "Wine-Lutris",
            Repository::WineCrossover => "Wine-Crossover",
            Repository::WineStagingMacos => "Wine-Staging-macOS",
            Repository::Gptk => "Game-Porting-Toolkit",
            Repository::ProtonCachyos => "Proton-CachyOS",
        }
    }
}

/// Why one feed gave nothing. A category only.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FeedError {
    Fetch(FetchError),
    /// The body was not the list of releases the parser needs.
    BadBody,
}

impl std::fmt::Display for FeedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FeedError::Fetch(e) => write!(f, "fetch {e}"),
            FeedError::BadBody => f.write_str("bad-body"),
        }
    }
}

/// Why a refresh did not complete (the op swallows it and logs the word).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefreshError {
    /// The store could not be opened (a file that is not a store is never overwritten).
    Store(io::ErrorKind),
}

impl std::fmt::Display for RefreshError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RefreshError::Store(kind) => write!(f, "store {kind:?}"),
        }
    }
}

/// `getVersionName`: a Wine build is named `Wine-<tag>`, everything else by its tag.
fn version_name(kind: &str, tag: &str) -> String {
    if kind.contains("Wine") {
        format!("Wine-{tag}")
    } else {
        tag.to_string()
    }
}

struct Asset<'a> {
    name: Option<&'a str>,
    url: Option<&'a str>,
    size: Option<Json>,
}

impl<'a> Asset<'a> {
    fn of(value: &'a Value) -> Asset<'a> {
        Asset {
            name: value.get("name").and_then(Value::as_str),
            url: value.get("browser_download_url").and_then(Value::as_str),
            size: value.get("size").cloned().map(Json::from),
        }
    }

    /// The asset name, which the TS read with `.includes` and `.endsWith`: an asset with none made
    /// the whole feed throw.
    fn name(&self) -> Result<&'a str, FeedError> {
        self.name.ok_or(FeedError::BadBody)
    }
}

fn set_download(release: &mut Obj, asset: &Asset<'_>) {
    if let Some(url) = asset.url {
        release.insert_js("download", Json::Str(url.to_string()));
    }
    if let Some(size) = &asset.size {
        release.insert_js("downsize", size.clone());
    }
}

fn set_checksum(release: &mut Obj, asset: &Asset<'_>) {
    if let Some(url) = asset.url {
        release.insert_js("checksum", Json::Str(url.to_string()));
    }
}

/// One release of a feed as a `VersionInfo`, with the asset picks of its type.
fn parse_release(ctx: &WineCtx, kind: &str, item: &Value) -> Result<Json, FeedError> {
    let tag = item
        .get("tag_name")
        .and_then(Value::as_str)
        .ok_or(FeedError::BadBody)?;
    let published = item
        .get("published_at")
        .and_then(Value::as_str)
        .ok_or(FeedError::BadBody)?;
    let assets: Vec<Asset<'_>> = item
        .get("assets")
        .and_then(Value::as_array)
        .ok_or(FeedError::BadBody)?
        .iter()
        .map(Asset::of)
        .collect();

    let mut release = Obj::new();
    release.insert_js("version", Json::Str(version_name(kind, tag)));
    release.insert_js("type", Json::Str(kind.to_string()));
    release.insert_js(
        "date",
        Json::Str(published.split('T').next().unwrap_or_default().to_string()),
    );
    release.insert_js("disksize", number(0));
    if let Some(link) = item.get("html_url").and_then(Value::as_str) {
        release.insert_js("release_notes_link", Json::Str(link.to_string()));
    }

    match kind {
        "Wine-Staging-macOS" => {
            // Sometimes the wine-devel package is first in the list; Wine-Staging is always wanted.
            let mut staging = None;
            for asset in &assets {
                if asset.name()?.contains("staging") {
                    staging = Some(asset);
                    break;
                }
            }
            if let Some(asset) = staging {
                set_download(&mut release, asset);
            }
        }
        "GE-Proton" => {
            // GE-Proton includes aarch64 and x86_64 builds: pick the one of this architecture.
            for asset in &assets {
                let name = asset.name()?;
                let is_aarch64 = name.contains("-aarch64");
                let is_sha = name.ends_with(".sha512sum");
                let is_tar = name.ends_with(".tar.gz");
                let wanted = (is_aarch64 && ctx.arch == Arch::Arm64)
                    || (!is_aarch64 && ctx.arch == Arch::X64);
                if wanted {
                    if is_sha {
                        set_checksum(&mut release, asset);
                    } else if is_tar {
                        set_download(&mut release, asset);
                    }
                }
            }
        }
        "Proton-CachyOS" => {
            let url_ends = |asset: &&Asset<'_>, suffix: &str| {
                asset.url.is_some_and(|url| url.ends_with(suffix))
            };
            if let Some(sha) = assets.iter().find(|a| url_ends(a, "x86_64.sha512sum")) {
                set_checksum(&mut release, sha);
            }
            if let Some(tar) = assets.iter().find(|a| url_ends(a, "x86_64.tar.xz")) {
                set_download(&mut release, tar);
            }
        }
        _ => {
            for asset in &assets {
                let name = asset.name()?;
                if name.ends_with("sha512sum") {
                    set_checksum(&mut release, asset);
                } else if name.ends_with("tar.gz") || name.ends_with("tar.xz") {
                    set_download(&mut release, asset);
                }
            }
        }
    }
    Ok(Json::Obj(release))
}

/// `/\d+-\d+$/` over a version: digits, a dash, digits, end of text.
fn ends_with_digits_dash_digits(version: &str) -> bool {
    let tail = version.trim_end_matches(|c: char| c.is_ascii_digit());
    let had_digits = tail.len() < version.len();
    match tail.strip_suffix('-') {
        Some(head) => had_digits && head.ends_with(|c: char| c.is_ascii_digit()),
        None => false,
    }
}

/// `fetchReleases`: one feed, `count` releases, with the `<type>-latest` entry in front. The `latest`
/// release is the newest whose version ends `<digits>-<digits>` (the TS skips builds like the LoL or
/// Diablo wine), else the first.
pub async fn fetch_releases(
    ctx: &WineCtx,
    repo: Repository,
    count: u32,
) -> Result<Vec<Json>, FeedError> {
    let url = format!("{}?per_page={count}", repo.url());
    let response = ctx
        .fetch
        .get(request(ctx, &url))
        .await
        .and_then(|r| r.error_for_status())
        .map_err(FeedError::Fetch)?;
    let data: Value = serde_json::from_slice(&response.body).map_err(|_| FeedError::BadBody)?;
    let items = data.as_array().ok_or(FeedError::BadBody)?;

    let mut releases = Vec::with_capacity(items.len() + 1);
    for item in items {
        releases.push(parse_release(ctx, repo.kind(), item)?);
    }

    let latest = releases
        .iter()
        .find(|r| text_of(r, "version").is_some_and(ends_with_digits_dash_digits))
        .or_else(|| releases.first());
    if let Some(latest) = latest {
        let mut entry = Obj::new();
        entry.insert_js(
            "version",
            Json::Str(format!(
                "{}-latest",
                text_of(latest, "type").unwrap_or_default()
            )),
        );
        for key in [
            "type",
            "date",
            "download",
            "downsize",
            "disksize",
            "checksum",
            "release_notes_link",
        ] {
            if let Some(value) = latest.get(key) {
                entry.insert_js(key, value.clone());
            }
        }
        releases.insert(0, Json::Obj(entry));
    }
    Ok(releases)
}

/// `getAvailableVersions`: each feed in turn; one that fails is logged and skipped.
pub async fn get_available_versions(
    ctx: &WineCtx,
    repositories: &[Repository],
    count: u32,
) -> Vec<Json> {
    let mut releases = Vec::new();
    for repo in repositories {
        match fetch_releases(ctx, *repo, count).await {
            Ok(fetched) => releases.extend(fetched),
            Err(error) => log_error(
                ctx,
                &format!(
                    "Could not fetch available releases for {}: {error}",
                    repo.kind()
                ),
            ),
        }
    }
    releases
}

/// The feeds a refresh walks when none are named: the three macOS ones on a Mac, GE-Proton and
/// Proton-CachyOS everywhere else.
pub fn default_repositories(platform: Platform) -> Vec<Repository> {
    if platform == Platform::Mac {
        vec![
            Repository::WineCrossover,
            Repository::WineStagingMacos,
            Repository::Gptk,
        ]
    } else {
        vec![Repository::ProtonGe, Repository::ProtonCachyos]
    }
}

/// Does the feed release `release` replace the stored `old` one? The "Proton" prefix got dropped from
/// GE-Proton version strings, and `Proton-GE-latest` became `GE-Proton-latest`; an old entry still
/// has to be recognised (Linux only, as in the TS).
fn same_release(ctx: &WineCtx, release: &Json, old: &Json) -> bool {
    let (release_version, old_version) = (text_of(release, "version"), text_of(old, "version"));
    if ctx.engine.platform == Platform::Linux && text_of(release, "type") == Some("GE-Proton") {
        if let (Some(r), Some(o)) = (release_version, old_version) {
            if format!("Proton-{r}") == o {
                return true;
            }
            if r == "GE-Proton-latest" && o == "Proton-GE-latest" {
                return true;
            }
        }
    }
    release_version == old_version
}

/// Merges the fetched `releases` into the stored list (`updateWineVersionInfos`, fetch branch):
/// stored entries stay, an installed one that a fetched release matches hands its install state to
/// that release, one the feeds no longer list is added back to `releases`, and a fetched release not
/// yet stored is appended (a `-latest` one replaces its stored twin).
fn merge(ctx: &WineCtx, releases: &mut Vec<Json>, stored: Vec<Json>) -> Vec<Json> {
    let mut to_store: Vec<Json> = Vec::with_capacity(stored.len() + releases.len());
    for old in stored {
        to_store.push(old.clone());
        let index = releases.iter().position(|r| same_release(ctx, r, &old));
        let install_dir = old.get("installDir").and_then(Json::as_str);
        // `old.installDir !== undefined && existsSync(old.installDir)`: a value that is not a path
        // names nothing.
        let present = install_dir.is_some_and(|dir| std::path::Path::new(dir).exists());
        if !present {
            continue;
        }
        match index.and_then(|i| releases.get_mut(i)) {
            Some(Json::Obj(matched)) => {
                if let Some(dir) = old.get("installDir") {
                    matched.insert_js("installDir", dir.clone());
                }
                if let Some(installed) = old.get("isInstalled") {
                    matched.insert_js("isInstalled", installed.clone());
                }
                if let Some(size) = old.get("disksize") {
                    matched.insert_js("disksize", size.clone());
                }
                if matched.get("checksum") != old.get("checksum") || truthy(old.get("hasUpdate")) {
                    matched.insert_js("hasUpdate", Json::Bool(true));
                }
            }
            Some(_) => {}
            None => releases.push(old.clone()),
        }
    }

    // New elements join the list and a `-latest` replaces its stored twin.
    for release in releases.iter() {
        let version = text_of(release, "version");
        let found = to_store.iter().position(|old| {
            let old_version = text_of(old, "version");
            old_version == version
                || version.is_some_and(|v| old_version == Some(format!("Proton-{v}").as_str()))
        });
        match found {
            None => to_store.push(release.clone()),
            Some(i) if version.is_some_and(|v| v.ends_with("-latest")) => {
                to_store[i] = release.clone();
            }
            Some(_) => {}
        }
    }
    to_store
}

/// The list `Array.prototype.sort` makes of `(a, b) => Date.parse(b.date) - Date.parse(a.date)`:
/// newest first, stable, an entry whose date is not a date ordering as equal to every other (a `NaN`
/// comparison). An insertion sort, so an inconsistent comparator cannot make the standard sort panic.
fn sort_newest_first(entries: &mut [Json]) {
    let date = |entry: &Json| text_of(entry, "date").and_then(date_ms);
    for i in 1..entries.len() {
        let mut j = i;
        while j > 0 {
            let (earlier, later) = (date(&entries[j - 1]), date(&entries[j]));
            // `later - earlier > 0`: the later entry is newer and goes first.
            let swap = matches!((earlier, later), (Some(e), Some(l)) if l > e);
            if !swap {
                break;
            }
            entries.swap(j - 1, j);
            j -= 1;
        }
    }
}

/// `updateWineVersionInfos`: with `fetch` the feeds (`repositories`, else [`default_repositories`])
/// are merged into the stored list and the list is saved; without it the stored list is only read.
/// Either way `wineVersionsUpdated` is pushed at the end. Returns the releases the TS returned (the
/// fetched ones, or the stored ones when nothing was fetched).
pub async fn update_wine_version_infos(
    ctx: &WineCtx,
    fetch: bool,
    repositories: Option<&[Repository]>,
    count: u32,
) -> Result<Vec<Json>, RefreshError> {
    log_info(ctx, "Updating wine versions info");
    let store = store::open(ctx).map_err(|e| RefreshError::Store(e.kind()))?;
    let mut releases: Vec<Json> = Vec::new();

    if fetch {
        log_info(ctx, "Fetching upstream information...");
        let default;
        let repositories = match repositories {
            Some(list) => list,
            None => {
                default = default_repositories(ctx.engine.platform);
                &default
            }
        };
        releases = get_available_versions(ctx, repositories, count).await;

        match store::read(&store) {
            Some(stored) => {
                let mut to_store = merge(ctx, &mut releases, stored);
                sort_newest_first(&mut to_store);
                store::write(&store, to_store).map_err(|e| RefreshError::Store(e.kind()))?;
            }
            None => {
                // `releasesToStore = releases`: the TS sorts the one array, so the list returned
                // is the sorted one too.
                sort_newest_first(&mut releases);
                store::write(&store, releases.clone())
                    .map_err(|e| RefreshError::Store(e.kind()))?;
            }
        }
    } else {
        log_info(ctx, "Read local information ...");
        if let Some(stored) = store::read(&store) {
            releases.extend(stored);
        }
    }

    log_info(ctx, "wine versions updated");
    emit_updated(ctx);
    Ok(releases)
}

/// The list the renderer shows (`store.get('wine-releases', [])`), as plain JSON.
pub fn list(ctx: &WineCtx) -> Result<Value, io::ErrorKind> {
    let store = store::open(ctx).map_err(|e| e.kind())?;
    Ok(Value::Array(
        store::read(&store)
            .unwrap_or_default()
            .iter()
            .map(Json::to_value)
            .collect(),
    ))
}

/// The `tag` and `published_at` of one entry of `ReleasesInfo`. Only the date is read.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ReleaseStamp {
    #[serde(default)]
    pub published_at: Option<String>,
}

/// The part of `ReleasesInfo` (`common/types`) the check reads. Every other key is ignored.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ReleasesInfo {
    #[serde(rename = "ge-proton", default)]
    pub ge_proton: Option<ReleaseStamp>,
    #[serde(rename = "proton-cachyos", default)]
    pub proton_cachyos: Option<ReleaseStamp>,
    #[serde(rename = "wine-crossover", default)]
    pub wine_crossover: Option<ReleaseStamp>,
    #[serde(rename = "wine-staging", default)]
    pub wine_staging: Option<ReleaseStamp>,
    #[serde(rename = "game-porting-toolkit", default)]
    pub game_porting_toolkit: Option<ReleaseStamp>,
}

/// `localVersionIsOlder`: a local date exists and is earlier than the release's day. A date that does
/// not parse compares false, as `NaN < x` does.
fn local_is_older(local: Option<&str>, latest: Option<&ReleaseStamp>) -> bool {
    let Some(local) = local.filter(|d| !d.is_empty()) else {
        return false;
    };
    let Some(published) = latest.and_then(|l| l.published_at.as_deref()) else {
        return false;
    };
    // `published_at.replace(/T.*/, '')`: the day part.
    let day = published.split('T').next().unwrap_or_default();
    matches!((date_ms(local), date_ms(day)), (Some(l), Some(p)) if l < p)
}

/// `updateWineListsIfOutdated`: fetch the latest releases of the translation layers, but only for a
/// repository whose `-latest` entry is already stored and older than upstream's newest. Nothing on
/// Windows. The refresh runs to its end before this returns; a failure is logged, never raised.
pub async fn update_lists_if_outdated(ctx: &WineCtx, info: &ReleasesInfo) {
    let platform = ctx.engine.platform;
    if platform == Platform::Windows {
        return;
    }
    let store = match store::open(ctx) {
        Ok(store) => store,
        Err(error) => {
            log_warn(
                ctx,
                &format!("wine releases check: store {:?}", error.kind()),
            );
            return;
        }
    };
    let local = store::read(&store).unwrap_or_default();
    let latest_local = |version: &str| -> Option<String> {
        local
            .iter()
            .find(|entry| text_of(entry, "version") == Some(version))
            .and_then(|entry| text_of(entry, "date"))
            .map(str::to_string)
    };

    let mut repositories = Vec::new();
    if platform == Platform::Linux {
        if local_is_older(
            latest_local("GE-Proton-latest").as_deref(),
            info.ge_proton.as_ref(),
        ) {
            repositories.push(Repository::ProtonGe);
        }
        if local_is_older(
            latest_local("Proton-CachyOS-latest").as_deref(),
            info.proton_cachyos.as_ref(),
        ) {
            repositories.push(Repository::ProtonCachyos);
        }
    }
    if platform == Platform::Mac {
        if local_is_older(
            latest_local("Wine-Crossover-latest").as_deref(),
            info.wine_crossover.as_ref(),
        ) {
            repositories.push(Repository::WineCrossover);
        }
        if local_is_older(
            latest_local("Wine-Staging-macOS-latest").as_deref(),
            info.wine_staging.as_ref(),
        ) {
            repositories.push(Repository::WineStagingMacos);
        }
        if local_is_older(
            latest_local("Game-Porting-Toolkit-latest").as_deref(),
            info.game_porting_toolkit.as_ref(),
        ) {
            repositories.push(Repository::Gptk);
        }
    }

    if !repositories.is_empty() {
        if let Err(error) =
            update_wine_version_infos(ctx, true, Some(&repositories), DEFAULT_COUNT).await
        {
            log_error(ctx, &format!("wine releases refresh failed: {error}"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(version: &str, date: &str) -> Json {
        let mut o = Obj::new();
        o.insert_js("version", Json::Str(version.to_string()));
        o.insert_js("date", Json::Str(date.to_string()));
        Json::Obj(o)
    }

    #[test]
    fn the_latest_pattern_is_digits_dash_digits_at_the_end() {
        for yes in ["GE-Proton9-27", "cachyos-9.0-20240601", "a-1-2", "1-2"] {
            assert!(ends_with_digits_dash_digits(yes), "{yes}");
        }
        for no in ["GE-Proton9", "Wine-11.21", "x-1-", "-1", "1-", "abc", ""] {
            assert!(!ends_with_digits_dash_digits(no), "{no}");
        }
    }

    #[test]
    fn the_names_follow_the_typescript() {
        assert_eq!(version_name("Wine-Crossover", "x"), "Wine-x");
        assert_eq!(version_name("Game-Porting-Toolkit", "x"), "x");
        assert_eq!(Repository::from_index(3), Some(Repository::WineCrossover));
        assert_eq!(Repository::from_index(7), None);
    }

    #[test]
    fn the_sort_is_newest_first_and_stable_and_leaves_odd_dates_alone() {
        let mut list = vec![
            entry("a", "2024-01-01"),
            entry("b", "2024-03-01"),
            entry("c", "2024-03-01"),
            entry("d", "not a date"),
            entry("e", "2024-02-01"),
        ];
        sort_newest_first(&mut list);
        let order: Vec<&str> = list.iter().filter_map(|e| text_of(e, "version")).collect();
        // `d` compares as equal to its neighbours, so `e` stays behind it.
        assert_eq!(order, ["b", "c", "a", "d", "e"]);
    }

    use gamelib_core::clock::SystemClock;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths};
    use gamelib_engine::fetch::{
        DownloadOutcome, Fetch, FetchFuture, FetchRequest, FetchResponse, Progress,
    };
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::path::Path;
    use std::sync::{Arc, Mutex};
    use tokio_util::sync::CancellationToken;

    /// Answers every GET with a 500 and remembers the URL it was asked for.
    #[derive(Default)]
    struct Asked(Mutex<Vec<String>>);

    impl Fetch for Asked {
        fn get(&self, req: FetchRequest) -> FetchFuture<'_, Result<FetchResponse, FetchError>> {
            self.0.lock().unwrap().push(req.url);
            Box::pin(async {
                Ok(FetchResponse {
                    status: 500,
                    headers: Vec::new(),
                    body: Vec::new(),
                })
            })
        }

        fn download<'a>(
            &'a self,
            _req: FetchRequest,
            _dest: &'a Path,
            _progress: &'a (dyn Fn(Progress) + Send + Sync),
            _cancel: CancellationToken,
        ) -> FetchFuture<'a, Result<DownloadOutcome, FetchError>> {
            Box::pin(async { Err(FetchError::Network) })
        }
    }

    fn ctx_for(home: &FakeHome, platform: Platform, fetch: Arc<Asked>) -> WineCtx {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            platform,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.join("userdata"),
                tools_path: root.join("tools"),
                user_home: root.join("home"),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_fetch(fetch);
        WineCtx::new(Arc::new(engine), root.join("tools").join("runtimes"))
    }

    fn seed(ctx: &WineCtx, entries: &[(&str, &str)]) {
        let handle = store::open(ctx).unwrap();
        store::write(
            &handle,
            entries.iter().map(|(v, d)| entry(v, d)).collect::<Vec<_>>(),
        )
        .unwrap();
    }

    fn info(day: &str) -> ReleasesInfo {
        let stamp = Some(ReleaseStamp {
            published_at: Some(format!("{day}T10:00:00Z")),
        });
        ReleasesInfo {
            ge_proton: stamp.clone(),
            proton_cachyos: stamp.clone(),
            wine_crossover: stamp.clone(),
            wine_staging: stamp.clone(),
            game_porting_toolkit: stamp,
        }
    }

    #[tokio::test]
    async fn the_releases_check_fetches_only_the_feeds_whose_stored_latest_is_older() {
        let home = FakeHome::new("wine-releases-");
        let asked = Arc::new(Asked::default());
        let ctx = ctx_for(&home, Platform::Linux, asked.clone());
        // GE-Proton is stored and old; Proton-CachyOS is stored and current; Wine-Crossover is not a
        // Linux feed at all.
        seed(
            &ctx,
            &[
                ("GE-Proton-latest", "2024-05-01"),
                ("Proton-CachyOS-latest", "2024-06-02"),
                ("Wine-Crossover-latest", "2024-01-01"),
            ],
        );
        update_lists_if_outdated(&ctx, &info("2024-06-02")).await;
        let urls = asked.0.lock().unwrap().clone();
        assert_eq!(urls, [format!("{PROTONGE_URL}?per_page=50")]);
    }

    #[tokio::test]
    async fn the_releases_check_asks_for_nothing_without_a_stored_latest_or_on_windows() {
        let home = FakeHome::new("wine-releases-");
        let asked = Arc::new(Asked::default());
        // No stored list at all: no local date, nothing is older.
        let ctx = ctx_for(&home, Platform::Linux, asked.clone());
        update_lists_if_outdated(&ctx, &info("2030-01-01")).await;
        // Windows never refreshes, whatever is stored.
        let ctx = ctx_for(&home, Platform::Windows, asked.clone());
        seed(&ctx, &[("GE-Proton-latest", "2000-01-01")]);
        update_lists_if_outdated(&ctx, &info("2030-01-01")).await;
        assert!(asked.0.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_failing_feed_is_skipped_and_the_stored_list_survives_the_refresh() {
        let home = FakeHome::new("wine-releases-");
        let asked = Arc::new(Asked::default());
        let ctx = ctx_for(&home, Platform::Mac, asked.clone());
        seed(&ctx, &[("Wine-Crossover-latest", "2024-01-01")]);
        let got = update_wine_version_infos(&ctx, true, None, 7)
            .await
            .unwrap();
        assert!(got.is_empty());
        let urls = asked.0.lock().unwrap().clone();
        assert_eq!(
            urls,
            [WINECROSSOVER_URL, WINESTAGINGMACOS_URL, GPTK_URL].map(|u| format!("{u}?per_page=7"))
        );
        let stored = list(&ctx).unwrap();
        assert_eq!(stored[0]["version"], "Wine-Crossover-latest");
    }

    #[test]
    fn an_outdated_local_needs_a_local_date_older_than_upstreams_day() {
        let upstream = ReleaseStamp {
            published_at: Some("2024-06-02T10:00:00Z".into()),
        };
        assert!(local_is_older(Some("2024-06-01"), Some(&upstream)));
        assert!(!local_is_older(Some("2024-06-02"), Some(&upstream)));
        assert!(!local_is_older(Some(""), Some(&upstream)));
        assert!(!local_is_older(None, Some(&upstream)));
        assert!(!local_is_older(Some("garbage"), Some(&upstream)));
        assert!(!local_is_older(Some("2024-06-01"), None));
    }
}
