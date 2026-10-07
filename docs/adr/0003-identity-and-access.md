# ADR-0003: Identity and authorization

- Status: Proposed (provisional default, pending owner review)
- Date: 2026-10-07
- Autonomy note: The initial design was chosen autonomously without owner approval on 2026-10-07; the owner accepted Cognito for the MVP on 2026-10-07.

## Context

The first release has platform administrators and tenant management users. Receptionists, practitioners, and other staff must be addable through RBAC without replacing the identity model.

## Decision

- Use AWS Cognito User Pools for MVP authentication; the owner accepted Cognito for the MVP on 2026-10-07. Separate platform-staff and tenant-user pools and app clients are proposed details.
- Store tenant memberships, location-scoped role assignments, and permissions in the application database. Tokens identify the user; they do not authorize a tenant or location by themselves.
- Resolve active membership and tenant scope server-side on every request. Enforce permissions at route and service boundaries, then enforce row isolation with PostgreSQL RLS.
- Require MFA for platform administrators. Support MFA for tenant owners and administrators.

## Consequences and gates

- Platform and tenant sessions use separate trusted boundaries and secure, revocable server-side session handling.
- Future roles are data assigned from a permission catalog; they do not require new Cognito groups or schema rewrites.
- Cognito password hashes cannot be exported. Leaving Cognito later means forced password resets or lazy migration when users next sign in.
- Keep authentication behind an application-owned identity interface. Cognito SDK calls and provider-specific claims must stay inside the identity adapter; other modules depend only on the interface.
- Confirm Cognito feature availability and deployment-region support during the foundation spike before creating pools.
