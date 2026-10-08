CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE clinic_hub.schedules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, practitioner_id, location_id)
    REFERENCES clinic_hub.practitioner_locations (tenant_id, practitioner_id, location_id)
    ON DELETE CASCADE,
  EXCLUDE USING gist (
    tenant_id WITH =,
    location_id WITH =,
    practitioner_id WITH =,
    day_of_week WITH =,
    tsrange(
      timestamp '2000-01-02' + start_time,
      timestamp '2000-01-02' + end_time,
      '[)'
    ) WITH &&
  )
);

CREATE TABLE clinic_hub.schedule_exceptions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  exception_date date NOT NULL,
  is_closed boolean NOT NULL,
  start_time time,
  end_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (is_closed AND start_time IS NULL AND end_time IS NULL)
    OR
    (NOT is_closed AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  ),
  UNIQUE (tenant_id, location_id, practitioner_id, exception_date),
  FOREIGN KEY (tenant_id, practitioner_id, location_id)
    REFERENCES clinic_hub.practitioner_locations (tenant_id, practitioner_id, location_id)
    ON DELETE CASCADE
);

ALTER TABLE clinic_hub.contacts
  ADD CONSTRAINT contacts_location_identity_key UNIQUE (tenant_id, location_id, id);

CREATE TABLE clinic_hub.appointments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  service_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN (
    'requested', 'held', 'confirmed', 'cancelled', 'declined', 'expired', 'rescheduled'
  )),
  hold_expires_at timestamptz,
  rescheduled_from_id uuid,
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  CHECK ((status = 'held' AND hold_expires_at IS NOT NULL) OR
         (status <> 'held' AND hold_expires_at IS NULL)),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, location_id, id),
  FOREIGN KEY (tenant_id, location_id, contact_id)
    REFERENCES clinic_hub.contacts (tenant_id, location_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, location_id, service_id, practitioner_id)
    REFERENCES clinic_hub.practitioner_services (tenant_id, location_id, service_id, practitioner_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, rescheduled_from_id)
    REFERENCES clinic_hub.appointments (tenant_id, id) ON DELETE RESTRICT,
  EXCLUDE USING gist (
    tenant_id WITH =,
    practitioner_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('held', 'confirmed'))
);

CREATE TABLE clinic_hub.appointment_status_history (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  previous_status text CHECK (previous_status IN (
    'requested', 'held', 'confirmed', 'cancelled', 'declined', 'expired', 'rescheduled'
  )),
  new_status text NOT NULL CHECK (new_status IN (
    'requested', 'held', 'confirmed', 'cancelled', 'declined', 'expired', 'rescheduled'
  )),
  actor_subject text NOT NULL,
  reason_code text CHECK (reason_code IS NULL OR reason_code ~ '^[a-z0-9._:-]{1,64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, location_id, appointment_id)
    REFERENCES clinic_hub.appointments (tenant_id, location_id, id) ON DELETE RESTRICT
);

CREATE INDEX schedules_practitioner_day_idx
  ON clinic_hub.schedules (tenant_id, location_id, practitioner_id, day_of_week);
CREATE INDEX schedule_exceptions_date_idx
  ON clinic_hub.schedule_exceptions (tenant_id, location_id, exception_date);
CREATE INDEX appointments_location_start_idx
  ON clinic_hub.appointments (tenant_id, location_id, starts_at);
CREATE INDEX appointments_hold_expiry_idx
  ON clinic_hub.appointments (tenant_id, practitioner_id, hold_expires_at)
  WHERE status = 'held';
CREATE INDEX appointment_history_appointment_time_idx
  ON clinic_hub.appointment_status_history (tenant_id, appointment_id, occurred_at);

ALTER TABLE clinic_hub.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY schedules_location_isolation ON clinic_hub.schedules
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

ALTER TABLE clinic_hub.schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.schedule_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY schedule_exceptions_location_isolation ON clinic_hub.schedule_exceptions
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

ALTER TABLE clinic_hub.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_location_isolation ON clinic_hub.appointments
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

ALTER TABLE clinic_hub.appointment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.appointment_status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_history_location_isolation ON clinic_hub.appointment_status_history
  FOR ALL TO clinic_hub_app
  USING (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  )
  WITH CHECK (
    tenant_id = clinic_hub.current_tenant_id()
    AND location_id = clinic_hub.current_location_id()
  );

GRANT SELECT, INSERT, DELETE ON clinic_hub.schedules TO clinic_hub_app;
GRANT SELECT, INSERT, DELETE ON clinic_hub.schedule_exceptions TO clinic_hub_app;
GRANT SELECT, INSERT, UPDATE ON clinic_hub.appointments TO clinic_hub_app;
GRANT SELECT, INSERT ON clinic_hub.appointment_status_history TO clinic_hub_app;

CREATE FUNCTION clinic_hub.available_appointment_slots(
  requested_tenant_id uuid,
  requested_location_id uuid,
  requested_service_id uuid,
  requested_local_date date
)
RETURNS TABLE (practitioner_id uuid, starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql
STABLE
AS $function$
  WITH service_context AS (
    SELECT offering.tenant_id,
           offering.location_id,
           offering.service_id,
           COALESCE(offering.duration_override_minutes, service.default_duration_minutes) AS duration_minutes,
           location.timezone
    FROM clinic_hub.location_services AS offering
    JOIN clinic_hub.services AS service
      ON service.tenant_id = offering.tenant_id
     AND service.id = offering.service_id
    JOIN clinic_hub.locations AS location
      ON location.tenant_id = offering.tenant_id
     AND location.id = offering.location_id
    WHERE offering.tenant_id = requested_tenant_id
      AND offering.location_id = requested_location_id
      AND offering.service_id = requested_service_id
      AND offering.status = 'active'
  ),
  weekly_windows AS (
    SELECT practitioner_service.practitioner_id,
           schedule.start_time,
           schedule.end_time,
           service_context.duration_minutes,
           service_context.timezone
    FROM service_context
    JOIN clinic_hub.practitioner_services AS practitioner_service
      ON practitioner_service.tenant_id = service_context.tenant_id
     AND practitioner_service.location_id = service_context.location_id
     AND practitioner_service.service_id = service_context.service_id
     AND practitioner_service.status = 'active'
    JOIN clinic_hub.practitioner_locations AS practitioner_location
      ON practitioner_location.tenant_id = practitioner_service.tenant_id
     AND practitioner_location.location_id = practitioner_service.location_id
     AND practitioner_location.practitioner_id = practitioner_service.practitioner_id
     AND practitioner_location.status = 'active'
     AND practitioner_location.verification_status = 'verified'
     AND practitioner_location.publication_state = 'published'
    JOIN clinic_hub.schedules AS schedule
      ON schedule.tenant_id = practitioner_service.tenant_id
     AND schedule.location_id = practitioner_service.location_id
     AND schedule.practitioner_id = practitioner_service.practitioner_id
     AND schedule.day_of_week = EXTRACT(DOW FROM requested_local_date)::smallint
    WHERE NOT EXISTS (
      SELECT 1 FROM clinic_hub.schedule_exceptions AS exception
      WHERE exception.tenant_id = service_context.tenant_id
        AND exception.location_id = service_context.location_id
        AND exception.practitioner_id = practitioner_service.practitioner_id
        AND exception.exception_date = requested_local_date
    )
    UNION ALL
    SELECT practitioner_service.practitioner_id,
           exception.start_time,
           exception.end_time,
           service_context.duration_minutes,
           service_context.timezone
    FROM service_context
    JOIN clinic_hub.practitioner_services AS practitioner_service
      ON practitioner_service.tenant_id = service_context.tenant_id
     AND practitioner_service.location_id = service_context.location_id
     AND practitioner_service.service_id = service_context.service_id
     AND practitioner_service.status = 'active'
    JOIN clinic_hub.practitioner_locations AS practitioner_location
      ON practitioner_location.tenant_id = practitioner_service.tenant_id
     AND practitioner_location.location_id = practitioner_service.location_id
     AND practitioner_location.practitioner_id = practitioner_service.practitioner_id
     AND practitioner_location.status = 'active'
     AND practitioner_location.verification_status = 'verified'
     AND practitioner_location.publication_state = 'published'
    JOIN clinic_hub.schedule_exceptions AS exception
      ON exception.tenant_id = practitioner_service.tenant_id
     AND exception.location_id = practitioner_service.location_id
     AND exception.practitioner_id = practitioner_service.practitioner_id
     AND exception.exception_date = requested_local_date
     AND NOT exception.is_closed
  ),
  candidate_slots AS (
    SELECT time_window.practitioner_id,
           generated.local_start AT TIME ZONE time_window.timezone AS slot_start,
           (generated.local_start + make_interval(mins => time_window.duration_minutes))
             AT TIME ZONE time_window.timezone AS slot_end,
           generated.local_start,
           time_window.timezone
    FROM weekly_windows AS time_window
    CROSS JOIN LATERAL generate_series(
      requested_local_date + time_window.start_time,
      requested_local_date + time_window.end_time - make_interval(mins => time_window.duration_minutes),
      make_interval(mins => time_window.duration_minutes)
    ) AS generated(local_start)
  )
  SELECT candidate.practitioner_id,
         candidate.slot_start,
         candidate.slot_end
  FROM candidate_slots AS candidate
  WHERE candidate.slot_start > statement_timestamp()
    AND (candidate.slot_start AT TIME ZONE candidate.timezone) = candidate.local_start
    AND NOT EXISTS (
      SELECT 1
      FROM clinic_hub.appointments AS appointment
      WHERE appointment.tenant_id = requested_tenant_id
        AND appointment.practitioner_id = candidate.practitioner_id
        AND appointment.status IN ('confirmed', 'held')
        AND (appointment.status = 'confirmed' OR appointment.hold_expires_at > statement_timestamp())
        AND tstzrange(appointment.starts_at, appointment.ends_at, '[)')
          && tstzrange(candidate.slot_start, candidate.slot_end, '[)')
    )
  ORDER BY candidate.slot_start, candidate.practitioner_id
$function$;

REVOKE ALL ON FUNCTION clinic_hub.available_appointment_slots(uuid, uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinic_hub.available_appointment_slots(uuid, uuid, uuid, date) TO clinic_hub_app;

CREATE FUNCTION clinic_hub.reject_appointment_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'appointment status history is append-only' USING ERRCODE = '42501';
END
$function$;

CREATE TRIGGER appointment_status_history_append_only
BEFORE UPDATE OR DELETE ON clinic_hub.appointment_status_history
FOR EACH ROW EXECUTE FUNCTION clinic_hub.reject_appointment_history_mutation();