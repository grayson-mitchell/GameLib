// Structural Worker-facing types (no @cloudflare/workers-types dependency).
// All SQL in relay/ uses plain `?` placeholders only (portable across D1 and node:sqlite).

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<unknown>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
}

export interface D1Like {
  prepare(sql: string): D1StatementLike
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface RelayEnv {
  DB: D1Like
  REPO_OWNER: string
  REPO_NAME: string
  BASE_BRANCH: string
  GITHUB_APP_ID: string
  GITHUB_INSTALLATION_ID: string
  GITHUB_APP_PRIVATE_KEY: string
  IP_HASH_SALT: string
  IP_HOURLY_LIMIT?: string
  DAILY_CREATE_CAP?: string
}

export interface RelayDeps {
  db: D1Like
  fetch: FetchLike
  now: () => number
  random: () => number
  env: RelayEnv
}
