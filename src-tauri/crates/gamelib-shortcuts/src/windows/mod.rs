//! The Windows halves of the shortcut services (D-12). Compiled on every host so the golden replays run
//! on Linux and macOS CI too; only a spawn of `powershell.exe` needs Windows, and that goes through the
//! injected `SpecRunner`.

pub mod lnk;
