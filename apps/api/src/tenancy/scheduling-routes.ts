import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { ApiDatabase } from '../db/schema.js'
import { requireTenantPermission } from '../access/tenant-permissions.js'
import {
  SchedulingError,
  createAppointment,
  listAppointmentStatusHistory,
  listAppointments,
  listAvailableSlots,
  listPractitionerSchedule,
  replaceWeeklySchedule,
  rescheduleAppointment,
  setScheduleException,
  transitionAppointment,
} from './scheduling-service.js'

interface SchedulingRouteOptions {
  tenantDatabase?: Kysely<ApiDatabase>
  tenantRealmGuard: preHandlerHookHandler
  tenantUnavailable: preHandlerHookHandler
}

function schedulingErrorReply(error: unknown, reply: Parameters<preHandlerHookHandler>[1]) {
  if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_scheduling_request' })
  if (!(error instanceof SchedulingError)) throw error
  const statusCode = error.code === 'not_found'
    ? 404
    : error.code === 'hold_expired'
      ? 410
      : ['slot_unavailable', 'invalid_transition', 'overlapping_windows', 'windows_overlap'].includes(error.code)
        ? 409
        : error.code === 'idempotency_conflict'
          ? 409
        : 400
  return reply.status(statusCode).send({ error: error.code })
}

export function registerSchedulingRoutes(
  routes: FastifyInstance,
  options: SchedulingRouteOptions,
): void {
  const scheduleGuard = options.tenantDatabase
    ? [options.tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'schedule.manage')]
    : options.tenantUnavailable
  const appointmentReadGuard = options.tenantDatabase
    ? [options.tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'appointment.read')]
    : options.tenantUnavailable
  const appointmentManageGuard = options.tenantDatabase
    ? [options.tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'appointment.manage')]
    : options.tenantUnavailable

  routes.put(
    '/v1/tenant/schedules/:practitionerId/weekly',
    {
      preHandler: scheduleGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Replace weekly schedule windows for a practitioner at the active location',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { practitionerId: { type: 'string', format: 'uuid' } },
          required: ['practitionerId'],
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            windows: {
              type: 'array',
              maxItems: 28,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
                  startTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
                  endTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
                },
                required: ['dayOfWeek', 'startTime', 'endTime'],
              },
            },
          },
          required: ['windows'],
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const { practitionerId } = request.params as { practitionerId: string }
        const { windows } = request.body as { windows: unknown }
        return await replaceWeeklySchedule(options.tenantDatabase!, request.identity!.subject, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          practitionerId,
          windows,
        })
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )

  routes.get(
    '/v1/tenant/schedules/:practitionerId',
    {
      preHandler: scheduleGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Read weekly schedule windows and date exceptions',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { practitionerId: { type: 'string', format: 'uuid' } },
          required: ['practitionerId'],
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const { practitionerId } = request.params as { practitionerId: string }
        return await listPractitionerSchedule(options.tenantDatabase!, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          practitionerId,
        })
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )

  routes.put(
    '/v1/tenant/schedules/:practitionerId/exceptions/:date',
    {
      preHandler: scheduleGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Set a practitioner schedule override or closure for one local date',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            practitionerId: { type: 'string', format: 'uuid' },
            date: { type: 'string', format: 'date' },
          },
          required: ['practitionerId', 'date'],
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            closed: { type: 'boolean' },
            startTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
            endTime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
          },
          required: ['closed'],
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const { practitionerId, date } = request.params as { practitionerId: string; date: string }
        const body = request.body as { closed: boolean; startTime?: string; endTime?: string }
        return await setScheduleException(options.tenantDatabase!, request.identity!.subject, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          practitionerId,
          date,
          ...body,
        })
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )

  routes.get(
    '/v1/tenant/available-slots',
    {
      preHandler: appointmentReadGuard,
      schema: {
        tags: ['tenant'],
        summary: 'List available appointment slots for a service on a location-local date',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            serviceId: { type: 'string', format: 'uuid' },
            date: { type: 'string', format: 'date' },
          },
          required: ['serviceId', 'date'],
        },
        response: {
          200: { type: 'array', items: { type: 'object', additionalProperties: true } },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const { serviceId, date } = request.query as { serviceId: string; date: string }
        return await listAvailableSlots(options.tenantDatabase!, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          serviceId,
          date,
        })
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )

  routes.get(
    '/v1/tenant/appointments',
    {
      preHandler: appointmentReadGuard,
      schema: {
        tags: ['tenant'],
        summary: 'List appointments in a time range at the active location',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
          },
          required: ['from', 'to'],
        },
        response: {
          200: { type: 'array', items: { type: 'object', additionalProperties: true } },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const { from, to } = request.query as { from: string; to: string }
        return await listAppointments(options.tenantDatabase!, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          from,
          to,
        })
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )

  routes.post(
    '/v1/tenant/appointments',
    {
      preHandler: appointmentManageGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Create an appointment request or a short-lived slot hold',
        security: [{ bearerAuth: [] }],
        headers: {
          type: 'object',
          additionalProperties: true,
          properties: {
            'idempotency-key': {
              type: 'string',
              minLength: 8,
              maxLength: 128,
              pattern: '^[A-Za-z0-9._:-]+$',
              description: 'Optional key for safely retrying the same appointment request',
            },
          },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            contactId: { type: 'string', format: 'uuid' },
            serviceId: { type: 'string', format: 'uuid' },
            practitionerId: { type: 'string', format: 'uuid' },
            startsAt: { type: 'string', format: 'date-time' },
            kind: { type: 'string', enum: ['request', 'hold'] },
          },
          required: ['contactId', 'serviceId', 'practitionerId', 'startsAt', 'kind'],
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const body = request.body as {
          contactId: string
          serviceId: string
          practitionerId: string
          startsAt: string
          kind: 'request' | 'hold'
          idempotencyKey?: string
        }
        const appointment = await createAppointment(options.tenantDatabase!, request.identity!.subject, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          idempotencyKey: typeof request.headers['idempotency-key'] === 'string'
            ? request.headers['idempotency-key']
            : undefined,
          ...body,
        })
        return reply.status(201).send(appointment)
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )

  for (const action of ['confirm', 'cancel', 'decline'] as const) {
    routes.post(
      `/v1/tenant/appointments/:appointmentId/${action}`,
      {
        preHandler: appointmentManageGuard,
        schema: {
          tags: ['tenant'],
          summary: `${action} an appointment`,
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { appointmentId: { type: 'string', format: 'uuid' } },
            required: ['appointmentId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { reasonCode: { type: 'string', pattern: '^[a-z0-9._:-]{1,64}$' } },
          },
          response: {
            200: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            410: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { appointmentId } = request.params as { appointmentId: string }
          const body = request.body as { reasonCode?: string } | undefined
          const appointment = await transitionAppointment(
            options.tenantDatabase!,
            request.identity!.subject,
            {
              tenantId: request.tenantId!,
              locationId: request.locationId,
              appointmentId,
              action,
              reasonCode: body?.reasonCode,
            },
          )
          return reply.status(200).send(appointment)
        } catch (error) {
          return schedulingErrorReply(error, reply)
        }
      },
    )
  }

  routes.post(
    '/v1/tenant/appointments/:appointmentId/reschedule',
    {
      preHandler: appointmentManageGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Reschedule a confirmed appointment to an available slot',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { appointmentId: { type: 'string', format: 'uuid' } },
          required: ['appointmentId'],
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { startsAt: { type: 'string', format: 'date-time' } },
          required: ['startsAt'],
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const { appointmentId } = request.params as { appointmentId: string }
        const { startsAt } = request.body as { startsAt: string }
        const appointment = await rescheduleAppointment(
          options.tenantDatabase!,
          request.identity!.subject,
          { tenantId: request.tenantId!, locationId: request.locationId, appointmentId, startsAt },
        )
        return reply.status(201).send(appointment)
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )

  routes.get(
    '/v1/tenant/appointments/:appointmentId/status-history',
    {
      preHandler: appointmentReadGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Read append-only appointment status history',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { appointmentId: { type: 'string', format: 'uuid' } },
          required: ['appointmentId'],
        },
        response: {
          200: { type: 'array', items: { type: 'object', additionalProperties: true } },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      try {
        const { appointmentId } = request.params as { appointmentId: string }
        return await listAppointmentStatusHistory(options.tenantDatabase!, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          appointmentId,
        })
      } catch (error) {
        return schedulingErrorReply(error, reply)
      }
    },
  )
}