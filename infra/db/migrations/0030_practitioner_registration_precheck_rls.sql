CREATE POLICY practitioner_registration_precheck
ON clinic_hub.practitioners
FOR SELECT TO clinic_hub_migrator
USING (tenant_id = clinic_hub.current_tenant_id());