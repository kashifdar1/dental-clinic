ALTER TABLE clinic_hub.contacts
  DROP CONSTRAINT contacts_tenant_id_location_id_fkey;
ALTER TABLE clinic_hub.contacts
  ADD CONSTRAINT contacts_location_restrict_fk
  FOREIGN KEY (tenant_id, location_id)
  REFERENCES clinic_hub.locations (tenant_id, id)
  ON DELETE RESTRICT;

ALTER TABLE clinic_hub.contact_consent_events
  DROP CONSTRAINT contact_consent_events_tenant_id_contact_id_fkey;
ALTER TABLE clinic_hub.contact_consent_events
  ADD CONSTRAINT contact_consent_restrict_fk
  FOREIGN KEY (tenant_id, contact_id)
  REFERENCES clinic_hub.contacts (tenant_id, id)
  ON DELETE RESTRICT;