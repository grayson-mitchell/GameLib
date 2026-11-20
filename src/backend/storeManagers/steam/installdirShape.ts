/**
 * Phase 80/82: the shape of a Steam manifest's untrusted `installdir`, shared by the bottle-direct
 * uninstall (gameUninstall.ts) and the copy-removal pre-check (library/acfState.ts). Pure; no
 * state, timers or handles.
 */
import { sep } from 'node:path'

/**
 * 80-REVIEW C/EXTRA-01: the shape of an untrusted manifest `installdir`, mirroring
 * `installdir_shape` in gamelib-steampoll's acf_copies.rs. Only a `single` plain folder name
 * may be deleted as `common/<installdir>`; a `nested` one (`Studio/GameB`) names a parent
 * other apps may share. A backslash, `:` and NUL are refused on every OS so one manifest means one
 * thing everywhere; so are an absolute path and any `.` or `..` segment (stricter than Rust,
 * which drops a non-leading `.`). Empty segments from repeated or trailing `/` are ignored,
 * as Rust's `Path::components` does.
 *
 * Exported for unit testing.
 */
export function installdirShape(
  installdir: string
):
  | { kind: 'single'; segment: string }
  | { kind: 'nested' }
  | { kind: 'escaping' } {
  if (/[\\:\0]/.test(installdir) || installdir.startsWith('/')) {
    return { kind: 'escaping' }
  }
  const segments = installdir.split('/').filter((s) => s !== '')
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    return { kind: 'escaping' }
  }
  const [segment] = segments
  if (segment === undefined) return { kind: 'escaping' }
  return segments.length === 1
    ? { kind: 'single', segment }
    : { kind: 'nested' }
}

/**
 * 80-REVIEW C/EXTRA-01: the raw `installdir` behind a Rust `readAcfState` installPath. Rust
 * builds it as `Path::new(steamappsDir).join("common").join(installdir)` with no
 * normalization, so the installdir is the verbatim tail after `<steamappsDir>/common/`. An
 * installPath without that prefix (an absolute installdir replaces the whole path) yields
 * `undefined`, which the caller refuses.
 *
 * Exported for unit testing.
 */
export function rawInstalldirFromInstallPath(
  steamappsDir: string,
  installPath: string
): string | undefined {
  const withSep = (p: string) => (p.endsWith(sep) ? p : p + sep)
  const prefix = withSep(withSep(steamappsDir) + 'common')
  return installPath.startsWith(prefix)
    ? installPath.slice(prefix.length)
    : undefined
}
