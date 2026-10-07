# ADR-0001: Cloud and primary region

- Status: Proposed (provisional default, pending owner review)
- Date: 2026-10-07
- Autonomy note: This proposal was chosen autonomously without owner approval on 2026-10-07.

## Context

The platform targets 20-100 Pakistani tenant organizations and is a custom TypeScript modular monolith on managed cloud services. Region affects latency, residency, backups, cost, and infrastructure code.

## Decision

Propose AWS managed infrastructure. Mumbai (`ap-south-1`) is approved for development and staging only. The production region remains open. Keep the region configurable so switching between Mumbai and UAE (`me-central-1`) does not require application code changes.

## Consequences and gates

- Proposed default: run each environment in one region and disclose its approved data region to tenants. Production region and backup location remain open.
- Before storing any real patient data, compare Mumbai and UAE for latency from Pakistan, data-residency requirements, and how Pakistani clinics and regulators view health data hosted in India.
- Production region selection, legal review of cross-border processing, and backup-region policy are explicit launch gates. Publish the approved locations to tenants; this ADR does not assert Pakistan residency compliance.
- No real patient data may be stored until the production-region comparison and decision are complete.
- No AWS account, infrastructure, or external service is created by this ADR.
