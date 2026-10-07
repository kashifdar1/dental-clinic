CREATE TABLE clinic_hub.invitations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_key text NOT NULL CHECK (role_key IN ('tenant_owner', 'tenant_admin', 'location_manager', 'receptionist', 'practitioner', 'billing_admin', 'content_editor')),
  scope text NOT NULL CHECK (scope IN ('tenant', 'location')),
  scope_location_id uuid,
  invited_by_subject text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, scope_location_id)
    REFERENCES clinic_hub.locations (tenant_id, id),
  CHECK ((scope = 'tenant' AND scope_location_id IS NULL) OR
         (scope = 'location' AND scope_location_id IS NOT NULL)),
  CHECK (role_key <> 'tenant_owner' OR scope = 'tenant')
);

CREATE UNIQUE INDEX invitations_pending_email_idx
  ON clinic_hub.invitations (tenant_id, lower(email))
  WHERE status = 'pending';
CREATE INDEX invitations_expiry_idx ON clinic_hub.invitations (expires_at);
ALTER TABLE clinic_hub.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_tenant_isolation ON clinic_hub.invitations
  FOR ALL TO clinic_hub_app, clinic_hub_platform
  USING (
    pg_has_role(current_user, 'clinic_hub_platform', 'member')
    OR (
      pg_has_role(current_user, 'clinic_hub_app', 'member')
      AND tenant_id = clinic_hub.current_tenant_id()
    )
  )
  WITH CHECK (
    pg_has_role(current_user, 'clinic_hub_platform', 'member')
    OR (
      pg_has_role(current_user, 'clinic_hub_app', 'member')
      AND tenant_id = clinic_hub.current_tenant_id()
    )
  );
GRANT SELECT, INSERT, UPDATE ON clinic_hub.invitations TO clinic_hub_app, clinic_hub_platform;

CREATE FUNCTION clinic_hub.resolve_invitation_tenant(invitation_token_hash text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, clinic_hub
AS $function$
  SELECT tenant_id
  FROM clinic_hub.invitations
  WHERE token_hash = invitation_token_hash
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1
$function$;
ALTER FUNCTION clinic_hub.resolve_invitation_tenant(text) OWNER TO clinic_hub_migrator;
REVOKE ALL ON FUNCTION clinic_hub.resolve_invitation_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinic_hub.resolve_invitation_tenant(text) TO clinic_hub_app;

CREATE TABLE clinic_hub.platform_staff (
  id uuid PRIMARY KEY,
  identity_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clinic_hub.platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.platform_staff FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_staff_only ON clinic_hub.platform_staff
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON clinic_hub.platform_staff TO clinic_hub_platform;

CREATE TABLE clinic_hub.security_events (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  actor_subject text,
  identity_realm text CHECK (identity_realm IN ('tenant', 'platform') OR identity_realm IS NULL),
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_events_time_idx ON clinic_hub.security_events (occurred_at DESC);
ALTER TABLE clinic_hub.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.security_events FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_security_events_only ON clinic_hub.security_events
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON clinic_hub.security_events TO clinic_hub_platform;

CREATE FUNCTION clinic_hub.reject_security_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'security_events is append-only' USING ERRCODE = '42501';
END
$function$;
CREATE TRIGGER security_events_append_only
BEFORE UPDATE OR DELETE ON clinic_hub.security_events
FOR EACH ROW EXECUTE FUNCTION clinic_hub.reject_security_event_mutation();
