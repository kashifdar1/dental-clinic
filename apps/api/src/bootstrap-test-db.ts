import { Client } from 'pg'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

async function ensureGroupRole(client: Client, name: string): Promise<void> {
  const result = await client.query('select 1 from pg_roles where rolname = $1', [name])
  if (result.rowCount === 0) {
    await client.query(
      `CREATE ROLE ${name} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
    )
  }
}

async function ensureLoginRole(
  client: Client,
  name: string,
  group: string,
  password: string,
): Promise<void> {
  const result = await client.query('select 1 from pg_roles where rolname = $1', [name])
  if (result.rowCount === 0) {
    await client.query(
      `CREATE ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${sqlLiteral(password)}`,
    )
  } else {
    await client.query(
      `ALTER ROLE ${name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${sqlLiteral(password)}`,
    )
  }
  await client.query(`GRANT ${group} TO ${name}`)
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_LOCAL_DB_BOOTSTRAP !== 'true') {
    throw new Error('Database role bootstrap is restricted to explicitly enabled local/test environments')
  }

  const client = new Client({ connectionString: required('BOOTSTRAP_DATABASE_URL') })
  await client.connect()

  try {
    await ensureGroupRole(client, 'clinic_hub_app')
    await ensureGroupRole(client, 'clinic_hub_platform')
    await ensureGroupRole(client, 'clinic_hub_migrator')
    await ensureLoginRole(
      client,
      'clinic_hub_app_login',
      'clinic_hub_app',
      required('APP_DB_PASSWORD'),
    )
    await ensureLoginRole(
      client,
      'clinic_hub_platform_login',
      'clinic_hub_platform',
      required('PLATFORM_DB_PASSWORD'),
    )
    await ensureLoginRole(
      client,
      'clinic_hub_migrator_login',
      'clinic_hub_migrator',
      required('MIGRATOR_DB_PASSWORD'),
    )

    await client.query('GRANT CONNECT ON DATABASE clinic_hub TO clinic_hub_app, clinic_hub_platform, clinic_hub_migrator')
    await client.query('GRANT CREATE ON DATABASE clinic_hub TO clinic_hub_migrator')
    const testDatabase = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'clinic_hub_test'",
    )
    if (testDatabase.rowCount === 0) {
      await client.query('CREATE DATABASE clinic_hub_test OWNER clinic_hub_bootstrap')
    }
    await client.query('GRANT CONNECT ON DATABASE clinic_hub_test TO clinic_hub_app, clinic_hub_platform, clinic_hub_migrator')
    await client.query('GRANT CREATE ON DATABASE clinic_hub_test TO clinic_hub_migrator')
    await client.query('SET ROLE clinic_hub_migrator')
    await client.query('CREATE SCHEMA IF NOT EXISTS clinic_hub AUTHORIZATION clinic_hub_migrator')
    await client.query('ALTER SCHEMA clinic_hub OWNER TO clinic_hub_migrator')
    await client.query('GRANT USAGE ON SCHEMA clinic_hub TO clinic_hub_app, clinic_hub_platform')
    await client.query('RESET ROLE')
    await client.query('ALTER ROLE clinic_hub_app_login IN DATABASE clinic_hub SET search_path TO clinic_hub, public')
    await client.query('ALTER ROLE clinic_hub_platform_login IN DATABASE clinic_hub SET search_path TO clinic_hub, public')
    await client.query('ALTER ROLE clinic_hub_migrator_login IN DATABASE clinic_hub SET search_path TO clinic_hub, public')
    await client.query('ALTER ROLE clinic_hub_app_login IN DATABASE clinic_hub_test SET search_path TO clinic_hub, public')
    await client.query('ALTER ROLE clinic_hub_platform_login IN DATABASE clinic_hub_test SET search_path TO clinic_hub, public')
    await client.query('ALTER ROLE clinic_hub_migrator_login IN DATABASE clinic_hub_test SET search_path TO clinic_hub, public')
  } finally {
    await client.end()
  }

  const testConnectionString = required('RLS_TEST_DATABASE_URL')
  if (new URL(testConnectionString).pathname !== '/clinic_hub_test') {
    throw new Error('RLS_TEST_DATABASE_URL must target the isolated clinic_hub_test database')
  }
  const testClient = new Client({ connectionString: testConnectionString })
  await testClient.connect()
  try {
    await testClient.query('SET ROLE clinic_hub_migrator')
    await testClient.query('CREATE SCHEMA IF NOT EXISTS clinic_hub AUTHORIZATION clinic_hub_migrator')
    await testClient.query('ALTER SCHEMA clinic_hub OWNER TO clinic_hub_migrator')
    await testClient.query('GRANT USAGE ON SCHEMA clinic_hub TO clinic_hub_app, clinic_hub_platform')
  } finally {
    await testClient.end()
  }

  console.info('Local/test database roles are ready')
}

await main()
