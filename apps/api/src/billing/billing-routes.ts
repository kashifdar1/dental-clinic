import { CreatePlanSchema, EntitlementKeySchema, PlanEntitlementInputSchema } from '@clinic-hub/shared'
import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from 'fastify'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import { requireTenantPermission } from '../access/tenant-permissions.js'
import type { ApiDatabase } from '../db/schema.js'
import {
  BillingError,
  addEntitlementOverride,
  addSubscriptionAddon,
  changePlan,
  createAddon,
  createManualBillingProvider,
  createPlan,
  publishPlanVersion,
  readTenantBilling,
  readUsage,
  setSubscriptionStatus,
} from './billing-service.js'
import { EntitlementError } from './entitlement-service.js'

interface BillingRouteOptions {
  tenantDatabase?: Kysely<ApiDatabase>
  platformDatabase?: Kysely<ApiDatabase>
  tenantRealmGuard: preHandlerHookHandler
  tenantUnavailable: preHandlerHookHandler
  platformStaffGuard: preHandlerHookHandler[]
  platformDatabaseUnavailable: preHandlerHookHandler
}

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
  required: ['error'],
} as const

function sendBillingError(error: unknown, reply: FastifyReply) {
  if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_billing_request' })
  if (error instanceof EntitlementError) return reply.status(409).send({ error: error.code })
  if (!(error instanceof BillingError)) throw error
  const status = error.code === 'not_found' ? 404 : error.code === 'invalid' ? 400 : 409
  return reply.status(status).send({ error: error.code })
}

export function registerBillingRoutes(routes: FastifyInstance, options: BillingRouteOptions): void {
  const platformGuard = options.platformDatabase
    ? options.platformStaffGuard
    : options.platformDatabaseUnavailable
  const billingGuard = options.tenantDatabase
    ? [options.tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'billing.manage')]
    : options.tenantUnavailable
  const platform = () => options.platformDatabase!

  routes.post(
    '/v1/platform/plans',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Publish a plan version without a catalog price',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'name', 'entitlements'],
          properties: {
            key: { type: 'string' },
            name: { type: 'string' },
            entitlements: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const body = CreatePlanSchema.parse(request.body)
        const created = await createPlan(platform(), body)
        return reply.status(201).send(created)
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/plans/:planId/versions',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Publish a new immutable plan version',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['planId'],
          properties: { planId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['entitlements'],
          properties: {
            entitlements: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { planId } = request.params as { planId: string }
        const body = z.object({ entitlements: z.array(PlanEntitlementInputSchema).min(1) }).strict().parse(request.body)
        const created = await publishPlanVersion(platform(), { planId, entitlements: body.entitlements })
        return reply.status(201).send(created)
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/addons',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Create an entitlement add-on',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'name', 'entitlementKey', 'increment'],
          properties: {
            key: { type: 'string' },
            name: { type: 'string' },
            entitlementKey: { type: 'string' },
            increment: { type: 'integer', minimum: 1 },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as { key: string; name: string; entitlementKey: string; increment: number }
        const created = await createAddon(platform(), {
          ...body,
          entitlementKey: EntitlementKeySchema.parse(body.entitlementKey),
        })
        return reply.status(201).send(created)
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/tenants/:tenantId/subscription',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Start a manual trial or active subscription',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['planVersionId', 'status'],
          properties: {
            planVersionId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['trialing', 'active'] },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { tenantId } = request.params as { tenantId: string }
        const body = request.body as { planVersionId: string; status: 'trialing' | 'active' }
        const provider = createManualBillingProvider(platform(), request.identity!.subject)
        const customer = await provider.createCustomer({ tenantId, name: tenantId })
        const started = await provider.startSubscription({
          tenantId,
          customerRef: customer.customerRef,
          planVersionId: body.planVersionId,
          status: body.status,
        })
        return reply.status(201).send(started)
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/tenants/:tenantId/subscription/plan',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Change the subscription plan without deleting tenant data',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['tenantId'],
          properties: { tenantId: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['planVersionId'],
          properties: { planVersionId: { type: 'string', format: 'uuid' } },
        },
        response: { 200: { type: 'object', additionalProperties: true }, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { tenantId } = request.params as { tenantId: string }
        const body = request.body as { planVersionId: string }
        return await changePlan(platform(), request.identity!.subject, { tenantId, planVersionId: body.planVersionId })
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/tenants/:tenantId/subscription/status',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Change subscription status without deleting tenant data',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['trialing', 'active', 'past_due', 'suspended', 'canceled'] },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true }, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { tenantId } = request.params as { tenantId: string }
        const body = request.body as { status: 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled' }
        return await setSubscriptionStatus(platform(), request.identity!.subject, { tenantId, status: body.status })
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/tenants/:tenantId/subscription/addons',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Attach an add-on to the open subscription',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['addonId', 'quantity'],
          properties: {
            addonId: { type: 'string', format: 'uuid' },
            quantity: { type: 'integer', minimum: 1 },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true }, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { tenantId } = request.params as { tenantId: string }
        const body = request.body as { addonId: string; quantity: number }
        const created = await addSubscriptionAddon(platform(), request.identity!.subject, {
          tenantId,
          addonId: body.addonId,
          quantity: body.quantity,
        })
        return reply.status(201).send(created)
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/tenants/:tenantId/entitlement-overrides',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Record an audited entitlement override',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['entitlementKey', 'reason'],
          properties: {
            entitlementKey: { type: 'string' },
            delta: { type: 'integer' },
            enabled: { type: 'boolean' },
            reason: { type: 'string', minLength: 20, maxLength: 500 },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { tenantId } = request.params as { tenantId: string }
        const body = request.body as {
          entitlementKey: string
          delta?: number
          enabled?: boolean
          reason: string
        }
        const created = await addEntitlementOverride(platform(), request.identity!.subject, {
          tenantId,
          entitlementKey: EntitlementKeySchema.parse(body.entitlementKey),
          delta: body.delta,
          enabled: body.enabled,
          reason: body.reason,
        })
        return reply.status(201).send(created)
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/tenants/:tenantId/invoices',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Issue an operator invoice for an entered amount',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['amountMinor', 'currency'],
          properties: {
            amountMinor: { type: 'integer', minimum: 1 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            externalReference: { type: 'string' },
          },
        },
        response: { 201: { type: 'object', additionalProperties: true }, 400: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { tenantId } = request.params as { tenantId: string }
        const body = request.body as { amountMinor: number; currency: string; externalReference?: string }
        const provider = createManualBillingProvider(platform(), request.identity!.subject)
        const issued = await provider.issueInvoice({ tenantId, ...body })
        return reply.status(201).send(issued)
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.post(
    '/v1/platform/invoices/:invoiceId/payment',
    {
      preHandler: platformGuard,
      schema: {
        tags: ['billing'],
        summary: 'Mark a manual invoice paid',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['providerRef', 'paid'],
          properties: {
            providerRef: { type: 'string' },
            paid: { type: 'boolean' },
          },
        },
        response: { 200: { type: 'object', additionalProperties: true }, 404: errorSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string }
        const body = request.body as { providerRef: string; paid: boolean }
        const provider = createManualBillingProvider(platform(), request.identity!.subject)
        return await provider.handlePaymentNotice({ invoiceId, providerRef: body.providerRef, paid: body.paid })
      } catch (error) {
        return sendBillingError(error, reply)
      }
    },
  )

  routes.get(
    '/v1/tenant/billing',
    {
      preHandler: billingGuard,
      schema: {
        tags: ['billing'],
        summary: 'Read the tenant subscription and recent invoices',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'object', additionalProperties: true }, 403: errorSchema },
      },
    },
    async (request) => readTenantBilling(options.tenantDatabase!, request.tenantId!),
  )

  routes.get(
    '/v1/tenant/usage',
    {
      preHandler: billingGuard,
      schema: {
        tags: ['billing'],
        summary: 'Read the current usage period',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: { type: 'object', additionalProperties: true } } },
      },
    },
    async (request) => readUsage(options.tenantDatabase!, request.tenantId!),
  )
}
