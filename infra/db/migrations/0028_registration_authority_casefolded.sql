DROP INDEX clinic_hub.practitioners_registration_casefolded_idx;
CREATE UNIQUE INDEX practitioners_registration_casefolded_idx
  ON clinic_hub.practitioners (
    tenant_id,
    upper(registration_authority),
    lower(registration_number)
  );