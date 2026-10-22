# Changelog

All notable changes and refactoring phases applied to the Aksharveda Blinkit PO & Dispatch Planning Dashboard.

---

## [Phase 1] - Data Layer Correctness
- **Dynamic CWD Data Path**: Replaced hardcoded Windows file paths in `src/lib/db.ts` with `path.join(process.cwd(), ".data")`. Added `.data/` to `.gitignore`.
- **Fail-Fast Production Safeguard**: When `process.env.NODE_ENV === "production"`, `getDataAdapterStatus()` fails loudly with a clear descriptive error instead of silently falling back to the local file store if Supabase is unconfigured or unavailable.
- **Transactional Commit Overwrite & Atomicity**:
  - Converted `commitUploadTransaction` in `src/lib/db.ts` and `src/lib/data-layer.ts` to `async`.
  - Used standard `crypto.randomUUID()` for all `upload_log` and `po_state_history` IDs.
  - Enforced strict foreign-key order: `upload_log` &rarr; `sku_master` &rarr; `po_header` &rarr; `po_line` &rarr; `po_plan` &rarr; `po_state_history`.
  - Batched Supabase upserts in chunks of 500 records via `mustUpsert` helper, checking error codes on every call.
- **Supabase 1000-Row Pagination**: Implemented `fetchAllRows(table, orderBy)` helper that pages in ranges of 1,000 using stable primary ordering to eliminate silent data truncation.
- **Migration**: Added `supabase/migrations/20261022000001_fix_upload_log.sql`.

---

## [Phase 2] - Upload Logic & Ingestion Quirks
- **Content-Hash Change Detection**:
  - Replaced the simple 3-field comparison with full line-level and header-level change detection across `units_ordered`, `total_grn_quantity`, `remaining_quantity`, `landing_rate`, `cost_price`, `margin_percentage`, `tax_value`, `total_amount`, `po_state`, `expiry_date`, `appointment_date`, and `region`.
  - Flagged modified POs as `Updated` and recorded detailed diffs in `preview.field_changes`.
- **Merged Line Set Totals**:
  - Recomputed `po_header.total_qty` and `total_amount` over the merged line set (existing lines not in incoming upload + incoming lines) so partial re-uploads never deflate PO totals.
- **Validation Quirks & Audit Trail**:
  - Single-file duplicate `(po_number, item_id)` detection rejecting subsequent lines with `"Duplicate PO/item row"`.
  - Rejected Excel-mangled numbers (e.g. `5.10761E+13` or decimals in PO / item IDs) with actionable instructions to export directly from Blinkit.
  - Pass rejected rows into `commitUploadTransaction`, storing them in `upload_log.rows_rejected` and `upload_log.error_report`.
- **Facility Regex & Region Mapping**:
  - Updated regex to require one letter + digits (`/^([A-Za-z\s]+?)\s+([A-Z]\d+)\s*-\s*/`) and cleaned up city fallback tokens (`Feeder`, `Hub`, `Central`, `Warehouse`).
  - Added `CITY_REGION_MAP` mapping Delhi, Gurgaon, Ghaziabad, Noida, Faridabad &rarr; `"NCR"` and Bhiwandi &rarr; `"Mumbai (Bhiwandi)"`.
  - Added nullable `region` column and index via `supabase/migrations/20261022000002_add_region_to_po_header.sql`.

---

## [Phase 3] - Security, Authentication & Access Control
- **Test Actions Gated**: Gated `upsert_test_po` and `delete_test_po` behind `process.env.NODE_ENV !== "production"` in `src/app/api/planning/route.ts` (returning HTTP 404 in production).
- **Supabase Auth & Root Middleware**:
  - Implemented root `src/middleware.ts` intercepting unauthenticated users and redirecting to `/login` for pages and returning HTTP 401 for protected API routes.
  - Implemented login page at `/login` with Supabase Auth credentials.
  - Added role-based access control matrix in `src/lib/auth.ts`:
    - `demand`: Ingest Blinkit PO CSV exports, view analytics, edit planning/stock.
    - `warehouse`: Dispatch planning sheet management, edit line items, update stock quantities.
    - `management`: Full administrative privileges across all operations.
    - All roles: Read access across purchase orders and dashboards.
- **Profiles Table & RLS**:
  - Added `supabase/migrations/20261022000003_profiles_and_rls.sql` creating `profiles` table and enabling RLS across all domain tables.
- **Dynamic Actor Persistence**: Replaced hardcoded `ops_team` in `src/app/api/stock/route.ts` with dynamic `updated_by` / `updatedBy` user identity, preserving `system_init` for system-created rows.
- **Playwright Test Safeguards**: Updated `test/e2e.spec.ts` to respect `PORT` from environment (default 3000), support test user login, and refuse to run against production Supabase instances.

---

## [Phase 4] - Notifications & Repository Hygiene
- **Email State Alerts & Absolute Dashboard URL**:
  - Added `NEXT_PUBLIC_APP_URL` (defaulting to `http://localhost:3000`) for absolute dashboard links in notification emails.
  - Implemented real `sendStateChangeAlert` in `EmailNotifier` via Resend API when API key is configured.
- **Recipient Seeding Protection**: Stopped seeding fake placeholder recipients in production mode; recipients are loaded strictly via settings UI or database records.
- **WhatsApp Cloud API Interface**: Isolated `WhatsAppNotifier` behind `IWhatsAppService` interface (`MetaCloudWhatsAppService`) ready for Meta Graph API tokens.
- **README & License Hygiene**:
  - Updated `README.md` to reference port 3000, correct clone URLs, proprietary license, all migrations, and new auth workflows.
  - Replaced MIT license in `LICENSE` with proprietary and confidential notice.
- **Atomic Local Store Writes**: Updated `saveStore` in `src/lib/db.ts` to write to a temporary file (`store.<uuid>.tmp`) before atomically renaming to `store.json`.

---

## Supabase Migrations in Execution Order
1. `supabase/migrations/20261019000001_initial_schema.sql` (Initial tables and constraints)
2. `supabase/migrations/20261019000002_align_notifications.sql` (Notification channel preferences)
3. `supabase/migrations/20261022000001_fix_upload_log.sql` (Add `total_units`, `total_amount` to `upload_log`, create notification tables)
4. `supabase/migrations/20261022000002_add_region_to_po_header.sql` (Add `region` column and index on `po_header`)
5. `supabase/migrations/20261022000003_profiles_and_rls.sql` (Create `profiles` table and enable RLS policies across all domain tables)
6. `supabase/migrations/20261022000004_add_pending_role.sql` (Allow pending signup profiles)
7. `supabase/migrations/20261023000001_hub_split_and_auth_lockdown.sql` (Hub-aware keys, inventory scope, pending profile trigger and approved-user RLS)

## [Phase 5] - Hub Isolation, Signup Safety & Cleanup
- Required hub-scoped PO reads and writes, including stock snapshots and upload history.
- Added a reviewed migration for hub-aware keys, pending-profile creation, and approved-user RLS policies. The migration has not been run against a database.
- Removed seeded notification recipients and static notification preview values. Signup now relies on a database-created pending profile, and client profile updates cannot set roles.
- Removed the tracked environment template and updated setup documentation to keep local environment files untracked.
- Removed the external Google Fonts build dependency so production builds do not require network access to Google Fonts.

---

## Environment Variables Reference
| Variable | Description | Default / Requirement |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | Required in production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous public key | Required for client auth |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (strictly server-side) | Required for backend data layer |
| `PORT` | Local application port | `3000` |
| `NEXT_PUBLIC_APP_URL` | Base dashboard URL for notification email links | `http://localhost:3000` |
| `NEXT_PUBLIC_DEFAULT_RECENT_DAYS` | Default rolling window filter in days | `30` |
| `NEXT_PUBLIC_NEAR_EXPIRY_DAYS` | Expiry threshold days for near-expiry PO alerts | `7` |
| `RESEND_API_KEY` | Resend API key for automated email delivery | Optional in dev (`re_...`) |
| `NOTIFICATION_FROM_EMAIL` | Sender address for notifications | `alerts@aksharveda.com` |
| `WHATSAPP_API_TOKEN` | Meta WhatsApp Cloud API bearer token | Optional in dev / stub |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp sender phone number ID | Optional in dev / stub |

---

## Deliberate Follow-ups / Non-Goals
1. **Live Meta WhatsApp Business Verification**: Kept stub implementation behind `IWhatsAppService` interface ready for active Meta Business Account approval.
2. **Third-party Channel Adapters (e.g. Zepto/Instamart)**: Database schema uses `channel_id` everywhere, but ingestion pipelines remain focused on Blinkit bulk CSV formats.
