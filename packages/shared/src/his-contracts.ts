import { z } from 'zod'

export const API_CONTRACT_VERSION = '1.0.0'
export const HIS_EVENT_VERSION = '1'
export const HIS_REQUEST_VERSION = '1'

export const IdempotencyKeySchema = z.string().trim().min(8).max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)

export const HISAppointmentRequestSchema = z.object({
  contractVersion: z.literal(HIS_REQUEST_VERSION),
  externalPatientRef: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  serviceId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
}).strict()

export const HISAppointmentEventSchema = z.object({
  contractVersion: z.literal(HIS_EVENT_VERSION),
  eventId: z.string().uuid(),
  eventType: z.enum([
    'appointment.requested',
    'appointment.confirmed',
    'appointment.cancelled',
    'appointment.declined',
    'appointment.rescheduled',
  ]),
  occurredAt: z.string().datetime({ offset: true }),
  tenantId: z.string().uuid(),
  locationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  serviceId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: z.enum(['requested', 'confirmed', 'cancelled', 'declined', 'rescheduled']),
  externalPatientRef: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/).nullable(),
}).strict()

export type HISAppointmentRequest = z.infer<typeof HISAppointmentRequestSchema>
export type HISAppointmentEvent = z.infer<typeof HISAppointmentEventSchema>