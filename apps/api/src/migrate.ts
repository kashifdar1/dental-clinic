import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

async function main(): Promise<void> {
  const testMode = process.argv.includes('--test')
  const connectionString = testMode
    ? process.env.RLS_TEST_MIGRATION_DATABASE_URL
    : process.env.MIGRATION_DATABASE_URL
  if (!connectionString) {
    throw new Error(testMode ? 'Missing RLS_TEST_MIGRATION_DATABASE_URL' : 'Missing MIGRATION_DATABASE_URL')
  }
  if (testMode && new URL(connectionString).pathname !== '/clinic_hub_test') {
    throw new Error('Test migrations must target the isolated clinic_hub_test database')
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_MIGRATIONS !== 'true') {
    throw new Error('Production migrations require the deployment migration workflow')
  }

  const client = new Client({ connectionString })
  const migrationDirectory = fileURLToPath(
    new URL('../../../infra/db/migrations/', import.meta.url),
  )
  await client.connect()

  try {
    await client.query('SET ROLE clinic_hub_migrator')
    await client.query('SET search_path TO clinic_hub, public')
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinic_hub.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const files = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const contents = await readFile(resolve(migrationDirectory, file), 'utf8')
      const checksum = createHash('sha256').update(contents).digest('hex')
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM clinic_hub.schema_migrations WHERE name = $1',
        [file],
      )

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration was modified: ${file}`)
        }
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(contents)
        await client.query(
          'INSERT INTO clinic_hub.schema_migrations (name, checksum) VALUES ($1, $2)',
          [file, checksum],
        )
        await client.query('COMMIT')
        console.info(`Applied migration ${file}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}

await main()
