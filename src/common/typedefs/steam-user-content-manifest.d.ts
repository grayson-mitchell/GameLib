/**
 * Types for steam-user's internal raw-manifest parser.
 * https://github.com/DoctorMcKay/node-steam-user/blob/master/components/content_manifest.js
 *
 * Phase 21 (21-04): this path is UNDOCUMENTED in steam-user's public API and
 * @types/steam-user does not declare it — it may move or change shape on a
 * steam-user version bump (Pitfall 5, T-21-10). depot.ts's
 * loadContentManifestParser() treats this as a minimal, defensively-checked
 * surface (a loud throw if `.parse` is ever missing at runtime), and this
 * ambient declaration exists only to satisfy `tsc` for the dynamic import
 * path itself — NOT as a guarantee steam-user won't change this file.
 */
declare module 'steam-user/components/content_manifest.js' {
  export function parse(buffer: Buffer): { files: unknown[] }
}
