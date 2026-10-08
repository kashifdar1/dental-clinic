import { createApi } from './app.js'
import { createIdentityAuthenticator } from './auth/oidc-authenticator.js'
import { createSessionStore } from './auth/session-store.js'
import { recordSecurityEvent } from './audit/security-events.js'
import { readConfig } from './config.js'
import { createDatabase } from './database.js'

const config = readConfig()
const database = createDatabase(config.databaseUrl)
const platformDatabase = config.platformDatabaseUrl
  ? createDatabase(config.platformDatabaseUrl)
  : undefined
const tenantSessionStore = createSessionStore(database.database)
const platformSessionStore = platformDatabase
  ? createSessionStore(platformDatabase.database)
  : undefined
const app = createApi({
  checkDatabase: database.check,
  authenticator: createIdentityAuthenticator(config),
  sessionStores: {
    tenant: tenantSessionStore,
    platform: platformSessionStore,
  },
  secureCookies: config.nodeEnv === 'production',
  tenantDatabase: database.database,
  platformDatabase: platformDatabase?.database,
  isActivePlatformStaff: async (subject) => {
    if (!platformDatabase) return false
    const staff = await platformDatabase.database
      .selectFrom('platform_staff')
      .select('id')
      .where('identity_subject', '=', subject)
      .where('status', '=', 'active')
      .executeTakeFirst()
    return Boolean(staff)
  },
  recordSecurityEvent: platformDatabase
    ? (event) => recordSecurityEvent(platformDatabase.database, event)
    : undefined,
})

app.addHook('onClose', async () => {
  await database.close()
  await platformDatabase?.close()
})

try {
  await app.listen({ host: config.host, port: config.port })
  app.log.info({ host: config.host, port: config.port }, 'API listening')
} catch (error) {
  app.log.error(
    { errorName: error instanceof Error ? error.name : 'unknown' },
    'API failed to start',
  )
  await app.close()
  process.exitCode = 1
}

let closing = false
async function shutdown(signal: NodeJS.Signals) {
  if (closing) return
  closing = true
  app.log.info({ signal }, 'API shutting down')
  await app.close()
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
