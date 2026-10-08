import { sql, type Kysely, type Transaction } from 'kysely'
import { z } from 'zod'

const IdentitySubjectSchema = z.string().trim().min(1).max(255)

export async function withIdentity<Database, Result>(
  database: Kysely<Database>,
  subject: string,
  operation: (transaction: Transaction<Database>) => Promise<Result>,
): Promise<Result> {
  const identitySubject = IdentitySubjectSchema.parse(subject)
  return database.transaction().execute(async (transaction) => {
    await sql`select set_config('app.identity_subject', ${identitySubject}, true)`.execute(
      transaction,
    )
    return operation(transaction)
  })
}
