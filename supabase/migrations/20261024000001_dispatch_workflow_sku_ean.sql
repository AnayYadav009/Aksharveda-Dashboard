BEGIN;

ALTER TABLE public.sku_master ADD COLUMN IF NOT EXISTS ean TEXT;
ALTER TABLE public.sku_master ADD COLUMN IF NOT EXISTS display_name TEXT;
UPDATE public.sku_master SET ean = upc WHERE (ean IS NULL OR ean = '') AND upc IS NOT NULL AND upc <> '';
UPDATE public.sku_master SET display_name = COALESCE(NULLIF(short_name, ''), name) WHERE display_name IS NULL OR display_name = '';
CREATE INDEX IF NOT EXISTS idx_sku_master_ean ON public.sku_master(ean);

ALTER TABLE public.po_plan ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE public.po_plan ADD COLUMN IF NOT EXISTS dispatched_by TEXT;
ALTER TABLE public.po_plan ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.po_plan ADD COLUMN IF NOT EXISTS delivered_by TEXT;

ALTER TABLE public.po_header DROP CONSTRAINT IF EXISTS po_header_po_state_check;
UPDATE public.po_header SET po_state = CASE
  WHEN upper(replace(po_state, ' ', '_')) IN ('FULFILLED', 'DELIVERED') THEN 'DELIVERED'
  WHEN upper(replace(po_state, ' ', '_')) IN ('PARTIALLY_SCHEDULED', 'SCHEDULED') THEN 'SCHEDULED'
  WHEN upper(po_state) = 'CANCELLED' THEN 'CANCELLED'
  WHEN upper(po_state) = 'EXPIRED' THEN 'EXPIRED'
  WHEN upper(po_state) = 'DISPATCHED' THEN 'DISPATCHED'
  ELSE 'UNSCHEDULED' END;
ALTER TABLE public.po_header ADD CONSTRAINT po_header_po_state_check CHECK (po_state IN ('UNSCHEDULED','SCHEDULED','DISPATCHED','DELIVERED','CANCELLED','EXPIRED'));

ALTER TABLE public.po_state_history ADD COLUMN IF NOT EXISTS planned_dispatch_date DATE;
ALTER TABLE public.po_state_history ADD COLUMN IF NOT EXISTS changed_by TEXT NOT NULL DEFAULT 'migration';
ALTER TABLE public.po_state_history ADD COLUMN IF NOT EXISTS note TEXT;

CREATE OR REPLACE FUNCTION public.apply_dispatch_update(
  p_hub TEXT, p_po_number TEXT, p_operation TEXT, p_dispatch_date DATE,
  p_state TEXT, p_actor TEXT, p_note TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_state TEXT;
  v_expiry DATE;
  v_current_date DATE;
  v_target_date DATE;
  v_target_state TEXT;
BEGIN
  IF p_hub NOT IN ('delhi', 'kolkata') OR p_operation NOT IN ('date', 'state') THEN
    RAISE EXCEPTION 'Invalid dispatch operation';
  END IF;
  SELECT po_state, expiry_date INTO v_old_state, v_expiry
  FROM po_header WHERE channel_id = 'blinkit' AND hub = p_hub AND po_number = p_po_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO not found'; END IF;
  SELECT internal_dispatch_date INTO v_current_date FROM po_plan
  WHERE channel_id = 'blinkit' AND hub = p_hub AND po_number = p_po_number;
  v_target_date := CASE WHEN p_operation = 'state' THEN v_current_date ELSE p_dispatch_date END;
  v_target_state := CASE WHEN p_operation = 'state' THEN p_state ELSE CASE WHEN v_target_date IS NULL THEN 'UNSCHEDULED' ELSE 'SCHEDULED' END END;
  IF p_operation = 'date' AND v_old_state IN ('DISPATCHED','DELIVERED','CANCELLED','EXPIRED') THEN RAISE EXCEPTION 'Dispatch date is locked for this state'; END IF;
  IF p_operation = 'date' AND v_target_date IS NOT NULL AND (v_target_date < (now() AT TIME ZONE 'Asia/Kolkata')::date OR v_target_date > v_expiry) THEN RAISE EXCEPTION 'Invalid planned dispatch date'; END IF;
  IF v_target_state NOT IN ('UNSCHEDULED','SCHEDULED','DISPATCHED','DELIVERED','CANCELLED','EXPIRED') THEN RAISE EXCEPTION 'Invalid dispatch state'; END IF;
  IF v_target_state <> v_old_state AND NOT (
    (v_old_state = 'UNSCHEDULED' AND v_target_state IN ('SCHEDULED','CANCELLED')) OR
    (v_old_state = 'SCHEDULED' AND v_target_state IN ('UNSCHEDULED','DISPATCHED','CANCELLED')) OR
    (v_old_state = 'DISPATCHED' AND v_target_state = 'DELIVERED')
  ) THEN RAISE EXCEPTION 'Invalid state transition: % to %', v_old_state, v_target_state; END IF;
  IF v_target_state IN ('SCHEDULED','DISPATCHED') AND v_target_date IS NULL THEN RAISE EXCEPTION 'A planned dispatch date is required'; END IF;

  INSERT INTO po_plan(channel_id, hub, po_number, internal_dispatch_date, updated_at, updated_by)
  VALUES ('blinkit', p_hub, p_po_number, v_target_date, now(), p_actor)
  ON CONFLICT (channel_id, hub, po_number) DO UPDATE SET internal_dispatch_date = EXCLUDED.internal_dispatch_date, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  IF v_target_state = 'DISPATCHED' THEN UPDATE po_plan SET dispatched_at = now(), dispatched_by = p_actor, actual_dispatch_date = (now() AT TIME ZONE 'Asia/Kolkata')::date WHERE channel_id = 'blinkit' AND hub = p_hub AND po_number = p_po_number; END IF;
  IF v_target_state = 'DELIVERED' THEN UPDATE po_plan SET delivered_at = now(), delivered_by = p_actor WHERE channel_id = 'blinkit' AND hub = p_hub AND po_number = p_po_number; END IF;
  IF v_target_state <> v_old_state THEN
    UPDATE po_header SET po_state = v_target_state WHERE channel_id = 'blinkit' AND hub = p_hub AND po_number = p_po_number;
  END IF;
  IF v_target_state <> v_old_state OR p_operation = 'date' THEN
    INSERT INTO po_state_history(channel_id, hub, po_number, old_state, new_state, planned_dispatch_date, changed_by, note)
    VALUES ('blinkit', p_hub, p_po_number, v_old_state, v_target_state, v_target_date, p_actor, COALESCE(p_note, CASE WHEN p_operation = 'date' THEN 'Planned dispatch date changed' ELSE 'State changed' END));
  END IF;
  RETURN v_target_state;
END $$;
REVOKE ALL ON FUNCTION public.apply_dispatch_update(TEXT,TEXT,TEXT,DATE,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_dispatch_update(TEXT,TEXT,TEXT,DATE,TEXT,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_dispatch_pos() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE affected INTEGER;
BEGIN
  WITH changed AS (
    WITH candidates AS MATERIALIZED (
      SELECT channel_id, hub, po_number, po_state
      FROM po_header
      WHERE po_state IN ('UNSCHEDULED','SCHEDULED')
        AND expiry_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
      FOR UPDATE
    ), updated AS (
      UPDATE po_header h SET po_state = 'EXPIRED'
      FROM candidates c
      WHERE h.channel_id = c.channel_id AND h.hub = c.hub AND h.po_number = c.po_number
      RETURNING h.channel_id, h.hub, h.po_number
    )
    SELECT u.channel_id, u.hub, u.po_number, c.po_state AS old_state
    FROM updated u JOIN candidates c USING (channel_id, hub, po_number)
  )
  INSERT INTO po_state_history(channel_id, hub, po_number, old_state, new_state, planned_dispatch_date, changed_by, note)
  SELECT c.channel_id, c.hub, c.po_number, c.old_state, 'EXPIRED', p.internal_dispatch_date, 'system:expiry-job', 'PO expiry date passed'
  FROM changed c LEFT JOIN po_plan p USING (channel_id, hub, po_number);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
    RAISE NOTICE 'pg_cron is unavailable; follow README manual expiry-job setup after enabling the extension.';
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-dispatch-pos';
      PERFORM cron.schedule('expire-dispatch-pos', '5 0 * * *', 'SELECT public.expire_dispatch_pos()');
    EXCEPTION WHEN insufficient_privilege OR undefined_table OR undefined_function THEN
      RAISE NOTICE 'pg_cron could not be scheduled by this role; follow README manual expiry-job setup.';
    END;
  END IF;
END $$;

COMMIT;
