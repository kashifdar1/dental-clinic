import { z } from 'zod'

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'ready', 'not_ready']),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>
