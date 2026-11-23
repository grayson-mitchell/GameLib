//! The wine crate's implementation of the engine-owned DXVK seam (D-25 (a)): [`WineDxvkInstaller`]
//! is a `gamelib_engine::dxvk::DxvkInstaller` over [`super::dxvk::install_remove`].
//!
//! The engine crate owns the trait and never names this one (D-04); the shell resolves a
//! [`WineDxvkInstaller`] at call time and hands it to the engine context. The trait answers a plain
//! `bool` (the TS `installRemove` resolved `true` or `false`), so the one thing `install_remove`
//! reports beyond that, a [`DxvkError`] (the TS rejection), is mapped to `false` here and noted in the
//! engine log as its category word only (T-87-09, T-87-21: no path, URL or response text).

use std::sync::Arc;

use gamelib_core::process::BoxFuture;
use gamelib_engine::dxvk::{DxvkInstaller, DxvkRequest};

use super::dxvk::install_remove;
use super::{HostWineRunner, ToolsHost, WineRunner};
use crate::ctx::WineCtx;

/// Installs or removes a DXVK-family tool through the wine crate's [`install_remove`].
pub struct WineDxvkInstaller {
    wine: Arc<WineCtx>,
    /// The facts about the running app the crate may not read itself (D-17): the Vulkan helper's
    /// directory, the online answer and the wine host facts a wine command runs with.
    host: ToolsHost,
    /// The wine core the tool's commands go through. `None` is the production one,
    /// [`HostWineRunner`] over `host.wine`; a test replaces it with a scripted one.
    runner: Option<Arc<dyn WineRunner>>,
}

impl WineDxvkInstaller {
    /// An installer over `wine` with the default [`ToolsHost`] and the production wine runner.
    pub fn new(wine: Arc<WineCtx>) -> WineDxvkInstaller {
        WineDxvkInstaller {
            wine,
            host: ToolsHost::default(),
            runner: None,
        }
    }

    /// Replaces the host facts (the shell reads them: the process environment, the public directory,
    /// whether the app is online).
    pub fn with_host(mut self, host: ToolsHost) -> WineDxvkInstaller {
        self.host = host;
        self
    }

    /// Replaces the wine core the tool's commands go through (a test scripts it).
    pub fn with_runner(mut self, runner: Arc<dyn WineRunner>) -> WineDxvkInstaller {
        self.runner = Some(runner);
        self
    }
}

impl DxvkInstaller for WineDxvkInstaller {
    fn install_remove(&self, req: DxvkRequest) -> BoxFuture<bool> {
        let wine = Arc::clone(&self.wine);
        let host = self.host.clone();
        let runner = self.runner.clone();
        Box::pin(async move {
            let outcome = match &runner {
                Some(runner) => install_remove(&wine, &host, runner.as_ref(), req).await,
                None => {
                    let production = HostWineRunner { host: &host.wine };
                    install_remove(&wine, &host, &production, req).await
                }
            };
            match outcome {
                Ok(done) => done,
                Err(error) => {
                    if let Some(log) = &wine.engine.log {
                        log.warn(&format!("DXVK install or remove failed: {error}"));
                    }
                    false
                }
            }
        })
    }
}
