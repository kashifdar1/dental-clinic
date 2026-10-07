import { afterEach, describe, expect, it } from 'vitest'
import { createApi } from '../src/app.js'

const apps: ReturnType<typeof createApi>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('API health endpoints', () => {
  it('reports liveness without depending on PostgreSQL', async () => {
    const app = createApi({
      checkDatabase: async () => {
        throw new Error('database should not be checked for liveness')
      },
      logger: false,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/live' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('reports readiness only when PostgreSQL is available', async () => {
    const app = createApi({
      checkDatabase: async () => {},
      logger: false,
    })
    apps.push(app)

    const ready = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(ready.statusCode).toBe(200)
    expect(ready.json()).toEqual({ status: 'ready' })
  })

  it('returns a generic readiness response when PostgreSQL is unavailable', async () => {
    const app = createApi({
      checkDatabase: async () => {
        throw new Error('connection password must not be exposed')
      },
      logger: false,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'not_ready' })
    expect(response.body).not.toContain('password')
  })
})
