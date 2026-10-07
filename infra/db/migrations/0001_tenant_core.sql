CREATE TABLE clinic_hub.tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('draft', 'trial', 'active', 'past_due', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinic_hub.locations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE clinic_hub.memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id) ON DELETE CASCADE,
  identity_subject text NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, identity_subject)
);

CREATE TABLE clinic_hub.role_assignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  role_key text NOT NULL CHECK (role_key IN ('tenant_owner', 'tenant_admin', 'location_manager', 'receptionist', 'practitioner', 'billing_admin', 'content_editor')),
  scope text NOT NULL CHECK (scope IN ('tenant', 'location')),
  scope_location_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, membership_id)
    REFERENCES clinic_hub.memberships (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, scope_location_id)
    REFERENCES clinic_hub.locations (tenant_id, id),
  CHECK ((scope = 'tenant' AND scope_location_id IS NULL) OR
         (scope = 'location' AND scope_location_id IS NOT NULL))
);

CREATE TABLE clinic_hub.audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id) ON DELETE CASCADE,
  actor_subject text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX locations_tenant_idx ON clinic_hub.locations (tenant_id);
CREATE INDEX memberships_tenant_idx ON clinic_hub.memberships (tenant_id);
CREATE INDEX role_assignments_tenant_idx ON clinic_hub.role_assignments (tenant_id);
CREATE INDEX audit_events_tenant_time_idx ON clinic_hub.audit_events (tenant_id, occurred_at DESC);

CREATE FUNCTION clinic_hub.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $function$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$function$;

REVOKE ALL ON FUNCTION clinic_hub.current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinic_hub.current_tenant_id() TO clinic_hub_app, clinic_hub_platform;

DO $rls$
DECLARE
  table_name text;
  tenant_filter text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenants', 'locations', 'memberships', 'role_assignments', 'audit_events'] LOOP
    tenant_filter := CASE
      WHEN table_name = 'tenants' THEN 'id = clinic_hub.current_tenant_id()'
      ELSE 'tenant_id = clinic_hub.current_tenant_id()'
    END;
    EXECUTE format('ALTER TABLE clinic_hub.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE clinic_hub.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format($policy$
      CREATE POLICY tenant_isolation ON clinic_hub.%I
      FOR ALL TO clinic_hub_app, clinic_hub_platform
      USING (
        pg_has_role(current_user, 'clinic_hub_platform', 'member')
        OR (
          pg_has_role(current_user, 'clinic_hub_app', 'member')
          AND %s
        )
      )
      WITH CHECK (
        pg_has_role(current_user, 'clinic_hub_platform', 'member')
        OR (
          pg_has_role(current_user, 'clinic_hub_app', 'member')
          AND %s
        )
      )
    $policy$, table_name, tenant_filter, tenant_filter);
  END LOOP;
END
$rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  clinic_hub.tenants,
  clinic_hub.locations,
  clinic_hub.memberships,
  clinic_hub.role_assignments
TO clinic_hub_app, clinic_hub_platform;
GRANT SELECT, INSERT ON clinic_hub.audit_events TO clinic_hub_app, clinic_hub_platform;

CREATE FUNCTION clinic_hub.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '42501';
END
$function$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON clinic_hub.audit_events
FOR EACH ROW EXECUTE FUNCTION clinic_hub.reject_audit_mutation();
