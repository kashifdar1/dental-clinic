CREATE POLICY identity_membership_select ON clinic_hub.memberships
  FOR SELECT TO clinic_hub_app
  USING (
    status = 'active'
    AND identity_subject = NULLIF(current_setting('app.identity_subject', true), '')
  );

CREATE POLICY identity_role_assignment_select ON clinic_hub.role_assignments
  FOR SELECT TO clinic_hub_app
  USING (
    EXISTS (
      SELECT 1
      FROM clinic_hub.memberships AS membership
      WHERE membership.id = role_assignments.membership_id
        AND membership.tenant_id = role_assignments.tenant_id
        AND membership.status = 'active'
        AND membership.identity_subject = NULLIF(current_setting('app.identity_subject', true), '')
    )
  );

CREATE POLICY identity_tenant_select ON clinic_hub.tenants
  FOR SELECT TO clinic_hub_app
  USING (
    EXISTS (
      SELECT 1
      FROM clinic_hub.memberships AS membership
      WHERE membership.tenant_id = tenants.id
        AND membership.status = 'active'
        AND membership.identity_subject = NULLIF(current_setting('app.identity_subject', true), '')
    )
  );
