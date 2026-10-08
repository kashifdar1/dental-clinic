CREATE TABLE clinic_hub.practitioners (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  registration_authority text NOT NULL CHECK (length(trim(registration_authority)) BETWEEN 1 AND 80),
  registration_number text NOT NULL CHECK (length(trim(registration_number)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, registration_authority, registration_number)
);

CREATE TABLE clinic_hub.practitioner_locations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_by_subject text,
  publication_state text NOT NULL DEFAULT 'draft'
    CHECK (publication_state IN ('draft', 'published', 'unpublished')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, practitioner_id, location_id),
  CHECK (
    (verification_status = 'verified' AND verified_at IS NOT NULL AND verified_by_subject IS NOT NULL)
    OR
    (verification_status <> 'verified' AND verified_at IS NULL AND verified_by_subject IS NULL)
  ),
  FOREIGN KEY (tenant_id, practitioner_id)
    REFERENCES clinic_hub.practitioners (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, location_id)
    REFERENCES clinic_hub.locations (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX practitioner_locations_location_idx
  ON clinic_hub.practitioner_locations (tenant_id, location_id, status, publication_state);

ALTER TABLE clinic_hub.practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.practitioners FORCE ROW LEVEL SECURITY;
CREATE POLICY practitioners_tenant_isolation ON clinic_hub.practitioners
  FOR ALL TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id())
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());

ALTER TABLE clinic_hub.practitioner_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.practitioner_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY practitioner_locations_location_isolation ON clinic_hub.practitioner_locations
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

GRANT SELECT, INSERT, UPDATE ON
  clinic_hub.practitioners,
  clinic_hub.practitioner_locations
TO clinic_hub_app;

CREATE FUNCTION clinic_hub.require_verified_practitioner_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.publication_state = 'published' THEN
    IF NEW.verification_status <> 'verified' THEN
      RAISE EXCEPTION 'only verified practitioners may be published' USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'inactive practitioners cannot be published' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER practitioner_publication_requires_verification
BEFORE INSERT OR UPDATE ON clinic_hub.practitioner_locations
FOR EACH ROW EXECUTE FUNCTION clinic_hub.require_verified_practitioner_publication();