/**
 * A user-authored theme, persisted under `configStore.customThemes` as ONE array (never as
 * dotted per-id keys, so a write is a single allow-listed key and an id can never build a key
 * path).
 *
 * `base` is a built-in theme key the custom theme was derived from; `tokens` are literal CSS
 * values keyed by custom-property name (for example `'--accent': '#112233'`). `configStore.theme`
 * selects a custom theme as `custom:<id>`.
 *
 * This is persisted user data: changing this shape requires a Phase 68 `store/config`
 * migration entry (adding an optional field does not).
 */
export interface CustomTheme {
  id: string
  name: string
  base: string
  tokens: Record<string, string>
}
