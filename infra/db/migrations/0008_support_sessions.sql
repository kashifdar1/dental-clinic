CREATE TABLE clinic_hub.support_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id),
  platform_subject text NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 20 AND 500),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);

CREATE INDEX support_sessions_expiry_idx ON clinic_hub.support_sessions (expires_at);
ALTER TABLE clinic_hub.support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.support_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY support_sessions_platform_only ON clinic_hub.support_sessions
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON clinic_hub.support_sessions TO clinic_hub_platform;

CREATE FUNCTION clinic_hub.allow_support_session_revoke()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.platform_subject IS DISTINCT FROM OLD.platform_subject
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'support sessions may only be revoked once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER support_session_revoke_only
BEFORE UPDATE ON clinic_hub.support_sessions
FOR EACH ROW EXECUTE FUNCTION clinic_hub.allow_support_session_revoke();
