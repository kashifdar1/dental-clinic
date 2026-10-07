CREATE POLICY invitation_lookup_function_only ON clinic_hub.invitations
  FOR SELECT TO clinic_hub_migrator
  USING (true);
