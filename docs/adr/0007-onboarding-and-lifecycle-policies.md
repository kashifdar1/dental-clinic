# ADR-0007: Initial onboarding and lifecycle policies

- Status: Proposed (provisional default, pending owner review)
- Date: 2026-10-07
- Autonomy note: This proposal was chosen autonomously without owner approval on 2026-10-07.

## Context

Self-onboarding publishes healthcare-provider information to the public. The platform also needs predictable, reversible behavior for overdue billing and abuse-related suspension.

## Decision

- Manually verify each tenant's facility and practitioner credentials before its first public publish. Automate only after reliable official verification sources are established.
- Support Urdu public pages with full RTL direction as well as English LTR.
- Separate `past_due` from an operator/security `suspended` state. Give `past_due` a seven-day grace period with the public site and inbound booking requests available; block tenant resource expansion. After hard suspension, stop new booking intake and all outbound messaging, unpublish the site, preserve tenant data, and provide a controlled export/support path.
- Security or legal suspension may take effect immediately and bypass the billing grace period; every suspension and override is audited.

## Consequences and gates

- The exact verification evidence and retention period require legal/product review before onboarding real tenants.
- The public site and booking behavior during a billing grace period must be visible to tenant admins.
- Never collect clinical records or promise verification/compliance beyond the checks actually performed.
