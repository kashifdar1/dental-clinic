CREATE OR REPLACE FUNCTION clinic_hub.deactivate_practitioner_services_for_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'location_services' THEN
    IF OLD.status = 'active' AND NEW.status = 'inactive' THEN
      UPDATE clinic_hub.practitioner_services
      SET status = 'inactive'
      WHERE tenant_id = NEW.tenant_id
        AND location_id = NEW.location_id
        AND service_id = NEW.service_id
        AND status = 'active';
    END IF;
  ELSIF TG_TABLE_NAME = 'practitioner_locations' THEN
    IF OLD.status = 'active'
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
  END IF;
  RETURN NEW;
END
$function$;