CREATE TABLE clinic_hub.service_categories (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE clinic_hub.services (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'),
  default_duration_minutes integer NOT NULL CHECK (default_duration_minutes BETWEEN 5 AND 480),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, slug),
  FOREIGN KEY (tenant_id, category_id)
    REFERENCES clinic_hub.service_categories (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE clinic_hub.location_services (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  service_id uuid NOT NULL,
  duration_override_minutes integer CHECK (
    duration_override_minutes IS NULL OR duration_override_minutes BETWEEN 5 AND 480
  ),
  price_amount_minor bigint CHECK (
    price_amount_minor IS NULL OR price_amount_minor BETWEEN 0 AND 9007199254740991
  ),
  currency_code text CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, location_id, service_id),
  CHECK ((price_amount_minor IS NULL) = (currency_code IS NULL)),
  FOREIGN KEY (tenant_id, location_id)
    REFERENCES clinic_hub.locations (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, service_id)
    REFERENCES clinic_hub.services (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE clinic_hub.practitioner_services (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  service_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, location_id, service_id, practitioner_id),
  FOREIGN KEY (tenant_id, location_id, service_id)
    REFERENCES clinic_hub.location_services (tenant_id, location_id, service_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, practitioner_id, location_id)
    REFERENCES clinic_hub.practitioner_locations (tenant_id, practitioner_id, location_id) ON DELETE CASCADE
);

CREATE INDEX services_category_idx ON clinic_hub.services (tenant_id, category_id, name);
CREATE INDEX location_services_location_idx
  ON clinic_hub.location_services (tenant_id, location_id, status);
CREATE INDEX practitioner_services_location_idx
  ON clinic_hub.practitioner_services (tenant_id, location_id, service_id, status);

ALTER TABLE clinic_hub.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.service_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY service_categories_tenant_isolation ON clinic_hub.service_categories
  FOR ALL TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id())
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());

ALTER TABLE clinic_hub.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.services FORCE ROW LEVEL SECURITY;
CREATE POLICY services_tenant_isolation ON clinic_hub.services
  FOR ALL TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id())
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());

ALTER TABLE clinic_hub.location_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.location_services FORCE ROW LEVEL SECURITY;
CREATE POLICY location_services_location_isolation ON clinic_hub.location_services
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

ALTER TABLE clinic_hub.practitioner_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.practitioner_services FORCE ROW LEVEL SECURITY;
CREATE POLICY practitioner_services_location_isolation ON clinic_hub.practitioner_services
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

GRANT SELECT, INSERT ON clinic_hub.service_categories, clinic_hub.services TO clinic_hub_app;
GRANT SELECT, INSERT, UPDATE ON
  clinic_hub.location_services,
  clinic_hub.practitioner_services
TO clinic_hub_app;

CREATE FUNCTION clinic_hub.require_active_service_assignments()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  offering_status text;
  practitioner_status text;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT service_offering.status INTO offering_status
    FROM clinic_hub.location_services AS service_offering
    WHERE service_offering.tenant_id = NEW.tenant_id
      AND service_offering.location_id = NEW.location_id
      AND service_offering.service_id = NEW.service_id;
    SELECT practitioner_assignment.status INTO practitioner_status
    FROM clinic_hub.practitioner_locations AS practitioner_assignment
    WHERE practitioner_assignment.tenant_id = NEW.tenant_id
      AND practitioner_assignment.location_id = NEW.location_id
      AND practitioner_assignment.practitioner_id = NEW.practitioner_id;
    IF offering_status IS DISTINCT FROM 'active'
       OR practitioner_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'active practitioner services require active location assignments'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER practitioner_service_requires_active_assignments
BEFORE INSERT OR UPDATE ON clinic_hub.practitioner_services
FOR EACH ROW EXECUTE FUNCTION clinic_hub.require_active_service_assignments();