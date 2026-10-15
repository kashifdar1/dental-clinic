CREATE TABLE clinic_hub.plans (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' AND length(key) <= 64),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinic_hub.plan_versions (
  id uuid PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES clinic_hub.plans(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL CHECK (status IN ('published', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version_number)
);

CREATE TABLE clinic_hub.plan_entitlements (
  id uuid PRIMARY KEY,
  plan_version_id uuid NOT NULL REFERENCES clinic_hub.plan_versions(id),
  entitlement_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('limit', 'flag', 'meter')),
  limit_value integer,
  flag_enabled boolean,
  included_quantity integer,
  overage_policy text,
  UNIQUE (plan_version_id, entitlement_key),
  CHECK (
    (kind = 'limit' AND limit_value IS NOT NULL AND limit_value >= 0
      AND flag_enabled IS NULL AND included_quantity IS NULL AND overage_policy IS NULL)
    OR (kind = 'flag' AND flag_enabled IS NOT NULL
      AND limit_value IS NULL AND included_quantity IS NULL AND overage_policy IS NULL)
    OR (kind = 'meter' AND included_quantity IS NOT NULL AND included_quantity >= 0
      AND overage_policy IN ('block', 'allow', 'informational')
      AND limit_value IS NULL AND flag_enabled IS NULL)
  ),
  CHECK (
    entitlement_key <> 'whatsapp.template_sends.monthly'
    OR overage_policy = 'informational'
  )
);

CREATE TABLE clinic_hub.addons (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' AND length(key) <= 64),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  entitlement_key text NOT NULL,
  increment integer NOT NULL CHECK (increment > 0),
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clinic_hub.subscriptions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id),
  plan_version_id uuid NOT NULL REFERENCES clinic_hub.plan_versions(id),
  status text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled')),
  customer_ref text NOT NULL CHECK (length(trim(customer_ref)) BETWEEN 1 AND 160),
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  past_due_since timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (current_period_end > current_period_start),
  CHECK ((status = 'canceled') = (canceled_at IS NOT NULL)),
  CHECK ((status = 'past_due') = (past_due_since IS NOT NULL))
);

CREATE UNIQUE INDEX subscriptions_one_open_per_tenant
  ON clinic_hub.subscriptions (tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'suspended');

CREATE TABLE clinic_hub.subscription_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  addon_id uuid NOT NULL REFERENCES clinic_hub.addons(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, addon_id),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES clinic_hub.subscriptions (tenant_id, id)
);

CREATE TABLE clinic_hub.entitlement_overrides (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id),
  entitlement_key text NOT NULL,
  delta integer,
  flag_enabled boolean,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 20 AND 500),
  actor_subject text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((delta IS NOT NULL AND delta <> 0 AND flag_enabled IS NULL)
    OR (flag_enabled IS NOT NULL AND delta IS NULL))
);

CREATE TABLE clinic_hub.entitlement_counters (
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id) ON DELETE CASCADE,
  entitlement_key text NOT NULL,
  live_count integer NOT NULL CHECK (live_count >= 0),
  PRIMARY KEY (tenant_id, entitlement_key)
);

CREATE TABLE clinic_hub.usage_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id),
  entitlement_key text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  source_ref text NOT NULL CHECK (length(source_ref) BETWEEN 1 AND 160),
  period_start date NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_ref)
);

CREATE TABLE clinic_hub.usage_rollups (
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id),
  entitlement_key text NOT NULL,
  period_start date NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entitlement_key, period_start)
);

CREATE TABLE clinic_hub.invoices (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES clinic_hub.tenants(id),
  subscription_id uuid,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency_code text NOT NULL REFERENCES clinic_hub.currency_codes(code),
  status text NOT NULL CHECK (status IN ('issued', 'paid', 'void')),
  issued_by_subject text NOT NULL,
  external_reference text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES clinic_hub.subscriptions (tenant_id, id)
);

CREATE INDEX subscriptions_tenant_idx ON clinic_hub.subscriptions (tenant_id, status);
CREATE INDEX usage_events_period_idx ON clinic_hub.usage_events (tenant_id, entitlement_key, period_start);
CREATE INDEX invoices_tenant_idx ON clinic_hub.invoices (tenant_id, issued_at DESC);

CREATE FUNCTION clinic_hub.reject_plan_entitlement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'plan entitlements are immutable' USING ERRCODE = '42501';
END
$function$;

CREATE TRIGGER plan_entitlements_immutable
BEFORE UPDATE OR DELETE ON clinic_hub.plan_entitlements
FOR EACH ROW EXECUTE FUNCTION clinic_hub.reject_plan_entitlement_mutation();

CREATE FUNCTION clinic_hub.restrict_plan_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'plan versions are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'retired' AND NEW.status IS DISTINCT FROM 'retired' THEN
    RAISE EXCEPTION 'retired plan versions stay retired' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'published' AND NEW.status NOT IN ('published', 'retired') THEN
    RAISE EXCEPTION 'invalid plan version status' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER plan_versions_restrict_update
BEFORE UPDATE ON clinic_hub.plan_versions
FOR EACH ROW EXECUTE FUNCTION clinic_hub.restrict_plan_version_update();

CREATE FUNCTION clinic_hub.sync_practitioner_entitlement_counter()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':practitioners.max', 0));
    INSERT INTO clinic_hub.entitlement_counters (tenant_id, entitlement_key, live_count)
    VALUES (NEW.tenant_id, 'practitioners.max', 1)
    ON CONFLICT (tenant_id, entitlement_key)
    DO UPDATE SET live_count = clinic_hub.entitlement_counters.live_count + 1;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(OLD.tenant_id::text || ':practitioners.max', 0));
  UPDATE clinic_hub.entitlement_counters
  SET live_count = live_count - 1
  WHERE tenant_id = OLD.tenant_id
    AND entitlement_key = 'practitioners.max'
    AND live_count > 0;
  RETURN OLD;
END
$function$;

CREATE TRIGGER practitioners_entitlement_counter
AFTER INSERT OR DELETE ON clinic_hub.practitioners
FOR EACH ROW EXECUTE FUNCTION clinic_hub.sync_practitioner_entitlement_counter();

ALTER TABLE clinic_hub.practitioners NO FORCE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.practitioners DISABLE ROW LEVEL SECURITY;
INSERT INTO clinic_hub.entitlement_counters (tenant_id, entitlement_key, live_count)
SELECT tenant_id, 'practitioners.max', count(*)::int
FROM clinic_hub.practitioners
GROUP BY tenant_id
ON CONFLICT (tenant_id, entitlement_key)
DO UPDATE SET live_count = EXCLUDED.live_count;
ALTER TABLE clinic_hub.practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.practitioners FORCE ROW LEVEL SECURITY;

CREATE FUNCTION clinic_hub.reject_usage_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'usage_events is append-only' USING ERRCODE = '42501';
END
$function$;

CREATE TRIGGER usage_events_append_only
BEFORE UPDATE OR DELETE ON clinic_hub.usage_events
FOR EACH ROW EXECUTE FUNCTION clinic_hub.reject_usage_event_mutation();

ALTER TABLE clinic_hub.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.plans FORCE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON clinic_hub.plans
  FOR SELECT TO clinic_hub_app, clinic_hub_platform USING (true);
CREATE POLICY plans_write ON clinic_hub.plans
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

ALTER TABLE clinic_hub.plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.plan_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_versions_read ON clinic_hub.plan_versions
  FOR SELECT TO clinic_hub_app, clinic_hub_platform USING (true);
CREATE POLICY plan_versions_write ON clinic_hub.plan_versions
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

ALTER TABLE clinic_hub.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.plan_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_entitlements_read ON clinic_hub.plan_entitlements
  FOR SELECT TO clinic_hub_app, clinic_hub_platform USING (true);
CREATE POLICY plan_entitlements_insert ON clinic_hub.plan_entitlements
  FOR INSERT TO clinic_hub_platform WITH CHECK (true);

ALTER TABLE clinic_hub.addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.addons FORCE ROW LEVEL SECURITY;
CREATE POLICY addons_read ON clinic_hub.addons
  FOR SELECT TO clinic_hub_app, clinic_hub_platform USING (true);
CREATE POLICY addons_write ON clinic_hub.addons
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

ALTER TABLE clinic_hub.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_tenant ON clinic_hub.subscriptions
  FOR SELECT TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY subscriptions_platform ON clinic_hub.subscriptions
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

ALTER TABLE clinic_hub.subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.subscription_items FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_items_tenant ON clinic_hub.subscription_items
  FOR SELECT TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY subscription_items_platform ON clinic_hub.subscription_items
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

ALTER TABLE clinic_hub.entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.entitlement_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY entitlement_overrides_tenant ON clinic_hub.entitlement_overrides
  FOR SELECT TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY entitlement_overrides_platform ON clinic_hub.entitlement_overrides
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

ALTER TABLE clinic_hub.entitlement_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.entitlement_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY entitlement_counters_tenant ON clinic_hub.entitlement_counters
  FOR ALL TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id())
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY entitlement_counters_platform ON clinic_hub.entitlement_counters
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

ALTER TABLE clinic_hub.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_events_tenant ON clinic_hub.usage_events
  FOR SELECT TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY usage_events_insert ON clinic_hub.usage_events
  FOR INSERT TO clinic_hub_app
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY usage_events_platform ON clinic_hub.usage_events
  FOR SELECT TO clinic_hub_platform USING (true);

ALTER TABLE clinic_hub.usage_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.usage_rollups FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_rollups_tenant ON clinic_hub.usage_rollups
  FOR ALL TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id())
  WITH CHECK (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY usage_rollups_platform ON clinic_hub.usage_rollups
  FOR SELECT TO clinic_hub_platform USING (true);

ALTER TABLE clinic_hub.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoices_tenant ON clinic_hub.invoices
  FOR SELECT TO clinic_hub_app
  USING (tenant_id = clinic_hub.current_tenant_id());
CREATE POLICY invoices_platform ON clinic_hub.invoices
  FOR ALL TO clinic_hub_platform USING (true) WITH CHECK (true);

CREATE POLICY currency_codes_platform_read ON clinic_hub.currency_codes
  FOR SELECT TO clinic_hub_platform USING (true);

GRANT SELECT ON
  clinic_hub.plans,
  clinic_hub.plan_versions,
  clinic_hub.plan_entitlements,
  clinic_hub.addons,
  clinic_hub.subscriptions,
  clinic_hub.subscription_items,
  clinic_hub.entitlement_overrides,
  clinic_hub.usage_events,
  clinic_hub.usage_rollups,
  clinic_hub.invoices
TO clinic_hub_app;

GRANT SELECT, INSERT, UPDATE ON clinic_hub.entitlement_counters TO clinic_hub_app;
GRANT INSERT ON clinic_hub.usage_events TO clinic_hub_app;
GRANT INSERT, UPDATE ON clinic_hub.usage_rollups TO clinic_hub_app;

GRANT SELECT, INSERT, UPDATE ON
  clinic_hub.plans,
  clinic_hub.plan_versions,
  clinic_hub.addons,
  clinic_hub.subscriptions,
  clinic_hub.subscription_items,
  clinic_hub.entitlement_overrides,
  clinic_hub.entitlement_counters,
  clinic_hub.invoices
TO clinic_hub_platform;
GRANT INSERT ON clinic_hub.plan_entitlements TO clinic_hub_platform;
GRANT SELECT ON clinic_hub.usage_events, clinic_hub.usage_rollups, clinic_hub.currency_codes TO clinic_hub_platform;
