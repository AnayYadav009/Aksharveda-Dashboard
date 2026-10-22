-- Migration: Fix upload_log schema with total_units and total_amount, and ensure notification tables
-- 20261022000001_fix_upload_log.sql

-- 1. Add total_units and total_amount columns to upload_log
ALTER TABLE upload_log 
    ADD COLUMN IF NOT EXISTS total_units INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(16, 2) NOT NULL DEFAULT 0;

-- 2. Ensure notification_recipients exists with exact TypeScript fields
CREATE TABLE IF NOT EXISTS notification_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'Ops',
    channel_prefs JSONB NOT NULL DEFAULT '{"email": true, "whatsapp": false, "in_app": true}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Ensure in_app_notifications exists with exact TypeScript fields
CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notif_unread ON in_app_notifications(is_read) WHERE is_read = FALSE;

-- Enable RLS
ALTER TABLE upload_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;
