import { createHash, randomUUID } from 'node:crypto'
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import { z } from 'zod'
import { IdempotencyKeySchema } from '@clinic-hub/shared'
import type { ApiDatabase, AppointmentStatus, AppointmentsTable } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { withTenantLocation } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()
const PractitionerIdSchema = z.string().uuid()
const ServiceIdSchema = z.string().uuid()
const AppointmentIdSchema = z.string().uuid()
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Invalid calendar date')
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const StartAtSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value))
const ReasonSchema = z.string().trim().regex(/^[a-z0-9._:-]{1,64}$/)

const ScheduleWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: TimeSchema,
  endTime: TimeSchema,
}).strict()

type ScheduleWindow = z.infer<typeof ScheduleWindowSchema>

export class SchedulingError extends Error {
  constructor(readonly code:
    | 'not_found'
    | 'invalid_window'
    | 'overlapping_windows'
    | 'slot_unavailable'
    | 'invalid_transition'
    | 'hold_expired'
    | 'windows_overlap'
    | 'invalid_range'
    | 'idempotency_conflict'
  ) {
    super(code)
    this.name = 'SchedulingError'
  }
}

function validateWindow(startTime: string, endTime: string): void {
  if (startTime >= endTime) throw new SchedulingError('invalid_window')
}

function assertNonOverlapping(windows: ScheduleWindow[]): void {
  const byDay = new Map<number, ScheduleWindow[]>()
  for (const window of windows) {
    const day = byDay.get(window.dayOfWeek) ?? []
    day.push(window)
    byDay.set(window.dayOfWeek, day)
  }
  for (const dayWindows of byDay.values()) {
    dayWindows.sort((left, right) => left.startTime.localeCompare(right.startTime))
    for (let index = 1; index < dayWindows.length; index += 1) {
      if (dayWindows[index].startTime < dayWindows[index - 1].endTime) {
        throw new SchedulingError('overlapping_windows')
      }
    }
  }
}

export async function replaceWeeklySchedule(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; locationId: string; practitionerId: string; windows: unknown },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  const windows = z.array(ScheduleWindowSchema).max(28).parse(input.windows)
  windows.forEach((window) => validateWindow(window.startTime, window.endTime))
  assertNonOverlapping(windows)

  try {
    await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      await requirePractitionerAssignment(transaction, tenantId, locationId, practitionerId)
      await transaction
        .deleteFrom('schedules')
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('practitioner_id', '=', practitionerId)
        .execute()
      if (windows.length > 0) {
        await transaction
          .insertInto('schedules')
          .values(windows.map((window) => ({
            id: randomUUID(),
            tenant_id: tenantId,
            location_id: locationId,
            practitioner_id: practitionerId,
            day_of_week: window.dayOfWeek,
            start_time: `${window.startTime}:00`,
            end_time: `${window.endTime}:00`,
          })))
          .execute()
      }
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'schedule.weekly_replaced',
        resourceType: 'practitioner_schedule',
        resourceId: practitionerId,
        metadata: { locationId, windowCount: windows.length },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23P01') {
      throw new SchedulingError('overlapping_windows')
    }
    throw error
  }

  return { tenantId, locationId, practitionerId, windows }
}

export async function setScheduleException(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    practitionerId: string
    date: string
    closed: boolean
    startTime?: string
    endTime?: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  const date = DateSchema.parse(input.date)
  const closed = z.boolean().parse(input.closed)
  const startTime = input.startTime === undefined ? null : TimeSchema.parse(input.startTime)
  const endTime = input.endTime === undefined ? null : TimeSchema.parse(input.endTime)
  if ((closed && (startTime !== null || endTime !== null))
    || (!closed && (startTime === null || endTime === null))) {
    throw new SchedulingError('invalid_window')
  }
  if (startTime !== null && endTime !== null) validateWindow(startTime, endTime)

  await withTenantLocation(database, tenantId, locationId, async (transaction) => {
    await requirePractitionerAssignment(transaction, tenantId, locationId, practitionerId)
    await transaction
      .deleteFrom('schedule_exceptions')
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('practitioner_id', '=', practitionerId)
      .where('exception_date', '=', date)
      .execute()
    await transaction
      .insertInto('schedule_exceptions')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        location_id: locationId,
        practitioner_id: practitionerId,
        exception_date: date,
        is_closed: closed,
        start_time: startTime === null ? null : `${startTime}:00`,
        end_time: endTime === null ? null : `${endTime}:00`,
      })
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'schedule.exception_set',
      resourceType: 'schedule_exception',
      metadata: { locationId, practitionerId, date, closed },
    })
  })

  return { tenantId, locationId, practitionerId, date, closed, startTime, endTime }
}

export async function listPractitionerSchedule(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; locationId: string; practitionerId: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  return withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const assignment = await transaction
      .selectFrom('practitioner_locations')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('practitioner_id', '=', practitionerId)
      .executeTakeFirst()
    if (!assignment) throw new SchedulingError('not_found')

    const [windows, exceptions] = await Promise.all([
      transaction
        .selectFrom('schedules')
        .select(['id', 'day_of_week as dayOfWeek', 'start_time as startTime', 'end_time as endTime'])
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('practitioner_id', '=', practitionerId)
        .orderBy('day_of_week', 'asc')
        .orderBy('start_time', 'asc')
        .execute(),
      transaction
        .selectFrom('schedule_exceptions')
        .select([
          'id',
          'exception_date as date',
          'is_closed as closed',
          'start_time as startTime',
          'end_time as endTime',
        ])
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('practitioner_id', '=', practitionerId)
        .orderBy('exception_date', 'asc')
        .execute(),
    ])
    return { practitionerId, locationId, windows, exceptions }
  })
}

export async function listAvailableSlots(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; locationId: string; serviceId: string; date: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const serviceId = ServiceIdSchema.parse(input.serviceId)
  const date = DateSchema.parse(input.date)
  return withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const result = await sql<{
      practitioner_id: string
      starts_at: Date
      ends_at: Date
    }>`
      SELECT * FROM clinic_hub.available_appointment_slots(
        ${tenantId}::uuid,
        ${locationId}::uuid,
        ${serviceId}::uuid,
        ${date}::date
      )
    `.execute(transaction)
    return result.rows.map((slot) => ({
      practitionerId: slot.practitioner_id,
      startsAt: new Date(slot.starts_at).toISOString(),
      endsAt: new Date(slot.ends_at).toISOString(),
    }))
  })
}

async function requirePractitionerAssignment(
  transaction: Transaction<ApiDatabase>,
  tenantId: string,
  locationId: string,
  practitionerId: string,
) {
  const assignment = await transaction
    .selectFrom('practitioner_locations')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('location_id', '=', locationId)
    .where('practitioner_id', '=', practitionerId)
    .executeTakeFirst()
  if (!assignment) throw new SchedulingError('not_found')
}

async function findRequestedSlot(
  transaction: Transaction<ApiDatabase>,
  input: {
    tenantId: string
    locationId: string
    serviceId: string
    practitionerId: string
    startsAt: Date
  },
) {
  const result = await sql<{
    practitioner_id: string
    starts_at: Date
    ends_at: Date
  }>`
    SELECT * FROM clinic_hub.available_appointment_slots(
      ${input.tenantId}::uuid,
      ${input.locationId}::uuid,
      ${input.serviceId}::uuid,
      (
        SELECT (${input.startsAt.toISOString()}::timestamptz AT TIME ZONE timezone)::date
        FROM clinic_hub.locations
        WHERE tenant_id = ${input.tenantId}::uuid AND id = ${input.locationId}::uuid
      )
    )
    WHERE practitioner_id = ${input.practitionerId}::uuid
      AND starts_at = ${input.startsAt.toISOString()}::timestamptz
  `.execute(transaction)
  const slot = result.rows[0]
  if (!slot) throw new SchedulingError('slot_unavailable')
  return { startsAt: slot.starts_at, endsAt: slot.ends_at }
}

async function appendAppointmentStatus(
  transaction: Transaction<ApiDatabase>,
  input: {
    tenantId: string
    locationId: string
    appointmentId: string
    previousStatus: AppointmentStatus | null
    newStatus: AppointmentStatus
    actorSubject: string
    reasonCode?: string
  },
) {
  await transaction
    .insertInto('appointment_status_history')
    .values({
      id: randomUUID(),
      tenant_id: input.tenantId,
      location_id: input.locationId,
      appointment_id: input.appointmentId,
      previous_status: input.previousStatus,
      new_status: input.newStatus,
      actor_subject: input.actorSubject,
      reason_code: input.reasonCode ?? null,
    })
    .execute()
}

async function expirePractitionerHolds(
  transaction: Transaction<ApiDatabase>,
  input: { tenantId: string; locationId: string; practitionerId: string; actorSubject: string },
) {
  const expiredHolds = await transaction
    .updateTable('appointments')
    .set({ status: 'expired', hold_expires_at: null, updated_at: new Date().toISOString() })
    .where('tenant_id', '=', input.tenantId)
    .where('location_id', '=', input.locationId)
    .where('practitioner_id', '=', input.practitionerId)
    .where('status', '=', 'held')
    .where('hold_expires_at', '<=', sql<Date>`statement_timestamp()`)
    .returning(['id'])
    .execute()
  for (const expired of expiredHolds) {
    await appendAppointmentStatus(transaction, {
      tenantId: input.tenantId,
      locationId: input.locationId,
      appointmentId: expired.id,
      previousStatus: 'held',
      newStatus: 'expired',
      actorSubject: input.actorSubject,
      reasonCode: 'hold.expired',
    })
    await appendAuditEvent(transaction, {
      tenantId: input.tenantId,
      actorSubject: input.actorSubject,
      action: 'appointment.expired',
      resourceType: 'appointment',
      resourceId: expired.id,
      metadata: { locationId: input.locationId, reasonCode: 'hold.expired' },
    })
  }
  return expiredHolds.map((appointment) => appointment.id)
}

export async function createAppointment(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    contactId: string
    serviceId: string
    practitionerId: string
    startsAt: string
    kind: 'request' | 'hold'
    idempotencyKey?: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId).toLowerCase()
  const locationId = LocationIdSchema.parse(input.locationId).toLowerCase()
  const contactId = z.string().uuid().parse(input.contactId).toLowerCase()
  const serviceId = ServiceIdSchema.parse(input.serviceId).toLowerCase()
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId).toLowerCase()
  const startsAt = StartAtSchema.parse(input.startsAt)
  const kind = z.enum(['request', 'hold']).parse(input.kind)
  const idempotencyKey = input.idempotencyKey === undefined
    ? undefined
    : IdempotencyKeySchema.parse(input.idempotencyKey)
  const requestHash = createHash('sha256')
    .update(JSON.stringify({
      tenantId,
      locationId,
      contactId,
      serviceId,
      practitionerId,
      startsAt: startsAt.toISOString(),
      kind,
    }))
    .digest('hex')
  const id = randomUUID()

  try {
    return await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      if (idempotencyKey) {
        const lockKey = `${tenantId}:${locationId}:${idempotencyKey}`
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(transaction)
        await transaction
          .deleteFrom('appointment_idempotency_keys')
          .where('tenant_id', '=', tenantId)
          .where('location_id', '=', locationId)
          .where('expires_at', '<=', sql<Date>`statement_timestamp()`)
          .execute()
        const priorRequest = await transaction
          .selectFrom('appointment_idempotency_keys')
          .select(['request_hash', 'response_body'])
          .where('tenant_id', '=', tenantId)
          .where('location_id', '=', locationId)
          .where('idempotency_key', '=', idempotencyKey)
          .executeTakeFirst()
        if (priorRequest) {
          if (priorRequest.request_hash !== requestHash) {
            throw new SchedulingError('idempotency_conflict')
          }
          return priorRequest.response_body as Selectable<AppointmentsTable>
        }
      }

      await expirePractitionerHolds(transaction, { tenantId, locationId, practitionerId, actorSubject })
      const slot = await findRequestedSlot(transaction, {
        tenantId,
        locationId,
        serviceId,
        practitionerId,
        startsAt,
      })
      const status: AppointmentStatus = kind === 'hold' ? 'held' : 'requested'
      const holdExpiry = kind === 'hold'
        ? await sql<{ expires_at: Date }>`
            SELECT statement_timestamp() + interval '5 minutes' AS expires_at
          `.execute(transaction)
        : null
      const expiresAt = holdExpiry?.rows[0].expires_at.toISOString() ?? null
      const appointment = await transaction
        .insertInto('appointments')
        .values({
          id,
          tenant_id: tenantId,
          location_id: locationId,
          contact_id: contactId,
          service_id: serviceId,
          practitioner_id: practitionerId,
          starts_at: slot.startsAt.toISOString(),
          ends_at: slot.endsAt.toISOString(),
          status,
          hold_expires_at: expiresAt,
          rescheduled_from_id: null,
          created_by_subject: actorSubject,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      await appendAppointmentStatus(transaction, {
        tenantId,
        locationId,
        appointmentId: id,
        previousStatus: null,
        newStatus: status,
        actorSubject,
      })
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: kind === 'hold' ? 'appointment.held' : 'appointment.requested',
        resourceType: 'appointment',
        resourceId: id,
        metadata: { locationId, serviceId, practitionerId, startsAt: slot.startsAt.toISOString() },
      })
      if (idempotencyKey) {
        await sql`
          INSERT INTO clinic_hub.appointment_idempotency_keys (
            id, tenant_id, location_id, idempotency_key, request_hash,
            appointment_id, response_status, response_body, expires_at
          ) VALUES (
            ${randomUUID()}::uuid,
            ${tenantId}::uuid,
            ${locationId}::uuid,
            ${idempotencyKey},
            ${requestHash},
            ${id}::uuid,
            201,
            ${JSON.stringify(appointment)}::jsonb,
            now() + interval '24 hours'
          )
        `.execute(transaction)
      }
      return appointment
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505' && idempotencyKey) {
      throw new SchedulingError('idempotency_conflict')
    }
    if (['23P01', '23514'].includes((error as { code?: string }).code ?? '')) {
      throw new SchedulingError('slot_unavailable')
    }
    throw error
  }
}

export async function transitionAppointment(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    appointmentId: string
    action: 'confirm' | 'cancel' | 'decline'
    reasonCode?: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const appointmentId = AppointmentIdSchema.parse(input.appointmentId)
  const action = z.enum(['confirm', 'cancel', 'decline']).parse(input.action)
  const reasonCode = input.reasonCode === undefined ? undefined : ReasonSchema.parse(input.reasonCode)

  const result = await withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const appointment = await transaction
      .selectFrom('appointments')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('id', '=', appointmentId)
      .forUpdate()
      .executeTakeFirst()
    if (!appointment) throw new SchedulingError('not_found')

    if (action === 'confirm') {
      const expiredIds = await expirePractitionerHolds(transaction, {
        tenantId,
        locationId,
        practitionerId: appointment.practitioner_id,
        actorSubject,
      })
      if (expiredIds.includes(appointmentId)) return { expired: true as const }
    }

    let nextStatus: AppointmentStatus
    if (action === 'confirm' && (appointment.status === 'requested' || appointment.status === 'held')) {
      if (appointment.status === 'requested') {
        await findRequestedSlot(transaction, {
          tenantId,
          locationId,
          serviceId: appointment.service_id,
          practitionerId: appointment.practitioner_id,
          startsAt: appointment.starts_at,
        })
      }
      nextStatus = 'confirmed'
    } else if (action === 'cancel'
      && ['requested', 'held', 'confirmed'].includes(appointment.status)) {
      nextStatus = 'cancelled'
    } else if (action === 'decline' && appointment.status === 'requested') {
      nextStatus = 'declined'
    } else {
      throw new SchedulingError('invalid_transition')
    }

    const updated = await transaction
      .updateTable('appointments')
      .set({
        status: nextStatus,
        hold_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('id', '=', appointmentId)
      .returningAll()
      .executeTakeFirstOrThrow()
    await appendAppointmentStatus(transaction, {
      tenantId,
      locationId,
      appointmentId,
      previousStatus: appointment.status,
      newStatus: nextStatus,
      actorSubject,
      reasonCode,
    })
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: `appointment.${nextStatus}`,
      resourceType: 'appointment',
      resourceId: appointmentId,
      metadata: { locationId, previousStatus: appointment.status, reasonCode },
    })
    return { expired: false as const, appointment: updated }
  }).catch(async (error) => {
    if ((error as { code?: string }).code === 'P0001' && action === 'confirm') {
      await withTenantLocation(database, tenantId, locationId, async (transaction) => {
        const appointment = await transaction
          .selectFrom('appointments')
          .select('practitioner_id')
          .where('tenant_id', '=', tenantId)
          .where('location_id', '=', locationId)
          .where('id', '=', appointmentId)
          .executeTakeFirst()
        if (appointment) {
          await expirePractitionerHolds(transaction, {
            tenantId,
            locationId,
            practitionerId: appointment.practitioner_id,
            actorSubject,
          })
        }
      })
      throw new SchedulingError('hold_expired')
    }
    if (['23P01', '23514'].includes((error as { code?: string }).code ?? '')) {
      throw new SchedulingError('slot_unavailable')
    }
    throw error
  })

  if (result.expired) throw new SchedulingError('hold_expired')
  return result.appointment
}

export async function rescheduleAppointment(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; locationId: string; appointmentId: string; startsAt: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const appointmentId = AppointmentIdSchema.parse(input.appointmentId)
  const startsAt = StartAtSchema.parse(input.startsAt)

  try {
    return await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      const previous = await transaction
        .selectFrom('appointments')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('id', '=', appointmentId)
        .forUpdate()
        .executeTakeFirst()
      if (!previous) throw new SchedulingError('not_found')
      if (previous.status !== 'confirmed') throw new SchedulingError('invalid_transition')

      await expirePractitionerHolds(transaction, {
        tenantId,
        locationId,
        practitionerId: previous.practitioner_id,
        actorSubject,
      })
      const slot = await findRequestedSlot(transaction, {
        tenantId,
        locationId,
        serviceId: previous.service_id,
        practitionerId: previous.practitioner_id,
        startsAt,
      })
      const now = new Date().toISOString()
      await transaction
        .updateTable('appointments')
        .set({ status: 'rescheduled', updated_at: now })
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('id', '=', appointmentId)
        .execute()
      await appendAppointmentStatus(transaction, {
        tenantId,
        locationId,
        appointmentId,
        previousStatus: 'confirmed',
        newStatus: 'rescheduled',
        actorSubject,
      })

      const newId = randomUUID()
      const appointment = await transaction
        .insertInto('appointments')
        .values({
          id: newId,
          tenant_id: tenantId,
          location_id: locationId,
          contact_id: previous.contact_id,
          service_id: previous.service_id,
          practitioner_id: previous.practitioner_id,
          starts_at: slot.startsAt.toISOString(),
          ends_at: slot.endsAt.toISOString(),
          status: 'confirmed',
          hold_expires_at: null,
          rescheduled_from_id: appointmentId,
          created_by_subject: actorSubject,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      await appendAppointmentStatus(transaction, {
        tenantId,
        locationId,
        appointmentId: newId,
        previousStatus: null,
        newStatus: 'confirmed',
        actorSubject,
        reasonCode: 'appointment.rescheduled_from',
      })
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'appointment.rescheduled',
        resourceType: 'appointment',
        resourceId: newId,
        metadata: { locationId, previousAppointmentId: appointmentId, startsAt: slot.startsAt.toISOString() },
      })
      return appointment
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23P01') {
      throw new SchedulingError('slot_unavailable')
    }
    throw error
  }
}

export async function listAppointments(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; locationId: string; from: string; to: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const from = StartAtSchema.parse(input.from)
  const to = StartAtSchema.parse(input.to)
  if (to <= from || to.getTime() - from.getTime() > 31 * 24 * 60 * 60 * 1000) {
    throw new SchedulingError('invalid_range')
  }
  return withTenantLocation(database, tenantId, locationId, (transaction) =>
    transaction
      .selectFrom('appointments')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('starts_at', '>=', from)
      .where('starts_at', '<', to)
      .orderBy('starts_at', 'asc')
      .execute(),
  )
}

export async function listAppointmentStatusHistory(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; locationId: string; appointmentId: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const appointmentId = AppointmentIdSchema.parse(input.appointmentId)
  return withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const appointment = await transaction
      .selectFrom('appointments')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('id', '=', appointmentId)
      .executeTakeFirst()
    if (!appointment) throw new SchedulingError('not_found')
    return transaction
      .selectFrom('appointment_status_history')
      .select([
        'id',
        'previous_status as previousStatus',
        'new_status as newStatus',
        'actor_subject as actorSubject',
        'reason_code as reasonCode',
        'occurred_at as occurredAt',
      ])
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('appointment_id', '=', appointmentId)
      .orderBy('occurred_at', 'asc')
      .execute()
  })
}
