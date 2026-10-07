DROP POLICY session_token_isolation ON clinic_hub.auth_sessions;
CREATE POLICY tenant_session_isolation ON clinic_hub.auth_sessions
  FOR ALL TO clinic_hub_app
  USING (
    identity_realm = 'tenant'
    AND session_hash = NULLIF(current_setting('app.session_hash', true), '')
  )
  WITH CHECK (
    identity_realm = 'tenant'
    AND session_hash = NULLIF(current_setting('app.session_hash', true), '')
  );

CREATE POLICY platform_session_isolation ON clinic_hub.auth_sessions
  FOR ALL TO clinic_hub_platform
  USING (
    identity_realm = 'platform'
    AND session_hash = NULLIF(current_setting('app.session_hash', true), '')
  )
  WITH CHECK (
    identity_realm = 'platform'
    AND session_hash = NULLIF(current_setting('app.session_hash', true), '')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON clinic_hub.auth_sessions TO clinic_hub_platform;
