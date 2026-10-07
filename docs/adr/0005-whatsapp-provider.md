# ADR-0005: WhatsApp integration

- Status: Proposed (provisional default, pending owner review)
- Date: 2026-10-07
- Autonomy note: This proposal was chosen autonomously without owner approval on 2026-10-07.

## Context

Tenants need inbound requests, reminders, notifications, a staff inbox, booking automation, and human handoff, using their own tenant- or location-specific WhatsApp numbers.

## Decision

- Integrate as a Meta Tech Provider using Embedded Signup v4 and the WhatsApp Cloud API, behind a `WhatsAppProvider` port.
- Each tenant owns its WhatsApp Business Account and number and pays Meta directly. Route location conversations through a location connection, falling back to a tenant-level connection.
- Verify webhook signatures on the raw body, acknowledge quickly, persist and deduplicate provider events, then process asynchronously.
- Use approved templates outside the customer-service window; enforce consent, opt-out, rate limits, message status, and metering.
- Bot/AI functionality is business-scoped booking and support, never a general-purpose assistant or medical advice. Do not train models on WhatsApp data.

## Consequences and gates

- Begin Meta Business Verification and App Review in Phase 0; use Embedded Signup v4 only.
- Validate that Pakistani pilot tenants can attach payment methods to their WABAs before promising self-service messaging. If not, evaluate an approved BSP/Solution Partner route as a new ADR.
- Meta's charges are not part of our subscription on this route. Our entitlements meter platform usage separately.
- Do not create a Meta app, connect a real tenant account, or send messages without the required external-action approval.
