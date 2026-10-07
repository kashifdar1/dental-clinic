import Fastify, { type FastifyServerOptions } from 'fastify'

interface ApiOptions {
  checkDatabase: () => Promise<void>
  logger?: FastifyServerOptions['logger']
}

export function createApi(options: ApiOptions) {
  const app = Fastify({
    logger: options.logger ?? {
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          "req.headers['x-api-key']",
        ],
        censor: '[REDACTED]',
      },
    },
  })

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'Unhandled API error',
    )
    return reply.status(500).send({
      error: 'internal_server_error',
      requestId: request.id,
    })
  })

  app.get('/health/live', async () => ({ status: 'ok' }))
  app.get('/health/ready', async (request, reply) => {
    try {
      await options.checkDatabase()
      return { status: 'ready' }
    } catch (error) {
      request.log.warn(
        { reason: error instanceof Error ? error.name : 'unknown' },
        'Database readiness check failed',
      )
      return reply.status(503).send({ status: 'not_ready' })
    }
  })

  return app
}
