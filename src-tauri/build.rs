fn main() {
    // Runs tauri's codegen at compile time: reads tauri.conf.json, embeds the
    // frontendDist assets (../build — the electron-vite renderer output), and
    // generates the capability schema consumed by capabilities/default.json.
    tauri_build::build()
}
