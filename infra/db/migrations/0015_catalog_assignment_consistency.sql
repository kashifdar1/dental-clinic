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
      AND service_offering.service_id = NEW.service_id;
    SELECT practitioner_assignment.status,
           practitioner_assignment.verification_status,
           practitioner_assignment.publication_state
      INTO practitioner_status, verification_status, publication_state
    FROM clinic_hub.practitioner_locations AS practitioner_assignment
    WHERE practitioner_assignment.tenant_id = NEW.tenant_id
      AND practitioner_assignment.location_id = NEW.location_id
      AND practitioner_assignment.practitioner_id = NEW.practitioner_id;
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

CREATE FUNCTION clinic_hub.deactivate_practitioner_services_for_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'location_services' AND OLD.status = 'active' AND NEW.status = 'inactive' THEN
    UPDATE clinic_hub.practitioner_services
    SET status = 'inactive'
    WHERE tenant_id = NEW.tenant_id
      AND location_id = NEW.location_id
      AND service_id = NEW.service_id
      AND status = 'active';
  ELSIF TG_TABLE_NAME = 'practitioner_locations'
    AND OLD.status = 'active'
    AND (NEW.status <> 'active'
      OR NEW.verification_status <> 'verified'
      OR NEW.publication_state <> 'published') THEN
    UPDATE clinic_hub.practitioner_services
    SET status = 'inactive'
    WHERE tenant_id = NEW.tenant_id
      AND location_id = NEW.location_id
      AND practitioner_id = NEW.practitioner_id
      AND status = 'active';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER location_service_deactivates_assignments
AFTER UPDATE OF status ON clinic_hub.location_services
FOR EACH ROW EXECUTE FUNCTION clinic_hub.deactivate_practitioner_services_for_parent();

CREATE TRIGGER practitioner_location_deactivates_services
AFTER UPDATE OF status, verification_status, publication_state ON clinic_hub.practitioner_locations
FOR EACH ROW EXECUTE FUNCTION clinic_hub.deactivate_practitioner_services_for_parent();