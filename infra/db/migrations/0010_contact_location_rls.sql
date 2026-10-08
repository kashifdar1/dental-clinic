CREATE FUNCTION clinic_hub.current_location_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $function$
  SELECT NULLIF(current_setting('app.location_id', true), '')::uuid
$function$;

REVOKE ALL ON FUNCTION clinic_hub.current_location_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinic_hub.current_location_id() TO clinic_hub_app;

DROP POLICY contacts_tenant_isolation ON clinic_hub.contacts;
CREATE POLICY contacts_location_isolation ON clinic_hub.contacts
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

DROP POLICY contact_consent_events_tenant_isolation ON clinic_hub.contact_consent_events;
CREATE POLICY contact_consent_events_location_isolation ON clinic_hub.contact_consent_events
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM clinic_hub.contacts AS contact
      WHERE contact.tenant_id = contact_consent_events.tenant_id
        AND contact.id = contact_consent_events.contact_id
        AND contact.location_id = clinic_hub.current_location_id()
    )
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM clinic_hub.contacts AS contact
      WHERE contact.tenant_id = contact_consent_events.tenant_id
        AND contact.id = contact_consent_events.contact_id
        AND contact.location_id = clinic_hub.current_location_id()
    )
  );