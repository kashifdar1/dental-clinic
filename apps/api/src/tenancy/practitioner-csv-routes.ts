import type { FastifyInstance, preHandlerHookHandler } from 'fastify'
import type { Kysely } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'
import { EntitlementError } from '../billing/entitlement-service.js'
import { requireTenantPermission } from '../access/tenant-permissions.js'
import {
  PractitionerCsvError,
  createPractitionerCsvTemplate,
  exportPractitionersCsv,
  importPractitionersCsv,
  previewPractitionerCsvAtLocation,
} from './practitioner-csv-service.js'
import { PractitionerCsvRequestSchema } from '@clinic-hub/shared'
import { z } from 'zod'

const csvPreviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fileErrors: { type: 'array', items: { type: 'string' } },
    rows: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rowNumber: { type: 'integer', minimum: 2 },
          displayName: { type: 'string' },
          registrationAuthority: { type: 'string' },
          registrationNumber: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } },
        },
        required: ['rowNumber', 'displayName', 'registrationAuthority', 'registrationNumber', 'errors'],
      },
    },
    totalRows: { type: 'integer', minimum: 0 },
    omittedRows: { type: 'integer', minimum: 0 },
    validCount: { type: 'integer', minimum: 0 },
    invalidCount: { type: 'integer', minimum: 0 },
  },
  required: ['fileErrors', 'rows', 'totalRows', 'omittedRows', 'validCount', 'invalidCount'],
} as const

const csvImportResultResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    importedCount: { type: 'integer', minimum: 0, maximum: 500 },
    practitioners: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', format: 'uuid' },
          assignmentId: { type: 'string', format: 'uuid' },
          displayName: { type: 'string' },
          registrationAuthority: { type: 'string' },
          registrationNumber: { type: 'string' },
          verificationStatus: { type: 'string', enum: ['unverified'] },
          publicationState: { type: 'string', enum: ['draft'] },
        },
        required: [
          'id', 'assignmentId', 'displayName', 'registrationAuthority',
          'registrationNumber', 'verificationStatus', 'publicationState',
        ],
      },
    },
  },
  required: ['importedCount', 'practitioners'],
} as const

const csvImportErrorResponseSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        error: { type: 'string', enum: ['invalid_csv_request', 'location_context_required', 'subscription_required', 'entitlement_exceeded', 'expansion_blocked', 'usage_required'] },
      },
      required: ['error'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        error: { type: 'string', enum: ['invalid_csv', 'registration_exists'] },
        preview: csvPreviewResponseSchema,
      },
      required: ['error', 'preview'],
    },
  ],
} as const

interface PractitionerCsvRouteOptions {
  tenantDatabase?: Kysely<ApiDatabase>
  tenantRealmGuard: preHandlerHookHandler
  tenantUnavailable: preHandlerHookHandler
}

export function registerPractitionerCsvRoutes(
  routes: FastifyInstance,
  options: PractitionerCsvRouteOptions,
): void {
  const managerGuard = options.tenantDatabase
    ? [options.tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'practitioner.manage')]
    : options.tenantUnavailable

  routes.get(
    '/v1/tenant/practitioners/import-template.csv',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Download the practitioner CSV import template',
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: 'string' },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      return reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="practitioners-template.csv"')
        .send(createPractitionerCsvTemplate())
    },
  )

  routes.get(
    '/v1/tenant/practitioners/export.csv',
    {
      preHandler: managerGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Export practitioners assigned to the active location',
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: 'string' },
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      const csv = await exportPractitionersCsv(options.tenantDatabase!, {
        tenantId: request.tenantId!,
        locationId: request.locationId,
      })
      return reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="practitioners.csv"')
        .send(csv)
    },
  )

  routes.post(
    '/v1/tenant/practitioners/import-preview',
    {
      attachValidation: true,
      preHandler: managerGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Validate practitioner CSV rows without importing them',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { csv: { type: 'string', minLength: 1, maxLength: 700000 } },
          required: ['csv'],
        },
        response: {
          200: csvPreviewResponseSchema,
          400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      if (request.validationError) return reply.status(400).send({ error: 'invalid_csv_request' })
      try {
        const body = PractitionerCsvRequestSchema.parse(request.body)
        return await previewPractitionerCsvAtLocation(options.tenantDatabase!, {
          tenantId: request.tenantId!,
          locationId: request.locationId,
          csv: body.csv,
        })
      } catch (error) {
        if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_csv_request' })
        throw error
      }
    },
  )

  routes.post(
    '/v1/tenant/practitioners/import',
    {
      attachValidation: true,
      preHandler: managerGuard,
      schema: {
        tags: ['tenant'],
        summary: 'Atomically import valid practitioners at the active location',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { csv: { type: 'string', minLength: 1, maxLength: 700000 } },
          required: ['csv'],
        },
        response: {
          201: csvImportResultResponseSchema,
          400: csvImportErrorResponseSchema,
          409: csvImportErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
      if (request.validationError) return reply.status(400).send({ error: 'invalid_csv_request' })
      try {
        const body = PractitionerCsvRequestSchema.parse(request.body)
        const imported = await importPractitionersCsv(
          options.tenantDatabase!,
          request.identity!.subject,
          { tenantId: request.tenantId!, locationId: request.locationId, csv: body.csv },
        )
        return reply.status(201).send(imported)
      } catch (error) {
        if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_csv_request' })
        if (error instanceof EntitlementError) return reply.status(409).send({ error: error.code })
        if (error instanceof PractitionerCsvError) {
          return reply
            .status(error.code === 'registration_exists' ? 409 : 400)
            .send({ error: error.code, preview: error.preview })
        }
        throw error
      }
    },
  )
}