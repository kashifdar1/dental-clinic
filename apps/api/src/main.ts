import { createApi } from './app.js'
import { readConfig } from './config.js'
import { createDatabase } from './database.js'

const config = readConfig()
const database = createDatabase(config.databaseUrl)
const app = createApi({ checkDatabase: database.check })

app.addHook('onClose', async () => {
  await database.close()
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
