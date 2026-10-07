# Architecture decision records

All seven ADRs are **Proposed (provisional default, pending owner review)**. Their initial defaults were
chosen autonomously without owner approval on 2026-10-07. The owner subsequently accepted Cognito for
the MVP on 2026-10-07; ADR-0003 records that narrow acceptance while its detailed identity design remains
proposed. These ADRs are not permission to create cloud accounts, register domains, connect real
WhatsApp tenants, charge money, deploy, or store real patient data. Recheck provider availability,
legal constraints, and pricing before those actions.

1. [Cloud and region](0001-cloud-and-region.md)
2. [Application and data stack](0002-application-and-data-stack.md)
3. [Identity and access](0003-identity-and-access.md)
4. [Public web and domains](0004-public-web-and-domains.md)
5. [WhatsApp provider](0005-whatsapp-provider.md)
6. [Subscription billing](0006-subscription-billing.md)
7. [Onboarding and lifecycle policies](0007-onboarding-and-lifecycle-policies.md)

Open gates: production cloud/region and backup location; the Mumbai-versus-UAE comparison for Pakistan
latency, residency, and stakeholder/regulator views of health data in India; exact platform domain;
plan tiers/limits/prices; tax-invoice fields; Cloudflare edge validation; WhatsApp tenant-payment
feasibility; and review of lifecycle policies. Do not store real patient data before the production
region decision. Local development and staging may use Mumbai and configuration placeholders.
