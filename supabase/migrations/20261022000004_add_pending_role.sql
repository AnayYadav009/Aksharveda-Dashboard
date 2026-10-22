-- Migration: Add pending to profiles role check constraint
-- 20261022000004_add_pending_role.sql

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('pending', 'demand', 'warehouse', 'management'));
