import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { defineConfig } from 'vitest/config'

if (existsSync('.env')) loadEnvFile('.env')

const requiredVariables = [
  'RLS_TEST_DATABASE_URL',
  'RLS_TEST_APP_DATABASE_URL',
  'RLS_TEST_PLATFORM_DATABASE_URL',
  'RLS_TEST_MIGRATION_DATABASE_URL',
]
const missing = requiredVariables.filter((name) => !process.env[name])
if (missing.length > 0) {
  throw new Error(`Database integration tests require: ${missing.join(', ')}`)
}
for (const name of requiredVariables) {
  if (new URL(process.env[name]!).pathname !== '/clinic_hub_test') {
    throw new Error(`${name} must target the isolated clinic_hub_test database`)
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/rls.integration.test.ts'],
  },
})
