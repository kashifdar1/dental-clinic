CREATE FUNCTION clinic_hub.find_existing_practitioner_registration_rows(
  requested_tenant_id uuid,
  requested_authorities text[],
  requested_numbers text[]
)
RETURNS TABLE (line_number bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, clinic_hub
AS $function$
  SELECT supplied.line_number
  FROM unnest(requested_authorities, requested_numbers)
    WITH ORDINALITY AS supplied(registration_authority, registration_number, line_number)
  WHERE requested_tenant_id = clinic_hub.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM clinic_hub.practitioners AS practitioner
      WHERE practitioner.tenant_id = requested_tenant_id
        AND upper(practitioner.registration_authority) = upper(supplied.registration_authority)
        AND lower(practitioner.registration_number) = lower(supplied.registration_number)
    )
$function$;

ALTER FUNCTION clinic_hub.find_existing_practitioner_registration_rows(uuid, text[], text[])
  OWNER TO clinic_hub_migrator;
REVOKE ALL ON FUNCTION clinic_hub.find_existing_practitioner_registration_rows(uuid, text[], text[])
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinic_hub.find_existing_practitioner_registration_rows(uuid, text[], text[])
  TO clinic_hub_app;