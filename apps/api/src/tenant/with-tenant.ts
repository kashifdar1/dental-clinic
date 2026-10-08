import { sql, type Kysely, type Transaction } from 'kysely'
import { z } from 'zod'

const TenantIdSchema = z.string().uuid()

export async function withTenant<Database, Result>(
  database: Kysely<Database>,
  tenantId: string,
  operation: (transaction: Transaction<Database>) => Promise<Result>,
): Promise<Result> {
  const scopedTenantId = TenantIdSchema.parse(tenantId)

  return database.transaction().execute(async (transaction) => {
    await sql`select set_config('app.tenant_id', ${scopedTenantId}, true)`.execute(
      transaction,
    )
    return operation(transaction)
  })
}

export async function withTenantLocation<Database, Result>(
  database: Kysely<Database>,
  tenantId: string,
  locationId: string,
  operation: (transaction: Transaction<Database>) => Promise<Result>,
): Promise<Result> {
  const scopedLocationId = TenantIdSchema.parse(locationId)

  return withTenant(database, tenantId, async (transaction) => {
    await sql`select set_config('app.location_id', ${scopedLocationId}, true)`.execute(
      transaction,
    )
    return operation(transaction)
  })
}
