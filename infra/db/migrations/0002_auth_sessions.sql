CREATE TABLE clinic_hub.auth_sessions (
  session_hash text PRIMARY KEY CHECK (session_hash ~ '^[a-f0-9]{64}$'),
  identity_subject text NOT NULL,
  identity_realm text NOT NULL CHECK (identity_realm IN ('tenant', 'platform')),
  email text,
  mfa_verified boolean NOT NULL DEFAULT false,
  csrf_hash text NOT NULL CHECK (csrf_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX auth_sessions_expiry_idx ON clinic_hub.auth_sessions (expires_at);

ALTER TABLE clinic_hub.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.auth_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY session_token_isolation ON clinic_hub.auth_sessions
  FOR ALL TO clinic_hub_app
  USING (
    session_hash = NULLIF(current_setting('app.session_hash', true), '')
  )
  WITH CHECK (
    session_hash = NULLIF(current_setting('app.session_hash', true), '')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_hub.auth_sessions TO clinic_hub_app;
