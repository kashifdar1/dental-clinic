import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createSessionStore } from '../src/auth/session-store.js'
import { recordSecurityEvent } from '../src/audit/security-events.js'
import { createTenant, listTenants, transitionTenant, TenantLifecycleError } from '../src/platform/tenant-service.js'
import { acceptInvitation, createInvitation } from '../src/tenancy/invitation-service.js'
import { createLocation, listLocations, updateLocation } from '../src/tenancy/location-service.js'
import { createDatabase } from '../src/database.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import { createApi } from '../src/app.js'

const applicationUrl = process.env.RLS_TEST_APP_DATABASE_URL
const platformUrl = process.env.RLS_TEST_PLATFORM_DATABASE_URL
const bootstrapUrl = process.env.RLS_TEST_DATABASE_URL
const integrationSuite = applicationUrl && platformUrl && bootstrapUrl ? describe : describe.skip

integrationSuite('PostgreSQL tenant row-level security', () => {
  const tenantA = '00000000-0000-4000-8000-000000000001'
  const tenantB = '00000000-0000-4000-8000-000000000002'
  const locationA = '00000000-0000-4000-8000-000000000011'
  const locationB = '00000000-0000-4000-8000-000000000012'
  const auditId = '00000000-0000-4000-8000-000000000021'
  const ownerMembershipId = '00000000-0000-4000-8000-000000000031'
  const ownerRoleAssignmentId = '00000000-0000-4000-8000-000000000032'
  const platformStaffId = '00000000-0000-4000-8000-000000000041'
  const bootstrap = new Pool({ connectionString: bootstrapUrl })
  const application = createDatabase(applicationUrl)
  const platform = createDatabase(platformUrl)
  const api = createApi({
    checkDatabase: application.check,
    tenantDatabase: application.database,
    platformDatabase: platform.database,
    logger: false,
    authenticator: {
      async authenticate(token) {
        if (token === 'platform-test-token') {
          return {
            subject: 'platform-admin-123',
            realm: 'platform',
            email: 'platform@example.test',
            emailVerified: true,
            mfaVerified: true,
          }
        }
        if (token === 'tenant-owner-test-token') {
          return {
            subject: 'tenant-owner-123',
            realm: 'tenant',
            email: 'owner@example.test',
            emailVerified: true,
            mfaVerified: false,
          }
        }
        return null
      },
    },
    isActivePlatformStaff: async (subject) => {
      const staff = await platform.database
        .selectFrom('platform_staff')
        .select('id')
        .where('identity_subject', '=', subject)
        .where('status', '=', 'active')
        .executeTakeFirst()
      return Boolean(staff)
    },
  })

  beforeAll(async () => {
    await bootstrap.query(
      `INSERT INTO clinic_hub.tenants (id, name, slug, lifecycle_state)
        VALUES ($1, 'Tenant A', $2, 'active'), ($3, 'Tenant B', $4, 'active')
        ON CONFLICT (id) DO UPDATE SET lifecycle_state = EXCLUDED.lifecycle_state`,
      [tenantA, `test-${tenantA}`, tenantB, `test-${tenantB}`],
    )
    await bootstrap.query(
      `INSERT INTO clinic_hub.locations (id, tenant_id, name, slug, timezone)
       VALUES ($1, $2, 'Location A', 'main', 'Asia/Karachi'),
        ($3, $4, 'Location B', 'main', 'Asia/Karachi')
      ON CONFLICT (id) DO NOTHING`,
      [locationA, tenantA, locationB, tenantB],
    )
    await bootstrap.query(
      `INSERT INTO clinic_hub.memberships
        (id, tenant_id, identity_subject, email, display_name, status)
       VALUES ($1, $2, 'tenant-owner-123', 'owner@example.test', 'Owner', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [ownerMembershipId, tenantA],
    )
    await bootstrap.query(
      `INSERT INTO clinic_hub.role_assignments
        (id, tenant_id, membership_id, role_key, scope, scope_location_id)
       VALUES ($1, $2, $3, 'tenant_owner', 'tenant', NULL)
       ON CONFLICT (id) DO NOTHING`,
      [ownerRoleAssignmentId, tenantA, ownerMembershipId],
    )
    await bootstrap.query(
      `INSERT INTO clinic_hub.platform_staff (id, identity_subject, email, status)
       VALUES ($1, 'platform-admin-123', 'platform@example.test', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [platformStaffId],
    )
  })

  afterAll(async () => {
    await Promise.all([api.close(), bootstrap.end(), application.close(), platform.close()])
  })

  it('limits tenant reads and rejects cross-tenant writes in a scoped transaction', async () => {
    const visibleTenants = await withTenant(
      application.database,
      tenantA,
      (transaction) => transaction.selectFrom('tenants').select('id').execute(),
    )
    const visibleLocations = await withTenant(
      application.database,
      tenantA,
      (transaction) => transaction.selectFrom('locations').select('id').execute(),
    )

    expect(visibleTenants.map((row) => row.id)).toEqual([tenantA])
    expect(visibleLocations.map((row) => row.id)).toContain(locationA)
    expect(visibleLocations.map((row) => row.id)).not.toContain(locationB)

    await expect(
      withTenant(application.database, tenantA, async (transaction) => {
        await transaction
          .insertInto('locations')
          .values({
            id: '00000000-0000-4000-8000-000000000099',
            tenant_id: tenantB,
            name: 'Cross-tenant write',
            slug: 'cross-tenant',
            timezone: 'Asia/Karachi',
          })
          .execute()
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('does not leak tenant context between transactions', async () => {
    const visibleA = await withTenant(
      application.database,
      tenantA,
      (transaction) => transaction.selectFrom('tenants').select('id').execute(),
    )
    const visibleB = await withTenant(
      application.database,
      tenantB,
      (transaction) => transaction.selectFrom('tenants').select('id').execute(),
    )

    expect(visibleA.map((row) => row.id)).toEqual([tenantA])
    expect(visibleB.map((row) => row.id)).toEqual([tenantB])
  })

  it('enables and forces row-level security on every tenant-owned table', async () => {
    const result = await bootstrap.query<{
      relname: string
      relrowsecurity: boolean
      relforcerowsecurity: boolean
    }>(`
      SELECT table_class.relname, table_class.relrowsecurity, table_class.relforcerowsecurity
      FROM pg_class AS table_class
      JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = 'clinic_hub'
        AND table_class.relkind = 'r'
        AND table_class.relname <> 'schema_migrations'
    `)

    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.rows.every((table) => table.relrowsecurity && table.relforcerowsecurity)).toBe(true)
  })

  it('rejects changes to append-only audit events', async () => {
    await bootstrap.query(
      `INSERT INTO clinic_hub.audit_events
        (id, tenant_id, actor_subject, action, resource_type)
       VALUES ($1, $2, 'test-user', 'tenant.created', 'tenant')
       ON CONFLICT (id) DO NOTHING`,
      [auditId, tenantA],
    )

    await expect(
      withTenant(application.database, tenantA, async (transaction) => {
        await transaction
          .updateTable('audit_events')
          .set({ action: 'forged.action' })
          .where('id', '=', auditId)
          .execute()
      }),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      bootstrap.query(
        "UPDATE clinic_hub.audit_events SET action = 'forged.action' WHERE id = $1",
        [auditId],
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('stores sessions behind token-hash RLS and revokes them server-side', async () => {
    const sessionStore = createSessionStore(application.database)
    const created = await sessionStore.create({
      subject: 'tenant-user-123',
      realm: 'tenant',
      email: 'owner@example.test',
      mfaVerified: false,
    })

    expect(created.sessionToken).not.toContain(created.record.subject)
    expect(sessionStore.verifyCsrf(created.record, created.csrfToken)).toBe(true)
    expect(sessionStore.verifyCsrf(created.record, 'wrong-csrf')).toBe(false)
    expect(await sessionStore.load(created.sessionToken)).toMatchObject({
      subject: 'tenant-user-123',
      realm: 'tenant',
    })

    const platformSessionStore = createSessionStore(platform.database)
    const platformSession = await platformSessionStore.create({
      subject: 'platform-admin-123',
      realm: 'platform',
      email: 'platform@example.test',
      emailVerified: true,
      mfaVerified: true,
    })
    expect(await platformSessionStore.load(platformSession.sessionToken)).toMatchObject({
      subject: 'platform-admin-123',
      realm: 'platform',
    })
    expect(await sessionStore.load(platformSession.sessionToken)).toBeNull()
    expect(await platformSessionStore.load(created.sessionToken)).toBeNull()

    const unscoped = await application.database
      .selectFrom('auth_sessions')
      .select('session_hash')
      .execute()
    expect(unscoped).toEqual([])

    await sessionStore.revoke(created.sessionToken)
    expect(await sessionStore.load(created.sessionToken)).toBeNull()
  })

  it('creates and accepts a verified, location-scoped invitation transactionally', async () => {
    const inviteeSubject = randomUUID()
    const invitation = await createInvitation(
      application.database,
      {
        subject: 'tenant-owner-123',
        realm: 'tenant',
        email: 'owner@example.test',
        emailVerified: true,
        mfaVerified: false,
      },
      {
        tenantId: tenantA,
        email: `reception-${randomUUID()}@example.test`,
        role: 'receptionist',
        scope: 'location',
        locationId: locationA,
      },
    )
    const inviteeEmail = (await bootstrap.query<{ email: string }>(
      'SELECT email FROM clinic_hub.invitations WHERE id = $1',
      [invitation.id],
    )).rows[0].email

    await expect(
      acceptInvitation(
        application.database,
        {
          subject: inviteeSubject,
          realm: 'tenant',
          email: 'wrong@example.test',
          emailVerified: true,
          mfaVerified: false,
        },
        invitation.token,
      ),
    ).rejects.toMatchObject({ code: 'email_mismatch' })

    const accepted = await acceptInvitation(
      application.database,
      {
        subject: inviteeSubject,
        realm: 'tenant',
        email: inviteeEmail,
        emailVerified: true,
        mfaVerified: false,
      },
      invitation.token,
    )
    expect(accepted.tenantId).toBe(tenantA)

    const assignment = await withTenant(
      application.database,
      tenantA,
      (transaction) =>
        transaction
          .selectFrom('role_assignments')
          .select(['role_key', 'scope_location_id'])
          .where('membership_id', '=', accepted.membershipId)
          .executeTakeFirst(),
    )
    expect(assignment).toEqual({ role_key: 'receptionist', scope_location_id: locationA })

    await expect(
      createInvitation(
        application.database,
        {
          subject: inviteeSubject,
          realm: 'tenant',
          email: inviteeEmail,
          emailVerified: true,
          mfaVerified: false,
        },
        {
          tenantId: tenantA,
          email: `unauthorized-${randomUUID()}@example.test`,
          role: 'receptionist',
          scope: 'location',
          locationId: locationA,
        },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('isolates platform staff and appends security events only through platform access', async () => {
    const staff = await platform.database
      .selectFrom('platform_staff')
      .select(['identity_subject', 'status'])
      .where('identity_subject', '=', 'platform-admin-123')
      .executeTakeFirst()
    expect(staff).toEqual({ identity_subject: 'platform-admin-123', status: 'active' })

    await expect(
      application.database.selectFrom('platform_staff').select('id').execute(),
    ).rejects.toMatchObject({ code: '42501' })

    await recordSecurityEvent(platform.database, {
      eventType: 'platform.authentication_denied',
      actorSubject: 'unknown-admin',
      identityRealm: 'platform',
      requestId: 'test-request',
    })
    const event = await platform.database
      .selectFrom('security_events')
      .select(['event_type', 'actor_subject'])
      .where('event_type', '=', 'platform.authentication_denied')
      .executeTakeFirst()
    expect(event).toEqual({
      event_type: 'platform.authentication_denied',
      actor_subject: 'unknown-admin',
    })
    await expect(
      platform.database
        .updateTable('security_events')
        .set({ event_type: 'forged.event' })
        .where('event_type', '=', 'platform.authentication_denied')
        .execute(),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('provisions tenants with an audited lifecycle and rejects invalid transitions', async () => {
    const slug = `tenant-${randomUUID()}`
    const created = await createTenant(platform.database, 'platform-admin-123', {
      name: 'New Tenant Organization',
      slug,
    })
    expect(created.lifecycleState).toBe('draft')

    await expect(
      transitionTenant(platform.database, 'platform-admin-123', created.id, 'trial'),
    ).resolves.toEqual({ id: created.id, lifecycleState: 'trial' })
    await expect(
      transitionTenant(platform.database, 'platform-admin-123', created.id, 'active'),
    ).resolves.toEqual({ id: created.id, lifecycleState: 'active' })
    await expect(
      transitionTenant(platform.database, 'platform-admin-123', created.id, 'draft'),
    ).rejects.toBeInstanceOf(TenantLifecycleError)
    expect((await listTenants(platform.database)).some((tenant) => tenant.id === created.id)).toBe(true)

    const audit = await platform.database
      .selectFrom('audit_events')
      .select(['action', 'resource_id'])
      .where('tenant_id', '=', created.id)
      .execute()
    expect(audit.map((event) => event.action).sort()).toEqual([
      'tenant.created',
      'tenant.lifecycle_changed',
      'tenant.lifecycle_changed',
    ].sort())
  })

  it('creates and updates locations only within the active tenant context', async () => {
    const location = await createLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'Second Location',
      slug: `second-${randomUUID()}`,
      timezone: 'Asia/Karachi',
    })
    expect((await listLocations(application.database, tenantA)).map((item) => item.id)).toContain(location.id)

    const updated = await updateLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      name: 'Renamed Location',
      slug: `renamed-${randomUUID()}`,
      timezone: 'Asia/Dubai',
    })
    expect(updated).toMatchObject({ id: location.id, tenantId: tenantA, name: 'Renamed Location' })
    expect((await listLocations(application.database, tenantB)).map((item) => item.id)).toEqual([
      locationB,
    ])
  })

  it('serves platform provisioning and tenant location routes behind role/RLS guards', async () => {
    const tenantResponse = await api.inject({
      method: 'POST',
      url: '/v1/platform/tenants',
      headers: { authorization: 'Bearer platform-test-token' },
      payload: { name: 'Route-created Tenant', slug: `route-${randomUUID()}` },
    })
    expect(tenantResponse.statusCode).toBe(201)
    const tenant = tenantResponse.json()

    const transition = await api.inject({
      method: 'PATCH',
      url: `/v1/platform/tenants/${tenant.id}/lifecycle`,
      headers: { authorization: 'Bearer platform-test-token' },
      payload: { lifecycleState: 'trial' },
    })
    expect(transition.statusCode).toBe(200)
    expect(transition.json()).toMatchObject({ id: tenant.id, lifecycleState: 'trial' })
    const auditResponse = await api.inject({
      method: 'GET',
      url: `/v1/platform/audit-events?tenantId=${tenant.id}`,
      headers: { authorization: 'Bearer platform-test-token' },
    })
    expect(auditResponse.statusCode).toBe(200)
    expect(auditResponse.json().tenantEvents.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining(['tenant.created', 'tenant.lifecycle_changed']),
    )

    const createdLocation = await api.inject({
      method: 'POST',
      url: '/v1/tenant/locations',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
      },
      payload: {
        name: 'API-created Location',
        slug: `api-${randomUUID()}`,
        timezone: 'Asia/Karachi',
      },
    })
    expect(createdLocation.statusCode).toBe(201)
    expect(createdLocation.json().tenantId).toBe(tenantA)

    const crossTenant = await api.inject({
      method: 'POST',
      url: '/v1/tenant/locations',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantB,
      },
      payload: {
        name: 'Forbidden Location',
        slug: `forbidden-${randomUUID()}`,
        timezone: 'Asia/Karachi',
      },
    })
    expect(crossTenant.statusCode).toBe(403)

    const membershipList = await api.inject({
      method: 'GET',
      url: '/v1/tenant/memberships',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
      },
    })
    expect(membershipList.statusCode).toBe(200)
    expect(membershipList.json().map((membership: { email: string }) => membership.email)).toContain(
      'owner@example.test',
    )
  })

  it('discovers only tenants attached to the authenticated membership', async () => {
    const response = await api.inject({
      method: 'GET',
      url: '/v1/tenant/tenants',
      headers: { authorization: 'Bearer tenant-owner-test-token' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      {
        tenantId: tenantA,
        name: 'Tenant A',
        slug: `test-${tenantA}`,
        roles: ['tenant_owner'],
      },
    ])
  })
})
