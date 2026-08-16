export interface PolicyProfile {
  id: string
  label: string
  jurisdiction: string
  description: string
}

/**
 * Policy profiles are configuration templates, not certifications.
 * A production API should supply this registry and enforce its controls.
 */
export const POLICY_PROFILES: PolicyProfile[] = [
  {
    id: 'privacy-baseline',
    label: 'Privacy baseline',
    jurisdiction: 'Organization defined',
    description: 'Consent, access control, auditability, and retention metadata.',
  },
  {
    id: 'hipaa-readiness',
    label: 'HIPAA readiness',
    jurisdiction: 'United States',
    description: 'Configuration marker for HIPAA-oriented operational controls.',
  },
  {
    id: 'gdpr-readiness',
    label: 'GDPR readiness',
    jurisdiction: 'EEA / United Kingdom',
    description: 'Configuration marker for data-subject and privacy controls.',
  },
]

export function getPolicyProfiles(ids: string[]): PolicyProfile[] {
  return ids
    .map((id) => POLICY_PROFILES.find((profile) => profile.id === id))
    .filter((profile): profile is PolicyProfile => Boolean(profile))
}
