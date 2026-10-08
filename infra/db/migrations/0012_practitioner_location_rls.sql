ALTER TABLE clinic_hub.practitioner_locations
  DROP CONSTRAINT practitioner_locations_tenant_id_practitioner_id_fkey;
ALTER TABLE clinic_hub.practitioner_locations
  ADD CONSTRAINT practitioner_locations_practitioner_fk
  FOREIGN KEY (tenant_id, practitioner_id)
  REFERENCES clinic_hub.practitioners (tenant_id, id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

DROP POLICY practitioners_tenant_isolation ON clinic_hub.practitioners;
CREATE POLICY practitioners_location_isolation ON clinic_hub.practitioners
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM clinic_hub.practitioner_locations AS assignment
      WHERE assignment.tenant_id = practitioners.tenant_id
        AND assignment.practitioner_id = practitioners.id
        AND assignment.location_id = clinic_hub.current_location_id()
    )
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM clinic_hub.practitioner_locations AS assignment
      WHERE assignment.tenant_id = practitioners.tenant_id
        AND assignment.practitioner_id = practitioners.id
        AND assignment.location_id = clinic_hub.current_location_id()
    )
  );