import { describe, expect, it } from 'vitest';
import { formatSkuName, isDispatchDateLocked, normalizeDispatchState, validateBulkSchedule, validatePlannedDate, validateTransition } from '../src/lib/dispatch-state';

describe('dispatch workflow helpers', () => {
  it('normalizes legacy CSV states to app states', () => {
    expect(normalizeDispatchState('Fulfilled')).toBe('DELIVERED');
    expect(normalizeDispatchState('Partially Scheduled')).toBe('SCHEDULED');
    expect(normalizeDispatchState('Scheduled')).toBe('SCHEDULED');
  });
  it('rejects malformed, past, and after-expiry dates', () => {
    expect(validatePlannedDate('2026-02-31', '2026-03-01', '2026-02-01').valid).toBe(false);
    expect(validatePlannedDate('2026-10-23', '2026-10-30', '2026-10-24').valid).toBe(false);
    expect(validatePlannedDate('2026-10-31', '2026-10-30', '2026-10-24').valid).toBe(false);
  });
  it('warns within one day of expiry and accepts the expiry date', () => {
    expect(validatePlannedDate('2026-10-29', '2026-10-30', '2026-10-24')).toMatchObject({ valid: true, warning: expect.any(String) });
    expect(validatePlannedDate('2026-10-30', '2026-10-30', '2026-10-24').valid).toBe(true);
  });
  it('allows only the dispatch state machine transitions and locks terminal dates', () => {
    expect(validateTransition('UNSCHEDULED', 'SCHEDULED', '2026-10-30').valid).toBe(true);
    expect(validateTransition('UNSCHEDULED', 'DISPATCHED', null).valid).toBe(false);
    expect(validateTransition('DELIVERED', 'SCHEDULED', '2026-10-30').valid).toBe(false);
    expect(validateTransition('SCHEDULED', 'CANCELLED', '2026-10-30').valid).toBe(true);
    expect(validateTransition('DISPATCHED', 'CANCELLED', '2026-10-30').valid).toBe(false);
    expect(isDispatchDateLocked('DISPATCHED')).toBe(true);
    expect(isDispatchDateLocked('DELIVERED')).toBe(true);
    expect(isDispatchDateLocked('SCHEDULED')).toBe(false);
  });
  it('preflights every bulk scheduling row', () => {
    const rows = [{ po_number: 'A', state: 'UNSCHEDULED' as const, date: '2026-10-29', expiry_date: '2026-10-30' }, { po_number: 'B', state: 'SCHEDULED' as const, date: '2026-10-29', expiry_date: '2026-10-30' }];
    expect(validateBulkSchedule(rows, '2026-10-24').valid).toBe(true);
    expect(validateBulkSchedule([{ ...rows[0], state: 'DELIVERED' }], '2026-10-24').valid).toBe(false);
  });
  it('formats common SKU noise without changing identifiers', () => {
    expect(formatSkuName('Aksharveda Floral Blooms Combo of Rose Petals Pack of 3')).toBe('Rose Petals 3');
    expect(formatSkuName('Small Diya')).toBe('Small Diya');
  });
});
