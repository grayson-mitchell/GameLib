//! `utils/systeminfo/osInfo/*.ts`: the operating system's name and, where the system gives one, its
//! version. Linux reads the os-release file, Windows asks PowerShell for `Win32_OperatingSystem`,
//! macOS is just "macOS".

use serde_json::Value;

use super::host::{HostFacts, OS_RELEASE_PATHS};
use super::{line_after_key, run_probe, ProbeError};
use crate::ctx::{InfoCtx, Platform};

/// `{ name, version? }`. A missing version is filled by the caller from `os.release()`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OsDetail {
    pub name: String,
    pub version: Option<String>,
}

impl OsDetail {
    fn named(name: &str) -> OsDetail {
        OsDetail {
            name: name.to_string(),
            version: None,
        }
    }
}

/// `getOsInfo`: the probe of the platform the context says the app runs on.
pub async fn get_os_info(ctx: &InfoCtx, host: &dyn HostFacts) -> Result<OsDetail, ProbeError> {
    match ctx.platform {
        Platform::Windows => os_info_windows(ctx).await,
        Platform::Linux => Ok(os_info_linux(host)),
        Platform::Mac => Ok(OsDetail::named("macOS")),
    }
}

/// Strips specifically double quotes from the start and end of a string (`stripQuotes`): a lone `"`
/// both starts and ends the string, and is stripped to nothing.
pub(crate) fn strip_quotes(text: &str) -> String {
    if text.starts_with('"') && text.ends_with('"') {
        let mut chars = text.chars();
        chars.next();
        chars.next_back();
        return chars.as_str().to_string();
    }
    text.to_string()
}

/// The os-release file at the first of its three locations that exists. See
/// <https://www.freedesktop.org/software/systemd/man/os-release.html>.
fn os_info_linux(host: &dyn HostFacts) -> OsDetail {
    let Some(contents) = OS_RELEASE_PATHS
        .iter()
        .find_map(|path| host.read_os_release(path))
    else {
        return OsDetail::named("Unknown Linux Distribution");
    };
    parse_os_release(&contents)
}

/// The name and version of an os-release text. The spec does not say whether a field carries quotes,
/// so each is accepted with or without. An empty field counts as absent, as an empty capture is falsy.
pub(crate) fn parse_os_release(contents: &str) -> OsDetail {
    let field = |key: &str| line_after_key(contents, key).filter(|v| !v.is_empty());
    let name = match (field("NAME="), field("PRETTY_NAME=")) {
        (Some(name), _) => strip_quotes(name),
        (None, Some(pretty)) => strip_quotes(pretty),
        (None, None) => "Linux".to_string(),
    };
    let version = match (
        field("VERSION="),
        field("VERSION_ID="),
        field("VERSION_CODENAME="),
    ) {
        (Some(version), _, _) => Some(strip_quotes(version)),
        (None, Some(id), Some(codename)) => Some(format!("{id} {codename}")),
        _ => None,
    };
    OsDetail {
        name,
        version: version.filter(|v| !v.is_empty()),
    }
}

/// `Get-CimInstance -Class Win32_OperatingSystem`, parsed as `{ Caption, Version }`; any other answer
/// is "Unknown Windows Version". A PowerShell that cannot start rejects the whole read.
async fn os_info_windows(ctx: &InfoCtx) -> Result<OsDetail, ProbeError> {
    let out = run_probe(
        ctx,
        "info.sysinfo.powershell_os",
        "powershell",
        &[
            "Get-CimInstance",
            "-Class",
            "Win32_OperatingSystem",
            "-Property",
            "Caption,Version",
            "|",
            "Select-Object",
            "Caption,Version",
            "|",
            "ConvertTo-Json",
            "-Compress",
        ],
        &[],
        true,
    )
    .await?;
    Ok(parse_windows_os(&out.stdout))
}

pub(crate) fn parse_windows_os(stdout: &str) -> OsDetail {
    let parsed: Option<(String, String)> =
        serde_json::from_str::<Value>(stdout)
            .ok()
            .and_then(|value| {
                let object = value.as_object()?;
                let caption = object.get("Caption")?.as_str()?.to_string();
                let version = object.get("Version")?.as_str()?.to_string();
                Some((caption, version))
            });
    match parsed {
        Some((name, version)) => OsDetail {
            name,
            version: Some(version),
        },
        None => OsDetail::named("Unknown Windows Version"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_quotes_removes_one_pair_of_double_quotes_only() {
        assert_eq!(strip_quotes("\"Ubuntu\""), "Ubuntu");
        assert_eq!(strip_quotes("'Ubuntu'"), "'Ubuntu'");
        assert_eq!(strip_quotes("\"open"), "\"open");
        assert_eq!(strip_quotes("\""), "");
        assert_eq!(strip_quotes("\"\""), "");
    }

    #[test]
    fn os_release_prefers_name_then_pretty_name_then_linux() {
        let both = parse_os_release("NAME=\"Ubuntu\"\nPRETTY_NAME=\"Ubuntu 22.04\"\n");
        assert_eq!(both.name, "Ubuntu");
        let pretty = parse_os_release("PRETTY_NAME=\"Arch\"\n");
        assert_eq!(pretty.name, "Arch");
        assert_eq!(parse_os_release("ID=x\n").name, "Linux");
    }

    #[test]
    fn os_release_version_is_the_version_field_or_id_with_codename() {
        assert_eq!(
            parse_os_release("NAME=A\nVERSION=\"1 (x)\"\nVERSION_ID=1\nVERSION_CODENAME=x\n")
                .version,
            Some("1 (x)".to_string())
        );
        assert_eq!(
            parse_os_release("NAME=A\nVERSION_ID=3.5.7\nVERSION_CODENAME=holo\n").version,
            Some("3.5.7 holo".to_string())
        );
        assert_eq!(parse_os_release("NAME=A\nVERSION_ID=3.5.7\n").version, None);
        assert_eq!(parse_os_release("NAME=A\nVERSION=\"\"\n").version, None);
    }

    #[test]
    fn windows_os_needs_caption_and_version_text() {
        let ok =
            parse_windows_os(r#"{"Caption":"Microsoft Windows 11 Pro","Version":"10.0.22631"}"#);
        assert_eq!(ok.name, "Microsoft Windows 11 Pro");
        assert_eq!(ok.version.as_deref(), Some("10.0.22631"));
        for bad in [
            "",
            "not json",
            "[]",
            "null",
            r#"{"Caption":"x"}"#,
            r#"{"Caption":1,"Version":"1"}"#,
        ] {
            assert_eq!(
                parse_windows_os(bad),
                OsDetail::named("Unknown Windows Version"),
                "{bad}"
            );
        }
    }
}
