CREATE TABLE clinic_hub.contacts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  preferred_language text,
  external_patient_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, location_id)
    REFERENCES clinic_hub.locations (tenant_id, id) ON DELETE CASCADE,
  CHECK (email IS NULL OR length(email) <= 254),
  CHECK (preferred_language IS NULL OR length(preferred_language) <= 35),
  CHECK (external_patient_ref IS NULL OR external_patient_ref ~ '^[A-Za-z0-9._:-]{1,128}$')
);

CREATE INDEX contacts_tenant_location_created_idx
  ON clinic_hub.contacts (tenant_id, location_id, created_at DESC);

CREATE TABLE clinic_hub.contact_consent_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  purpose text NOT NULL CHECK (purpose IN ('appointment_updates', 'marketing')),
  state text NOT NULL CHECK (state IN ('granted', 'withdrawn')),
  source text NOT NULL CHECK (source IN ('web_form', 'paper', 'verbal', 'staff_entry', 'import')),
  policy_version text CHECK (policy_version IS NULL OR policy_version ~ '^[A-Za-z0-9._:-]{1,64}$'),
  evidence_reference text CHECK (evidence_reference IS NULL OR evidence_reference ~ '^[A-Za-z0-9._:-]{1,128}$'),
  actor_subject text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, contact_id)
    REFERENCES clinic_hub.contacts (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX contact_consent_contact_time_idx
  ON clinic_hub.contact_consent_events (tenant_id, contact_id, recorded_at DESC);

ALTER TABLE clinic_hub.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant_isolation ON clinic_hub.contacts
  FOR ALL TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id())
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());

ALTER TABLE clinic_hub.contact_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.contact_consent_events FORCE ROW LEVEL SECURITY;
CREATE POLICY contact_consent_events_tenant_isolation ON clinic_hub.contact_consent_events
  FOR ALL TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id())
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());

GRANT SELECT, INSERT ON clinic_hub.contacts, clinic_hub.contact_consent_events TO clinic_hub_app;

CREATE FUNCTION clinic_hub.reject_contact_consent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'contact consent events are append-only' USING ERRCODE = '42501';
END
$function$;

CREATE TRIGGER contact_consent_events_append_only
BEFORE UPDATE OR DELETE ON clinic_hub.contact_consent_events
FOR EACH ROW EXECUTE FUNCTION clinic_hub.reject_contact_consent_mutation();