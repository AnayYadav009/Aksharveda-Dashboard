-- Migration: Add region to po_header
-- 20261022000002_add_region_to_po_header.sql

ALTER TABLE po_header 
    ADD COLUMN IF NOT EXISTS region TEXT;

CREATE INDEX IF NOT EXISTS idx_po_header_region ON po_header(region);
