# ADR-0006: Subscription billing in Pakistan

- Status: Proposed (provisional default, pending owner review)
- Date: 2026-10-07
- Autonomy note: This proposal was chosen autonomously without owner approval on 2026-10-07.

## Context

Subscriptions and entitlements must control tenant resources. Stripe does not currently support Pakistan-based merchant accounts, and the initial plan tiers and prices are owner-defined.

## Decision

- Define a provider-agnostic `BillingProvider` port and keep plans, immutable plan versions, subscriptions, entitlements, usage events, and invoices in the platform domain.
- Launch with operator-issued invoices and manual bank transfer/Raast reconciliation. Add a local payment-gateway adapter only after due diligence.
- Do not hard-code plan prices or promise automatic recurring collection until the owner and accountant approve tiers, tax-invoice fields, and a supported payment route.
- Entitlements gate platform resources; Meta WhatsApp message charges stay directly between Meta and each tenant under ADR-0005.

## Consequences and gates

- Self-onboarding may select a plan and enter a trial/activation-request state before automatic billing exists.
- Downgrades never delete tenant data; over-limit resources become read-only or unpublished under a defined grace policy.
- Confirm local payment, tax, invoicing, and consumer-protection requirements with an accountant before charging tenants.
