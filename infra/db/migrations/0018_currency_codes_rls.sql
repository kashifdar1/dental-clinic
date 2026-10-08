ALTER TABLE clinic_hub.currency_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hub.currency_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY currency_codes_read_only ON clinic_hub.currency_codes
  FOR SELECT TO clinic_hub_app
  USING (true);