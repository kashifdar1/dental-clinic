import { z } from 'zod'

export const PRACTITIONER_CSV_HEADERS = [
  'display_name',
  'registration_authority',
  'registration_number',
] as const
export const PRACTITIONER_CSV_MAX_ROWS = 500

export const PractitionerCsvRowSchema = z.object({
  display_name: z.string().trim().min(1).max(160),
  registration_authority: z.string().trim().min(1).max(80).transform((value) => value.toUpperCase()),
  registration_number: z.string().trim().min(1).max(80),
}).strict()

export type PractitionerCsvRow = z.infer<typeof PractitionerCsvRowSchema>

export const PractitionerCsvRequestSchema = z.object({
  csv: z.string().min(1).max(700_000),
}).strict()

export const PractitionerCsvPreviewRowSchema = z.object({
  rowNumber: z.number().int().min(2),
  displayName: z.string(),
  registrationAuthority: z.string(),
  registrationNumber: z.string(),
  errors: z.array(z.string()),
}).strict()

export const PractitionerCsvPreviewSchema = z.object({
  fileErrors: z.array(z.string()),
  rows: z.array(PractitionerCsvPreviewRowSchema).max(PRACTITIONER_CSV_MAX_ROWS),
  totalRows: z.number().int().min(0),
  omittedRows: z.number().int().min(0),
  validCount: z.number().int().min(0),
  invalidCount: z.number().int().min(0),
}).strict()

export type PractitionerCsvPreviewRow = z.infer<typeof PractitionerCsvPreviewRowSchema>
export type PractitionerCsvPreview = z.infer<typeof PractitionerCsvPreviewSchema>

export const PractitionerCsvImportResultSchema = z.object({
  importedCount: z.number().int().min(0).max(PRACTITIONER_CSV_MAX_ROWS),
  practitioners: z.array(z.object({
    id: z.string().uuid(),
    assignmentId: z.string().uuid(),
    displayName: z.string(),
    registrationAuthority: z.string(),
    registrationNumber: z.string(),
    verificationStatus: z.literal('unverified'),
    publicationState: z.literal('draft'),
  }).strict()).max(PRACTITIONER_CSV_MAX_ROWS),
}).strict()

export const PractitionerCsvImportErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.literal('invalid_csv_request') }).strict(),
  z.object({ error: z.literal('location_context_required') }).strict(),
  z.object({
    error: z.enum(['invalid_csv', 'registration_exists']),
    preview: PractitionerCsvPreviewSchema,
  }).strict(),
])

export type PractitionerCsvImportResult = z.infer<typeof PractitionerCsvImportResultSchema>
export type PractitionerCsvImportError = z.infer<typeof PractitionerCsvImportErrorSchema>