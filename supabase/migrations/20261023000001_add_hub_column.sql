-- Migration: Add required hub column to domain tables
-- 20261023000001_add_hub_column.sql

-- 1. Create hub check type / constraint
DO $$ BEGIN
  -- Alter po_header
  ALTER TABLE po_header ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
  ALTER TABLE po_header DROP CONSTRAINT IF EXISTS po_header_hub_check;
  ALTER TABLE po_header ADD CONSTRAINT po_header_hub_check CHECK (hub IN ('delhi', 'kolkata'));

  -- Alter po_line
  ALTER TABLE po_line ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
  ALTER TABLE po_line DROP CONSTRAINT IF EXISTS po_line_hub_check;
  ALTER TABLE po_line ADD CONSTRAINT po_line_hub_check CHECK (hub IN ('delhi', 'kolkata'));

  -- Alter po_plan
  ALTER TABLE po_plan ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
  ALTER TABLE po_plan DROP CONSTRAINT IF EXISTS po_plan_hub_check;
  ALTER TABLE po_plan ADD CONSTRAINT po_plan_hub_check CHECK (hub IN ('delhi', 'kolkata'));

  -- Alter po_line_dispatch
  ALTER TABLE po_line_dispatch ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
  ALTER TABLE po_line_dispatch DROP CONSTRAINT IF EXISTS po_line_dispatch_hub_check;
  ALTER TABLE po_line_dispatch ADD CONSTRAINT po_line_dispatch_hub_check CHECK (hub IN ('delhi', 'kolkata'));

  -- Alter po_state_history
  ALTER TABLE po_state_history ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
  ALTER TABLE po_state_history DROP CONSTRAINT IF EXISTS po_state_history_hub_check;
  ALTER TABLE po_state_history ADD CONSTRAINT po_state_history_hub_check CHECK (hub IN ('delhi', 'kolkata'));

  -- Alter upload_log
  ALTER TABLE upload_log ADD COLUMN IF NOT EXISTS hub TEXT NOT NULL DEFAULT 'delhi';
  ALTER TABLE upload_log DROP CONSTRAINT IF EXISTS upload_log_hub_check;
  ALTER TABLE upload_log ADD CONSTRAINT upload_log_hub_check CHECK (hub IN ('delhi', 'kolkata'));
END $$;
