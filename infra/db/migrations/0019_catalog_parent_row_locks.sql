CREATE OR REPLACE FUNCTION clinic_hub.require_active_service_assignments()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  offering_status text;
  practitioner_status text;
  verification_status text;
  publication_state text;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT service_offering.status INTO offering_status
    FROM clinic_hub.location_services AS service_offering
    WHERE service_offering.tenant_id = NEW.tenant_id
      AND service_offering.location_id = NEW.location_id
      AND service_offering.service_id = NEW.service_id
    FOR UPDATE;
    SELECT practitioner_assignment.status,
           practitioner_assignment.verification_status,
           practitioner_assignment.publication_state
      INTO practitioner_status, verification_status, publication_state
    FROM clinic_hub.practitioner_locations AS practitioner_assignment
    WHERE practitioner_assignment.tenant_id = NEW.tenant_id
      AND practitioner_assignment.location_id = NEW.location_id
      AND practitioner_assignment.practitioner_id = NEW.practitioner_id
    FOR UPDATE;
    IF offering_status IS DISTINCT FROM 'active'
       OR practitioner_status IS DISTINCT FROM 'active'
       OR verification_status IS DISTINCT FROM 'verified'
       OR publication_state IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'active practitioner services require an active, verified and published practitioner'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;