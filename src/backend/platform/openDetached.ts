import { spawn } from 'child_process'

/**
 * True when `shell.openExternal(url, options)` should open `url` in the
 * background through a direct detached `/usr/bin/open -g`.
 *
 * Steam-only on purpose: `steam:` is a strict subset of the Rust shell's
 * OPEN_EXTERNAL_ALLOWED_SCHEMES (src-tauri/src/main.rs), and every other URL
 * keeps going through that renderer-facing check.
 */
export function shouldOpenInBackground(
  platform: NodeJS.Platform,
  url: string,
  options: unknown
): boolean {
  if (platform !== 'darwin') return false
  if (typeof options !== 'object' || options === null) return false
  if ((options as { activate?: unknown }).activate !== false) return false
  const colon = url.indexOf(':')
  if (colon < 0) return false
  return url.slice(0, colon).toLowerCase() === 'steam'
}

/**
 * Fires a URL through a direct, detached `/usr/bin/open -g`. Used for
 * shutdown restores (the sidecar's stdout frame channel is gone at stdin EOF)
 * and for background opens on darwin (`-g` does not raise the target app).
 */
export function spawnOpenDetached(
  url: string,
  onError?: (code: string) => void
): void {
  // The child inherits the real user session on purpose: LaunchServices
  // resolves steam:// per user, so a fake or stripped env breaks dispatch.
  // Tests never reach this call; the missing env option is what
  // fakeHomeIsolation.test.ts requires.
  const child = spawn('/usr/bin/open', ['-g', url], {
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', (err) => {
    onError?.((err as NodeJS.ErrnoException).code ?? 'error')
  })
  child.unref()
}
