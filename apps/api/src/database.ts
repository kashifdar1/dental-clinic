import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'

type ApiDatabase = Record<string, never>

export function createDatabase(connectionString: string) {
  const database = new Kysely<ApiDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        connectionTimeoutMillis: 2_000,
        idleTimeoutMillis: 30_000,
        max: 10,
      }),
    }),
  })

  return {
    async check(): Promise<void> {
      await sql`select 1`.execute(database)
    },
    close: () => database.destroy(),
  }
}
