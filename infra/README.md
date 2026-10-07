# Infrastructure

`compose.yaml` starts the local development PostgreSQL service. `db/migrations/` contains the
forward-only tenant, session, invitation, platform-staff, security-event, and RLS schema migrations.

Cloud infrastructure code is intentionally not provisioned in P0. The production region and edge
provider remain open decisions; add the AWS infrastructure package after those launch gates are
approved. No production account, domain, certificate, or service is managed from this directory yet.
