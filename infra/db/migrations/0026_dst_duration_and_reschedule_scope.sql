ALTER TABLE clinic_hub.appointments
  DROP CONSTRAINT appointments_tenant_id_rescheduled_from_id_fkey;
ALTER TABLE clinic_hub.appointments
  ADD CONSTRAINT appointments_rescheduled_same_location_fk
  FOREIGN KEY (tenant_id, location_id, rescheduled_from_id)
  REFERENCES clinic_hub.appointments (tenant_id, location_id, id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION clinic_hub.available_appointment_slots(
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
  local_candidates AS (
    SELECT time_window.practitioner_id,
           time_window.duration_minutes,
           time_window.timezone,
           generated.local_start
    FROM weekly_windows AS time_window
    CROSS JOIN LATERAL generate_series(
      requested_local_date + time_window.start_time,
      requested_local_date + time_window.end_time - make_interval(mins => time_window.duration_minutes),
      make_interval(mins => time_window.duration_minutes)
    ) AS generated(local_start)
  ),
  candidate_slots AS (
    SELECT local_candidate.practitioner_id,
           local_candidate.local_start AT TIME ZONE local_candidate.timezone AS slot_start,
           (local_candidate.local_start AT TIME ZONE local_candidate.timezone)
             + make_interval(mins => local_candidate.duration_minutes) AS slot_end,
           local_candidate.local_start,
           local_candidate.timezone
    FROM local_candidates AS local_candidate
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