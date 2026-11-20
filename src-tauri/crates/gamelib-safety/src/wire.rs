//! Serde wire types for the `safety_*` ops. Field names are camelCase and enum names kebab-case;
//! `src/common/types/safety.ts` mirrors them and `safetyWireParity.test.ts` pins the match.
//! Inputs deny unknown fields so a drifting caller fails loudly as `:bad-args`.

use crate::tri::Tri;
use serde::{Deserialize, Serialize};

/// What a target is. Decides which trust-root and content rules apply.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TargetKind {
    GameInstall,
    GameSupport,
    Prefix,
    Bottle,
    SideloadFolder,
    AppData,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Target {
    pub id: String,
    pub path: String,
    pub kind: TargetKind,
    /// The folder the target must lie strictly inside. Only ever a caller-supplied parameter,
    /// never derived from a manifest, a library entry or an executable path.
    #[serde(default)]
    pub trust_root: Option<String>,
    /// A sideload game's own executable (absolute, or relative to the folder).
    #[serde(default)]
    pub executable: Option<String>,
}

/// Any store's library entry that has an install location.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Known {
    pub key: String,
    pub path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub targets: Vec<Target>,
    /// `None` means "the list could not be read" and yields `Unknown`, never "no known installs".
    #[serde(default)]
    pub known_installs: Option<Vec<Known>>,
    /// The key of the game being removed; its own entry is not a sibling.
    #[serde(default)]
    pub self_key: Option<String>,
    #[serde(default)]
    pub protected_roots: Vec<String>,
}

/// Why an item got its verdict. Closed set, mapped 1:1 to i18n keys by the TS side.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Reason {
    Ok,
    NotAbsolute,
    DotSegment,
    NulByte,
    IsProtectedRoot,
    IsTrustRoot,
    OutsideTrustRoot,
    NoTrustRoot,
    NestedKnownInstall,
    InsideKnownInstall,
    KnownInstallsUnreadable,
    CanonicalizeFailed,
    NotAPrefix,
    FolderLooksShared,
    DeleteFailed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub verdict: Tri,
    pub reason: Reason,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub other_key: Option<String>,
    /// The target is a symlink or junction: the link itself is the unit of deletion.
    pub is_link: bool,
    /// Nothing exists at the target; there is nothing to delete.
    pub absent: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    pub overall: Tri,
    pub items: Vec<Item>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Outcome {
    Refused,
    Removed,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveReply {
    pub overall: Tri,
    pub items: Vec<Item>,
    pub outcome: Outcome,
}
