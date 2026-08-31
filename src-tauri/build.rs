fn main() {
    // Runs tauri's codegen at compile time: reads tauri.conf.json, embeds the
    // frontendDist assets (../build/renderer — the plain-Vite renderer
    // output, assembled by meta/assembleRendererDist.ts), and generates the
    // capability schema consumed by capabilities/default.json.
    tauri_build::build()
}
