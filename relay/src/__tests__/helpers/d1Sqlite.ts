import { readFileSync } from 'fs'
import { join } from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { D1Like, D1StatementLike } from '../../env'

type SqlValue = string | number | bigint | null | Uint8Array

function makeStatement(
  db: DatabaseSync,
  sql: string,
  values: unknown[]
): D1StatementLike {
  return {
    bind: (...v) => makeStatement(db, sql, v),
    first: async <T>() => {
      const row = db.prepare(sql).get(...(values as SqlValue[]))
      return (row ?? null) as T | null
    },
    run: async () => db.prepare(sql).run(...(values as SqlValue[])),
    all: async <T>() => ({
      results: db.prepare(sql).all(...(values as SqlValue[])) as T[]
    })
  }
}

export function createTestD1(): D1Like & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(
    readFileSync(join(__dirname, '../../../migrations/0001_init.sql'), 'utf8')
  )
  return {
    raw,
    prepare: (sql: string) => makeStatement(raw, sql, [])
  }
}
