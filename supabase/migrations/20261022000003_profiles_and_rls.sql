-- Migration: Add profiles table and enable RLS policies across all tables
-- 20261022000003_profiles_and_rls.sql

-- 1. Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('demand', 'warehouse', 'management')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read all profiles" ON profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- 2. Enable RLS on all domain tables
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_header ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_dispatch ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies: Authenticated users can read all tables
CREATE POLICY "Allow authenticated read channels" ON channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read sku_master" ON sku_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read po_header" ON po_header FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read po_line" ON po_line FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read po_plan" ON po_plan FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read po_line_dispatch" ON po_line_dispatch FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read stock_snapshot" ON stock_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read po_state_history" ON po_state_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read settings" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read upload_log" ON upload_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read notification_recipients" ON notification_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read in_app_notifications" ON in_app_notifications FOR SELECT TO authenticated USING (true);

-- Deny anon access explicitly by not granting anon policies (service_role bypasses RLS safely on server).
