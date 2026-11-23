//! The Vulkan helper probes (`createVulkan`, `utils/graphics/vulkan`): `vulkan-helper
//! physical-versions`, `instance-version` and `nvapi-path`, run through the spawn seam as bounded
//! helper children. They pick which DXVK and VKD3D release a Linux host gets and where `nvngx.dll`
//! lives.
//!
//! As in the TS, the two version probes are memoised for the life of one [`Vulkan`] (one install
//! call), so asking both the DXVK and the VKD3D lookup costs one spawn each; `nvapi-path` is not.
//! A probe that cannot be spawned, times out or exits non-zero answers `""`, which every reader
//! treats as "unknown": no GPU, no instance version, no `nvngx`.

use std::path::PathBuf;
use std::time::Duration;

use gamelib_core::process::ProcSpec;
use gamelib_engine::ctx::Platform;
use serde_json::Value;

use super::ToolsHost;
use crate::ctx::{Arch, WineCtx};

/// How long a probe gets (the TS `VULKAN_PROBE_TIMEOUT_MS`: the helper enumerates the Vulkan
/// instance, so the bound is generous).
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);

/// A Vulkan API version, `[major, minor, patch]`.
pub(crate) type VulkanVersion = [u64; 3];

/// The helper's path under the public directory: `bin/<arch>/<platform>/vulkan-helper`, the names
/// Node's `process.arch` and `process.platform` use.
fn helper_path(ctx: &WineCtx, host: &ToolsHost) -> Option<PathBuf> {
    let public = host.public_dir.as_ref()?;
    let arch = match ctx.arch {
        Arch::X64 => "x64",
        Arch::Arm64 => "arm64",
        Arch::Other => "ia32",
    };
    let platform = match ctx.engine.platform {
        Platform::Mac => "darwin",
        Platform::Linux => "linux",
        Platform::Windows => "win32",
    };
    let mut path = public
        .join("bin")
        .join(arch)
        .join(platform)
        .join("vulkan-helper");
    if ctx.engine.platform == Platform::Windows {
        path.set_extension("exe");
    }
    Some(path)
}

pub(crate) struct Vulkan<'a> {
    ctx: &'a WineCtx,
    helper: Option<PathBuf>,
    instance: Option<String>,
    physical: Option<String>,
}

impl<'a> Vulkan<'a> {
    pub(crate) fn new(ctx: &'a WineCtx, host: &ToolsHost) -> Vulkan<'a> {
        Vulkan {
            ctx,
            helper: helper_path(ctx, host),
            instance: None,
            physical: None,
        }
    }

    /// The stdout of one probe, or `""` when it failed.
    async fn probe(&self, arg: &str) -> String {
        let Some(helper) = &self.helper else {
            return String::new();
        };
        let Some(program) = helper.to_str() else {
            return String::new();
        };
        let mut spec = ProcSpec::new("vulkan-helper", program);
        spec.argv = vec![arg.to_string()];
        spec.timeout = Some(PROBE_TIMEOUT);
        spec.cancel = Some(self.ctx.engine.shutdown.token());
        let out = self.ctx.proc.run(spec, None).await;
        if out.timed_out || out.cancelled || out.code != Some(0) {
            return String::new();
        }
        out.stdout
    }

    /// The version of the installed Vulkan API interface; `None` when unsupported or unreadable.
    pub(crate) async fn instance_version(&mut self) -> Option<VulkanVersion> {
        if self.instance.is_none() {
            self.instance = Some(self.probe("instance-version").await);
        }
        let text = self.instance.as_deref()?;
        let value: Value = serde_json::from_str(text).ok()?;
        let parts = value.as_array()?;
        if parts.len() < 3 {
            return None;
        }
        Some([
            parts.first()?.as_u64()?,
            parts.get(1)?.as_u64()?,
            parts.get(2)?.as_u64()?,
        ])
    }

    /// Whether any GPU supports at least `target`.
    pub(crate) async fn any_gpu_supports(&mut self, target: VulkanVersion) -> bool {
        if self.physical.is_none() {
            self.physical = Some(self.probe("physical-versions").await);
        }
        let Some(text) = self.physical.as_deref() else {
            return false;
        };
        let Ok(Value::Array(devices)) = serde_json::from_str::<Value>(text) else {
            return false;
        };
        devices.iter().any(|device| {
            let part = |key: &str| device.get(key).and_then(Value::as_u64);
            match (part("major"), part("minor"), part("patch")) {
                (Some(major), Some(minor), Some(patch)) => [major, minor, patch] >= target,
                _ => false,
            }
        })
    }

    /// Where `nvngx.dll` is shipped (the helper's `nvapi-path`, trimmed); `""` when there is none.
    pub(crate) async fn nvngx_path(&self) -> String {
        self.probe("nvapi-path").await.trim().to_string()
    }
}

#[cfg(all(test, feature = "testing"))]
mod tests {
    use super::*;
    use gamelib_core::clock::SystemClock;
    use gamelib_core::process::SpecOutput;
    use gamelib_core::shutdown::Shutdown;
    use gamelib_engine::ctx::{EngineCtx, EnginePaths};
    use gamelib_engine::testing::ScriptedSpecRunner;
    use gamelib_store::host::StoreHost;
    use gamelib_testutil::FakeHome;
    use std::sync::Arc;

    fn out(stdout: &str) -> SpecOutput {
        SpecOutput {
            code: Some(0),
            stdout: stdout.to_string(),
            ..SpecOutput::default()
        }
    }

    fn ctx(home: &FakeHome, proc: Arc<ScriptedSpecRunner>) -> WineCtx {
        let root = home.root().to_path_buf();
        let engine = EngineCtx::new(
            Arc::new(StoreHost::new()),
            Arc::new(SystemClock),
            Platform::Linux,
            EnginePaths {
                app_folder: root.clone(),
                user_data: root.clone(),
                tools_path: root.join("tools"),
                user_home: root.clone(),
                temp: root.join("temp"),
            },
            Shutdown::new(),
        )
        .with_proc(proc);
        WineCtx::new(Arc::new(engine), root.join("runtimes")).with_arch(Arch::X64)
    }

    fn host(home: &FakeHome) -> ToolsHost {
        ToolsHost {
            public_dir: Some(home.root().join("public")),
            ..ToolsHost::default()
        }
    }

    #[tokio::test]
    async fn the_version_probes_are_memoised_and_read_the_helpers_json() {
        let home = FakeHome::new("vulkan-");
        let helper = home.root().join("public/bin/x64/linux/vulkan-helper");
        let helper = helper.to_str().unwrap();
        let proc = Arc::new(
            ScriptedSpecRunner::new(Vec::new())
                .on(
                    helper,
                    &["physical-versions"],
                    out(r#"[{"name":"a","major":1,"minor":2,"patch":9}]"#),
                )
                .on(helper, &["instance-version"], out("[1,3,280]"))
                .on(helper, &["nvapi-path"], out("/nv\n")),
        );
        let ctx = ctx(&home, proc.clone());
        let mut vulkan = Vulkan::new(&ctx, &host(&home));

        assert!(vulkan.any_gpu_supports([1, 1, 0]).await);
        assert!(!vulkan.any_gpu_supports([1, 3, 0]).await);
        assert_eq!(vulkan.instance_version().await, Some([1, 3, 280]));
        assert_eq!(vulkan.instance_version().await, Some([1, 3, 280]));
        assert_eq!(vulkan.nvngx_path().await, "/nv");
        assert_eq!(vulkan.nvngx_path().await, "/nv");
        // One spawn per memoised probe, one per nvapi-path ask.
        let argv: Vec<String> = proc.spawns().iter().map(|s| s.argv.join(" ")).collect();
        assert_eq!(
            argv,
            [
                "physical-versions",
                "instance-version",
                "nvapi-path",
                "nvapi-path"
            ]
        );
    }

    #[tokio::test]
    async fn a_failed_or_unreadable_probe_answers_unknown() {
        let home = FakeHome::new("vulkan-");
        let helper = home.root().join("public/bin/x64/linux/vulkan-helper");
        let helper = helper.to_str().unwrap();
        let proc = Arc::new(
            ScriptedSpecRunner::new(Vec::new())
                .on(
                    helper,
                    &["physical-versions"],
                    SpecOutput {
                        code: Some(1),
                        stdout: r#"[{"major":9,"minor":9,"patch":9}]"#.to_string(),
                        ..SpecOutput::default()
                    },
                )
                .on(helper, &["instance-version"], out("not json")),
        );
        let ctx = ctx(&home, proc);
        let mut vulkan = Vulkan::new(&ctx, &host(&home));
        assert!(!vulkan.any_gpu_supports([1, 1, 0]).await);
        assert_eq!(vulkan.instance_version().await, None);
        assert_eq!(vulkan.nvngx_path().await, "");
    }

    #[tokio::test]
    async fn no_public_directory_means_no_helper_and_no_spawn() {
        let home = FakeHome::new("vulkan-");
        let proc = Arc::new(ScriptedSpecRunner::new(Vec::new()));
        let ctx = ctx(&home, proc.clone());
        let mut vulkan = Vulkan::new(&ctx, &ToolsHost::default());
        assert!(!vulkan.any_gpu_supports([1, 1, 0]).await);
        assert_eq!(vulkan.instance_version().await, None);
        assert!(proc.spawns().is_empty());
    }
}
