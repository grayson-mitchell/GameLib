fn main() {
    // Phase 86 D-25: the shell compiles the baked IsThereAnyDeal key with
    // `option_env!("ITAD_API_KEY")` (src/info_dispatch.rs). Without this line cargo would reuse
    // a build made with a different key (or none) when only the variable changed.
    println!("cargo:rerun-if-env-changed=ITAD_API_KEY");
    // Runs tauri's codegen at compile time: reads tauri.conf.json, embeds the
    // frontendDist assets (../build/renderer — the plain-Vite renderer
    // output, assembled by meta/assembleRendererDist.ts), and generates the
    // capability schema consumed by capabilities/default.json.
    tauri_build::build()
}
