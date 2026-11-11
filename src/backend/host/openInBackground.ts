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
