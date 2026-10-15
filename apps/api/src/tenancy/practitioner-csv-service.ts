import { randomUUID } from 'node:crypto'
import Papa from 'papaparse'
import { z } from 'zod'
import { sql, type Kysely } from 'kysely'
import {
  PRACTITIONER_CSV_HEADERS,
  PRACTITIONER_CSV_MAX_ROWS,
  PractitionerCsvImportResultSchema,
  PractitionerCsvPreviewSchema,
  PractitionerCsvRowSchema,
  type PractitionerCsvPreview,
  type PractitionerCsvPreviewRow,
  type PractitionerCsvRow,
} from '@clinic-hub/shared'
import type { ApiDatabase } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { assertEntitlement } from '../billing/entitlement-service.js'
import { withTenantLocation } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()
const CsvSchema = z.string().min(1).max(700_000)

type RawRow = Record<string, string | undefined>

export class PractitionerCsvError extends Error {
  constructor(
    readonly code: 'invalid_csv' | 'registration_exists',
    readonly preview: PractitionerCsvPreview,
  ) {
    super(code)
    this.name = 'PractitionerCsvError'
  }
}

function registrationKey(authority: string, number: string): string {
  return `${authority.toUpperCase()}\u0000${number.toLowerCase()}`
}

export function previewPractitionerCsv(
  csvInput: string,
  existingRegistrationKeys: ReadonlySet<string> = new Set(),
): PractitionerCsvPreview {
  const csv = CsvSchema.parse(csvInput)
  if (new TextEncoder().encode(csv).length > 700_000) {
    throw new z.ZodError([])
  }
  let fields: string[] = []
  let totalRows = 0
  const rawRows: RawRow[] = []
  const parseErrors: string[] = []
  Papa.parse<RawRow>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
    step: (result) => {
      if (fields.length === 0) fields = result.meta.fields ?? []
      parseErrors.push(...result.errors.map(
        (error) => `CSV row ${(error.row ?? 0) + 2}: ${error.message}`,
      ))
      if (rawRows.length < PRACTITIONER_CSV_MAX_ROWS) rawRows.push(result.data)
      totalRows += 1
    },
    complete: (result) => {
      if (fields.length === 0) fields = result.meta.fields ?? []
      if (parseErrors.length === 0) {
        parseErrors.push(...result.errors.map(
          (error) => `CSV row ${(error.row ?? 0) + 2}: ${error.message}`,
        ))
      }
    },
  })
  const fileErrors = parseErrors
  if (totalRows > PRACTITIONER_CSV_MAX_ROWS) {
    fileErrors.push(`CSV exceeds the ${PRACTITIONER_CSV_MAX_ROWS}-row import limit`)
  }
  const duplicateHeaders = fields.filter((field, index) => fields.indexOf(field) !== index)
  if (duplicateHeaders.length > 0) {
    fileErrors.push(`Duplicate columns: ${[...new Set(duplicateHeaders)].join(', ')}`)
  }
  const missingHeaders = PRACTITIONER_CSV_HEADERS.filter((header) => !fields.includes(header))
  const unexpectedHeaders = fields.filter((field) =>
    !PRACTITIONER_CSV_HEADERS.includes(field as typeof PRACTITIONER_CSV_HEADERS[number]),
  )
  if (missingHeaders.length > 0) fileErrors.push(`Missing columns: ${missingHeaders.join(', ')}`)
  if (unexpectedHeaders.length > 0) fileErrors.push(`Unexpected columns: ${unexpectedHeaders.join(', ')}`)
  if (totalRows === 0) fileErrors.push('CSV contains no practitioner rows')

  const seenRegistrations = new Set<string>()
  const rows: PractitionerCsvPreviewRow[] = rawRows.map((rawRow, index) => {
    const errors: string[] = []
    const parsedRow = PractitionerCsvRowSchema.safeParse({
      display_name: rawRow.display_name ?? '',
      registration_authority: rawRow.registration_authority ?? '',
      registration_number: rawRow.registration_number ?? '',
    })
    let row: PractitionerCsvRow | undefined
    if (!parsedRow.success) {
      for (const issue of parsedRow.error.issues) {
        errors.push(`${String(issue.path[0] ?? 'row')}: ${issue.message}`)
      }
    } else {
      row = parsedRow.data
      const key = registrationKey(row.registration_authority, row.registration_number)
      if (existingRegistrationKeys.has(key)) errors.push('Registration already exists in this tenant')
      else if (seenRegistrations.has(key)) errors.push('Registration is duplicated in this file')
      else seenRegistrations.add(key)
    }

    return {
      rowNumber: index + 2,
      displayName: row?.display_name ?? (rawRow.display_name ?? '').trim(),
      registrationAuthority: row?.registration_authority ?? (rawRow.registration_authority ?? '').trim(),
      registrationNumber: row?.registration_number ?? (rawRow.registration_number ?? '').trim(),
      errors,
    }
    })

  const validCount = rows.filter((row) => row.errors.length === 0).length
  return PractitionerCsvPreviewSchema.parse({
    fileErrors,
    rows,
    totalRows,
    omittedRows: totalRows - rows.length,
    validCount: fileErrors.length === 0 ? validCount : 0,
    invalidCount: fileErrors.length > 0 ? totalRows : rows.length - validCount,
  })
}

export async function previewPractitionerCsvAtLocation(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; locationId: string; csv: string },
): Promise<PractitionerCsvPreview> {
  const tenantId = z.string().uuid().parse(input.tenantId)
  const locationId = z.string().uuid().parse(input.locationId)
  const preview = previewPractitionerCsv(input.csv)
  const candidateRows = preview.rows.filter((row) => row.errors.length === 0)
  if (candidateRows.length === 0) return preview

  const existing = await withTenantLocation(database, tenantId, locationId, async (transaction) =>
    sql<{ line_number: string }>`
      SELECT line_number
      FROM clinic_hub.find_existing_practitioner_registration_rows(
        ${tenantId}::uuid,
        ${candidateRows.map((row) => row.registrationAuthority)}::text[],
        ${candidateRows.map((row) => row.registrationNumber)}::text[]
      )
    `.execute(transaction),
  )
  const existingLineNumbers = new Set(existing.rows.map((row) => Number(row.line_number)))
  if (existingLineNumbers.size === 0) return preview

  const duplicateRowNumbers = new Set(
    [...existingLineNumbers].map((lineNumber) => candidateRows[lineNumber - 1].rowNumber),
  )
  const rows = preview.rows.map((row) => duplicateRowNumbers.has(row.rowNumber)
    ? { ...row, errors: [...row.errors, 'Registration already exists in this tenant'] }
    : row)
  const validCount = rows.filter((row) => row.errors.length === 0).length
  return PractitionerCsvPreviewSchema.parse({
    ...preview,
    rows,
    validCount: preview.fileErrors.length === 0 ? validCount : 0,
    invalidCount: preview.fileErrors.length > 0 ? preview.totalRows : rows.length - validCount,
  })
}

export function createPractitionerCsvTemplate(): string {
  return Papa.unparse([{
    display_name: 'Dr. Example',
    registration_authority: 'PMDC',
    registration_number: 'PMDC-123456',
  }], { columns: [...PRACTITIONER_CSV_HEADERS] })
}

function escapeSpreadsheetFormula(value: string): string {
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value
}

export async function exportPractitionersCsv(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; locationId: string },
): Promise<string> {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const practitioners = await withTenantLocation(database, tenantId, locationId, (transaction) =>
    transaction
      .selectFrom('practitioner_locations as assignment')
      .innerJoin('practitioners as practitioner', (join) =>
        join
          .onRef('practitioner.tenant_id', '=', 'assignment.tenant_id')
          .onRef('practitioner.id', '=', 'assignment.practitioner_id'),
      )
      .select([
        'practitioner.display_name as displayName',
        'practitioner.registration_authority as registrationAuthority',
        'practitioner.registration_number as registrationNumber',
      ])
      .where('assignment.tenant_id', '=', tenantId)
      .where('assignment.location_id', '=', locationId)
      .orderBy('practitioner.display_name', 'asc')
      .execute(),
  )

  return Papa.unparse(practitioners.map((practitioner) => ({
    display_name: escapeSpreadsheetFormula(practitioner.displayName),
    registration_authority: escapeSpreadsheetFormula(practitioner.registrationAuthority),
    registration_number: escapeSpreadsheetFormula(practitioner.registrationNumber),
  })), { columns: [...PRACTITIONER_CSV_HEADERS] })
}

export async function importPractitionersCsv(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; locationId: string; csv: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const preview = await previewPractitionerCsvAtLocation(database, {
    tenantId,
    locationId,
    csv: input.csv,
  })
  if (preview.fileErrors.length > 0 || preview.validCount !== preview.rows.length) {
    throw new PractitionerCsvError('invalid_csv', preview)
  }

  const rows = preview.rows.map((row) => PractitionerCsvRowSchema.parse({
    display_name: row.displayName,
    registration_authority: row.registrationAuthority,
    registration_number: row.registrationNumber,
  }))
  const imported = rows.map((row) => ({
    practitionerId: randomUUID(),
    assignmentId: randomUUID(),
    row,
  }))

  try {
    await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      await assertEntitlement(transaction, {
        tenantId,
        key: 'practitioners.max',
        delta: imported.length,
      })
      await transaction
        .insertInto('practitioner_locations')
        .values(imported.map(({ practitionerId, assignmentId }) => ({
          id: assignmentId,
          tenant_id: tenantId,
          practitioner_id: practitionerId,
          location_id: locationId,
          status: 'active' as const,
          verification_status: 'unverified' as const,
          verified_at: null,
          verified_by_subject: null,
          publication_state: 'draft' as const,
        })))
        .execute()
      await transaction
        .insertInto('practitioners')
        .values(imported.map(({ practitionerId, row }) => ({
          id: practitionerId,
          tenant_id: tenantId,
          display_name: row.display_name,
          registration_authority: row.registration_authority,
          registration_number: row.registration_number,
        })))
        .execute()

      for (let index = 0; index < imported.length; index += 1) {
        const { practitionerId, assignmentId } = imported[index]
        await appendAuditEvent(transaction, {
          tenantId,
          actorSubject,
          action: 'practitioner.imported',
          resourceType: 'practitioner',
          resourceId: practitionerId,
          metadata: { locationId, assignmentId, csvRow: index + 2 },
        })
      }
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      const refreshedPreview = await previewPractitionerCsvAtLocation(database, {
        tenantId,
        locationId,
        csv: input.csv,
      })
      throw new PractitionerCsvError('registration_exists', refreshedPreview)
    }
    throw error
  }

  return PractitionerCsvImportResultSchema.parse({
    importedCount: imported.length,
    practitioners: imported.map(({ practitionerId, assignmentId, row }) => ({
      id: practitionerId,
      assignmentId,
      displayName: row.display_name,
      registrationAuthority: row.registration_authority,
      registrationNumber: row.registration_number,
      verificationStatus: 'unverified' as const,
      publicationState: 'draft' as const,
    })),
  })
}