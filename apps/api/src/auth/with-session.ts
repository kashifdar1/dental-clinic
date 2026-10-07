import { sql, type Kysely, type Transaction } from 'kysely'
import { z } from 'zod'
import type { ApiDatabase } from '../db/schema.js'

const SessionHashSchema = z.string().regex(/^[a-f0-9]{64}$/)

export async function withSession<Result>(
  database: Kysely<ApiDatabase>,
  sessionHash: string,
  operation: (transaction: Transaction<ApiDatabase>) => Promise<Result>,
): Promise<Result> {
  const scopedSessionHash = SessionHashSchema.parse(sessionHash)

  return database.transaction().execute(async (transaction) => {
    await sql`select set_config('app.session_hash', ${scopedSessionHash}, true)`.execute(
      transaction,
    )
    return operation(transaction)
  })
}
