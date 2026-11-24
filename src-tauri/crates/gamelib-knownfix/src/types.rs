//! The shapes the known-fix readers answer with (`KnowFixesInfo`, `KnownFixProfile` and
//! `GamelibFixStatus` in `src/common/types.ts`), and the closed set of runners and layers.
//!
//! The two fix types hold each key's JSON value as it was in the file, not a narrowed Rust type. The
//! TypeScript reader copies an allow-listed key without checking its type (only `macArch`, `drm`,
//! `steamGameOverlay`, `launchArgs` and `exeOverride` are shape-checked), and the recorded goldens keep
//! that: a `launchNotice` of `5` is answered as `5`. Narrowing here would change what the renderer gets;
//! the consumers (the launch builders, the registry fixes) validate the keys they use.

use serde::Serialize;
use serde_json::Value;

/// The five runners, the closed set `runnerArg()` allows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Runner {
    Legendary,
    Gog,
    Nile,
    Sideload,
    Steam,
}

impl Runner {
    /// The runner named `name`, exactly as the renderer spells it.
    pub fn parse(name: &str) -> Option<Runner> {
        match name {
            "legendary" => Some(Runner::Legendary),
            "gog" => Some(Runner::Gog),
            "nile" => Some(Runner::Nile),
            "sideload" => Some(Runner::Sideload),
            "steam" => Some(Runner::Steam),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Runner::Legendary => "legendary",
            Runner::Gog => "gog",
            Runner::Nile => "nile",
            Runner::Sideload => "sideload",
            Runner::Steam => "steam",
        }
    }
}

/// Which directory a fix file came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FixLayer {
    /// `<appFolder>/fixes/local`: the operator's own files.
    Local,
    /// The curated, in-repo layer.
    Bundled,
    /// `<appFolder>/fixes`: the downloaded cache.
    Remote,
}

impl FixLayer {
    /// The word a log line and an answer use for the layer.
    pub fn as_str(self) -> &'static str {
        match self {
            FixLayer::Local => "local",
            FixLayer::Bundled => "bundled",
            FixLayer::Remote => "remote",
        }
    }
}

/// The twelve keys a tier-1 file may carry, in the order the TypeScript allow-list lists them. A
/// key outside this list is dropped at every layer, and none of the tier-2 keys is ever added.
pub const TIER1_KNOWN_FIX_KEYS: [&str; 12] = [
    "title",
    "notes",
    "winetricks",
    "runInPrefix",
    "envVariables",
    "wikiLink",
    "launchNotice",
    "macArch",
    "drm",
    "launchArgs",
    "exeOverride",
    "steamGameOverlay",
];

/// The keys that only say where a title is installed or launched from; they are not a fix.
pub const TIER1_ROUTING_KEYS: [&str; 2] = ["macArch", "drm"];

/// The eight keys a tier-2 profile may carry (`title` and `notes` are descriptive and allowed in both
/// tiers).
pub const TIER2_PROFILE_KEYS: [&str; 8] = [
    "title",
    "notes",
    "evidence",
    "registry",
    "dllOverrides",
    "overlays",
    "steamSharedRedists",
    "shimFeatures",
];

/// The keys both tiers may carry.
pub const DESCRIPTIVE_KEYS: [&str; 2] = ["title", "notes"];

/// One tier-1 fix: the allow-listed keys of `<id>-<store>.json`, each present or absent.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownFixesInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winetricks: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_in_prefix: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_variables: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wiki_link: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_notice: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mac_arch: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drm: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_args: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exe_override: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steam_game_overlay: Option<Value>,
}

impl KnownFixesInfo {
    /// Sets `key` to `value` when it is one of [`TIER1_KNOWN_FIX_KEYS`]; `false` for any other key.
    pub fn set(&mut self, key: &str, value: Value) -> bool {
        let slot = match key {
            "title" => &mut self.title,
            "notes" => &mut self.notes,
            "winetricks" => &mut self.winetricks,
            "runInPrefix" => &mut self.run_in_prefix,
            "envVariables" => &mut self.env_variables,
            "wikiLink" => &mut self.wiki_link,
            "launchNotice" => &mut self.launch_notice,
            "macArch" => &mut self.mac_arch,
            "drm" => &mut self.drm,
            "launchArgs" => &mut self.launch_args,
            "exeOverride" => &mut self.exe_override,
            "steamGameOverlay" => &mut self.steam_game_overlay,
            _ => return false,
        };
        *slot = Some(value);
        true
    }

    /// The value of `key`, when it is a tier-1 key and present.
    pub fn get(&self, key: &str) -> Option<&Value> {
        match key {
            "title" => &self.title,
            "notes" => &self.notes,
            "winetricks" => &self.winetricks,
            "runInPrefix" => &self.run_in_prefix,
            "envVariables" => &self.env_variables,
            "wikiLink" => &self.wiki_link,
            "launchNotice" => &self.launch_notice,
            "macArch" => &self.mac_arch,
            "drm" => &self.drm,
            "launchArgs" => &self.launch_args,
            "exeOverride" => &self.exe_override,
            "steamGameOverlay" => &self.steam_game_overlay,
            _ => &None,
        }
        .as_ref()
    }

    /// The keys that are present, in allow-list order.
    pub fn keys(&self) -> Vec<&'static str> {
        TIER1_KNOWN_FIX_KEYS
            .iter()
            .copied()
            .filter(|key| self.get(key).is_some())
            .collect()
    }
}

/// One tier-2 profile: the keys of `<id>-<store>.profile.json`, each present or absent.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownFixProfile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registry: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dll_overrides: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overlays: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steam_shared_redists: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shim_features: Option<Value>,
}

impl KnownFixProfile {
    /// Sets `key` to `value` when it is one of [`TIER2_PROFILE_KEYS`]; `false` for any other key.
    pub fn set(&mut self, key: &str, value: Value) -> bool {
        let slot = match key {
            "title" => &mut self.title,
            "notes" => &mut self.notes,
            "evidence" => &mut self.evidence,
            "registry" => &mut self.registry,
            "dllOverrides" => &mut self.dll_overrides,
            "overlays" => &mut self.overlays,
            "steamSharedRedists" => &mut self.steam_shared_redists,
            "shimFeatures" => &mut self.shim_features,
            _ => return false,
        };
        *slot = Some(value);
        true
    }
}

/// What the game page's GameLib row shows: which layer holds a fix and its trimmed launch notice.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamelibFixStatus {
    pub origin: FixLayer,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_notice: Option<String>,
}

/// A tier-1 fix and the layer that won it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LayeredFix {
    pub fix: KnownFixesInfo,
    pub layer: FixLayer,
}
