CREATE TABLE clinic_hub.appointment_idempotency_keys (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  appointment_id uuid NOT NULL,
  response_status smallint NOT NULL CHECK (response_status = 201),
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, location_id, idempotency_key),
  FOREIGN KEY (tenant_id, location_id, appointment_id)
    REFERENCES clinic_hub.appointments (tenant_id, location_id, id)
    ON DELETE RESTRICT,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);

CREATE INDEX appointment_idempotency_expiry_idx
  ON clinic_hub.appointment_idempotency_keys (expires_at);

ALTER TABLE clinic_hub.appointment_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.appointment_idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_idempotency_location_isolation ON clinic_hub.appointment_idempotency_keys
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

GRANT SELECT, INSERT, DELETE ON clinic_hub.appointment_idempotency_keys TO clinic_hub_app;