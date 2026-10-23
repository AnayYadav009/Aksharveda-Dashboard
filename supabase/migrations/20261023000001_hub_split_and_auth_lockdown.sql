-- Require hub-specific identity for PO, plan, dispatch and inventory records.
-- This migration is authored for manual review; it has not been run against a database.

BEGIN;

DO $$
DECLARE
  required_table text;
  missing_tables text[] := ARRAY[]::text[];
BEGIN
  FOREACH required_table IN ARRAY ARRAY['channels', 'sku_master', 'upload_log', 'profiles', 'settings', 'notification_recipients', 'in_app_notifications'] LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      missing_tables := array_append(missing_tables, required_table);
    END IF;
  END LOOP;
  IF cardinality(missing_tables) > 0 THEN
    RAISE EXCEPTION 'Run all earlier migrations in order before this one. Missing prerequisite tables: %', array_to_string(missing_tables, ', ');
  END IF;
END $$;

ALTER TABLE po_header ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
ALTER TABLE po_line ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
ALTER TABLE po_plan ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
ALTER TABLE po_line_dispatch ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
ALTER TABLE po_state_history ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
ALTER TABLE upload_log ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
ALTER TABLE stock_snapshot ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';

ALTER TABLE po_header DROP CONSTRAINT IF EXISTS po_header_hub_check;
ALTER TABLE po_header ADD CONSTRAINT po_header_hub_check CHECK (hub IN ('delhi', 'kolkata'));
ALTER TABLE po_line DROP CONSTRAINT IF EXISTS po_line_hub_check;
ALTER TABLE po_line ADD CONSTRAINT po_line_hub_check CHECK (hub IN ('delhi', 'kolkata'));
ALTER TABLE po_plan DROP CONSTRAINT IF EXISTS po_plan_hub_check;
ALTER TABLE po_plan ADD CONSTRAINT po_plan_hub_check CHECK (hub IN ('delhi', 'kolkata'));
ALTER TABLE po_line_dispatch DROP CONSTRAINT IF EXISTS po_line_dispatch_hub_check;
ALTER TABLE po_line_dispatch ADD CONSTRAINT po_line_dispatch_hub_check CHECK (hub IN ('delhi', 'kolkata'));
ALTER TABLE po_state_history DROP CONSTRAINT IF EXISTS po_state_history_hub_check;
ALTER TABLE po_state_history ADD CONSTRAINT po_state_history_hub_check CHECK (hub IN ('delhi', 'kolkata'));
ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_hub_check;
ALTER TABLE upload_log ADD CONSTRAINT upload_log_hub_check CHECK (hub IN ('delhi', 'kolkata'));
ALTER TABLE stock_snapshot DROP CONSTRAINT IF EXISTS stock_snapshot_hub_check;
ALTER TABLE stock_snapshot ADD CONSTRAINT stock_snapshot_hub_check CHECK (hub IN ('delhi', 'kolkata'));

-- Rebuild compound keys and foreign keys so duplicate PO numbers can exist in both hubs.
ALTER TABLE po_line DROP CONSTRAINT IF EXISTS po_line_channel_id_po_number_fkey;
ALTER TABLE po_plan DROP CONSTRAINT IF EXISTS po_plan_channel_id_po_number_fkey;
ALTER TABLE po_line_dispatch DROP CONSTRAINT IF EXISTS po_line_dispatch_channel_id_po_number_item_id_fkey;
ALTER TABLE po_line_dispatch DROP CONSTRAINT IF EXISTS po_line_dispatch_channel_id_po_number_fkey;
ALTER TABLE po_line DROP CONSTRAINT IF EXISTS po_line_channel_id_hub_po_number_fkey;
ALTER TABLE po_plan DROP CONSTRAINT IF EXISTS po_plan_channel_id_hub_po_number_fkey;
ALTER TABLE po_line_dispatch DROP CONSTRAINT IF EXISTS po_line_dispatch_channel_id_hub_po_number_item_id_fkey;
ALTER TABLE po_line DROP CONSTRAINT IF EXISTS po_line_pkey;
ALTER TABLE po_plan DROP CONSTRAINT IF EXISTS po_plan_pkey;
ALTER TABLE po_line_dispatch DROP CONSTRAINT IF EXISTS po_line_dispatch_pkey;
ALTER TABLE po_header DROP CONSTRAINT IF EXISTS po_header_pkey;

ALTER TABLE po_header ADD CONSTRAINT po_header_pkey PRIMARY KEY (channel_id, hub, po_number);
ALTER TABLE po_line ADD CONSTRAINT po_line_pkey PRIMARY KEY (channel_id, hub, po_number, item_id);
ALTER TABLE po_plan ADD CONSTRAINT po_plan_pkey PRIMARY KEY (channel_id, hub, po_number);
ALTER TABLE po_line_dispatch ADD CONSTRAINT po_line_dispatch_pkey PRIMARY KEY (channel_id, hub, po_number, item_id);

ALTER TABLE po_line ADD CONSTRAINT po_line_channel_id_hub_po_number_fkey
  FOREIGN KEY (channel_id, hub, po_number) REFERENCES po_header(channel_id, hub, po_number) ON DELETE CASCADE;
ALTER TABLE po_plan ADD CONSTRAINT po_plan_channel_id_hub_po_number_fkey
  FOREIGN KEY (channel_id, hub, po_number) REFERENCES po_header(channel_id, hub, po_number) ON DELETE CASCADE;
ALTER TABLE po_line_dispatch ADD CONSTRAINT po_line_dispatch_channel_id_hub_po_number_item_id_fkey
  FOREIGN KEY (channel_id, hub, po_number, item_id) REFERENCES po_line(channel_id, hub, po_number, item_id) ON DELETE CASCADE;

ALTER TABLE stock_snapshot DROP CONSTRAINT IF EXISTS stock_snapshot_pkey;
ALTER TABLE stock_snapshot ADD CONSTRAINT stock_snapshot_pkey PRIMARY KEY (hub, item_id);

-- New accounts always receive a pending profile from a trusted database trigger.
CREATE OR REPLACE FUNCTION public.create_pending_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(COALESCE(NEW.email, ''), '@', 1), 'User'),
    'pending'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_pending_profile();

INSERT INTO public.profiles (user_id, name, role)
SELECT id, COALESCE(NULLIF(raw_user_meta_data->>'name', ''), split_part(COALESCE(email, ''), '@', 1), 'User'), 'pending'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role IN ('demand', 'warehouse', 'management')
  );
$$;
REVOKE ALL ON FUNCTION public.is_approved_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_management_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'management'
  );
$$;
REVOKE ALL ON FUNCTION public.is_management_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_management_user() TO authenticated;

-- Remove broad policies, including the former self-update profile policy that allowed role escalation.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'channels', 'sku_master', 'po_header', 'po_line', 'po_plan',
        'po_line_dispatch', 'stock_snapshot', 'po_state_history', 'settings',
        'upload_log', 'notification_recipients', 'in_app_notifications', 'notifications'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;
END $$;

CREATE POLICY "Users can read their own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_management_user());

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'channels', 'sku_master', 'po_header', 'po_line', 'po_plan', 'po_line_dispatch',
    'stock_snapshot', 'po_state_history', 'settings', 'upload_log',
    'notification_recipients', 'in_app_notifications', 'notifications'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (public.is_approved_user())',
      'Approved users can read ' || table_name,
      table_name
    );
  END LOOP;
END $$;

COMMIT;
