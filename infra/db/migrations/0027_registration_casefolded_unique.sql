ALTER TABLE clinic_hub.practitioners
  DROP CONSTRAINT practitioners_tenant_id_registration_authority_registration_key;

CREATE UNIQUE INDEX practitioners_registration_casefolded_idx
  ON clinic_hub.practitioners (
    tenant_id,
    registration_authority,
    lower(registration_number)
  );