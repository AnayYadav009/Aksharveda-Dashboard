-- Supabase Postgres Migration for Aksharveda PO Dashboard
-- Channel-agnostic foundation with Blinkit-first support

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Channels
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO channels (id, name)
VALUES ('blinkit', 'Blinkit')
ON CONFLICT (id) DO NOTHING;

-- 2. Upload Log
CREATE TABLE IF NOT EXISTS upload_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id TEXT NOT NULL REFERENCES channels(id),
    file_name TEXT NOT NULL,
    uploaded_by TEXT NOT NULL DEFAULT 'demand_team',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rows_total INTEGER NOT NULL DEFAULT 0,
    pos_new INTEGER NOT NULL DEFAULT 0,
    pos_updated INTEGER NOT NULL DEFAULT 0,
    pos_unchanged INTEGER NOT NULL DEFAULT 0,
    rows_rejected INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed', -- 'completed', 'failed', 'partial'
    error_report JSONB DEFAULT '[]'::jsonb
);

-- 3. SKU Master (Global / Channel agnostic)
CREATE TABLE IF NOT EXISTS sku_master (
    item_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    upc TEXT,
    uom_text TEXT,
    mrp NUMERIC(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PO Header (Blinkit / Channel owned)
CREATE TABLE IF NOT EXISTS po_header (
    channel_id TEXT NOT NULL REFERENCES channels(id),
    po_number TEXT NOT NULL,
    facility_raw TEXT NOT NULL,
    city TEXT,
    facility_code TEXT,
    order_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    appointment_date DATE,
    po_state TEXT NOT NULL, -- 'Unscheduled', 'Scheduled', 'Partially Scheduled', 'Fulfilled', 'Expired'
    total_qty INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_upload_id UUID REFERENCES upload_log(id),
    last_upload_id UUID REFERENCES upload_log(id),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (channel_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_header_order_date ON po_header(order_date);
CREATE INDEX IF NOT EXISTS idx_po_header_expiry_date ON po_header(expiry_date);
CREATE INDEX IF NOT EXISTS idx_po_header_po_state ON po_header(po_state);
CREATE INDEX IF NOT EXISTS idx_po_header_city ON po_header(city);
CREATE INDEX IF NOT EXISTS idx_po_header_channel ON po_header(channel_id);

-- 5. PO Line Items (Blinkit / Channel owned)
CREATE TABLE IF NOT EXISTS po_line (
    channel_id TEXT NOT NULL,
    po_number TEXT NOT NULL,
    item_id TEXT NOT NULL REFERENCES sku_master(item_id),
    units_ordered INTEGER NOT NULL DEFAULT 0,
    total_grn_quantity INTEGER NOT NULL DEFAULT 0,
    remaining_quantity INTEGER NOT NULL DEFAULT 0,
    landing_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    margin_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0,
    tax_value NUMERIC(8, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (channel_id, po_number, item_id),
    FOREIGN KEY (channel_id, po_number) REFERENCES po_header(channel_id, po_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_po_line_item ON po_line(item_id);

-- 6. PO Plan (TEAM OWNED - Never overwritten by Blinkit CSV re-uploads)
CREATE TABLE IF NOT EXISTS po_plan (
    channel_id TEXT NOT NULL,
    po_number TEXT NOT NULL,
    remarks TEXT,
    central_appointment_date DATE,
    internal_dispatch_date DATE,
    actual_dispatch_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'ops_team',
    PRIMARY KEY (channel_id, po_number),
    FOREIGN KEY (channel_id, po_number) REFERENCES po_header(channel_id, po_number) ON DELETE CASCADE
);

-- 7. PO Line Dispatch (TEAM OWNED - Never overwritten by Blinkit CSV re-uploads)
CREATE TABLE IF NOT EXISTS po_line_dispatch (
    channel_id TEXT NOT NULL,
    po_number TEXT NOT NULL,
    item_id TEXT NOT NULL,
    qty_dispatched INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'ops_team',
    PRIMARY KEY (channel_id, po_number, item_id),
    FOREIGN KEY (channel_id, po_number, item_id) REFERENCES po_line(channel_id, po_number, item_id) ON DELETE CASCADE
);

-- 8. Stock Snapshot (Inventory in Hand)
CREATE TABLE IF NOT EXISTS stock_snapshot (
    item_id TEXT PRIMARY KEY REFERENCES sku_master(item_id) ON DELETE CASCADE,
    qty_in_hand INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'ops_team'
);

-- 9. PO State History (Audit trail of state transitions)
CREATE TABLE IF NOT EXISTS po_state_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id TEXT NOT NULL DEFAULT 'blinkit',
    po_number TEXT NOT NULL,
    old_state TEXT NOT NULL,
    new_state TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    upload_id UUID REFERENCES upload_log(id)
);

CREATE INDEX IF NOT EXISTS idx_po_state_history_po ON po_state_history(po_number);

-- 10. Settings Table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value)
VALUES 
    ('near_expiry_days', '7'::jsonb),
    ('default_recent_days', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 11. Notification Recipients & In-App Notifications
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

CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info', -- 'info', 'warning', 'alert', 'success'
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    metadata JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notif_unread ON in_app_notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(is_read) WHERE is_read = FALSE;

