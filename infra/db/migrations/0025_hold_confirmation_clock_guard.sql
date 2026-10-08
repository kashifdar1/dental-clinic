CREATE OR REPLACE FUNCTION clinic_hub.enforce_appointment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('requested', 'held', 'confirmed') THEN
      RAISE EXCEPTION 'appointments must start as requested, held or confirmed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'held' AND NEW.hold_expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'appointment holds must expire in the future'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM clinic_hub.available_appointment_slots(
        NEW.tenant_id,
        NEW.location_id,
        NEW.service_id,
        (NEW.starts_at AT TIME ZONE (
          SELECT location.timezone
          FROM clinic_hub.locations AS location
          WHERE location.tenant_id = NEW.tenant_id
            AND location.id = NEW.location_id
        ))::date
      ) AS available_slot
      WHERE available_slot.practitioner_id = NEW.practitioner_id
        AND available_slot.starts_at = NEW.starts_at
        AND available_slot.ends_at = NEW.ends_at
    ) THEN
      RAISE EXCEPTION 'appointment does not match an available schedule slot'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.practitioner_id IS DISTINCT FROM OLD.practitioner_id
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.rescheduled_from_id IS DISTINCT FROM OLD.rescheduled_from_id
     OR NEW.created_by_subject IS DISTINCT FROM OLD.created_by_subject
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'appointment booking details are immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = OLD.status THEN
    IF OLD.status = 'held'
       AND NEW.hold_expires_at IS NOT NULL
       AND OLD.hold_expires_at IS NOT NULL
       AND NEW.hold_expires_at < OLD.hold_expires_at THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'appointment updates must change status' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'held'
     AND NEW.status = 'confirmed'
     AND OLD.hold_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'appointment hold has expired' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (OLD.status = 'requested' AND NEW.status IN ('confirmed', 'cancelled', 'declined'))
    OR (OLD.status = 'held' AND NEW.status IN ('confirmed', 'cancelled', 'expired'))
    OR (OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'rescheduled'))
  ) THEN
    RAISE EXCEPTION 'invalid appointment status transition' USING ERRCODE = '42501';
  END IF;

  IF NEW.status <> 'held' AND NEW.hold_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'only held appointments may have an expiry' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;