import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createSessionStore } from '../src/auth/session-store.js'
import { recordSecurityEvent } from '../src/audit/security-events.js'
import { createTenant, listTenants, transitionTenant, TenantLifecycleError } from '../src/platform/tenant-service.js'
import { acceptInvitation, createInvitation } from '../src/tenancy/invitation-service.js'
import {
  createContact,
  listContactConsentEvents,
  listContacts,
  recordContactConsent,
} from '../src/tenancy/contact-service.js'
import {
  assignPractitionerToLocation,
  createPractitioner,
  listPractitioners,
  updatePractitionerLocation,
  updatePractitionerVerification,
} from '../src/tenancy/practitioner-service.js'
import {
  PractitionerCsvError,
  importPractitionersCsv,
} from '../src/tenancy/practitioner-csv-service.js'
import {
  assignPractitionerToService,
  createLocationOffering,
  createService,
  createServiceCategory,
  listLocationCatalog,
  updateLocationOffering,
  updatePractitionerServiceStatus,
} from '../src/tenancy/catalog-service.js'
import {
  createAppointment,
  listAppointmentStatusHistory,
  listAvailableSlots,
  replaceWeeklySchedule,
  rescheduleAppointment,
  setScheduleException,
  transitionAppointment,
} from '../src/tenancy/scheduling-service.js'
import { createLocation, listLocations, updateLocation } from '../src/tenancy/location-service.js'
import { createDatabase } from '../src/database.js'
import { withTenant, withTenantLocation } from '../src/tenant/with-tenant.js'
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
  const locationC = '00000000-0000-4000-8000-000000000013'
  const auditId = '00000000-0000-4000-8000-000000000021'
  const ownerMembershipId = '00000000-0000-4000-8000-000000000031'
  const ownerRoleAssignmentId = '00000000-0000-4000-8000-000000000032'
  const receptionistMembershipId = '00000000-0000-4000-8000-000000000033'
  const receptionistRoleAssignmentId = '00000000-0000-4000-8000-000000000034'
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
        if (token === 'tenant-receptionist-test-token') {
          return {
            subject: 'tenant-receptionist-123',
            realm: 'tenant',
            email: 'receptionist@example.test',
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
      `INSERT INTO clinic_hub.locations (id, tenant_id, name, slug, timezone)
       VALUES ($1, $2, 'Location C', 'second', 'Asia/Karachi')
       ON CONFLICT (id) DO NOTHING`,
      [locationC, tenantA],
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
      `INSERT INTO clinic_hub.memberships
        (id, tenant_id, identity_subject, email, display_name, status)
       VALUES ($1, $2, 'tenant-receptionist-123', 'receptionist@example.test', 'Receptionist', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [receptionistMembershipId, tenantA],
    )
    await bootstrap.query(
      `INSERT INTO clinic_hub.role_assignments
        (id, tenant_id, membership_id, role_key, scope, scope_location_id)
       VALUES ($1, $2, $3, 'receptionist', 'location', $4)
       ON CONFLICT (id) DO NOTHING`,
      [receptionistRoleAssignmentId, tenantA, receptionistMembershipId, locationA],
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

    const rescheduleConstraint = await bootstrap.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'appointments_rescheduled_same_location_fk'`,
    )
    expect(rescheduleConstraint.rows[0].definition).toContain(
      'FOREIGN KEY (tenant_id, location_id, rescheduled_from_id)',
    )
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

  it('scopes minimal contacts by tenant and location and preserves consent history', async () => {
    const contact = await createContact(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      displayName: 'Samira Khan',
      phoneE164: '+923001234567',
      email: 'samira@example.test',
      preferredLanguage: 'ur-PK',
      externalPatientRef: 'his-123',
    })

    expect(await listContacts(application.database, tenantA, locationA)).toContainEqual(
      expect.objectContaining({
        id: contact.id,
        displayName: 'Samira Khan',
        preferredLanguage: 'ur-PK',
      }),
    )
    expect(await listContacts(application.database, tenantB, locationB)).toEqual([])
    expect(await listContacts(application.database, tenantA, locationB)).toEqual([])

    const otherLocationContact = await createContact(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      displayName: 'Other Location Contact',
      phoneE164: '+923001234570',
    })

    const consent = await recordContactConsent(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
      channel: 'whatsapp',
      purpose: 'appointment_updates',
      state: 'granted',
      source: 'verbal',
      policyVersion: '2026-01',
      evidenceReference: 'consent-form-123',
    })
    const otherLocationConsent = await recordContactConsent(
      application.database,
      'tenant-owner-123',
      {
        tenantId: tenantA,
        locationId: locationC,
        contactId: otherLocationContact.id,
        channel: 'sms',
        purpose: 'appointment_updates',
        state: 'granted',
        source: 'staff_entry',
      },
    )
    expect(await listContactConsentEvents(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
    })).toContainEqual(expect.objectContaining({
      id: consent.id,
      channel: 'whatsapp',
      state: 'granted',
      actorSubject: 'tenant-owner-123',
    }))
    await expect(listContactConsentEvents(application.database, {
      tenantId: tenantB,
      locationId: locationB,
      contactId: contact.id,
    })).rejects.toMatchObject({ code: 'not_found' })
    const hiddenLocationContacts = await withTenantLocation(
      application.database,
      tenantA,
      locationA,
      (transaction) => transaction
        .selectFrom('contacts')
        .select('id')
        .where('id', '=', otherLocationContact.id)
        .execute(),
    )
    expect(hiddenLocationContacts).toEqual([])
    const hiddenLocationConsents = await withTenantLocation(
      application.database,
      tenantA,
      locationA,
      (transaction) => transaction
        .selectFrom('contact_consent_events')
        .select('id')
        .where('id', '=', otherLocationConsent.id)
        .execute(),
    )
    expect(hiddenLocationConsents).toEqual([])
    await expect(
      withTenantLocation(application.database, tenantA, locationA, (transaction) =>
        transaction
          .insertInto('contacts')
          .values({
            id: randomUUID(),
            tenant_id: tenantA,
            location_id: locationC,
            display_name: 'Wrong location insert',
            phone_e164: '+923001234571',
            email: null,
            preferred_language: null,
            external_patient_ref: null,
          })
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      withTenantLocation(application.database, tenantA, locationA, (transaction) =>
        transaction
          .insertInto('contact_consent_events')
          .values({
            id: randomUUID(),
            tenant_id: tenantA,
            contact_id: otherLocationContact.id,
            channel: 'sms',
            purpose: 'appointment_updates',
            state: 'granted',
            source: 'staff_entry',
            policy_version: null,
            evidence_reference: null,
            actor_subject: 'tenant-owner-123',
          })
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    const unscopedLocationContacts = await withTenant(
      application.database,
      tenantA,
      (transaction) => transaction.selectFrom('contacts').select('id').execute(),
    )
    expect(unscopedLocationContacts).toEqual([])
    await expect(
      application.database
        .updateTable('contact_consent_events')
        .set({ state: 'withdrawn' })
        .where('id', '=', consent.id)
        .execute(),
    ).rejects.toMatchObject({ code: '42501' })

    const retainedLocation = await createLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'Consent Retention Location',
      slug: `consent-retention-${randomUUID().slice(0, 8)}`,
      timezone: 'Asia/Karachi',
    })
    const retainedContact = await createContact(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: retainedLocation.id,
      displayName: 'Consent Retention Contact',
      phoneE164: '+923001234572',
    })
    await recordContactConsent(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: retainedLocation.id,
      contactId: retainedContact.id,
      channel: 'whatsapp',
      purpose: 'appointment_updates',
      state: 'granted',
      source: 'paper',
    })
    await expect(bootstrap.query(
      'DELETE FROM clinic_hub.contacts WHERE id = $1',
      [retainedContact.id],
    )).rejects.toMatchObject({ code: '23503' })
    await expect(bootstrap.query(
      'DELETE FROM clinic_hub.locations WHERE id = $1',
      [retainedLocation.id],
    )).rejects.toMatchObject({ code: '23503' })
  })

  it('assigns practitioners to multiple locations with independent verification and publication', async () => {
    const practitioner = await createPractitioner(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      displayName: 'Dr Amina Siddiqui',
      registrationAuthority: 'pmdc',
      registrationNumber: `REG-${randomUUID()}`,
    })
    expect(practitioner.verificationStatus).toBe('unverified')
    expect(await listPractitioners(application.database, tenantA, locationA)).toContainEqual(
      expect.objectContaining({ id: practitioner.id, verificationStatus: 'unverified' }),
    )

    await expect(createPractitioner(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      displayName: 'Duplicate Registration',
      registrationAuthority: practitioner.registrationAuthority,
      registrationNumber: practitioner.registrationNumber,
    })).rejects.toMatchObject({ code: 'registration_unavailable' })
    await expect(createPractitioner(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      displayName: 'Case Variant Registration',
      registrationAuthority: practitioner.registrationAuthority.toLowerCase(),
      registrationNumber: practitioner.registrationNumber.toLowerCase(),
    })).rejects.toMatchObject({ code: 'registration_unavailable' })

    const secondAssignment = await assignPractitionerToLocation(
      application.database,
      'tenant-owner-123',
      { tenantId: tenantA, locationId: locationC, practitionerId: practitioner.id },
    )
    expect(secondAssignment.verificationStatus).toBe('unverified')
    await expect(updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })).rejects.toMatchObject({ code: 'not_verified' })

    await updatePractitionerVerification(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      verificationStatus: 'verified',
      evidenceReference: 'registry-check-001',
    })
    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })

    await expect(updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })).rejects.toMatchObject({ code: 'not_verified' })
    await updatePractitionerVerification(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      practitionerId: practitioner.id,
      verificationStatus: 'verified',
      evidenceReference: 'registry-check-002',
    })
    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })

    await updatePractitionerVerification(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      verificationStatus: 'rejected',
    })
    expect(await listPractitioners(application.database, tenantA, locationA)).toContainEqual(
      expect.objectContaining({ verificationStatus: 'rejected', publicationState: 'unpublished' }),
    )
    expect(await listPractitioners(application.database, tenantA, locationC)).toContainEqual(
      expect.objectContaining({ verificationStatus: 'verified', publicationState: 'published' }),
    )
    const practitionerAudit = await withTenant(
      application.database,
      tenantA,
      (transaction) => transaction
        .selectFrom('audit_events')
        .select('action')
        .where('resource_id', '=', practitioner.id)
        .execute(),
    )
    expect(practitionerAudit.map((event) => event.action)).toEqual(expect.arrayContaining([
      'practitioner.created',
      'practitioner.location_assigned',
      'practitioner.verification_changed',
      'practitioner.location_updated',
    ]))

    const hiddenAssignment = await withTenantLocation(
      application.database,
      tenantA,
      locationA,
      (transaction) => transaction
        .selectFrom('practitioner_locations')
        .select('id')
        .where('id', '=', secondAssignment.id)
        .execute(),
    )
    expect(hiddenAssignment).toEqual([])
    await expect(
      withTenantLocation(application.database, tenantA, locationA, (transaction) =>
      transaction
        .insertInto('practitioner_locations')
        .values({
          id: randomUUID(),
          tenant_id: tenantA,
          practitioner_id: practitioner.id,
          location_id: locationC,
          status: 'active',
          verification_status: 'unverified',
          verified_at: null,
          verified_by_subject: null,
          publication_state: 'draft',
        })
        .execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    const locationOnlyPractitioner = await createPractitioner(
      application.database,
      'tenant-owner-123',
      {
        tenantId: tenantA,
        locationId: locationC,
        displayName: 'Location C Only Practitioner',
        registrationAuthority: 'pmdc',
        registrationNumber: `REG-${randomUUID()}`,
      },
    )
    const hiddenProfile = await withTenantLocation(
      application.database,
      tenantA,
      locationA,
      (transaction) => transaction
        .selectFrom('practitioners')
        .select('id')
        .where('id', '=', locationOnlyPractitioner.id)
        .execute(),
    )
    expect(hiddenProfile).toEqual([])
    const unscopedProfiles = await withTenant(
      application.database,
      tenantA,
      (transaction) => transaction.selectFrom('practitioners').select('id').execute(),
    )
    expect(unscopedProfiles).toEqual([])
    await expect(
      withTenantLocation(application.database, tenantA, locationA, (transaction) =>
        transaction
          .updateTable('practitioners')
          .set({ display_name: 'Unauthorized profile change' })
          .where('id', '=', practitioner.id)
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      withTenantLocation(application.database, tenantA, locationA, (transaction) =>
      transaction
        .insertInto('practitioners')
        .values({
          id: randomUUID(),
          tenant_id: tenantA,
          display_name: 'Unassigned Practitioner',
          registration_authority: 'PMDC',
          registration_number: `REG-${randomUUID()}`,
        })
        .execute(),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('scopes clinic service offerings and practitioner links to an active location', async () => {
    const suffix = randomUUID().slice(0, 8)
    const category = await createServiceCategory(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'Dental Care',
      slug: `dental-${suffix}`,
    })
    const service = await createService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      categoryId: category.id,
      name: 'Routine Consultation',
      slug: `consultation-${suffix}`,
      defaultDurationMinutes: 30,
    })
    await expect(createLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      priceAmountMinor: 1000,
      currencyCode: 'ZZZ',
    })).rejects.toMatchObject({ code: 'invalid_currency' })
    await expect(withTenantLocation(application.database, tenantA, locationA, (transaction) =>
      transaction
        .insertInto('location_services')
        .values({
          id: randomUUID(),
          tenant_id: tenantA,
          location_id: locationA,
          service_id: service.id,
          duration_override_minutes: null,
          price_amount_minor: '1000',
          currency_code: 'ZZZ',
          status: 'active',
        })
        .execute(),
    )).rejects.toMatchObject({ code: '23503' })
    await expect(withTenant(application.database, tenantA, (transaction) =>
      transaction
        .insertInto('currency_codes')
        .values({ code: 'ZZZ' })
        .execute(),
    )).rejects.toMatchObject({ code: '42501' })
    const offering = await createLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      durationOverrideMinutes: 45,
      priceAmountMinor: 175000,
      currencyCode: 'pkr',
    })
    expect(offering).toMatchObject({ durationOverrideMinutes: 45, priceAmountMinor: 175000, currencyCode: 'PKR' })
    await expect(updateLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      durationOverrideMinutes: 45,
      priceAmountMinor: 1000,
      currencyCode: 'ZZZ',
      status: 'active',
    })).rejects.toMatchObject({ code: 'invalid_currency' })
    expect(await listLocationCatalog(application.database, tenantA, locationA)).toContainEqual(
      expect.objectContaining({
        serviceId: service.id,
        categoryName: 'Dental Care',
        defaultDurationMinutes: 30,
        durationOverrideMinutes: 45,
        priceAmountMinor: 175000,
        currencyCode: 'PKR',
      }),
    )
    expect((await listLocationCatalog(application.database, tenantA, locationC))
      .some((item) => item.serviceId === service.id)).toBe(false)
    expect(await listLocationCatalog(application.database, tenantB, locationB)).toEqual([])

    const practitioner = await createPractitioner(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      displayName: 'Catalog Practitioner',
      registrationAuthority: 'pmdc',
      registrationNumber: `REG-${randomUUID()}`,
    })
    await updatePractitionerVerification(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      verificationStatus: 'verified',
      evidenceReference: 'catalog-registry-check',
    })
    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })
    const practitionerService = await assignPractitionerToService(
      application.database,
      'tenant-owner-123',
      {
        tenantId: tenantA,
        locationId: locationA,
        serviceId: service.id,
        practitionerId: practitioner.id,
      },
    )
    expect(await listLocationCatalog(application.database, tenantA, locationA)).toContainEqual(
      expect.objectContaining({
        serviceId: service.id,
        practitioners: [expect.objectContaining({ id: practitioner.id, status: 'active' })],
      }),
    )

    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      status: 'inactive',
      publicationState: 'unpublished',
    })
    expect(await listLocationCatalog(application.database, tenantA, locationA)).toContainEqual(
      expect.objectContaining({
        serviceId: service.id,
        practitioners: [expect.objectContaining({ id: practitioner.id, status: 'inactive' })],
      }),
    )
    await expect(updatePractitionerServiceStatus(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      practitionerId: practitioner.id,
      status: 'active',
    })).rejects.toMatchObject({ code: 'not_active' })
    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })
    await updatePractitionerServiceStatus(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      practitionerId: practitioner.id,
      status: 'active',
    })

    await updateLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      durationOverrideMinutes: null,
      priceAmountMinor: null,
      currencyCode: null,
      status: 'inactive',
    })
    expect(await listLocationCatalog(application.database, tenantA, locationA)).toContainEqual(
      expect.objectContaining({
        serviceId: service.id,
        status: 'inactive',
        practitioners: [expect.objectContaining({ id: practitioner.id, status: 'inactive' })],
      }),
    )
    await expect(updatePractitionerServiceStatus(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      practitionerId: practitioner.id,
      status: 'active',
    })).rejects.toMatchObject({ code: 'not_active' })

    const hiddenOffering = await withTenantLocation(
      application.database,
      tenantA,
      locationC,
      (transaction) => transaction
        .selectFrom('location_services')
        .select('id')
        .where('id', '=', offering.id)
        .execute(),
    )
    expect(hiddenOffering).toEqual([])
    const hiddenPractitionerService = await withTenantLocation(
      application.database,
      tenantA,
      locationC,
      (transaction) => transaction
        .selectFrom('practitioner_services')
        .select('id')
        .where('id', '=', practitionerService.id)
        .execute(),
    )
    expect(hiddenPractitionerService).toEqual([])
    await expect(withTenantLocation(application.database, tenantA, locationA, (transaction) =>
      transaction
        .insertInto('location_services')
        .values({
          id: randomUUID(),
          tenant_id: tenantA,
          location_id: locationC,
          service_id: service.id,
          duration_override_minutes: null,
          price_amount_minor: null,
          currency_code: null,
          status: 'active',
        })
        .execute(),
    )).rejects.toMatchObject({ code: '42501' })
  })

  it('serializes practitioner-service activation against concurrent parent deactivation', async () => {
    const suffix = randomUUID().slice(0, 8)
    const category = await createServiceCategory(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'Concurrent Services',
      slug: `concurrent-${suffix}`,
    })
    const service = await createService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      categoryId: category.id,
      name: 'Concurrent Consultation',
      slug: `concurrent-service-${suffix}`,
      defaultDurationMinutes: 30,
    })
    await createLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
    })
    const practitioner = await createPractitioner(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      displayName: 'Concurrent Practitioner',
      registrationAuthority: 'pmdc',
      registrationNumber: `REG-${randomUUID()}`,
    })
    await updatePractitionerVerification(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      verificationStatus: 'verified',
      evidenceReference: 'concurrency-registry-check',
    })
    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })

    const observer = new Pool({ connectionString: applicationUrl, max: 2 })
    type HeldMutation = (signalReady: () => void, hold: Promise<void>) => Promise<void>
    const runAgainstHeldParent = async (
      mutateParent: HeldMutation,
      activateChild: () => Promise<unknown>,
    ) => {
      let signalParentReady!: () => void
      let releaseParent!: () => void
      const parentReady = new Promise<void>((resolve) => { signalParentReady = resolve })
      const holdParent = new Promise<void>((resolve) => { releaseParent = resolve })
      const parentMutation = mutateParent(signalParentReady, holdParent)
      await parentReady

      const childMutation = activateChild().then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )

      let observedLockWait = false
      const deadline = Date.now() + 3_000
      while (Date.now() < deadline) {
        const result = await observer.query<{ pid: number }>(`
          SELECT pid
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND usename = current_user
            AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock'
            AND query ILIKE '%practitioner_services%'
        `)
        if (result.rows.length > 0) {
          observedLockWait = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      releaseParent()
      await parentMutation
      const outcome = await childMutation
      return { observedLockWait, outcome }
    }

    try {
      const offerDeactivation = await runAgainstHeldParent(
        (signalReady, hold) => withTenantLocation(
          application.database,
          tenantA,
          locationA,
          async (transaction) => {
            await transaction
              .updateTable('location_services')
              .set({ status: 'inactive', updated_at: new Date().toISOString() })
              .where('tenant_id', '=', tenantA)
              .where('location_id', '=', locationA)
              .where('service_id', '=', service.id)
              .execute()
            signalReady()
            await hold
          },
        ),
        () => assignPractitionerToService(application.database, 'tenant-owner-123', {
          tenantId: tenantA,
          locationId: locationA,
          serviceId: service.id,
          practitionerId: practitioner.id,
        }),
      )
      expect(offerDeactivation.observedLockWait).toBe(true)
      expect(offerDeactivation.outcome).toMatchObject({ error: { code: 'not_active' } })

      await updateLocationOffering(application.database, 'tenant-owner-123', {
        tenantId: tenantA,
        locationId: locationA,
        serviceId: service.id,
        durationOverrideMinutes: null,
        priceAmountMinor: null,
        currencyCode: null,
        status: 'active',
      })
      await assignPractitionerToService(application.database, 'tenant-owner-123', {
        tenantId: tenantA,
        locationId: locationA,
        serviceId: service.id,
        practitionerId: practitioner.id,
      })
      await updatePractitionerServiceStatus(application.database, 'tenant-owner-123', {
        tenantId: tenantA,
        locationId: locationA,
        serviceId: service.id,
        practitionerId: practitioner.id,
        status: 'inactive',
      })

      const practitionerDeactivation = await runAgainstHeldParent(
        (signalReady, hold) => withTenantLocation(
          application.database,
          tenantA,
          locationA,
          async (transaction) => {
            await transaction
              .updateTable('practitioner_locations')
              .set({
                status: 'inactive',
                publication_state: 'unpublished',
                updated_at: new Date().toISOString(),
              })
              .where('tenant_id', '=', tenantA)
              .where('location_id', '=', locationA)
              .where('practitioner_id', '=', practitioner.id)
              .execute()
            signalReady()
            await hold
          },
        ),
        () => updatePractitionerServiceStatus(application.database, 'tenant-owner-123', {
          tenantId: tenantA,
          locationId: locationA,
          serviceId: service.id,
          practitionerId: practitioner.id,
          status: 'active',
        }),
      )
      expect(practitionerDeactivation.observedLockWait).toBe(true)
      expect(practitionerDeactivation.outcome).toMatchObject({ error: { code: 'not_active' } })
      expect(await listLocationCatalog(application.database, tenantA, locationA)).toContainEqual(
        expect.objectContaining({
          serviceId: service.id,
          practitioners: [expect.objectContaining({ id: practitioner.id, status: 'inactive' })],
        }),
      )
    } finally {
      await observer.end()
    }
  })

  it('generates timezone-aware slots and serializes appointment holds and confirmations', async () => {
    const suffix = randomUUID().slice(0, 8)
    const category = await createServiceCategory(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'Scheduling Services',
      slug: `scheduling-${suffix}`,
    })
    const service = await createService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      categoryId: category.id,
      name: 'Scheduling Visit',
      slug: `scheduling-visit-${suffix}`,
      defaultDurationMinutes: 30,
    })
    await createLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
    })
    const practitioner = await createPractitioner(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      displayName: 'Scheduling Practitioner',
      registrationAuthority: 'pmdc',
      registrationNumber: `REG-${randomUUID()}`,
    })
    await updatePractitionerVerification(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      verificationStatus: 'verified',
      evidenceReference: 'scheduling-registry-check',
    })
    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })
    await assignPractitionerToService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      practitionerId: practitioner.id,
    })
    const contact = await createContact(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      displayName: 'Booking Contact',
      phoneE164: '+923001234573',
    })

    await replaceWeeklySchedule(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      windows: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' },
        { dayOfWeek: 2, startTime: '09:00', endTime: '11:00' },
      ],
    })
    const mondaySlots = await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      date: '2030-01-07',
    })
    expect(mondaySlots).toHaveLength(4)
    expect(mondaySlots[0]).toMatchObject({
      practitionerId: practitioner.id,
      startsAt: '2030-01-07T04:00:00.000Z',
      endsAt: '2030-01-07T04:30:00.000Z',
    })
    await setScheduleException(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      date: '2030-01-08',
      closed: true,
    })
    expect(await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      date: '2030-01-08',
    })).toEqual([])
    await setScheduleException(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      practitionerId: practitioner.id,
      date: '2030-01-09',
      closed: false,
      startTime: '12:00',
      endTime: '13:00',
    })
    expect(await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      date: '2030-01-09',
    })).toHaveLength(2)

    const requestedStart = mondaySlots[0].startsAt
    const requests = await Promise.all([1, 2].map(() => createAppointment(
      application.database,
      'tenant-owner-123',
      {
        tenantId: tenantA,
        locationId: locationA,
        contactId: contact.id,
        serviceId: service.id,
        practitionerId: practitioner.id,
        startsAt: requestedStart,
        kind: 'request',
      },
    )))
    const confirmations = await Promise.allSettled(requests.map((appointment) =>
      transitionAppointment(application.database, 'tenant-owner-123', {
        tenantId: tenantA,
        locationId: locationA,
        appointmentId: appointment.id,
        action: 'confirm',
      }),
    ))
    expect(confirmations.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(confirmations.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const losingRequest = requests[confirmations.findIndex((result) => result.status === 'rejected')]
    await transitionAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: losingRequest.id,
      action: 'decline',
      reasonCode: 'slot.taken',
    })
    const confirmedRequest = requests[confirmations.findIndex((result) => result.status === 'fulfilled')]
    const hiddenAppointment = await withTenantLocation(
      application.database,
      tenantB,
      locationB,
      (transaction) => transaction
        .selectFrom('appointments')
        .select('id')
        .where('id', '=', confirmedRequest.id)
        .execute(),
    )
    expect(hiddenAppointment).toEqual([])
    const appointmentHistory = await listAppointmentStatusHistory(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: confirmedRequest.id,
    })
    const hiddenAppointmentHistory = await withTenantLocation(
      application.database,
      tenantA,
      locationC,
      (transaction) => transaction
        .selectFrom('appointment_status_history')
        .select('id')
        .where('id', '=', appointmentHistory[0].id)
        .execute(),
    )
    expect(hiddenAppointmentHistory).toEqual([])
    const unscopedAppointments = await withTenant(
      application.database,
      tenantA,
      (transaction) => transaction.selectFrom('appointments').select('id').execute(),
    )
    expect(unscopedAppointments).toEqual([])
    const hiddenSchedule = await withTenantLocation(
      application.database,
      tenantA,
      locationC,
      (transaction) => transaction
        .selectFrom('schedules')
        .select('id')
        .where('practitioner_id', '=', practitioner.id)
        .execute(),
    )
    expect(hiddenSchedule).toEqual([])
    const rescheduled = await rescheduleAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: confirmedRequest.id,
      startsAt: mondaySlots[2].startsAt,
    })
    expect(rescheduled).toMatchObject({
      status: 'confirmed',
      rescheduled_from_id: confirmedRequest.id,
    })
    await transitionAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: rescheduled.id,
      action: 'cancel',
      reasonCode: 'patient.cancelled',
    })
    expect((await listAppointmentStatusHistory(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: confirmedRequest.id,
    })).map((event) => event.newStatus)).toEqual(['requested', 'confirmed', 'rescheduled'])

    const held = await createAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
      serviceId: service.id,
      practitionerId: practitioner.id,
      startsAt: mondaySlots[3].startsAt,
      kind: 'hold',
    })
    await expect(createAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
      serviceId: service.id,
      practitionerId: practitioner.id,
      startsAt: mondaySlots[3].startsAt,
      kind: 'hold',
    })).rejects.toMatchObject({ code: 'slot_unavailable' })
    const confirmedHold = await transitionAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: held.id,
      action: 'confirm',
    })
    expect(confirmedHold.status).toBe('confirmed')

    const exceptionSlots = await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      date: '2030-01-09',
    })
    const expiredHold = await createAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
      serviceId: service.id,
      practitionerId: practitioner.id,
      startsAt: exceptionSlots[0].startsAt,
      kind: 'hold',
    })
    await bootstrap.query(
      `UPDATE clinic_hub.appointments
       SET hold_expires_at = now() - interval '1 minute'
       WHERE id = $1`,
      [expiredHold.id],
    )
    await expect(withTenantLocation(application.database, tenantA, locationA, (transaction) =>
      transaction
        .updateTable('appointments')
        .set({ status: 'confirmed', hold_expires_at: null, updated_at: new Date().toISOString() })
        .where('id', '=', expiredHold.id)
        .execute(),
    )).rejects.toMatchObject({ code: 'P0001' })
    const requestAfterExpiry = await createAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
      serviceId: service.id,
      practitionerId: practitioner.id,
      startsAt: exceptionSlots[0].startsAt,
      kind: 'request',
    })
    expect(await bootstrap.query<{ status: string }>(
      'SELECT status FROM clinic_hub.appointments WHERE id = $1',
      [expiredHold.id],
    )).toMatchObject({ rows: [{ status: 'expired' }] })
    await expect(transitionAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: requestAfterExpiry.id,
      action: 'confirm',
    })).resolves.toMatchObject({ status: 'confirmed' })

    const rescheduleSlots = await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      serviceId: service.id,
      date: '2030-01-14',
    })
    const staleRescheduleHold = await createAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
      serviceId: service.id,
      practitionerId: practitioner.id,
      startsAt: rescheduleSlots[1].startsAt,
      kind: 'hold',
    })
    await bootstrap.query(
      `UPDATE clinic_hub.appointments
       SET hold_expires_at = now() - interval '1 minute'
       WHERE id = $1`,
      [staleRescheduleHold.id],
    )
    const replacement = await rescheduleAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: requestAfterExpiry.id,
      startsAt: rescheduleSlots[1].startsAt,
    })
    expect(replacement).toMatchObject({ status: 'confirmed' })
    expect(await bootstrap.query<{ status: string }>(
      'SELECT status FROM clinic_hub.appointments WHERE id = $1',
      [staleRescheduleHold.id],
    )).toMatchObject({ rows: [{ status: 'expired' }] })

    const boundaryHold = await createAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationA,
      contactId: contact.id,
      serviceId: service.id,
      practitionerId: practitioner.id,
      startsAt: rescheduleSlots[2].startsAt,
      kind: 'hold',
    })
    const expiryObserver = new Pool({ connectionString: applicationUrl, max: 1 })
    await bootstrap.query(`
      CREATE FUNCTION clinic_hub.test_delay_held_appointment_confirmation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF OLD.status = 'held' AND NEW.status = 'confirmed' THEN
          PERFORM pg_sleep(0.75);
        END IF;
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER appointments_a_test_delay_confirmation
      BEFORE UPDATE ON clinic_hub.appointments
      FOR EACH ROW EXECUTE FUNCTION clinic_hub.test_delay_held_appointment_confirmation();
    `)
    try {
      await bootstrap.query(
        `UPDATE clinic_hub.appointments
         SET hold_expires_at = statement_timestamp() + interval '250 milliseconds'
         WHERE id = $1`,
        [boundaryHold.id],
      )
      const confirmation = transitionAppointment(application.database, 'tenant-owner-123', {
        tenantId: tenantA,
        locationId: locationA,
        appointmentId: boundaryHold.id,
        action: 'confirm',
      }).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      let reachedDelayTrigger = false
      const lockDeadline = Date.now() + 2_000
      while (Date.now() < lockDeadline) {
        const waiting = await expiryObserver.query<{ pid: number }>(`
          SELECT pid
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND usename = current_user
            AND pid <> pg_backend_pid()
            AND wait_event = 'PgSleep'
            AND query ILIKE '%appointments%'
        `)
        if (waiting.rows.length > 0) {
          reachedDelayTrigger = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      const confirmationResult = await confirmation
      expect(reachedDelayTrigger).toBe(true)
      expect(confirmationResult).toMatchObject({ error: { code: 'hold_expired' } })
    } finally {
      await bootstrap.query(`
        DROP TRIGGER IF EXISTS appointments_a_test_delay_confirmation ON clinic_hub.appointments;
        DROP FUNCTION IF EXISTS clinic_hub.test_delay_held_appointment_confirmation();
      `)
      await expiryObserver.end()
    }
    expect(await bootstrap.query<{ status: string }>(
      'SELECT status FROM clinic_hub.appointments WHERE id = $1',
      [boundaryHold.id],
    )).toMatchObject({ rows: [{ status: 'expired' }] })
    expect((await listAppointmentStatusHistory(application.database, {
      tenantId: tenantA,
      locationId: locationA,
      appointmentId: boundaryHold.id,
    })).map((event) => event.newStatus)).toEqual(['held', 'expired'])
    const expiryAudit = await withTenant(application.database, tenantA, (transaction) =>
      transaction
        .selectFrom('audit_events')
        .select(['action', 'metadata'])
        .where('resource_id', '=', boundaryHold.id)
        .where('action', '=', 'appointment.expired')
        .executeTakeFirst(),
    )
    expect(expiryAudit).toMatchObject({
      action: 'appointment.expired',
      metadata: { locationId: locationA, reasonCode: 'hold.expired' },
    })
  })

  it('keeps elapsed service duration stable across daylight-saving transitions', async () => {
    const suffix = randomUUID().slice(0, 8)
    const location = await createLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'New York Scheduling Location',
      slug: `new-york-${suffix}`,
      timezone: 'America/New_York',
    })
    const category = await createServiceCategory(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'DST Services',
      slug: `dst-${suffix}`,
    })
    const service = await createService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      categoryId: category.id,
      name: 'DST Consultation',
      slug: `dst-consultation-${suffix}`,
      defaultDurationMinutes: 30,
    })
    await createLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      serviceId: service.id,
    })
    const practitioner = await createPractitioner(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      displayName: 'DST Practitioner',
      registrationAuthority: 'pmdc',
      registrationNumber: `REG-${randomUUID()}`,
    })
    await updatePractitionerVerification(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      practitionerId: practitioner.id,
      verificationStatus: 'verified',
      evidenceReference: 'dst-registry-check',
    })
    await updatePractitionerLocation(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      practitionerId: practitioner.id,
      status: 'active',
      publicationState: 'published',
    })
    await assignPractitionerToService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      serviceId: service.id,
      practitionerId: practitioner.id,
    })
    await replaceWeeklySchedule(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      practitionerId: practitioner.id,
      windows: [{ dayOfWeek: 0, startTime: '00:30', endTime: '04:00' }],
    })

    const fallBackSlots = await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: location.id,
      serviceId: service.id,
      date: '2030-11-03',
    })
    expect(fallBackSlots).toHaveLength(7)
    expect(fallBackSlots.every((slot) =>
      new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime() === 30 * 60 * 1000,
    )).toBe(true)

    await replaceWeeklySchedule(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: location.id,
      practitionerId: practitioner.id,
      windows: [{ dayOfWeek: 0, startTime: '01:00', endTime: '04:00' }],
    })
    const springForwardSlots = await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: location.id,
      serviceId: service.id,
      date: '2030-03-10',
    })
    expect(springForwardSlots).toHaveLength(4)
    expect(springForwardSlots.every((slot) =>
      new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime() === 30 * 60 * 1000,
    )).toBe(true)
    expect(springForwardSlots.some((slot) => slot.startsAt.includes('T07:00:00.000Z'))).toBe(true)
  })

  it('refreshes CSV preview after concurrent imports race on one registration', async () => {
    const suffix = randomUUID().slice(0, 8)
    const registrationNumber = `CSV-RACE-${suffix}`
    const registrationSql = registrationNumber.replaceAll("'", "''")
    await bootstrap.query(`
      DROP TRIGGER IF EXISTS practitioner_csv_race_delay ON clinic_hub.practitioners;
      CREATE OR REPLACE FUNCTION clinic_hub.test_delay_csv_registration_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        IF lower(NEW.registration_number) = lower('${registrationSql}') THEN
          PERFORM pg_sleep(0.25);
        END IF;
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER practitioner_csv_race_delay
      BEFORE INSERT ON clinic_hub.practitioners
      FOR EACH ROW EXECUTE FUNCTION clinic_hub.test_delay_csv_registration_insert();
    `)

    try {
      const csv = (name: string, authority: string, number: string) =>
        `display_name,registration_authority,registration_number\n${name},${authority},${number}`
      const outcomes = await Promise.all([
        importPractitionersCsv(application.database, 'tenant-owner-123', {
          tenantId: tenantA,
          locationId: locationC,
          csv: csv('Concurrent Import One', 'PMDC', registrationNumber),
        }),
        importPractitionersCsv(application.database, 'tenant-owner-123', {
          tenantId: tenantA,
          locationId: locationC,
          csv: csv('Concurrent Import Two', 'pmdc', registrationNumber.toLowerCase()),
        }),
      ].map((operation) => operation.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )))
      const successfulImports = outcomes.filter((outcome): outcome is { value: Awaited<ReturnType<typeof importPractitionersCsv>> } =>
        'value' in outcome,
      )
      const failedImports = outcomes.filter((outcome): outcome is { error: unknown } =>
        'error' in outcome,
      )
      expect(successfulImports).toHaveLength(1)
      expect(failedImports).toHaveLength(1)
      const conflict = failedImports[0].error
      expect(conflict).toBeInstanceOf(PractitionerCsvError)
      if (!(conflict instanceof PractitionerCsvError)) throw conflict
      expect(conflict.code).toBe('registration_exists')
      expect(conflict.preview.validCount).toBe(0)
      expect(conflict.preview.rows[0].errors).toContain('Registration already exists in this tenant')

      const profiles = await withTenantLocation(
        application.database,
        tenantA,
        locationC,
        (transaction) => transaction
          .selectFrom('practitioners')
          .select('id')
          .where('registration_number', 'ilike', registrationNumber)
          .execute(),
      )
      expect(profiles).toHaveLength(1)
      const auditEvents = await withTenant(application.database, tenantA, (transaction) =>
        transaction
          .selectFrom('audit_events')
          .select('id')
          .where('resource_id', '=', successfulImports[0].value.practitioners[0].id)
          .where('action', '=', 'practitioner.imported')
          .execute(),
      )
      expect(auditEvents).toHaveLength(1)
    } finally {
      await bootstrap.query(`
        DROP TRIGGER IF EXISTS practitioner_csv_race_delay ON clinic_hub.practitioners;
        DROP FUNCTION IF EXISTS clinic_hub.test_delay_csv_registration_insert();
      `)
    }
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

    const createdContact = await api.inject({
      method: 'POST',
      url: '/v1/tenant/contacts',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
      payload: {
        displayName: 'API Contact',
        phoneE164: '+923001234568',
        email: 'api-contact@example.test',
      },
    })
    expect(createdContact.statusCode).toBe(201)

    const createdConsent = await api.inject({
      method: 'POST',
      url: `/v1/tenant/contacts/${createdContact.json().id}/consents`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
      payload: {
        channel: 'email',
        purpose: 'appointment_updates',
        state: 'granted',
        source: 'web_form',
        policyVersion: '2026-01',
      },
    })
    expect(createdConsent.statusCode).toBe(201)

    const consentHistory = await api.inject({
      method: 'GET',
      url: `/v1/tenant/contacts/${createdContact.json().id}/consents`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
    })
    expect(consentHistory.statusCode).toBe(200)
    expect(consentHistory.json()).toMatchObject([
      { id: createdConsent.json().id, channel: 'email', state: 'granted' },
    ])

    const receptionistContacts = await api.inject({
      method: 'GET',
      url: '/v1/tenant/contacts',
      headers: {
        authorization: 'Bearer tenant-receptionist-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
    })
    expect(receptionistContacts.statusCode).toBe(200)

    const receptionistContact = await api.inject({
      method: 'POST',
      url: '/v1/tenant/contacts',
      headers: {
        authorization: 'Bearer tenant-receptionist-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
      payload: { displayName: 'Reception Contact', phoneE164: '+923001234569' },
    })
    expect(receptionistContact.statusCode).toBe(201)

    const receptionistWrongLocation = await api.inject({
      method: 'GET',
      url: '/v1/tenant/contacts',
      headers: {
        authorization: 'Bearer tenant-receptionist-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationB,
      },
    })
    expect(receptionistWrongLocation.statusCode).toBe(403)

    const createdPractitioner = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
      payload: {
        displayName: 'Route Practitioner',
        registrationAuthority: 'PMDC',
        registrationNumber: `API-${randomUUID()}`,
      },
    })
    expect(createdPractitioner.statusCode).toBe(201)

    const receptionistPractitioners = await api.inject({
      method: 'GET',
      url: '/v1/tenant/practitioners',
      headers: {
        authorization: 'Bearer tenant-receptionist-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
    })
    expect(receptionistPractitioners.statusCode).toBe(403)

    const secondAssignment = await api.inject({
      method: 'POST',
      url: `/v1/tenant/practitioners/${createdPractitioner.json().id}/locations`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
    })
    expect(secondAssignment.statusCode).toBe(201)

    const verifySecondAssignment = await api.inject({
      method: 'PATCH',
      url: `/v1/tenant/practitioners/${createdPractitioner.json().id}/verification`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { verificationStatus: 'verified', evidenceReference: 'api-registry-check' },
    })
    expect(verifySecondAssignment.statusCode).toBe(200)

    const publishSecondAssignment = await api.inject({
      method: 'PATCH',
      url: `/v1/tenant/practitioners/${createdPractitioner.json().id}/location`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { status: 'active', publicationState: 'published' },
    })
    expect(publishSecondAssignment.statusCode).toBe(200)

    const scheduleCategory = await createServiceCategory(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      name: 'HTTP Scheduling Category',
      slug: `http-schedule-${randomUUID().slice(0, 8)}`,
    })
    const scheduleService = await createService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      categoryId: scheduleCategory.id,
      name: 'HTTP Scheduling Service',
      slug: `http-schedule-service-${randomUUID().slice(0, 8)}`,
      defaultDurationMinutes: 30,
    })
    await createLocationOffering(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      serviceId: scheduleService.id,
    })
    await assignPractitionerToService(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      serviceId: scheduleService.id,
      practitionerId: createdPractitioner.json().id,
    })

    const scheduleWrite = await api.inject({
      method: 'PUT',
      url: `/v1/tenant/schedules/${createdPractitioner.json().id}/weekly`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { windows: [{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }] },
    })
    expect(scheduleWrite.statusCode).toBe(200)

    const availableSlots = await api.inject({
      method: 'GET',
      url: `/v1/tenant/available-slots?serviceId=${scheduleService.id}&date=2030-01-07`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
    })
    expect(availableSlots.statusCode).toBe(200)
    expect(availableSlots.json()).toHaveLength(4)

    const scheduleContact = await createContact(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      displayName: 'Schedule Route Contact',
      phoneE164: '+923001234575',
    })
    const appointmentRequest = await api.inject({
      method: 'POST',
      url: '/v1/tenant/appointments',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: {
        contactId: scheduleContact.id,
        serviceId: scheduleService.id,
        practitionerId: createdPractitioner.json().id,
        startsAt: availableSlots.json()[0].startsAt,
        kind: 'request',
      },
    })
    expect(appointmentRequest.statusCode).toBe(201)

    const appointmentConfirmation = await api.inject({
      method: 'POST',
      url: `/v1/tenant/appointments/${appointmentRequest.json().id}/confirm`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: {},
    })
    expect(appointmentConfirmation.statusCode).toBe(200)
    expect(appointmentConfirmation.json().status).toBe('confirmed')

    const refreshedSlots = await listAvailableSlots(application.database, {
      tenantId: tenantA,
      locationId: locationC,
      serviceId: scheduleService.id,
      date: '2030-01-14',
    })
    expect(refreshedSlots.length).toBeGreaterThanOrEqual(2)
    const directAppointment = await createAppointment(application.database, 'tenant-owner-123', {
      tenantId: tenantA,
      locationId: locationC,
      contactId: scheduleContact.id,
      serviceId: scheduleService.id,
      practitionerId: createdPractitioner.json().id,
      startsAt: refreshedSlots[1].startsAt,
      kind: 'request',
    })
    expect(directAppointment.status).toBe('requested')
    const idempotencyKey = `his-${randomUUID()}`
    const idempotentPayload = {
      contactId: scheduleContact.id,
      serviceId: scheduleService.id,
      practitionerId: createdPractitioner.json().id,
      startsAt: refreshedSlots[1].startsAt,
      kind: 'request',
    }
    const idempotentRequests = await Promise.all([0, 1].map((requestIndex) => api.inject({
      method: 'POST',
      url: '/v1/tenant/appointments',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': requestIndex === 0 ? tenantA : tenantA.toUpperCase(),
        'x-location-id': requestIndex === 0 ? locationC : locationC.toUpperCase(),
        'idempotency-key': idempotencyKey,
      },
      payload: requestIndex === 0
        ? idempotentPayload
        : {
            ...idempotentPayload,
            contactId: idempotentPayload.contactId.toUpperCase(),
            serviceId: idempotentPayload.serviceId.toUpperCase(),
            practitionerId: idempotentPayload.practitionerId.toUpperCase(),
          },
    })))
    expect(
      idempotentRequests.map((response) => response.statusCode),
      JSON.stringify({
        slots: refreshedSlots,
        responses: idempotentRequests.map((response) => response.json()),
      }),
    ).toEqual([201, 201])
    expect(idempotentRequests[0].json().id).toBe(idempotentRequests[1].json().id)

    const mismatchedReplay = await api.inject({
      method: 'POST',
      url: '/v1/tenant/appointments',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
        'idempotency-key': idempotencyKey,
      },
      payload: { ...idempotentPayload, startsAt: refreshedSlots[2].startsAt },
    })
    expect(mismatchedReplay.statusCode).toBe(409)
    await bootstrap.query(
      `UPDATE clinic_hub.appointment_idempotency_keys
         SET created_at = statement_timestamp() - interval '2 hours',
           expires_at = statement_timestamp() - interval '1 second'
       WHERE idempotency_key = $1`,
      [idempotencyKey],
    )
    const reusedIdempotencyKey = await api.inject({
      method: 'POST',
      url: '/v1/tenant/appointments',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
        'idempotency-key': idempotencyKey,
      },
      payload: idempotentPayload,
    })
    expect(reusedIdempotencyKey.statusCode).toBe(201)
    expect(reusedIdempotencyKey.json().id).not.toBe(idempotentRequests[0].json().id)
    const keyRecords = await bootstrap.query(
      `SELECT id FROM clinic_hub.appointment_idempotency_keys
       WHERE tenant_id = $1 AND location_id = $2 AND idempotency_key = $3`,
      [tenantA, locationC, idempotencyKey],
    )
    expect(keyRecords.rowCount).toBe(1)

    const appointmentHold = await api.inject({
      method: 'POST',
      url: '/v1/tenant/appointments',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: {
        contactId: scheduleContact.id,
        serviceId: scheduleService.id,
        practitionerId: createdPractitioner.json().id,
        startsAt: refreshedSlots[3].startsAt,
        kind: 'hold',
      },
    })
    expect(appointmentHold.statusCode).toBe(201)
    await bootstrap.query(
      `UPDATE clinic_hub.appointments
       SET hold_expires_at = now() - interval '1 minute'
       WHERE id = $1`,
      [appointmentHold.json().id],
    )
    const expiredConfirmation = await api.inject({
      method: 'POST',
      url: `/v1/tenant/appointments/${appointmentHold.json().id}/confirm`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: {},
    })
    expect(expiredConfirmation.statusCode).toBe(410)

    const invalidCsvRequest = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: {},
    })
    expect(invalidCsvRequest.statusCode).toBe(400)
    expect(invalidCsvRequest.json()).toEqual({ error: 'invalid_csv_request' })

    const missingLocationCsvRequest = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import-preview',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
      },
      payload: { csv: 'display_name,registration_authority,registration_number\nA,PMDC,B' },
    })
    expect(missingLocationCsvRequest.statusCode).toBe(400)
    expect(missingLocationCsvRequest.json()).toEqual({ error: 'location_context_required' })

    const csvRegistration = `CSV-${randomUUID().slice(0, 8)}`
    const formulaRegistration = `=${randomUUID().slice(0, 8)}`
    const practitionerCsv = [
      'display_name,registration_authority,registration_number',
      `"=SUM(1,1)",PMDC,${formulaRegistration}`,
      `Dr CSV Example,PMDC,${csvRegistration}`,
    ].join('\n')
    const csvPreview = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import-preview',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { csv: practitionerCsv },
    })
    expect(csvPreview.statusCode).toBe(200)
    expect(csvPreview.json()).toMatchObject({ validCount: 2, invalidCount: 0, fileErrors: [] })

    const oversizedCsv = [
      'display_name,registration_authority,registration_number',
      ...Array.from({ length: 501 }, (_, index) =>
        `Practitioner ${index},PMDC,ROW-LIMIT-${index}`),
    ].join('\n')
    const oversizedPreview = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import-preview',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { csv: oversizedCsv },
    })
    expect(oversizedPreview.statusCode).toBe(200)
    expect(oversizedPreview.json()).toMatchObject({
      validCount: 0,
      invalidCount: 501,
      totalRows: 501,
      omittedRows: 1,
    })
    expect(oversizedPreview.json().rows).toHaveLength(500)
    expect(oversizedPreview.json().fileErrors).toContain('CSV exceeds the 500-row import limit')

    const invalidCsv = [
      'display_name,registration_authority,registration_number',
      'Valid Name,PMDC,CSV-REG-INVALID-001',
      ',PMDC,CSV-REG-INVALID-002',
    ].join('\n')
    const invalidImport = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { csv: invalidCsv },
    })
    expect(invalidImport.statusCode).toBe(400)
    expect(invalidImport.json().preview.invalidCount).toBe(1)

    const csvImport = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { csv: practitionerCsv },
    })
    expect(csvImport.statusCode).toBe(201)
    expect(csvImport.json().importedCount).toBe(2)
    expect(csvImport.json().practitioners).toEqual(expect.arrayContaining([
      expect.objectContaining({
        displayName: '=SUM(1,1)',
        verificationStatus: 'unverified',
        publicationState: 'draft',
      }),
    ]))
    const repeatedCsvImport = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { csv: practitionerCsv },
    })
    expect(repeatedCsvImport.statusCode).toBe(400)
    const importedCsvRegistrations = await withTenantLocation(
      application.database,
      tenantA,
      locationC,
      (transaction) => transaction
        .selectFrom('practitioners')
        .select('registration_number')
        .where('registration_number', 'in', [formulaRegistration, csvRegistration])
        .execute(),
    )
    expect(importedCsvRegistrations).toHaveLength(2)
    const existingCsvPreview = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import-preview',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { csv: practitionerCsv },
    })
    expect(existingCsvPreview.statusCode).toBe(200)
    expect(existingCsvPreview.json()).toMatchObject({ validCount: 0, invalidCount: 2 })
    expect(existingCsvPreview.json().rows.every((row: { errors: string[] }) =>
      row.errors.includes('Registration already exists in this tenant'),
    )).toBe(true)
    const caseVariantCsv = [
      'display_name,registration_authority,registration_number',
      `Different Name,PMDC,${csvRegistration.toLowerCase()}`,
    ].join('\n')
    const caseVariantImport = await api.inject({
      method: 'POST',
      url: '/v1/tenant/practitioners/import',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { csv: caseVariantCsv },
    })
    expect(caseVariantImport.statusCode).toBe(400)

    const formulaSafeExport = await api.inject({
      method: 'GET',
      url: '/v1/tenant/practitioners/export.csv',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
    })
    expect(formulaSafeExport.statusCode).toBe(200)
    expect(formulaSafeExport.headers['content-type']).toContain('text/csv')
    expect(formulaSafeExport.body).toContain("'=SUM(1,1)")
    expect(formulaSafeExport.body).toContain(`'${formulaRegistration}`)

    const otherLocationExport = await api.inject({
      method: 'GET',
      url: '/v1/tenant/practitioners/export.csv',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
    })
    expect(otherLocationExport.statusCode).toBe(200)
    expect(otherLocationExport.body).not.toContain(csvRegistration)

    const serviceCategory = await api.inject({
      method: 'POST',
      url: '/v1/tenant/catalog/categories',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
      },
      payload: { name: 'API Services', slug: `api-services-${randomUUID().slice(0, 8)}` },
    })
    expect(serviceCategory.statusCode).toBe(201)

    const service = await api.inject({
      method: 'POST',
      url: '/v1/tenant/catalog/services',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
      },
      payload: {
        categoryId: serviceCategory.json().id,
        name: 'API Consultation',
        slug: `api-consultation-${randomUUID().slice(0, 8)}`,
        defaultDurationMinutes: 30,
      },
    })
    expect(service.statusCode).toBe(201)

    const receptionistCatalogRead = await api.inject({
      method: 'GET',
      url: '/v1/tenant/catalog',
      headers: {
        authorization: 'Bearer tenant-receptionist-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
    })
    expect(receptionistCatalogRead.statusCode).toBe(200)

    const serviceOffering = await api.inject({
      method: 'POST',
      url: `/v1/tenant/catalog/services/${service.json().id}/locations`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
      payload: { durationOverrideMinutes: 45, priceAmountMinor: 125000, currencyCode: 'PKR' },
    })
    expect(serviceOffering.statusCode).toBe(201)

    const practitionerService = await api.inject({
      method: 'POST',
      url: `/v1/tenant/catalog/services/${service.json().id}/practitioners/${createdPractitioner.json().id}`,
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
    })
    expect(practitionerService.statusCode).toBe(201)

    const receptionistCatalog = await api.inject({
      method: 'GET',
      url: '/v1/tenant/catalog',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationC,
      },
    })
    expect(receptionistCatalog.json()).toContainEqual(expect.objectContaining({
      serviceId: service.json().id,
      priceAmountMinor: 125000,
      practitioners: expect.arrayContaining([
        expect.objectContaining({ id: createdPractitioner.json().id }),
      ]),
    }))

    const receptionistOfferWrite = await api.inject({
      method: 'POST',
      url: `/v1/tenant/catalog/services/${service.json().id}/locations`,
      headers: {
        authorization: 'Bearer tenant-receptionist-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
      payload: {},
    })
    expect(receptionistOfferWrite.statusCode).toBe(403)

    const locationCatalog = await api.inject({
      method: 'GET',
      url: '/v1/tenant/catalog',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationA,
      },
    })
    expect(locationCatalog.json().some((item: { serviceId: string }) => item.serviceId === service.json().id)).toBe(false)

    const wrongLocation = await api.inject({
      method: 'GET',
      url: '/v1/tenant/contacts',
      headers: {
        authorization: 'Bearer tenant-owner-test-token',
        'x-tenant-id': tenantA,
        'x-location-id': locationB,
      },
    })
    expect(wrongLocation.statusCode).toBe(403)

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

  it('limits support sessions to reasoned, short-lived, read-only tenant snapshots', async () => {
    const started = await api.inject({
      method: 'POST',
      url: `/v1/platform/tenants/${tenantA}/support-sessions`,
      headers: { authorization: 'Bearer platform-test-token' },
      payload: { reason: 'Investigate a tenant-reported location setup issue' },
    })
    expect(started.statusCode).toBe(201)
    const session = started.json()
    expect(new Date(session.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000)

    const snapshot = await api.inject({
      method: 'GET',
      url: `/v1/platform/support-sessions/${session.id}/snapshot`,
      headers: {
        authorization: 'Bearer platform-test-token',
        'x-support-token': session.token,
      },
    })
    expect(snapshot.statusCode).toBe(200)
    expect(snapshot.json().tenant.id).toBe(tenantA)
    expect(snapshot.json().locations.length).toBeGreaterThan(0)
    expect(snapshot.json()).not.toHaveProperty('patients')

    const invalidToken = await api.inject({
      method: 'GET',
      url: `/v1/platform/support-sessions/${session.id}/snapshot`,
      headers: {
        authorization: 'Bearer platform-test-token',
        'x-support-token': 'invalid-support-token',
      },
    })
    expect(invalidToken.statusCode).toBe(403)

    const ended = await api.inject({
      method: 'DELETE',
      url: `/v1/platform/support-sessions/${session.id}`,
      headers: { authorization: 'Bearer platform-test-token' },
    })
    expect(ended.statusCode).toBe(204)
    const revokedSnapshot = await api.inject({
      method: 'GET',
      url: `/v1/platform/support-sessions/${session.id}/snapshot`,
      headers: {
        authorization: 'Bearer platform-test-token',
        'x-support-token': session.token,
      },
    })
    expect(revokedSnapshot.statusCode).toBe(410)
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
