import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import type { AuthenticatedIdentity } from '@clinic-hub/shared'
import type { ApiDatabase } from '../db/schema.js'
import { withSession } from './with-session.js'

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000

export interface SessionRecord extends AuthenticatedIdentity {
  csrfHash: string
  expiresAt: Date
}

export interface NewSession {
  sessionToken: string
  csrfToken: string
  record: SessionRecord
}

export interface SessionStore {
  create(identity: AuthenticatedIdentity, now?: Date): Promise<NewSession>
  load(sessionToken: string, now?: Date): Promise<SessionRecord | null>
  revoke(sessionToken: string, now?: Date): Promise<void>
  verifyCsrf(record: SessionRecord, csrfToken: string): boolean
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function createSessionStore(database: Kysely<ApiDatabase>): SessionStore {
  return {
    async create(identity, now = new Date()) {
      const sessionToken = randomBytes(32).toString('base64url')
      const csrfToken = randomBytes(32).toString('base64url')
      const sessionHash = hash(sessionToken)
      const csrfHash = hash(csrfToken)
      const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS)

      await withSession(database, sessionHash, (transaction) =>
        transaction
          .insertInto('auth_sessions')
          .values({
            session_hash: sessionHash,
            identity_subject: identity.subject,
            identity_realm: identity.realm,
            email: identity.email ?? null,
            email_verified: identity.emailVerified,
            mfa_verified: identity.mfaVerified,
            csrf_hash: csrfHash,
            expires_at: expiresAt.toISOString(),
            revoked_at: null,
          })
          .execute(),
      )

      return {
        sessionToken,
        csrfToken,
        record: { ...identity, csrfHash, expiresAt },
      }
    },

    async load(sessionToken, now = new Date()) {
      const sessionHash = hash(sessionToken)
      const session = await withSession(database, sessionHash, (transaction) =>
        transaction
          .selectFrom('auth_sessions')
          .select([
            'identity_subject',
            'identity_realm',
            'email',
            'email_verified',
            'mfa_verified',
            'csrf_hash',
            'expires_at',
            'revoked_at',
          ])
          .where('expires_at', '>', now)
          .where('revoked_at', 'is', null)
          .executeTakeFirst(),
      )
      if (!session) return null

      return {
        subject: session.identity_subject,
        realm: session.identity_realm,
        email: session.email ?? undefined,
        emailVerified: session.email_verified,
        mfaVerified: session.mfa_verified,
        csrfHash: session.csrf_hash,
        expiresAt: session.expires_at,
      }
    },

    async revoke(sessionToken, now = new Date()) {
      const sessionHash = hash(sessionToken)
      await withSession(database, sessionHash, (transaction) =>
        transaction
          .updateTable('auth_sessions')
          .set({ revoked_at: now.toISOString() })
          .where('revoked_at', 'is', null)
          .execute(),
      )
    },

    verifyCsrf(record, csrfToken) {
      const actual = Buffer.from(hash(csrfToken), 'hex')
      const expected = Buffer.from(record.csrfHash, 'hex')
      return actual.length === expected.length && timingSafeEqual(actual, expected)
    },
  }
}

export async function clearExpiredSessions(
  database: Kysely<ApiDatabase>,
  before = new Date(),
): Promise<void> {
  await sql`DELETE FROM clinic_hub.auth_sessions WHERE expires_at <= ${before.toISOString()} OR revoked_at IS NOT NULL`.execute(
    database,
  )
}
