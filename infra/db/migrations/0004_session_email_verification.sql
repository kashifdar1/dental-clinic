ALTER TABLE clinic_hub.auth_sessions
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false;
